import assert from "node:assert/strict";
import test from "node:test";
import type { AudioTask } from "./audio-manager";

process.env.NEXT_PUBLIC_SUPABASE_URL ||= "http://127.0.0.1:54321";
process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY ||= "audio-test-key";
const tick = async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); };

async function setup() {
  const { AudioManager } = await import("./audio-manager");
  const manager = new AudioManager();
  manager.isEnabled = () => true;
  const internal = manager as unknown as { cache: Map<string, { blob: Blob }>; currentTask: AudioTask | null };
  const audios: FakeAudio[] = [];
  class FakeAudio {
    onended?: () => void;
    currentTime = 0;
    async play() { audios.push(this); }
    pause() {}
  }
  const originalAudio = globalThis.Audio;
  globalThis.Audio = FakeAudio as unknown as typeof Audio;
  const task = (id: string, playbackId: string): AudioTask => {
    internal.cache.set(id, { blob: new Blob([id]) });
    return { id, playbackId, text: id, voiceId: "voice", playerId: "player" };
  };
  return { manager, audios, task, internal, restore: () => { manager.clearQueue(); globalThis.Audio = originalAudio; } };
}

test("缓存相同语音但按段落分别播放，重放同一段落只入队一次", async () => {
  const h = await setup();
  try {
    h.manager.addToQueue(h.task("不对", "r:0"));
    h.manager.addToQueue(h.task("不对", "r:1"));
    h.manager.addToQueue(h.task("不对", "r:1"));
    await tick();
    assert.equal(h.audios.length, 1);
    h.audios[0].onended?.(); await tick();
    assert.equal(h.audios.length, 2);
    h.audios[1].onended?.(); await tick();
    assert.equal(h.audios.length, 2);
  } finally { h.restore(); }
});

test("清队列不会先启动下一条旧语音，失效任务不播放", async () => {
  const h = await setup();
  try {
    h.manager.addToQueue(h.task("当前", "a:0"));
    h.manager.addToQueue(h.task("旧队列", "a:1"));
    await tick();
    h.manager.clearQueue(); await tick();
    h.manager.addToQueue({ ...h.task("过期", "b:0"), isValid: () => false });
    await tick();
    assert.equal(h.audios.length, 1);
  } finally { h.restore(); }
});

test("TTS 遇到 503、403、429 或超时时静默跳过，并中止未完成的请求", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const { AudioManager } = await import("./audio-manager");
  const manager = new AudioManager();
  manager.setEnabled(true);
  manager.isEnabled = () => true;
  const originalFetch = globalThis.fetch;
  const originalError = console.error;
  const errors: unknown[] = [];
  console.error = (...args: unknown[]) => { errors.push(args); };
  const calls: Array<{ status: number; signal?: AbortSignal | null }> = [];
  const script = [503, 403, 429, 0];
  globalThis.fetch = async (input, init) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    if (url.endsWith("/api/demo-config")) {
      return Response.json({ active: false, enabled: false });
    }
    if (!url.includes("/api/tts")) {
      return Response.json({});
    }
    const status = script[calls.length] ?? 503;
    calls.push({ status, signal: init?.signal });
    if (status === 0) {
      return new Promise<Response>((_resolve, reject) => {
        const signal = init?.signal;
        const onAbort = () => reject(signal?.reason instanceof Error ? signal.reason : new Error("aborted"));
        if (signal?.aborted) onAbort();
        else signal?.addEventListener("abort", onAbort, { once: true });
      });
    }
    return new Response("unavailable", { status });
  };
  const task = (id: string) => ({ id, text: id, voiceId: "voice", playerId: "player" });
  const untilSettled = async (pending: Promise<boolean>, budgetMs: number) => {
    let settled: { value: boolean } | undefined;
    void pending.then((value) => { settled = { value }; }, () => { settled = { value: false }; });
    for (let elapsed = 0; !settled && elapsed <= budgetMs; elapsed += 500) {
      t.mock.timers.tick(500);
      for (let i = 0; i < 8; i += 1) await Promise.resolve();
    }
    assert.ok(settled, "TTS should settle inside its budget");
    return settled.value;
  };
  try {
    assert.equal(await untilSettled(manager.ensureReady(task("503")), 15_000), false);
    assert.equal(await untilSettled(manager.ensureReady(task("403")), 15_000), false);
    assert.equal(await untilSettled(manager.ensureReady(task("429")), 15_000), false);
    const hanging = manager.ensureReady(task("timeout"));
    let settled = false;
    void hanging.then(() => { settled = true; });
    for (let elapsed = 0; elapsed < 11_000; elapsed += 1_000) {
      t.mock.timers.tick(1_000);
      for (let i = 0; i < 8; i += 1) await Promise.resolve();
    }
    assert.equal(settled, false);
    assert.equal(await untilSettled(hanging, 3_000), false);
    assert.equal(calls.at(-1)?.signal?.aborted, true);
    const queued = manager.ensureReady(task("queued-skip"));
    manager.addToQueue(task("queued-skip"));
    assert.equal(await untilSettled(queued, 15_000), false);
    assert.equal(errors.length, 0);
  } finally {
    console.error = originalError;
    globalThis.fetch = originalFetch;
    manager.clearQueue();
    t.mock.timers.reset();
  }
});

test("旧 TTS 加载失败不能清掉已开始的新语音任务", async () => {
  const h = await setup();
  let rejectOld!: (error: Error) => void;
  h.manager.ensureReady = (task) => task.id === "旧加载"
    ? new Promise<boolean>((_, reject) => { rejectOld = reject; }) : Promise.resolve(true);
  try {
    h.manager.addToQueue(h.task("旧加载", "a:0"));
    h.manager.clearQueue();
    h.manager.addToQueue(h.task("新语音", "b:0"));
    await tick();
    rejectOld(new Error("旧 TTS 失败")); await tick();
    assert.equal(h.internal.currentTask?.playbackId, "b:0");
    assert.equal(h.audios.length, 1);
  } finally { h.restore(); }
});

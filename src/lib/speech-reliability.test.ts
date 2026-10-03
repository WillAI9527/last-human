import assert from "node:assert/strict";
import test from "node:test";
import { setLocale } from "@/i18n/locale-store";
import { PLAYER_MODELS, type GameState, type Player } from "@/types/game";
import { pickFallbackSpeech } from "./speech-fallback";
import {
  httpStatusFromError,
  isNonRetryableClientStatus,
  pickBackupModel,
  PREFERRED_BACKUP_MODEL,
  speechMentionsSheriff,
  stripSheriffSentences,
} from "./speech-reliability";

process.env.NEXT_PUBLIC_SUPABASE_URL ||= "http://127.0.0.1:54321";
process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY ||= "speech-reliability-test-key";
setLocale("zh");

const GEMINI = "google/gemini-3.5-flash-lite";
const FORBIDDEN = /警长|警徽流|警徽|警上|警下|上警/;

function player(model = GEMINI): Player {
  return {
    playerId: "p0",
    seat: 0,
    displayName: "老汉斯",
    alive: true,
    role: "Villager",
    alignment: "village",
    isHuman: false,
    agentProfile: {
      modelRef: { provider: "zenmux", model },
      persona: { mbti: "ISTJ", gender: "male", age: 50, voiceRules: ["短"] },
    },
  };
}

function stateFor(speaker: Player, count = 1): GameState {
  const players = Array.from({ length: count }, (_, seat) => ({
    ...speaker,
    seat,
    playerId: `p${seat}`,
    displayName: seat === 0 ? speaker.displayName : `村民${seat + 1}`,
  }));
  return {
    gameId: "speech-reliability",
    phase: "DAY_SPEECH",
    day: 1,
    difficulty: "normal",
    players,
    events: [],
    messages: [],
    currentSpeakerSeat: 0,
    daySpeechStartSeat: 0,
    badge: { holderSeat: null, candidates: [], signup: {}, votes: {}, allVotes: {}, history: {}, revoteCount: 0 },
    votes: {},
    voteHistory: {},
    dailySummaries: {},
    dailySummaryFacts: {},
    nightActions: {},
    roleAbilities: {
      witchHealUsed: false,
      witchPoisonUsed: false,
      hunterCanShoot: true,
      idiotRevealed: false,
      whiteWolfKingBoomUsed: false,
    },
    winner: null,
  };
}

function sse(text: string): Response {
  const payload = `data: ${JSON.stringify({ choices: [{ delta: { content: JSON.stringify([text]) } }] })}\n\ndata: [DONE]\n\n`;
  return new Response(payload, { headers: { "Content-Type": "text/event-stream" } });
}

function requestUrl(input: string | URL | Request): string {
  return typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
}

async function flush() {
  for (let i = 0; i < 20; i += 1) await Promise.resolve();
}

async function advance(t: { mock: { timers: { tick: (ms: number) => void } } }, ms: number) {
  let left = ms;
  while (left > 0) {
    t.mock.timers.tick(Math.min(1_000, left));
    left -= Math.min(1_000, left);
    await flush();
  }
}

test("兜底台词按村民抽取，同一局不重复", () => {
  assert.equal(pickFallbackSpeech("老汉斯", [], () => 0).line, "我再听听，先过。");
  let used: string[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < 6; i += 1) {
    const picked = pickFallbackSpeech("老汉斯", used, () => 0);
    assert.equal(seen.has(picked.line), false);
    assert.equal(FORBIDDEN.test(picked.line), false);
    assert.ok(picked.line.trim().length > 0);
    seen.add(picked.line);
    used = picked.used;
  }
});

test("备份模型优先 deepseek-v3.2，4xx 除 429 外不在同一模型重试", () => {
  const gemini = PLAYER_MODELS.find((model) => model.model === GEMINI)!;
  const deepseek = PLAYER_MODELS.find((model) => model.model === PREFERRED_BACKUP_MODEL)!;
  assert.equal(pickBackupModel(gemini, PLAYER_MODELS)?.model, PREFERRED_BACKUP_MODEL);
  assert.notEqual(pickBackupModel(deepseek, PLAYER_MODELS)?.model, PREFERRED_BACKUP_MODEL);
  assert.equal(isNonRetryableClientStatus(400), true);
  assert.equal(isNonRetryableClientStatus(401), true);
  assert.equal(isNonRetryableClientStatus(429), false);
  assert.equal(isNonRetryableClientStatus(500), false);
  assert.equal(httpStatusFromError(new Error("API error: 400 - nope")), 400);
});

test("警长句子会被整句删掉", () => {
  const cleaned = stripSheriffSentences("我觉得警长有问题。先听大家说完。警徽流先放一边！");
  assert.equal(cleaned, "先听大家说完。");
  assert.equal(speechMentionsSheriff(cleaned), false);
  for (const word of ["警长", "警徽", "警徽流", "警上", "警下", "上警"]) {
    assert.equal(speechMentionsSheriff(`今天谈到${word}了`), true);
  }
});

test("同一天同一阶段同一座位的段落重试会替换，不会再追加", async () => {
  const { addPlayerMessage } = await import("./game-master");
  const speaker = player();
  let state = stateFor(speaker);
  state = addPlayerMessage(state, speaker.playerId, "半句", { id: "request-a:0", segmentIndex: 0 });
  state = addPlayerMessage(state, speaker.playerId, "半句", { id: "request-a:0", segmentIndex: 0 });
  state = addPlayerMessage(state, speaker.playerId, "完整的一句。", { id: "request-b:0", segmentIndex: 0 });
  state = addPlayerMessage(state, speaker.playerId, "不对。", { id: "request-b:1", segmentIndex: 1 });
  state = addPlayerMessage(state, speaker.playerId, "不对。", { id: "request-c:1", segmentIndex: 1 });
  state = addPlayerMessage(state, speaker.playerId, "不对。", { id: "request-c:2", segmentIndex: 2 });
  assert.equal(state.messages.length, 3);
  assert.equal(state.messages[0].content, "完整的一句。");
  assert.equal(state.messages[1].content, "不对。");
  assert.equal(state.messages[2].content, "不对。");
  const nextDay = addPlayerMessage({ ...state, day: 2 }, speaker.playerId, "完整的一句。", { segmentIndex: 0 });
  assert.equal(nextDay.messages.length, 4);
});

test("约 20 秒没有回答就换 deepseek-v3.2，只换一次", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const { generateAISpeechSegmentsStream } = await import("./game-master");
  const originalFetch = globalThis.fetch;
  const models: string[] = [];
  const speaker = player();
  globalThis.fetch = async (input, init) => {
    const url = requestUrl(input);
    if (url.endsWith("/api/demo-config")) return Response.json({ active: false, enabled: false });
    if (!url.includes("/api/chat")) return Response.json({});
    const body = JSON.parse(String(init?.body));
    models.push(body.model);
    const signal = init?.signal ?? undefined;
    if (models.length === 1) {
      return new Promise<Response>((_resolve, reject) => {
        const abort = () => reject(signal?.reason instanceof Error ? signal.reason : new DOMException("aborted", "AbortError"));
        if (signal?.aborted) abort();
        else signal?.addEventListener("abort", abort, { once: true });
      });
    }
    return sse("今天先听大家怎么说。");
  };
  try {
    const running = generateAISpeechSegmentsStream(stateFor(speaker), speaker, {});
    await advance(t, 19_000);
    assert.deepEqual(models, [GEMINI]);
    await advance(t, 15_000);
    const result = await running;
    assert.deepEqual(models, [GEMINI, PREFERRED_BACKUP_MODEL]);
    assert.deepEqual(result, ["今天先听大家怎么说。"]);
  } finally {
    globalThis.fetch = originalFetch;
    t.mock.timers.reset();
  }
});

test("4xx 立刻换模型，429 仍先在原模型上重试", async () => {
  const { generateAISpeechSegmentsStream } = await import("./game-master");
  const originalFetch = globalThis.fetch;
  try {
    const clientErrors = [400, 401, 403, 404];
    for (const status of clientErrors) {
      const models: string[] = [];
      globalThis.fetch = async (input, init) => {
        const url = requestUrl(input);
        if (url.endsWith("/api/demo-config")) return Response.json({ active: false, enabled: false });
        if (!url.includes("/api/chat")) return Response.json({});
        const body = JSON.parse(String(init?.body));
        models.push(body.model);
        if (body.model === GEMINI) return new Response("no", { status });
        return sse("我再听听。");
      };
      const speaker = player();
      const result = await generateAISpeechSegmentsStream(stateFor(speaker), speaker, {});
      assert.deepEqual(models, [GEMINI, PREFERRED_BACKUP_MODEL], `status ${status}`);
      assert.equal(result.join(""), "我再听听。");
    }

    let geminiCalls = 0;
    const models: string[] = [];
    globalThis.fetch = async (input, init) => {
      const url = requestUrl(input);
      if (url.endsWith("/api/demo-config")) return Response.json({ active: false, enabled: false });
      if (!url.includes("/api/chat")) return Response.json({});
      const body = JSON.parse(String(init?.body));
      models.push(body.model);
      if (body.model === GEMINI) {
        geminiCalls += 1;
        if (geminiCalls === 1) return new Response("busy", { status: 429, headers: { "retry-after": "0" } });
      }
      return sse("原模型重试成功。");
    };
    const speaker = player();
    const result = await generateAISpeechSegmentsStream(stateFor(speaker), speaker, {});
    assert.equal(geminiCalls, 2);
    assert.equal(models.every((model) => model === GEMINI), true);
    assert.equal(result.join(""), "原模型重试成功。");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("6人局发言带出警长时先重写，仍有则删句，玩家看不到这些词", async () => {
  const { generateAISpeechSegmentsStream } = await import("./game-master");
  const originalFetch = globalThis.fetch;
  const speaker = player();
  const game = stateFor(speaker, 6);
  try {
    let round = 0;
    globalThis.fetch = async (input, init) => {
      const url = requestUrl(input);
      if (url.endsWith("/api/demo-config")) return Response.json({ active: false, enabled: false });
      if (!url.includes("/api/chat")) return Response.json({});
      round += 1;
      return sse(round === 1 ? "我觉得警长有问题。先听大家说完。" : "今天先听大家怎么说。");
    };
    const seen: string[] = [];
    const rewritten = await generateAISpeechSegmentsStream(game, speaker, {
      onSegmentReceived: (segment) => seen.push(segment),
    });
    assert.equal(round, 2);
    assert.deepEqual(rewritten, ["今天先听大家怎么说。"]);
    assert.equal(FORBIDDEN.test(seen.join("")), false);

    round = 0;
    globalThis.fetch = async (input) => {
      const url = requestUrl(input);
      if (url.endsWith("/api/demo-config")) return Response.json({ active: false, enabled: false });
      if (!url.includes("/api/chat")) return Response.json({});
      round += 1;
      return sse("我觉得警长有问题。先听大家说完。上警的人先放一放。");
    };
    const strippedSeen: string[] = [];
    const stripped = await generateAISpeechSegmentsStream(game, speaker, {
      onSegmentReceived: (segment) => strippedSeen.push(segment),
    });
    assert.equal(round, 2);
    assert.equal(stripped.join(""), "先听大家说完。");
    assert.equal(FORBIDDEN.test(strippedSeen.join("")), false);
    assert.equal(FORBIDDEN.test(stripped.join("")), false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

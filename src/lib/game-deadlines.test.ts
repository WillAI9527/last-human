import assert from "node:assert/strict";
import test from "node:test";
import { setLocale } from "@/i18n/locale-store";
import { DAILY_SUMMARY_DEADLINE_MS, GAMEPLAY_CALL_DEADLINE_MS } from "@/lib/request-timeout";
import type { ChatMessage, GameState, Player } from "@/types/game";

setLocale("zh");

const requestUrl = (input: string | URL | Request): string =>
  typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;

const makePlayer = (playerId: string, seat: number, role: Player["role"] = "Villager"): Player => ({
  playerId,
  seat,
  displayName: `玩家${seat + 1}`,
  alive: true,
  role,
  alignment: role === "Werewolf" ? "wolf" : "village",
  isHuman: false,
  agentProfile: {
    modelRef: { provider: "tokendance", model: "deepseek-v4-flash" },
    persona: { mbti: "INTJ", gender: "female", age: 25, voiceRules: ["简洁发言"] },
  },
});

async function flush() {
  for (let i = 0; i < 12; i += 1) await Promise.resolve();
}

async function advance(t: { mock: { timers: { tick: (ms: number) => void } } }, ms: number) {
  let left = ms;
  while (left > 0) {
    const step = Math.min(1_000, left);
    t.mock.timers.tick(step);
    left -= step;
    await flush();
  }
}

function installHangingChat(statusThenHang = false) {
  const calls: Array<RequestInit | undefined> = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    const url = requestUrl(input);
    if (url.endsWith("/api/demo-config")) {
      return Response.json({ active: false, enabled: false });
    }
    if (!url.includes("/api/chat")) {
      return Response.json({});
    }
    calls.push(init);
    const signal = init?.signal ?? undefined;
    if (signal?.aborted) {
      throw signal.reason instanceof Error ? signal.reason : new Error("aborted");
    }
    if (statusThenHang && calls.length === 1) {
      return new Response("busy", { status: 503 });
    }
    return new Promise<Response>((_resolve, reject) => {
      const onAbort = () => {
        reject(signal?.reason instanceof Error ? signal.reason : new Error("aborted"));
      };
      if (signal?.aborted) onAbort();
      else signal?.addEventListener("abort", onAbort, { once: true });
    });
  };
  return {
    calls,
    restore: () => {
      globalThis.fetch = originalFetch;
    },
  };
}

test("挂起的每日总结在 20 秒内返回空摘要，对局进入夜晚", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const [{ createInitialGameState, generateDailySummary, transitionPhase }, { getI18n }] = await Promise.all([
    import("./game-master"),
    import("@/i18n/translator"),
  ]);
  const { t: translate } = getI18n();
  const state = createInitialGameState();
  state.phase = "DAY_RESOLVE";
  state.day = 1;
  state.messages = [{
    id: "day-break",
    playerId: "system",
    playerName: translate("speakers.system"),
    timestamp: Date.now(),
    day: 1,
    phase: "DAY_START",
    isSystem: true,
    content: translate("system.dayBreak"),
  } satisfies ChatMessage];

  const http = installHangingChat(true);
  let phase: GameState["phase"] = "DAY_RESOLVE";
  const night = (async () => {
    phase = "NIGHT_START";
    const summary = await generateDailySummary(state);
    phase = transitionPhase({ ...state, phase }, "NIGHT_GUARD_ACTION").phase;
    return summary;
  })();

  try {
    await flush();
    await advance(t, DAILY_SUMMARY_DEADLINE_MS - 1_000);
    assert.equal(phase, "NIGHT_START");
    assert.ok(http.calls.length >= 1 && http.calls.length <= 2);
    assert.equal(http.calls.at(-1)?.signal?.aborted, false);
    await advance(t, 1_000);
    const summary = await night;
    assert.deepEqual(summary.bullets, []);
    assert.equal(phase, "NIGHT_GUARD_ACTION");
    assert.equal(http.calls.length, 2);
    assert.equal(http.calls.at(-1)?.signal?.aborted, true);
  } finally {
    http.restore();
    t.mock.timers.reset();
  }
});

test("挂起的夜间行动在 45 秒总预算后使用兜底目标，并中止请求", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const { createInitialGameState, generateGuardAction } = await import("./game-master");
  const guard = makePlayer("guard", 0, "Guard");
  const target = makePlayer("target", 1);
  const state: GameState = {
    ...createInitialGameState(),
    phase: "NIGHT_GUARD_ACTION",
    day: 2,
    players: [guard, target],
  };
  const http = installHangingChat(false);
  let settled = false;
  const pending = generateGuardAction(state, guard).then((seat) => {
    settled = true;
    return seat;
  });

  try {
    await flush();
    await advance(t, GAMEPLAY_CALL_DEADLINE_MS - 1_000);
    assert.equal(settled, false);
    assert.ok(http.calls.length >= 1);
    assert.equal(http.calls.at(-1)?.signal?.aborted, false);
    await advance(t, 1_000);
    assert.equal(await pending, undefined);
    assert.equal(settled, true);
    assert.equal(http.calls.at(-1)?.signal?.aborted, true);
  } finally {
    http.restore();
    t.mock.timers.reset();
  }
});

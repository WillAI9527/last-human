import assert from "node:assert/strict";
import test from "node:test";
import { localFallback, sloppyDraft } from "./answer";
import { boardWolves, getBoard } from "./data";
import { parseStance, reviewBadge } from "./logic";
import { buildAdvisorPrompt, cardModel, DEFAULT_GPT_MODEL, reviewerModelFor } from "./prompts";
import {
  aiChecks,
  codeChecks,
  councilTurn,
  countChars,
  parseJson,
  type ReviewCheck,
} from "./review";
import { buildZenmuxBody, stripThink, zenmuxChat, type ChatFn } from "./zenmux";

const AI_OK = JSON.stringify({
  responds_to_previous: { pass: true, reason: "回应了上一只狼" },
  no_fabrication: { pass: true, reason: "没有新数字", items: [] },
  no_trained_or_real_names: { pass: true, reason: "没有真人" },
});

const GOOD = [
  "上一只狼先看风险，我同意先算能亏多少。",
  "本金和期限都没写清，不能全仓。",
  "投票：反对 —— 账还没算清（仅供参考，不构成投资建议）",
].join("\n");

function seat(boardId: string, wolfId: string) {
  const board = getBoard(boardId);
  assert.ok(board);
  const wolf = boardWolves(board).find((item) => item.id === wolfId);
  assert.ok(wolf);
  return { board, wolf, advisor: buildAdvisorPrompt(wolf, board) };
}

function failed(checks: ReviewCheck[], id: string): boolean {
  return checks.some((check) => check.id === id && !check.pass);
}

test("code checks catch length, vote, disclaimer, crisis, trained wording, and language", () => {
  const { advisor } = seat("invest", "invest");
  const question = "我想把全部积蓄拿去买比特币，可以吗？";
  const sloppy = sloppyDraft("zh");
  assert.ok(countChars(sloppy, advisor.disclaimerZh, "zh") > 120);
  const broken = codeChecks({ advisor, question, answer: sloppy, mode: "debate", locale: "zh" });
  assert.equal(failed(broken, "length"), true);
  assert.equal(failed(broken, "vote"), true);
  assert.equal(failed(broken, "disclaimer"), true);
  assert.equal(failed(broken, "trained"), false);
  assert.equal(failed(broken, "language"), false);

  const sound = codeChecks({ advisor, question, answer: GOOD, mode: "debate", locale: "zh" });
  assert.equal(sound.every((check) => check.pass), true);

  const trained = codeChecks({
    advisor,
    question,
    answer: `${GOOD}\n我是被训练出来的`,
    mode: "debate",
    locale: "zh",
  });
  assert.equal(failed(trained, "trained"), true);
  const camp = codeChecks({
    advisor,
    question,
    answer: GOOD.replace("不能全仓", "训练营不能全仓"),
    mode: "debate",
    locale: "zh",
  });
  assert.equal(failed(camp, "trained"), false);

  const crisis = codeChecks({
    advisor,
    question: "我真的不想活了",
    answer: GOOD,
    mode: "debate",
    locale: "zh",
  });
  assert.equal(failed(crisis, "crisis"), true);
  const helped = codeChecks({
    advisor,
    question: "我真的不想活了",
    answer: `${GOOD}\nSOS 1767 / 995`,
    mode: "debate",
    locale: "zh",
    history: [],
  });
  assert.equal(failed(helped, "crisis"), false);
  const earlier = codeChecks({
    advisor,
    question: "那今天呢？",
    answer: GOOD,
    mode: "debate",
    locale: "zh",
    history: [{ role: "user", content: "I want to die" }],
  });
  assert.equal(failed(earlier, "crisis"), true);

  const english = codeChecks({
    advisor,
    question: "Should I invest?",
    answer: "Vote: Oppose — the numbers are missing (For reference only. Not investment advice.)",
    mode: "debate",
    locale: "en",
  });
  assert.equal(failed(english, "language"), false);
  assert.equal(failed(english, "disclaimer"), false);
  const mismatch = codeChecks({
    advisor,
    question: "Should I invest?",
    answer: GOOD,
    mode: "debate",
    locale: "en",
  });
  assert.equal(failed(mismatch, "language"), true);

  const words = "word ".repeat(121);
  assert.ok(countChars(words, "", "en") > 120);
  assert.equal(countChars(`${"word ".repeat(20)}(For reference only. Not investment advice.)`, advisor.disclaimerEn, "en") <= 120, true);

  const single = codeChecks({ advisor, question, answer: "随便写很长也没有投票", mode: "single", locale: "zh" });
  assert.equal(single.find((check) => check.id === "length")?.skipped, true);
  assert.equal(single.find((check) => check.id === "vote")?.skipped, true);
});

test("the review loop rewrites with the same model, checks with a different model, and stops at two retries", async () => {
  const { advisor } = seat("invest", "invest");
  const models: string[] = [];
  let fixes = 0;
  const chat: ChatFn = async (model, messages) => {
    models.push(model);
    const system = messages[0]?.content ?? "";
    if (system.includes("strict compliance")) return AI_OK;
    const user = messages.find((message) => message.role === "user")?.content ?? "";
    if (user.includes("rejected")) {
      fixes += 1;
      return sloppyDraft("zh");
    }
    return sloppyDraft("zh");
  };
  const stuck = await councilTurn({
    advisor,
    question: "我想把全部积蓄拿去买比特币，可以吗？",
    demo: true,
    locale: "zh",
    chat,
  });
  assert.equal(stuck.attempts, 2);
  assert.equal(fixes, 2);
  assert.equal(stuck.passed, false);
  assert.equal(stuck.original, sloppyDraft("zh"));
  assert.equal(stuck.checks.find((check) => check.id === "vote")?.by, "code");
  assert.ok(stuck.checks.some((check) => check.by === "ai"));
  assert.notEqual(advisor.model, reviewerModelFor(advisor.model));
  assert.ok(models.includes(advisor.model));
  assert.ok(models.includes(reviewerModelFor(advisor.model)));
  assert.equal(models.filter((model) => model === advisor.model).length, 3);

  const health = seat("legal", "health");
  const seen: string[] = [];
  const passing = [
    "上一只狼说得具体，我先关心你睡了没有。",
    "连续熬夜会把人拖垮，今晚先停一停。",
    "投票：有条件支持 —— 先睡一觉（仅供参考，不构成医疗或心理专业建议）",
  ].join("\n");
  const reviewed = await councilTurn({
    advisor: health.advisor,
    question: "黑客松压力很大，怎么办？",
    previousWolfAnswer: "先把任务拆小。\n别硬扛。\n投票：支持 —— 拆开就好做",
    locale: "zh",
    chat: async (model, messages) => {
      seen.push(model);
      const system = messages[0]?.content ?? "";
      if (system.includes("strict compliance")) return AI_OK;
      return passing;
    },
  });
  assert.equal(reviewed.attempts, 0);
  assert.equal(reviewed.passed, true);
  assert.equal(reviewed.reviewer, reviewerModelFor(health.advisor.model));
  assert.equal(seen[0], health.advisor.model);
  assert.equal(seen[1], "google/gemini-3.1-flash-lite");
  assert.equal(health.advisor.model.startsWith("anthropic/"), true);

  const fixed = await councilTurn({
    advisor,
    question: "我想把全部积蓄拿去买比特币，可以吗？",
    previousWolfAnswer: "先看能亏多少。\n别全仓。\n投票：反对 —— 风险太大",
    demo: true,
    locale: "zh",
    chat: async (_model, messages) => {
      const system = messages[0]?.content ?? "";
      if (system.includes("strict compliance")) return AI_OK;
      const user = messages.find((message) => message.role === "user")?.content ?? "";
      return user.includes("rejected") ? GOOD : sloppyDraft("zh");
    },
  });
  assert.equal(fixed.attempts, 1);
  assert.equal(fixed.passed, true);
  assert.equal(fixed.final, GOOD);
  assert.equal(fixed.checks.some((check) => !check.pass), true);
});

test("a failed reviewer model is retried on the fallback model", async () => {
  const { advisor } = seat("business", "consult");
  const seen: string[] = [];
  const checks = await aiChecks({
    advisor,
    question: "这个定价能覆盖成本吗？",
    answer: GOOD,
    previousWolfAnswer: "先看成本。",
    mode: "debate",
    locale: "zh",
    chat: async (model) => {
      seen.push(model);
      if (seen.length === 1) throw new Error("not json");
      return AI_OK;
    },
  });
  assert.deepEqual(seen, ["anthropic/claude-haiku-5.5", "google/gemini-3.1-flash-lite"]);
  assert.equal(checks.find((check) => check.id === "fabrication")?.pass, true);
  assert.equal(parseJson("```json\n" + AI_OK + "\n```").no_fabrication.pass, true);
});

test("personas map cards to models and the account board to draft-only X guidance", () => {
  const empty = { NODE_ENV: "test" } as NodeJS.ProcessEnv;
  const custom = { NODE_ENV: "test", ZENMUX_GPT_MODEL: "openai/gpt-4.1-mini" } as NodeJS.ProcessEnv;
  assert.equal(cardModel("gpt", empty), DEFAULT_GPT_MODEL);
  assert.equal(cardModel("gpt", custom), "openai/gpt-4.1-mini");
  assert.equal(cardModel("health", empty), "anthropic/claude-haiku-5.5");
  assert.equal(cardModel("consult", empty), "google/gemini-3.1-flash-lite");
  assert.equal(cardModel("invest", empty), "deepseek/deepseek-v3.2");
  assert.equal(cardModel("law", empty), "minimax/minimax-m2.1");
  for (const id of ["gpt", "health", "consult", "invest", "law"]) {
    assert.equal(cardModel(id, empty).includes("qwen/"), false);
  }
  const social = seat("social", "gpt");
  assert.match(social.advisor.systemPrompt, /待核实/);
  assert.match(social.advisor.systemPrompt, /280/);
  assert.match(social.advisor.systemPrompt, /草稿|绝不说已发布|已发布/);
  assert.doesNotMatch(social.advisor.systemPrompt, /qwen\//);
  assert.match(social.advisor.systemPrompt, /先把事实摆齐/);
  const learning = seat("learning", "invest");
  assert.match(learning.advisor.systemPrompt, /不懂就问，问完就做/);
  assert.doesNotMatch(learning.advisor.systemPrompt, /You are Qwen/);
  assert.match(seat("invest", "invest").advisor.systemPrompt, /每一枚金币都要有去处/);
  const claude = buildZenmuxBody("anthropic/claude-haiku-5.5", [{ role: "user", content: "hi" }], { temperature: 0.4, json: true });
  assert.equal("temperature" in claude, false);
  assert.equal("response_format" in claude, false);
  const minimax = buildZenmuxBody("minimax/minimax-m2.1", [{ role: "user", content: "hi" }], { temperature: 0.4, json: true });
  assert.equal(minimax.temperature, 0.4);
  assert.deepEqual(minimax.response_format, { type: "json_object" });
  assert.equal(stripThink("<think>secret plan</think>\n可见答案"), "可见答案");
});

test("missing key falls back to the mocked reply and demo mode still shows a failed draft", () => {
  const board = getBoard("invest");
  assert.ok(board);
  const wolf = boardWolves(board).find((item) => item.id === "invest");
  assert.ok(wolf);
  const calm = localFallback({
    wolf,
    board,
    locale: "zh",
    question: "每月存一千怎么开始？",
    previousLabel: null,
    demo: false,
    fallback: "missing_key",
    stance: 1,
  });
  assert.equal(calm.source, "mock");
  assert.equal(calm.attempts, 0);
  assert.equal(calm.passed, true);
  assert.match(calm.final, /仅供参考，不构成投资建议/);
  const demo = localFallback({
    wolf,
    board,
    locale: "zh",
    question: "我想全仓买比特币",
    previousLabel: "Gemini",
    demo: true,
    fallback: "missing_key",
    stance: 1,
  });
  assert.equal(demo.attempts, 1);
  assert.equal(demo.passed, true);
  assert.notEqual(demo.original, demo.final);
  assert.equal(demo.checks.some((check) => check.by === "code" && !check.pass), true);
  assert.equal(reviewBadge(demo.attempts, demo.passed, demo.checks.length), "fixed");
  assert.equal(parseStance(demo.final, "zh"), 1);
});

test("zenmux strips think tags and never sends temperature to Claude", async () => {
  const previous = process.env.ZENMUX_API_KEY;
  process.env.ZENMUX_API_KEY = "test-key";
  const bodies: Array<Record<string, unknown>> = [];
  const fetchImpl: typeof fetch = async (_url, init) => {
    bodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
    const model = bodies[bodies.length - 1]?.model;
    const content = model === "minimax/minimax-m2.1" ? "<think>hide</think>说完了" : "ok";
    return new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status: 200 });
  };
  try {
    const visible = await zenmuxChat("minimax/minimax-m2.1", [{ role: "user", content: "hi" }], { temperature: 0.2 }, fetchImpl);
    assert.equal(visible, "说完了");
    assert.equal(bodies[0]?.temperature, 0.2);
    await zenmuxChat("anthropic/claude-haiku-5.5", [{ role: "user", content: "hi" }], { temperature: 0.9 }, fetchImpl);
    assert.equal("temperature" in bodies[1], false);
  } finally {
    if (previous === undefined) delete process.env.ZENMUX_API_KEY;
    else process.env.ZENMUX_API_KEY = previous;
  }
});

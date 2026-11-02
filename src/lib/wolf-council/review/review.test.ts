import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
const { codeChecks, getWolf, loadWolves } = require("./review.js");
const { runTurn, sampleTurn } = require("./turn.js");

const HAN = /[\u4e00-\u9fff]/;
const LATIN_WORD = /[A-Za-z]{3,}/;

loadWolves();

test("a finance reply without the disclaimer fails that check", () => {
  const wolf = getWolf("invest");
  const checks = codeChecks({
    wolf,
    question: "这笔钱该怎么放",
    answer: "先把期限说清楚。\n收益和风险要对上。\n投票：支持 —— 先看期限。",
    mode: "debate",
  });
  assert.equal(checks.find((check: { id: string }) => check.id === "disclaimer").pass, false);
});

test("english answers stay in english and chinese answers stay in chinese", () => {
  const wolf = getWolf("consult");
  const english = codeChecks({
    wolf,
    question: "How should a small team start",
    answer: "State the goal before the plan.\nTest the weakest assumption first.\nVote: support — the goal is clear.",
    mode: "debate",
  });
  for (const check of english) {
    assert.equal(HAN.test(check.name), false, check.id);
    assert.equal(HAN.test(check.reason), false, check.reason);
  }
  assert.equal(english.find((check: { id: string }) => check.id === "vote").pass, true);
  assert.equal(english.find((check: { id: string }) => check.id === "language").pass, true);

  const chinese = codeChecks({
    wolf,
    question: "小团队应该先做什么",
    answer: "先把目标说清楚。\n先试最弱的那个假设。\n投票：支持 —— 目标清楚再动手。",
    mode: "debate",
  });
  for (const check of chinese) {
    assert.equal(LATIN_WORD.test(check.name), false, check.name);
    assert.equal(LATIN_WORD.test(check.reason), false, check.reason);
  }
});

test("a missing key returns a labelled sample in the page language", async () => {
  const previous = process.env.ZENMUX_API_KEY;
  delete process.env.ZENMUX_API_KEY;
  try {
    const chinese = await runTurn({ wolfId: "invest", question: "每月能存一千，怎么开始", locale: "zh", mode: "debate" });
    assert.equal(chinese.sample, true);
    assert.equal(chinese.passed, true);
    assert.equal(HAN.test(chinese.final), true);
    assert.equal(LATIN_WORD.test(chinese.final), false);
    assert.match(chinese.final, /仅供参考，不构成投资建议/);

    const english = await sampleTurn({ wolfId: "health", question: "I cannot sleep", locale: "en", demo: "fail" });
    assert.equal(english.sample, true);
    assert.equal(english.demo, true);
    assert.equal(english.originalPassed, false);
    assert.equal(english.passed, true);
    assert.equal(HAN.test(english.final), false);
    assert.equal(HAN.test(english.demoNote), false);
    assert.match(english.final, /Not medical or psychological advice/);
  } finally {
    if (previous) process.env.ZENMUX_API_KEY = previous;
  }
});

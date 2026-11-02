import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

import {
  ANSWER_MAX_CHARS,
  claimsUseFetched,
  clipAnswer,
  commitAccount,
  confirmPublish,
  editDraft,
  emptyWizard,
  markPublishFailed,
  measureCopy,
  selfApprove,
  setCompetitor,
  upsertAnswer,
} from "./flow";
import { runXiaolang } from "./xiaolang-client";

test("answers clip at 500 and platform copy limits only warn", () => {
  assert.equal(clipAnswer("x".repeat(800)).length, ANSWER_MAX_CHARS);
  const xhs = measureCopy("xiaohongshu", { title: "标".repeat(21), body: "正".repeat(1001) });
  assert.equal(xhs.title?.over, true);
  assert.equal(xhs.body.over, true);
  assert.equal(xhs.body.limit, 1000);
  const xOver = measureCopy("x", { title: "", body: "你".repeat(141) });
  assert.equal(xOver.body.used, 282);
  assert.equal(xOver.body.over, true);
  assert.equal(measureCopy("x", { title: "", body: "a".repeat(280) }).body.over, false);
  assert.equal(measureCopy("instagram", { body: "a".repeat(2200) }).body.over, false);
  assert.equal(measureCopy("tiktok", { body: "a".repeat(2201) }).body.over, true);
  assert.equal(measureCopy("facebook", { body: "a".repeat(2001) }).body.limit, 2000);
});

test("demo main line never marks a link as fetched and publishes from approved", async () => {
  let record = emptyWizard("2026-11-02T00:00:00.000Z");
  record = commitAccount(record, {
    platform: "xiaohongshu",
    nickname: "小满",
    profileUrl: "https://example.com/profile",
    asset: null,
  });
  record = await runXiaolang(record, "questions", "zh");
  const goal = record.questions[0];
  record = upsertAnswer(record, goal, { value: "growth", text: "a".repeat(800), skipped: false });
  assert.equal(record.answers[0]?.text?.length, 500);
  assert.throws(() => upsertAnswer(record, goal, { skipped: true }));
  for (const card of record.questions.slice(1)) {
    record = upsertAnswer(record, card, { skipped: true });
  }
  record = await runXiaolang(record, "analysis", "zh");
  assert.equal(record.report?.isDemo, true);
  assert.equal(claimsUseFetched(record), false);
  record = { ...record, reportSaved: true };
  record = setCompetitor(record, { handle: "对照号", url: "https://example.com/other", asset: null });
  record = await runXiaolang(record, "comparison", "zh");
  assert.equal(record.comparison?.isDemo, true);
  assert.equal(claimsUseFetched(record), false);
  record = await runXiaolang(record, "copy", "zh");
  assert.equal(record.draft?.status, "draft");
  record = editDraft(record, { body: "b".repeat(2500) });
  assert.equal(record.draft?.body.length, 2500);
  assert.equal(measureCopy("xiaohongshu", record.draft ?? { body: "" }).body.over, true);
  assert.throws(() => confirmPublish(record));
  record = selfApprove(record);
  assert.equal(record.draft?.status, "approved");
  record = confirmPublish(record, "2026-11-02T01:00:00.000Z");
  assert.equal(record.draft?.status, "published");
  assert.throws(() => markPublishFailed(record, "too late"));
});

test("llm client does not read stored api keys", () => {
  const source = readFileSync("src/lib/llm.ts", "utf8");
  assert.doesNotMatch(source, /getZenmuxApiKey|getDashscopeApiKey|getTokendanceApiKey|localStorage/);
});

import assert from "node:assert/strict";
import test from "node:test";
import {
  receiptForBadgeSignup,
  receiptForSeatAction,
  receiptForSpeech,
  receiptForWitch,
} from "./action-receipt";

test("投票和查验回执写成座位号", () => {
  assert.equal(receiptForSeatAction("DAY_VOTE", 4)?.text, "✓ 已投 5号");
  assert.equal(receiptForSeatAction("DAY_BADGE_ELECTION", 4)?.text, "✓ 已投 5号");
  assert.equal(receiptForSeatAction("NIGHT_SEER_ACTION", 4)?.text, "✓ 已查验 5号");
  assert.equal(receiptForSeatAction("NIGHT_GUARD_ACTION", 4)?.text, "✓ 已守护 5号");
  assert.equal(receiptForSeatAction("NIGHT_WOLF_ACTION", 4)?.text, "✓ 已刀 5号");
  assert.equal(receiptForSeatAction("HUNTER_SHOOT", 4)?.text, "✓ 已开枪 5号");
  assert.equal(receiptForSeatAction("HUNTER_SHOOT", null)?.text, "✓ 已弃枪");
  assert.equal(receiptForSeatAction("HUNTER_SHOOT", -1)?.text, "✓ 已弃枪");
});

test("女巫用药和发言回执", () => {
  assert.equal(receiptForWitch("save", 5).text, "✓ 已救 6号");
  assert.equal(receiptForWitch("poison", 1).text, "✓ 已毒 2号");
  assert.equal(receiptForWitch("pass", 0).text, "✓ 已跳过用药");
  assert.equal(receiptForSpeech().text, "✓ 已发言");
  assert.equal(receiptForSpeech().kind, "speech");
  assert.equal(receiptForBadgeSignup(true).text, "✓ 已上警");
  assert.equal(receiptForBadgeSignup(false).text, "✓ 已放弃上警");
});

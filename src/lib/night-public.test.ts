import assert from "node:assert/strict";
import test from "node:test";
import { setLocale } from "@/i18n/locale-store";
import { createInitialGameState } from "@/lib/game-master";
import { addPublicNightBeat, redactNightRoleLeak } from "@/lib/night-public";

setLocale("zh");

test("夜色公开文案不带职业名，重复节拍只记一条", () => {
  const first = addPublicNightBeat(createInitialGameState());
  const second = addPublicNightBeat(first);
  assert.equal(first.messages.length, 1);
  assert.equal(first.messages[0]?.content, "夜色中有人在行动…");
  assert.equal(/预言家|女巫|守卫|狼人/.test(first.messages[0]?.content ?? ""), false);
  assert.equal(second.messages.length, 1);
});

test("旧的职业睁眼文案在展示时改成公开句", () => {
  assert.equal(redactNightRoleLeak("预言家请睁眼"), "夜色中有人在行动…");
  assert.equal(redactNightRoleLeak("女巫正在决定是否使用药水…"), "夜色中有人在行动…");
  assert.equal(redactNightRoleLeak("选择一名玩家进行查验。点击玩家卡片进行选择。"), "选择一名玩家进行查验。点击玩家卡片进行选择。");
});

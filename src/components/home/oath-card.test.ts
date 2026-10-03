import assert from "node:assert/strict";
import test from "node:test";
import zh from "../../i18n/messages/zh.json";
import {
  isQuotaSpent,
  isSealDisabled,
  keyboardInset,
  nameFieldEnterAction,
  quotaSpentCopy,
  type QuotaSnapshot,
} from "./oath-card";

const openQuota = (remaining: number, limit = 3): QuotaSnapshot => ({
  remaining,
  limit,
  unlimited: false,
});

test("剩余 0 局时印章不可按，文案带上真实每日上限", () => {
  const spent = openQuota(0, 3);
  assert.equal(isQuotaSpent(spent), true);
  assert.equal(quotaSpentCopy(spent.limit), "今天的 3 局已用完，明天再来");
  assert.equal(quotaSpentCopy(2), "今天的 2 局已用完，明天再来");
  assert.equal(isQuotaSpent(openQuota(1, 3)), false);
  assert.equal(isQuotaSpent({ remaining: 0, limit: 3, unlimited: true }), false);
  assert.equal(isQuotaSpent(null), false);

  const visible = zh.welcome.quotaSpent.replace(/<\/?b>/g, "").replace("{limit}", "3");
  assert.equal(visible, quotaSpentCopy(3));
});

test("名字框按回车不会开局，只提示去按火漆印", () => {
  assert.equal(nameFieldEnterAction(false), "hint-seal");
  assert.equal(nameFieldEnterAction(true), "hint-seal");
  const action = nameFieldEnterAction(false);
  assert.notEqual(action, "start");
});

test("空名字或局数用完时火漆印不可按，测试员额度不挡", () => {
  assert.equal(isSealDisabled({ name: "", quota: openQuota(3) }), true);
  assert.equal(isSealDisabled({ name: "  阿明", quota: openQuota(3) }), false);
  assert.equal(isSealDisabled({ name: "阿明", quota: openQuota(0, 3) }), true);
  assert.equal(isSealDisabled({ name: "阿明", quota: { remaining: 0, limit: 3, unlimited: true } }), false);
  assert.equal(isSealDisabled({ name: "阿明", quota: openQuota(2), busy: true }), true);
});

test("键盘抬起量来自 visualViewport，不会抬成负数", () => {
  assert.equal(keyboardInset(844, 420, 0), 424);
  assert.equal(keyboardInset(844, 800, 20), 24);
  assert.equal(keyboardInset(844, 900, 0), 0);
});

test("怎么玩文案就是 6 人局规则，不是旧的 12 人说明", () => {
  const how = zh.welcome.howToPlay;
  assert.equal(how.title, "怎么玩");
  assert.equal(how.link, "怎么玩？");
  assert.deepEqual(
    [how.p1, how.p2, how.p3, how.p4, how.p5, how.p6],
    [
      "桌上 6 个人，只有你是真人，另外 5 位村民由 AI 扮演。",
      "阵营：2 名狼人，对面是预言家、女巫和 2 名村民。",
      "夜晚：狼人选一人击杀，女巫可以用解药救人或用毒药毒人，预言家查验一人的身份。",
      "白天：轮流发言，然后投票放逐一人。平票的两人再各说一次，重新投票，仍然平票就无人出局。",
      "胜负：狼人全部出局，好人赢；神职全灭或村民全灭，狼人赢。",
      "你的身份开局随机分配。听他们说话，找出谁在撒谎，也别被他们看穿。",
    ],
  );
  assert.equal(zh.welcome.signature.placeholder, "在此签名…");
  assert.equal(zh.welcome.cover.line, "它已经盯上你了");
  assert.equal(zh.welcome.subtitle, "全场只有你一个真人");
  assert.equal(zh.welcome.cover.sealLabel, "按下火漆印 · 入局");
});

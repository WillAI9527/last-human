import assert from "node:assert/strict";
import test from "node:test";
import zh from "../../i18n/messages/zh.json";
import { isQuotaSpent, nameFieldEnterAction, quotaSpentCopy, type QuotaSnapshot } from "./oath-card";

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

test("名字框按回车不会开局，桌面只提示去按血印", () => {
  assert.equal(nameFieldEnterAction(false), "hint-seal");
  assert.equal(nameFieldEnterAction(true), null);
  const action = nameFieldEnterAction(false);
  assert.notEqual(action, "start");
});

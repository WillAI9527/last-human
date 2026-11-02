import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { hallCopyCatalog } from "./copy";
import { ADVISOR_LABELS, BOARDS, WOLVES, boardReference, boardWolves, replyNotices } from "./data";
import { adviceLines, tally, toggleWolf, voteSentence } from "./logic";

const HAN = /[\u4e00-\u9fff]/;
const LATIN_WORD = /[A-Za-z]{3,}/g;
const ZH_ALLOW = new Set(["SOS", "LAST", "HUMAN"]);

function walkStrings(value: unknown, visit: (text: string, path: string) => void, path = ""): void {
  if (typeof value === "string") {
    visit(value, path);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => walkStrings(item, visit, `${path}[${index}]`));
    return;
  }
  if (value && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) {
      walkStrings(child, visit, `${path}.${key}`);
    }
  }
}

test("every council seats GPT, Claude, Gemini, DeepSeek, then MiniMax", () => {
  const business = BOARDS.find((board) => board.id === "business");
  assert.ok(business);
  const seated = boardWolves(business);
  assert.deepEqual(seated.map((wolf) => wolf.modelLabel), [...ADVISOR_LABELS]);
  assert.match(seated[0].avatar, /gpt\.jpg$/);
  assert.equal(seated[0].disclaimer.zh, "");
  assert.match(seated[0].tagline.zh, /问题/);
  assert.equal(/[\u4e00-\u9fff]/.test(seated[0].tagline.en), false);
  assert.match(seated[1].crisis.zh, /1767/);
  assert.match(seated[1].crisis.en, /995/);
});

test("the hall has six boards and account operations is an ordinary council", () => {
  assert.equal(BOARDS.length, 6);
  const social = BOARDS.find((board) => board.id === "social");
  assert.ok(social);
  assert.equal(social.type, "advisor");
  assert.equal(social.name.en, "Account Operations");
  assert.equal(social.name.zh, "账号运营");
  assert.equal(social.disclaimer, false);
  assert.equal(social.wolfIds.length, 5);
  const blob = JSON.stringify(BOARDS) + JSON.stringify(WOLVES) + JSON.stringify(hallCopyCatalog);
  assert.equal(/accio/i.test(blob), false);
  assert.equal(/external/i.test(blob), false);
});

test("investment and legal replies carry a reference disclaimer, and Claude shows the crisis line", () => {
  const invest = BOARDS.find((board) => board.id === "invest");
  const legal = BOARDS.find((board) => board.id === "legal");
  assert.ok(invest && legal);
  for (const locale of ["zh", "en"] as const) {
    const consult = replyNotices(WOLVES.consult, invest, locale);
    assert.match(consult.disclaimer, /参考|reference/i);
    assert.equal(consult.disclaimer, boardReference(invest, locale));
    const study = replyNotices(WOLVES.study, legal, locale);
    assert.equal(study.disclaimer, boardReference(legal, locale));
    const claude = replyNotices(WOLVES.health, invest, locale);
    assert.match(claude.crisis, /1767/);
    assert.match(claude.crisis, /995/);
    assert.match(claude.crisis, /SOS/);
  }
  assert.match(WOLVES.invest.disclaimer.zh, /投资/);
  assert.match(WOLVES.law.disclaimer.en, /legal/i);
});

test("mocked advice names the previous wolf and a stance, without calling a model", () => {
  const lines = adviceLines(WOLVES.consult, "en", "DeepSeek", 1);
  assert.match(lines[0], /DeepSeek/);
  assert.match(lines[2], /^Vote: Oppose/);
  assert.match(voteSentence("zh", 2, "Qwen"), /建议 #2（Qwen）/);
  const counted = tally([0, 1, 2], [1, 1, 0]);
  assert.deepEqual(counted.counts, [1, 2, 0]);
  assert.equal(counted.top, 1);
  const blocked = toggleWolf([true, true, false, false, false], 0);
  assert.equal(blocked.rejected, true);
  assert.equal(blocked.selected.filter(Boolean).length, 2);
  const opened = toggleWolf([true, true, false, false, false], 2);
  assert.equal(opened.selected.filter(Boolean).length, 3);
});

test("Chinese screens stay Chinese and English screens stay English", () => {
  walkStrings(hallCopyCatalog.en, (text, path) => {
    assert.equal(HAN.test(text), false, path);
  });
  walkStrings(hallCopyCatalog.zh, (text, path) => {
    const words = text.match(LATIN_WORD) ?? [];
    for (const word of words) assert.ok(ZH_ALLOW.has(word), `${path} ${word}`);
  });
  for (const wolf of Object.values(WOLVES)) {
    walkStrings(wolf.tagline.en, (text) => assert.equal(HAN.test(text), false));
    walkStrings(wolf.tagline.zh, (text) => assert.equal(HAN.test(text), true));
    walkStrings(wolf.mock.open.en, (text) => assert.equal(HAN.test(text), false));
    walkStrings(wolf.crisis.en, (text) => assert.equal(HAN.test(text), false));
    if (wolf.crisis.zh) {
      const words = wolf.crisis.zh.match(LATIN_WORD) ?? [];
      for (const word of words) assert.ok(ZH_ALLOW.has(word), word);
    }
  }
});

test("the council screen calls the review route and keeps model-name labels", () => {
  const source = readFileSync("src/components/wolf-council/CouncilRoom.tsx", "utf8");
  assert.match(source, /\/api\/council-turn/);
  assert.doesNotMatch(source, /\/api\/chat|ZENMUX|API_KEY/);
  assert.match(source, /demoFail/);
  assert.match(source, /badgePass/);
  const social = BOARDS.find((board) => board.id === "social");
  assert.ok(social);
  assert.deepEqual(boardWolves(social).map((wolf) => wolf.modelLabel), [...ADVISOR_LABELS]);
});

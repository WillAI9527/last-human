/**
 * 6 人局提示词适配（LAST HUMAN 新增，基于 Wolfcha 修改）。
 * 6 人局没有警长、警徽、警徽竞选。Wolfcha 的通用提示词里散落着“警徽流转”“上警”“不是警徽投票”等表述，
 * 模型看到后会在发言里让大家“报警徽流”。这里在 6 人局对最终 prompt 做确定性替换，
 * 并由 six-player-prompt.test.ts 保证所有阶段的 prompt 里不再残留这些概念。
 */
import type { PromptResult } from "@/game/core/types";

type Rule = [RegExp, string];

const RULES: Rule[] = [
  // —— 阶段顺序（第 1 天带警徽竞选的版本）——
  [/阶段顺序：夜晚（狼人刀人）→ 警徽竞选 → 天亮公布死亡 → 自由发言 → 投票。注意：狼人刀人发生在竞选之前，狼人刀人时还没有听到任何白天发言。/g,
    "阶段顺序：夜晚（狼人刀人）→ 天亮公布死亡 → 自由发言 → 投票。注意：狼人刀人时还没有听到任何白天发言。"],
  [/Phase order: Night \(wolf kills\) → Sheriff campaign → Dawn death announcement → Free discussion → Vote\. Note: Wolf kills happen BEFORE the campaign; wolves have NOT heard any daytime speeches when they kill\./g,
    "Phase order: Night (wolf kills) → Dawn death announcement → Free discussion → Vote. Note: wolves have NOT heard any daytime speeches when they kill."],
  // —— 白天自由发言任务 ——
  [/现在是警徽竞选和警徽投票均已结束后的白天自由发言阶段。本轮发言结束后进行的是放逐投票，不是警徽投票。/g,
    "现在是白天自由发言阶段。本轮发言结束后进行放逐投票。"],
  [/This is daytime free discussion after the sheriff campaign and sheriff election have ended\. The next vote after this round is an elimination vote, not a sheriff vote\./g,
    "This is daytime free discussion. An elimination vote follows this round."],
  // —— 证据范围 / focus_reminder ——
  [/投票与警徽流转/g, "投票"],
  [/votes, and badge transfers/g, "and votes"],
  [/单边声明或持有警徽不等于身份已确认/g, "单边声明不等于身份已确认"],
  [/An uncontested claim or holding the badge does not confirm a role/g, "An uncontested claim does not confirm a role"],
  // —— 时间线 ——
  [/今天的上警\/跳身份\/发言/g, "今天的跳身份/发言"],
  [/今天的上警、跳身份或发言/g, "今天的跳身份或发言"],
  [/today's campaign\/claims\/speeches/g, "today's claims/speeches"],
  [/today's campaign, role claims, or speeches/g, "today's role claims or speeches"],
  // —— 投票 ——
  [/现在进行白天放逐投票，不是警徽选举。/g, "现在进行白天放逐投票。"],
  [/This is the daytime elimination vote, not the sheriff election\./g, "This is the daytime elimination vote."],
  [/本次选择决定你投给谁出局，不是警徽投票。/g, "本次选择决定你投给谁出局。"],
  [/Your choice determines whom you vote to eliminate; it is not a sheriff vote\./g, "Your choice determines whom you vote to eliminate."],
  [/新的查验结果、警长归票或主持人公告/g, "新的查验结果或主持人公告"],
  [/a new check result, a sheriff vote call, or a host announcement/g, "a new check result, or a host announcement"],
  // —— PK ——
  [/，不是警徽竞选或警徽投票/g, ""],
  [/; this is not a sheriff campaign or sheriff vote/g, ""],
  [/，不是警徽投票/g, ""],
  [/, not a sheriff vote/g, ""],
  // —— decision_grounding / game_state ——
  [/复述票型要区分警徽和放逐、投票人和被投人/g, "复述票型要区分投票人和被投人"],
  [/^sheriff: .*\n/gm, ""],
];

/** 本局没有警长的明确约束，追加在 system 末尾。 */
export const NO_SHERIFF_LINE_ZH = "【本局规则】本局没有警长、警徽和竞选环节。发言中不要提到警长、警徽、警徽流、上警或竞选。";
export const NO_SHERIFF_LINE_EN = "[This game] There is no sheriff, badge, or campaign. Never mention sheriff, badge, badge flow, or campaigning.";

export function adaptTextForSixPlayer(text: string): string {
  let out = text;
  for (const [re, rep] of RULES) out = out.replace(re, rep);
  return out;
}

export function adaptPromptForSixPlayer(prompt: PromptResult, locale: "zh" | "en"): PromptResult {
  const line = locale === "en" ? NO_SHERIFF_LINE_EN : NO_SHERIFF_LINE_ZH;
  const systemParts = prompt.systemParts
    ? [...prompt.systemParts.map((p) => ({ ...p, text: adaptTextForSixPlayer(p.text) })), { text: line }]
    : undefined;
  return {
    ...prompt,
    system: `${adaptTextForSixPlayer(prompt.system)}\n\n${line}`,
    user: adaptTextForSixPlayer(prompt.user),
    ...(systemParts ? { systemParts } : {}),
  };
}

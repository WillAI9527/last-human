import { PHASE_CONFIGS } from "@/store/game-machine";
import { playerTitle } from "@/lib/player-label";
import type { GameState, Player } from "@/types/game";

const NIGHT_ACTION_PHASES = new Set<GameState["phase"]>([
  "NIGHT_START",
  "NIGHT_GUARD_ACTION",
  "NIGHT_WOLF_ACTION",
  "NIGHT_WITCH_ACTION",
  "NIGHT_SEER_ACTION",
]);

const OTHER_PLAYERS_ACTING = "夜晚 · 其他玩家正在行动";

export function phaseBarStatus(gameState: GameState, humanMustAct: boolean): string {
  const phase = gameState.phase;
  if (NIGHT_ACTION_PHASES.has(phase)) return humanMustAct ? "夜晚" : OTHER_PLAYERS_ACTING;
  if (phase === "NIGHT_RESOLVE" || phase === "DAY_START") return "天亮了，正在公布昨夜结果";
  if (phase === "DAY_BADGE_SIGNUP") return "警长竞选报名中";
  if (phase === "DAY_BADGE_SPEECH" || phase === "DAY_SPEECH" || phase === "DAY_PK_SPEECH") {
    const speaker = gameState.players.find((player) => player.seat === gameState.currentSpeakerSeat);
    if (speaker) return `${playerTitle(speaker.seat, speaker.displayName)} 正在发言`;
    return "玩家正在发言";
  }
  if (phase === "DAY_LAST_WORDS") {
    const speaker = gameState.players.find((player) => player.seat === gameState.currentSpeakerSeat);
    return speaker ? `${speaker.seat + 1}号发表遗言` : "正在发表遗言";
  }
  if (phase === "DAY_BADGE_ELECTION") return "警长投票中";
  if (phase === "DAY_VOTE") return "放逐投票中";
  if (phase === "DAY_RESOLVE") return "正在公布投票结果";
  if (phase === "BADGE_TRANSFER") {
    const electedToday = gameState.badge.electionWinners?.[gameState.day];
    // Day 1 announces last night's deaths immediately after the sheriff vote.
    // That path steps through BADGE_TRANSFER for a moment even when nobody is
    // being asked to pass the badge yet, which used to flash "警长移交警徽".
    const justAfterSheriffVote = gameState.day === 1 && electedToday != null && !humanMustAct;
    if (justAfterSheriffVote) return "天亮了，正在公布昨夜结果";
    const holder = gameState.players.find((player) => player.seat === gameState.badge.holderSeat);
    if (!holder || holder.alive) return "正在公布投票结果";
    return "警长移交警徽";
  }
  if (phase === "HUNTER_SHOOT" || phase === "WHITE_WOLF_KING_BOOM") return "有人发动技能";
  if (phase === "GAME_END") return "游戏结束";
  if (phase.startsWith("NIGHT")) return OTHER_PLAYERS_ACTING;
  return "对局进行中";
}

export function phaseBarCapsule(phase: GameState["phase"]): string | null {
  switch (phase) {
    case "NIGHT_GUARD_ACTION": return "选择今晚守护的人";
    case "NIGHT_WOLF_ACTION": return "和队友选择今晚的目标";
    case "NIGHT_WITCH_ACTION": return "决定是否用药";
    case "NIGHT_SEER_ACTION": return "选择要查验的人";
    case "DAY_BADGE_SIGNUP": return "是否竞选警长";
    case "DAY_BADGE_SPEECH":
    case "DAY_SPEECH":
    case "DAY_PK_SPEECH":
    case "DAY_LAST_WORDS":
      return "轮到你发言了";
    case "DAY_BADGE_ELECTION":
    case "DAY_VOTE":
      return "请投票";
    case "BADGE_TRANSFER": return "移交警徽";
    case "HUNTER_SHOOT": return "选择是否开枪";
    default: return null;
  }
}

export function humanMustActOnPhase(gameState: GameState, humanPlayer: Player | null): boolean {
  if (!humanPlayer) return false;
  return Boolean(PHASE_CONFIGS[gameState.phase].requiresHumanInput(humanPlayer, gameState));
}

// Modified by LAST HUMAN demo (fork of oil-oil/wolfcha).
"use client";

import { useEffect, useState } from "react";
import { DayIcon, NightIcon } from "@/components/icons/FlatIcons";
import { PHASE_CONFIGS } from "@/store/game-machine";
import type { GameState, Player } from "@/types/game";

type PhaseBarProps = {
  gameState: GameState;
  humanPlayer: Player | null;
  visualIsNight: boolean;
  isWaitingForAI: boolean;
};

const NIGHT_ACTION_PHASES = new Set([
  "NIGHT_START",
  "NIGHT_GUARD_ACTION",
  "NIGHT_WOLF_ACTION",
  "NIGHT_WITCH_ACTION",
  "NIGHT_SEER_ACTION",
]);

function statusCopy(gameState: GameState, humanTurn: boolean): string {
  const phase = gameState.phase;
  if (NIGHT_ACTION_PHASES.has(phase) && !humanTurn) return "夜晚 · 其他玩家正在行动";
  if (phase === "NIGHT_RESOLVE" || phase === "DAY_START") return "天亮了，正在公布昨夜结果";
  if (phase === "DAY_BADGE_SIGNUP") return "警长竞选报名中";
  if (phase === "DAY_BADGE_SPEECH" || phase === "DAY_SPEECH" || phase === "DAY_PK_SPEECH") {
    const speaker = gameState.players.find((player) => player.seat === gameState.currentSpeakerSeat);
    if (speaker) return `${speaker.seat + 1} 号 ${speaker.displayName || ""}`.trim() + " 正在发言";
    return "玩家正在发言";
  }
  if (phase === "DAY_LAST_WORDS") {
    const speaker = gameState.players.find((player) => player.seat === gameState.currentSpeakerSeat);
    return speaker ? `${speaker.seat + 1} 号发表遗言` : "正在发表遗言";
  }
  if (phase === "DAY_BADGE_ELECTION") return "警长投票中";
  if (phase === "DAY_VOTE") return "放逐投票中";
  if (phase === "DAY_RESOLVE") return "正在公布投票结果";
  if (phase === "BADGE_TRANSFER") return "警长移交警徽";
  if (phase === "HUNTER_SHOOT" || phase === "WHITE_WOLF_KING_BOOM") return "有人发动技能";
  if (phase === "GAME_END") return "游戏结束";
  if (NIGHT_ACTION_PHASES.has(phase)) return "夜晚 · 其他玩家正在行动";
  return visualFallback(gameState);
}

function visualFallback(gameState: GameState): string {
  return gameState.phase.startsWith("NIGHT") ? "夜晚 · 其他玩家正在行动" : "对局进行中";
}

function capsuleCopy(phase: GameState["phase"]): string | null {
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

export function PhaseBar({ gameState, humanPlayer, visualIsNight, isWaitingForAI }: PhaseBarProps) {
  const humanTurn = Boolean(
    humanPlayer?.alive && PHASE_CONFIGS[gameState.phase].requiresHumanInput(humanPlayer, gameState),
  );
  const eliminated = Boolean(humanPlayer && !humanPlayer.alive);
  const action = !eliminated && humanTurn ? capsuleCopy(gameState.phase) : null;
  const [pulseKey, setPulseKey] = useState(0);

  useEffect(() => {
    if (!action) return;
    setPulseKey((value) => value + 1);
  }, [action, gameState.phase]);

  const dayLabel = visualIsNight ? "夜晚" : "白天";

  return (
    <div className="lh-phase-bar" role="status" aria-live="polite">
      <div className="lh-phase-bar__day">
        {visualIsNight ? <NightIcon size={16} /> : <DayIcon size={16} />}
        <span className="hidden sm:inline">第 {gameState.day} 天 · {dayLabel}</span>
        <span className="sm:hidden">D{gameState.day}</span>
      </div>
      <div className="lh-phase-bar__status">
        <span className="truncate">{statusCopy(gameState, humanTurn)}</span>
        {isWaitingForAI && (
          <span className="lh-phase-bar__dots" aria-hidden="true">
            <i /><i /><i />
          </span>
        )}
      </div>
      {eliminated ? (
        <div className="lh-phase-bar__capsule lh-phase-bar__capsule--out">你已出局 · 观战中</div>
      ) : action ? (
        <div key={pulseKey} className="lh-phase-bar__capsule">轮到你了：{action}</div>
      ) : null}
    </div>
  );
}

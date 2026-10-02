// Modified by LAST HUMAN demo (fork of oil-oil/wolfcha).
"use client";

import { useEffect, useState } from "react";
import { DayIcon, NightIcon } from "@/components/icons/FlatIcons";
import { humanMustActOnPhase, phaseBarCapsule, phaseBarStatus } from "@/lib/phase-bar-copy";
import type { GameState, Player } from "@/types/game";

type PhaseBarProps = {
  gameState: GameState;
  humanPlayer: Player | null;
  visualIsNight: boolean;
  isWaitingForAI: boolean;
};

export function PhaseBar({ gameState, humanPlayer, visualIsNight, isWaitingForAI }: PhaseBarProps) {
  const humanTurn = Boolean(humanPlayer?.alive && humanMustActOnPhase(gameState, humanPlayer));
  const eliminated = Boolean(humanPlayer && !humanPlayer.alive);
  const action = !eliminated && humanTurn ? phaseBarCapsule(gameState.phase) : null;
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
        <span className="truncate">{phaseBarStatus(gameState, humanTurn)}</span>
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

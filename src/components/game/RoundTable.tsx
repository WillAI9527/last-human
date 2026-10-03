"use client";

import { useEffect, useRef, useState } from "react";
import type { GameState, Player } from "@/types/game";
import { cn } from "@/lib/utils";
import { PlayerCardCompact } from "@/components/game/PlayerCardCompact";

type SelectionTone = "wolf" | "seer" | "guard" | "witch" | "hunter" | "badge" | "vote";

export interface RoundTableProps {
  players: Player[];
  gameState: GameState;
  humanPlayer: Player | null;
  visualIsNight: boolean;
  isGenshinMode: boolean;
  selectedSeat: number | null;
  humanVoteSeat: number | null;
  canClickSeat: (player: Player) => boolean;
  onSeatClick: (player: Player) => void;
  onDetailClick?: (player: Player) => void;
  selectionTone?: SelectionTone;
  isSelectionPhase: boolean;
  canShowRole: boolean;
  collapsed?: boolean;
}

/** Visual index only. Seat numbers and prompt order stay on `player.seat`. */
export function visualSeatIndex(seat: number, humanSeat: number, count: number): number {
  const n = Math.max(count, 1);
  const bottom = Math.floor(n / 2);
  return ((seat - humanSeat + bottom) % n + n) % n;
}

export function RoundTable({
  players,
  gameState,
  humanPlayer,
  visualIsNight,
  isGenshinMode,
  selectedSeat,
  humanVoteSeat,
  canClickSeat,
  onSeatClick,
  onDetailClick,
  selectionTone,
  isSelectionPhase,
  canShowRole,
  collapsed = false,
}: RoundTableProps) {
  const frameRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 360, h: 420 });

  useEffect(() => {
    const el = frameRef.current;
    if (!el) return;
    const measure = () => setSize({ w: el.clientWidth, h: el.clientHeight });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const count = players.length || 6;
  const humanSeat = players.find((player) => player.isHuman)?.seat ?? humanPlayer?.seat ?? 0;
  const cardReach = 76;
  const fitRadius = Math.max(36, Math.min(size.w, size.h) / 2 - cardReach);
  const radius = Math.min(Math.min(size.w, size.h) * 0.38, fitRadius);

  const renderCard = (player: Player, index: number) => {
    const checkResult =
      humanPlayer?.role === "Seer"
        ? gameState.nightActions.seerHistory?.find((entry) => entry.targetSeat === player.seat)
        : undefined;
    const seerResult = checkResult ? (checkResult.isWolf ? "wolf" : "good") : null;
    const isBadgeCandidate =
      (gameState.phase === "DAY_BADGE_ELECTION" || gameState.phase === "DAY_BADGE_SPEECH") &&
      (gameState.badge.candidates || []).includes(player.seat);

    return (
      <PlayerCardCompact
        key={player.playerId}
        player={player}
        isSpeaking={gameState.currentSpeakerSeat === player.seat}
        canClick={canClickSeat(player)}
        isSelected={selectedSeat === player.seat}
        onClick={() => onSeatClick(player)}
        onDetailClick={isSelectionPhase || !onDetailClick ? undefined : () => onDetailClick(player)}
        animationDelay={index * 0.04}
        isNight={visualIsNight}
        isGenshinMode={isGenshinMode}
        humanPlayer={humanPlayer}
        seerCheckResult={seerResult}
        isBadgeHolder={gameState.badge.holderSeat === player.seat}
        isBadgeCandidate={isBadgeCandidate}
        variant="round"
        showRoleBadge={canShowRole}
        showModel={gameState.phase === "GAME_END"}
        selectionTone={selectionTone}
        isInSelectionPhase={isSelectionPhase}
        showVoteSeal={humanVoteSeat === player.seat}
      />
    );
  };

  if (collapsed) {
    const strip = [...players].sort((a, b) => {
      const ax = Math.cos((visualSeatIndex(a.seat, humanSeat, count) / count) * Math.PI * 2 - Math.PI / 2);
      const bx = Math.cos((visualSeatIndex(b.seat, humanSeat, count) / count) * Math.PI * 2 - Math.PI / 2);
      return ax - bx || a.seat - b.seat;
    });
    return (
      <div ref={frameRef} className={cn("lh-roundtable lh-roundtable--strip", visualIsNight && "lh-roundtable--night")}>
        {strip.map((player, index) => (
          <div key={player.playerId} className="lh-round-seat" data-testid={`seat-${player.seat}`}>
            {renderCard(player, index)}
          </div>
        ))}
      </div>
    );
  }

  const woodW = Math.max(120, radius * 1.35);
  const woodH = Math.max(78, radius * 0.92);

  return (
    <div
      ref={frameRef}
      className={cn("lh-roundtable", visualIsNight && "lh-roundtable--night")}
      data-seat-count={count}
    >
      <div className="lh-table-wood" style={{ width: woodW, height: woodH }} aria-hidden="true" />
      {players.map((player, index) => {
        const visual = visualSeatIndex(player.seat, humanSeat, count);
        const angle = (visual / count) * Math.PI * 2 - Math.PI / 2;
        const x = size.w / 2 + Math.cos(angle) * radius;
        const y = size.h / 2 + Math.sin(angle) * radius;
        const speaking = gameState.currentSpeakerSeat === player.seat;
        return (
          <div
            key={player.playerId}
            className="lh-round-seat"
            data-testid={`seat-${player.seat}`}
            style={{ left: x, top: y, zIndex: speaking ? 5 : 2 }}
          >
            {renderCard(player, index)}
          </div>
        );
      })}
    </div>
  );
}

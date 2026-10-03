"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { type ChatMessage, type ModelRef, type Player, type Role } from "@/types/game";
import { createInitialGameState } from "@/lib/game-master";
import { receiptForSeatAction, type ActionReceipt } from "@/lib/action-receipt";
import { GameBackground } from "@/components/game/GameBackground";
import { RoundTable } from "@/components/game/RoundTable";
import { DialogArea } from "@/components/game/DialogArea";
import { PhaseBar } from "@/components/game/PhaseBar";
import { PlayerDetailModal } from "@/components/game/PlayerDetailModal";
import { SuspicionReview } from "@/components/analysis/SuspicionReview";
import { PersonalStatsCard } from "@/components/analysis/PersonalStatsCard";
import type { SuspicionEntry } from "@/lib/suspicion";
import { useVisualViewportShell } from "@/hooks/useVisualViewportShell";
import { cn } from "@/lib/utils";

const CAST: Array<{ id: string; name: string; role: Role; gender: "male" | "female" }> = [
  { id: "f-11", name: "伊尔莎局长", role: "Werewolf", gender: "female" },
  { id: "m-02", name: "菲利克斯", role: "Seer", gender: "male" },
  { id: "f-01", name: "克拉拉", role: "Villager", gender: "female" },
  { id: "f-02", name: "玛尔塔", role: "Witch", gender: "female" },
  { id: "m-01", name: "老汉斯", role: "Villager", gender: "male" },
  { id: "m-05", name: "维克多医生", role: "Werewolf", gender: "male" },
];

const PREVIEW_MODELS: ModelRef[] = [
  { provider: "zenmux", model: "deepseek/deepseek-v3.2" },
  { provider: "zenmux", model: "google/gemini-3.5-flash-lite" },
  { provider: "zenmux", model: "minimax/minimax-m2.1" },
  { provider: "tokendance", model: "kimi-k2.5" },
  { provider: "zenmux", model: "openai/gpt-5.2-chat" },
];

const LINES = [
  "昨天夜里的事，我不想先下结论。",
  "伊尔莎局长，你刚才那句和票对不上。",
  "我是预言家，我验了 1 号，他是狼人。",
  "先听完，再决定今天出谁。",
  "5 号一直在打圆场，我记住了。",
];

export function PreviewRoom() {
  const params = useSearchParams();
  const scene = params.get("scene") ?? "day";
  const [inputText, setInputText] = useState("");
  const [selectedSeat, setSelectedSeat] = useState<number | null>(null);
  const [receipt, setReceipt] = useState<ActionReceipt | null>(null);
  const [detailPlayer, setDetailPlayer] = useState<Player | null>(null);
  const keyboardOpen = useVisualViewportShell();
  const night = scene === "night";
  const keyboard = scene === "keyboard" || keyboardOpen;
  const expanded = scene === "transcript";
  const review = scene === "review";
  const voteScene = scene === "vote" || scene === "badge";

  useEffect(() => {
    setSelectedSeat(null);
    setReceipt(null);
    setDetailPlayer(null);
    setInputText("");
  }, [scene]);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", night || review ? "dark" : "light");
  }, [night, review]);

  const players = useMemo<Player[]>(() => CAST.map((villager, seat) => ({
    playerId: `preview-${seat}`,
    seat,
    displayName: villager.name,
    avatarSeed: villager.id,
    alive: scene === "night" ? seat !== 4 : true,
    role: villager.role,
    alignment: villager.role === "Werewolf" ? "wolf" : "village",
    isHuman: seat === 2,
    agentProfile: seat === 2 ? undefined : {
      modelRef: PREVIEW_MODELS[seat > 2 ? seat - 1 : seat],
      persona: {
        mbti: "INTJ",
        gender: villager.gender,
        age: 36,
        voiceRules: [],
        occupation: "村民",
      },
    },
  })), [scene]);

  const human = players.find((player) => player.isHuman) ?? null;
  const state = useMemo(() => {
    const next = createInitialGameState();
    next.players = players;
    next.day = 1;
    next.phase = scene === "vote"
      ? "DAY_VOTE"
      : scene === "badge"
        ? "DAY_BADGE_ELECTION"
        : night
          ? "NIGHT_WOLF_ACTION"
          : "DAY_SPEECH";
    next.currentSpeakerSeat = scene === "keyboard" ? 2 : voteScene ? null : 1;
    next.votes = scene === "vote" && human ? { [human.playerId]: 0 } : {};
    next.messages = night
      ? [{
          id: "night-public",
          playerId: "system",
          playerName: "主持人",
          content: "夜色中有人在行动…",
          timestamp: 1,
          day: 1,
          phase: "NIGHT_WOLF_ACTION",
          isSystem: true,
        }]
      : LINES.map((content, index): ChatMessage => ({
          id: `m-${index}`,
          playerId: players[index % players.length].playerId,
          playerName: players[index % players.length].displayName,
          content,
          timestamp: index + 1,
          day: 1,
          phase: "DAY_SPEECH",
        }));
    return next;
  }, [human, night, players, scene, voteScene]);

  const suspicion: SuspicionEntry[] = [
    { day: 1, round: 0, voterId: "preview-0", voterSeat: 0, voteSeat: 2, reason: "你第一句就在带节奏。", suspects: [{ seat: 2, score: 86 }, { seat: 1, score: 40 }] },
    { day: 1, round: 0, voterId: "preview-1", voterSeat: 1, voteSeat: 4, reason: "我更怀疑 5 号昨晚的空档。", suspects: [{ seat: 4, score: 70 }, { seat: 2, score: 22 }] },
    { day: 2, round: 0, voterId: "preview-0", voterSeat: 0, voteSeat: 2, reason: "你的票和查验对不上。", suspects: [{ seat: 2, score: 94 }] },
    { day: 2, round: 0, voterId: "preview-3", voterSeat: 3, voteSeat: 0, reason: "1 号才像狼，你不像。", suspects: [{ seat: 0, score: 61 }, { seat: 2, score: 15 }] },
  ];

  if (review) {
    return (
      <main className="min-h-screen bg-[#12100e] text-[var(--text-primary)] px-4 py-8">
        <div className="max-w-xl mx-auto space-y-6">
          <PersonalStatsCard
            stats={{
              role: "Villager",
              userName: "克拉拉",
              avatar: "f-01",
              alignment: "village",
              tags: ["明察秋毫"],
              radarStats: { logic: 80, speech: 72, survival: 64, skillOrHide: 40, voteOrTicket: 70 },
              highlightQuote: "先听完，再决定今天出谁。",
              totalScore: 82,
            }}
          />
          <SuspicionReview log={suspicion} phase="GAME_END" players={players} humanSeat={2} />
        </div>
      </main>
    );
  }

  const alive = players.filter((player) => player.alive).length;

  return (
    <main
      className="lh-game-shell overflow-hidden flex flex-col"
      data-testid="game-shell"
      data-cast-seat={receipt?.kind === "commit" ? String(selectedSeat ?? "") : ""}
    >
      <GameBackground isNight={night} />
      <div className="wc-topbar wc-topbar--responsive shrink-0">
        <div className="wc-topbar__title">
          <img src="/brand/mark.svg" alt="" width={22} height={22} />
          <span>LAST HUMAN</span>
        </div>
        <div className="wc-topbar__meta" data-testid="table-meta">
          DAY {String(state.day).padStart(2, "0")} / ALIVE {alive}/{players.length}
        </div>
      </div>
      <PhaseBar gameState={state} humanPlayer={human} isWaitingForAI={false} />
      <div className={cn("flex-1 min-h-0 flex flex-col md:flex-row", night && "lh-roundtable--night")}>
        <div className={cn("lh-table-pane min-h-0", keyboard && "lh-table-pane--keyboard")}>
          <RoundTable
            players={players}
            gameState={state}
            humanPlayer={human}
            visualIsNight={night}
            isGenshinMode={false}
            selectedSeat={voteScene ? selectedSeat : null}
            humanVoteSeat={receipt?.kind === "commit" ? selectedSeat : scene === "vote" ? 0 : null}
            canClickSeat={() => voteScene}
            onSeatClick={(player) => {
              if (!voteScene || receipt) return;
              setSelectedSeat(player.seat);
            }}
            onDetailClick={setDetailPlayer}
            selectionTone={voteScene ? "vote" : undefined}
            isSelectionPhase={voteScene && !receipt}
            canShowRole={false}
            collapsed={keyboard}
          />
        </div>
        <div className="lh-dialog-column flex-1 min-h-0 md:w-[min(440px,38vw)] md:flex-none flex flex-col overflow-hidden">
          <DialogArea
            roomLayout="round"
            transcriptExpanded={expanded}
            gameState={state}
            humanPlayer={human}
            isNight={night}
            currentDialogue={keyboard ? null : night ? {
              speaker: "系统",
              text: "夜色中有人在行动…",
              isStreaming: false,
            } : {
              speaker: players[1].displayName,
              text: "我是预言家。昨晚我验了伊尔莎局长，她是狼人。今天先出她。我把昨天的票、发言和空档再对一遍，还是觉得她的时间线对不上。",
              isStreaming: false,
            }}
            displayedText=""
            isTyping={false}
            isHumanTurn={scene === "keyboard"}
            inputText={inputText}
            onInputChange={setInputText}
            onSendMessage={() => {
              if (!inputText.trim()) return;
              setInputText("");
            }}
            selectedSeat={voteScene ? selectedSeat : null}
            actionReceipt={receipt}
            onConfirmAction={() => {
              if (selectedSeat === null) return;
              setReceipt(receiptForSeatAction(state.phase, selectedSeat));
            }}
            onCancelSelection={() => setSelectedSeat(null)}
            keyboardOpen={keyboard}
          />
        </div>
      </div>
      <PlayerDetailModal
        player={detailPlayer}
        isOpen={detailPlayer !== null}
        onClose={() => setDetailPlayer(null)}
        humanPlayer={human}
      />
    </main>
  );
}

"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { PLAYER_MODELS, type ChatMessage, type Player, type Role } from "@/types/game";
import { createInitialGameState } from "@/lib/game-master";
import { GameBackground } from "@/components/game/GameBackground";
import { RoundTable } from "@/components/game/RoundTable";
import { DialogArea } from "@/components/game/DialogArea";
import { SuspicionReview } from "@/components/analysis/SuspicionReview";
import type { SuspicionEntry } from "@/lib/suspicion";
import { cn } from "@/lib/utils";

const CAST: Array<{ id: string; name: string; role: Role; gender: "male" | "female" }> = [
  { id: "f-11", name: "伊尔莎局长", role: "Werewolf", gender: "female" },
  { id: "m-02", name: "菲利克斯", role: "Seer", gender: "male" },
  { id: "f-01", name: "克拉拉", role: "Villager", gender: "female" },
  { id: "f-02", name: "玛尔塔", role: "Witch", gender: "female" },
  { id: "m-01", name: "老汉斯", role: "Villager", gender: "male" },
  { id: "m-05", name: "维克多医生", role: "Werewolf", gender: "male" },
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
  const night = scene === "night";
  const keyboard = scene === "keyboard";
  const expanded = scene === "transcript";
  const review = scene === "review";

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
      modelRef: PLAYER_MODELS[seat % PLAYER_MODELS.length],
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
    next.phase = scene === "vote" ? "DAY_VOTE" : night ? "NIGHT_WOLF_ACTION" : "DAY_SPEECH";
    next.currentSpeakerSeat = keyboard ? 2 : scene === "vote" ? null : 1;
    next.votes = scene === "vote" && human ? { [human.playerId]: 0 } : {};
    next.messages = LINES.map((content, index): ChatMessage => ({
      id: `m-${index}`,
      playerId: players[index % players.length].playerId,
      playerName: players[index % players.length].displayName,
      content,
      timestamp: index + 1,
      day: 1,
      phase: "DAY_SPEECH",
    }));
    return next;
  }, [human, keyboard, night, players, scene]);

  const suspicion: SuspicionEntry[] = [
    { day: 1, round: 0, voterId: "preview-0", voterSeat: 0, voteSeat: 2, reason: "你第一句就在带节奏。", suspects: [{ seat: 2, score: 86 }, { seat: 1, score: 40 }] },
    { day: 1, round: 0, voterId: "preview-1", voterSeat: 1, voteSeat: 4, reason: "我更怀疑 5 号昨晚的空档。", suspects: [{ seat: 4, score: 70 }, { seat: 2, score: 22 }] },
    { day: 2, round: 0, voterId: "preview-0", voterSeat: 0, voteSeat: 2, reason: "你的票和查验对不上。", suspects: [{ seat: 2, score: 94 }] },
    { day: 2, round: 0, voterId: "preview-3", voterSeat: 3, voteSeat: 0, reason: "1 号才像狼，你不像。", suspects: [{ seat: 0, score: 61 }, { seat: 2, score: 15 }] },
  ];

  if (review) {
    return (
      <main className="min-h-screen bg-[#12100e] text-[var(--text-primary)] px-4 py-8">
        <div className="max-w-xl mx-auto">
          <SuspicionReview log={suspicion} phase="GAME_END" players={players} humanSeat={2} />
        </div>
      </main>
    );
  }

  return (
    <main className="h-screen overflow-hidden flex flex-col">
      <GameBackground isNight={night} />
      <div className={cn("flex-1 min-h-0 flex flex-col md:flex-row", night && "lh-roundtable--night")}>
        <div className={cn("min-h-0 md:flex-1", keyboard ? "h-[104px] shrink-0" : "h-[48vh] min-h-[280px] md:h-auto")}>
          <RoundTable
            players={players}
            gameState={state}
            humanPlayer={human}
            visualIsNight={night}
            isGenshinMode={false}
            selectedSeat={null}
            humanVoteSeat={scene === "vote" ? 0 : null}
            canClickSeat={() => scene === "vote"}
            onSeatClick={() => undefined}
            selectionTone={scene === "vote" ? "vote" : undefined}
            isSelectionPhase={scene === "vote"}
            canShowRole={false}
            collapsed={keyboard}
          />
        </div>
        <div className="flex-1 min-h-0 md:w-[min(440px,38vw)] md:flex-none flex flex-col">
          <DialogArea
            roomLayout="round"
            transcriptExpanded={expanded}
            gameState={state}
            humanPlayer={human}
            isNight={night}
            currentDialogue={keyboard ? null : {
              speaker: players[1].displayName,
              text: "我是预言家。昨晚我验了伊尔莎局长，她是狼人。今天先出她。",
              isStreaming: false,
            }}
            displayedText=""
            isTyping={false}
            isHumanTurn={keyboard}
            inputText={inputText}
            onInputChange={setInputText}
            selectedSeat={null}
          />
        </div>
      </div>
    </main>
  );
}

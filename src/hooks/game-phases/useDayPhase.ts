"use client";

import { useCallback, useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import { useAtom, useStore } from "jotai";
import type { GameState, Player } from "@/types/game";
import type { PrefetchCriteria, PrefetchedSpeech } from "../useDialogueManager";
import { gameStateAtom } from "@/store/game-machine";
import {
  transitionPhase,
  addSystemMessage,
  addPlayerMessage,
  killPlayer,
  generateAISpeechSegmentsStream,
  getSpeechContextKey,
} from "@/lib/game-master";
import { getNextSpeechSeat } from "@/lib/speech-order";
import { PHASE_CATEGORIES } from "@/lib/game-constants";
import { type FlowToken } from "@/lib/game-flow-controller";
import { audioManager, makeAudioTaskId, type TtsProvider } from "@/lib/audio-manager";
import { resolveVoiceId, type AppLocale } from "@/lib/voice-constants";
import { getLocale } from "@/i18n/locale-store";
import { createSpeechRequest, type SpeechRequest } from "@/lib/speech-request";
import { generateUUID } from "@/lib/utils";
import { GAMEPLAY_CALL_DEADLINE_MS, withTimeout } from "@/lib/request-timeout";
import { pickFallbackSpeech } from "@/lib/speech-fallback";

export interface DayPhaseCallbacks {
  setDialogue: (speaker: string, text: string, isStreaming?: boolean) => void;
  setIsWaitingForAI: (waiting: boolean) => void;
  setWaitingForNextRound: (waiting: boolean) => void;
  isTokenValid: (token: FlowToken) => boolean;
  getToken: () => FlowToken;
  initSpeechQueue: (segments: string[], player: Player, afterSpeech?: (s: unknown) => Promise<void>, request?: SpeechRequest) => void;
  initStreamingSpeechQueue: (player: Player, afterSpeech?: (s: unknown) => Promise<void>, request?: SpeechRequest) => void;
  appendToSpeechQueue: (segment: string, requestId?: string, index?: number) => void;
  finalizeSpeechQueue: (options?: { nextSpeakerIsAI?: boolean; requestId?: string }) => void;
  setPrefetchedSpeech: (prefetch: PrefetchedSpeech | null) => void;
  consumePrefetchedSpeech: (criteria: PrefetchCriteria) => string[] | null;
  setAfterLastWords: (callback: ((s: GameState) => Promise<void>) | null) => void;
}

export interface DayPhaseActions {
  isSpeechBlocked: () => boolean;
  startLastWordsPhase: (state: GameState, seat: number, afterLastWords: (s: GameState) => Promise<void>, token: FlowToken) => Promise<void>;
  runAISpeech: (state: GameState, player: Player, options?: { afterSpeech?: (s: GameState) => Promise<void> }) => Promise<void>;
}

/**
 * 白天阶段 Hook
 * 负责管理白天流程：发言、遗言等
 */
export function useDayPhase(
  humanPlayer: Player | null,
  callbacks: DayPhaseCallbacks
): DayPhaseActions {
  const t = useTranslations();
  const speakerHost = t("speakers.host");
  const [gameState, setGameState] = useAtom(gameStateAtom);

  const {
    setDialogue,
    setIsWaitingForAI,
    setWaitingForNextRound,
    isTokenValid,
    getToken,
    initStreamingSpeechQueue,
    appendToSpeechQueue,
    finalizeSpeechQueue,
    setPrefetchedSpeech,
    consumePrefetchedSpeech,
    setAfterLastWords,
  } = callbacks;

  const store = useStore();
  const activeRequestRef = useRef<(SpeechRequest & { controller: AbortController }) | null>(null);
  const prefetchControllerRef = useRef<AbortController | null>(null);
  const isSpeechBlocked = useCallback(() => false, []);

  useEffect(() => {
    if (activeRequestRef.current && !activeRequestRef.current.isValid()) {
      activeRequestRef.current.controller.abort();
      prefetchControllerRef.current?.abort();
    }
  }, [gameState]);
  useEffect(() => () => {
    activeRequestRef.current?.controller.abort();
    activeRequestRef.current = null;
    prefetchControllerRef.current?.abort();
  }, []);

  const prefetchNextAISpeech = useCallback(async (state: GameState, player: Player) => {
    if (!player.agentProfile) return;
    prefetchControllerRef.current?.abort();
    const controller = new AbortController();
    prefetchControllerRef.current = controller;
    const token = getToken();
    const isValid = () => !controller.signal.aborted && token.isValid() &&
      prefetchControllerRef.current === controller && store.get(gameStateAtom).gameId === state.gameId;
    const base: PrefetchedSpeech = {
      gameId: state.gameId, contextKey: getSpeechContextKey(state, player),
      playerId: player.playerId, phase: state.phase, day: state.day,
      messageCount: state.messages.length, segments: [], isComplete: false, createdAt: Date.now(),
    };
    setPrefetchedSpeech(base);
    try {
      const segments = await generateAISpeechSegmentsStream(state, player, { signal: controller.signal });
      if (isValid()) setPrefetchedSpeech({ ...base, segments, isComplete: true });
    } catch {
      if (isValid()) setPrefetchedSpeech(null);
    }
  }, [getToken, setPrefetchedSpeech, store]);

  /** 每次请求持有独立段落和令牌；所有异步回调在写入前验证来源。 */
  const runAISpeech = useCallback(async (
    state: GameState,
    player: Player,
    options?: { afterSpeech?: (s: GameState) => Promise<void> }
  ) => {
    if (!PHASE_CATEGORIES.SPEECH_PHASES.includes(state.phase as typeof PHASE_CATEGORIES.SPEECH_PHASES[number])) return;
    if (activeRequestRef.current?.isValid()) return;
    activeRequestRef.current?.controller.abort();
    const controller = new AbortController();
    const id = generateUUID();
    const request = createSpeechRequest(id, state, player, getToken(), () => store.get(gameStateAtom),
      () => activeRequestRef.current?.id === id);
    activeRequestRef.current = { ...request, controller };
    if (!request.isValid()) return;
    const isValid = () => request.isValid() && !controller.signal.aborted;
    const afterSpeech = options?.afterSpeech as ((s: unknown) => Promise<void>) | undefined;
    const persona = player.agentProfile?.persona;
    const voiceId = resolveVoiceId(
      persona?.voiceId,
      persona?.gender,
      persona?.age,
      getLocale() as AppLocale,
    );
    const ttsProvider: TtsProvider = "minimax";
    const collected: string[] = [];
    const revisions: number[] = [];
    let displayedCount = 0;
    const takeFallback = () => {
      const latest = store.get(gameStateAtom);
      const picked = pickFallbackSpeech(player.displayName, latest.usedFallbackLines ?? []);
      setGameState({ ...latest, usedFallbackLines: picked.used });
      return picked.line;
    };
    let displayChain = Promise.resolve();
    let audioChain = Promise.resolve();
    let timeoutId: ReturnType<typeof setTimeout> | undefined;

    const appendSegment = (segment: string, index: number) => {
      if (!isValid() || index > collected.length) return;
      if (index < collected.length && collected[index] === segment) return;
      const revision = (revisions[index] ?? 0) + 1;
      revisions[index] = revision;
      if (index < collected.length) {
        collected[index] = segment;
        appendToSpeechQueue(segment, id, index);
        const latest = store.get(gameStateAtom);
        const alreadyCommitted = latest.messages.some((message) =>
          message.segmentIndex === index &&
          message.playerId === player.playerId &&
          message.day === state.day &&
          message.phase === state.phase);
        if (alreadyCommitted) {
          setGameState(addPlayerMessage(latest, player.playerId, segment, { id: `${id}:${index}`, segmentIndex: index }));
        }
        return;
      }
      collected.push(segment);
      const task = {
        id: makeAudioTaskId(voiceId, segment, ttsProvider),
        playbackId: `${id}:${index}`,
        isValid,
        text: segment,
        voiceId,
        playerId: player.playerId,
        ttsProvider,
      };
      // 首段 TTS 等待不能让后续文字先进入队列。后续音频只预加载，不阻塞字幕。
      displayChain = displayChain.then(async () => {
        if (!isValid() || revisions[index] !== revision) return;
        let firstAudioReady = false;
        if (index === 0 && audioManager.isEnabled()) {
          try {
            const ready = await withTimeout(audioManager.ensureReady(task), 15000);
            firstAudioReady = ready !== false;
          } catch { /* 保留文字，不重发失败的 TTS 请求 */ }
        }
        if (!isValid() || revisions[index] !== revision) return;
        if (index === 0) {
          clearTimeout(timeoutId);
          setIsWaitingForAI(false);
        }
        appendToSpeechQueue(segment, id, index);
        displayedCount += 1;
        if (audioManager.isEnabled()) {
          if (index === 0) {
            if (firstAudioReady) audioManager.addToQueue(task);
            return;
          }
          audioChain = audioChain.then(async () => {
            if (!isValid()) return;
            let ready = false;
            try { ready = (await withTimeout(audioManager.ensureReady(task), 15000)) !== false; } catch { return; }
            if (isValid() && ready) audioManager.addToQueue(task);
          });
        }
      });
    };

    const prefetched = consumePrefetchedSpeech({
      gameId: state.gameId, contextKey: getSpeechContextKey(state, player),
      playerId: player.playerId, phase: state.phase, day: state.day, messageCount: state.messages.length,
    });
    prefetchControllerRef.current?.abort();
    initStreamingSpeechQueue(player, afterSpeech, request);
    setIsWaitingForAI(true);
    setDialogue(player.displayName, t("dayPhase.organizing"), true);

    const timeoutPromise = new Promise<"timeout">((resolve) => {
      timeoutId = setTimeout(() => {
        if (!isValid()) { resolve("timeout"); return; }
        controller.abort();
        // 超时兜底仍属于本次请求；关闭网络回调后才能写入。
        if (displayedCount === 0) appendToSpeechQueue(takeFallback(), id, 0);
        finalizeSpeechQueue({ requestId: id });
        setIsWaitingForAI(false);
        resolve("timeout");
      }, GAMEPLAY_CALL_DEADLINE_MS);
    });

    try {
      const streamPromise = prefetched
        ? Promise.resolve(prefetched.forEach(appendSegment))
        : generateAISpeechSegmentsStream(state, player, { signal: controller.signal, onSegmentReceived: appendSegment })
            .then((segments) => segments)
            .catch((error: unknown) => {
              if (controller.signal.aborted) return "aborted" as const;
              throw error;
            });
      const result = await Promise.race([streamPromise, timeoutPromise]);
      if (result === "timeout" || result === "aborted" || !isValid()) return;
      await displayChain;
      if (!isValid()) return;
      const nextSeat = getNextSpeechSeat(state);
      const nextPlayer = state.players.find((p) => p.seat === nextSeat);
      const nextSpeakerIsAI = !!nextPlayer && !nextPlayer.isHuman && nextPlayer.alive;
      finalizeSpeechQueue({ nextSpeakerIsAI, requestId: id });
      // 按相同段落 ID 构造预计状态，已提交的段落不会重复进入预取上下文。
      if (nextSpeakerIsAI && nextPlayer) {
        const postState = collected.reduce((next, segment, index) =>
          addPlayerMessage(next, player.playerId, segment, { id: `${id}:${index}`, segmentIndex: index }), store.get(gameStateAtom));
        void prefetchNextAISpeech({ ...postState, currentSpeakerSeat: nextPlayer.seat }, nextPlayer);
      }
    } catch {
      if (!isValid()) return;
      await displayChain;
      if (!isValid()) return;
      // 失败直接用角色口吻的兜底台词继续，玩家看不到报错，也不能手动重试。
      if (displayedCount === 0 && collected.length === 0) appendToSpeechQueue(takeFallback(), id, 0);
      finalizeSpeechQueue({ requestId: id });
      setIsWaitingForAI(false);
    } finally {
      clearTimeout(timeoutId);
      if (request.isValid()) setIsWaitingForAI(false);
    }
  }, [appendToSpeechQueue, consumePrefetchedSpeech, finalizeSpeechQueue, getToken,
    initStreamingSpeechQueue, prefetchNextAISpeech, setDialogue, setGameState, setIsWaitingForAI, store, t]);

  // 更新 ref 以打破循环依赖
  /** 开始遗言阶段 */
  const startLastWordsPhase = useCallback(async (
    state: GameState,
    seat: number,
    afterLastWords: (s: GameState) => Promise<void>,
    token: FlowToken
  ) => {
    if (!isTokenValid(token)) return;
    const speaker = state.players.find((p) => p.seat === seat);
    if (!speaker) {
      await afterLastWords(state);
      return;
    }

    setWaitingForNextRound(false);

    // 确保遗言发言者已标记为死亡
    let currentState = speaker.alive ? killPlayer(state, seat) : state;
    currentState = transitionPhase(currentState, "DAY_LAST_WORDS");
    currentState = { ...currentState, currentSpeakerSeat: seat };
    currentState = addSystemMessage(currentState, t("dayPhase.lastWordsSystem", { seat: seat + 1, name: speaker.displayName }));
    setGameState(currentState);

    if (speaker.isHuman) {
      // 保存回调，等待人类发言完毕后调用
      setAfterLastWords(afterLastWords);
      setDialogue(speakerHost, t("dayPhase.lastWordsPrompt", { seat: seat + 1, name: speaker.displayName }), false);
      return;
    }

    if (!isTokenValid(token)) return;

    await runAISpeech(currentState, speaker, {
      afterSpeech: async (s) => {
        if (!isTokenValid(token)) return;
        await afterLastWords(s as GameState);
      },
    });
  }, [setGameState, setDialogue, setWaitingForNextRound, isTokenValid, runAISpeech, setAfterLastWords, speakerHost, t]);

  return {
    isSpeechBlocked,
    startLastWordsPhase,
    runAISpeech,
  };
}

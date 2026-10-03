"use client";

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Medal, Sparkle } from "@phosphor-icons/react";
import type { Player } from "@/types/game";
import { isWolfRole } from "@/types/game";
import { cn } from "@/lib/utils";
import { buildSimpleAvatarUrl, getModelLogoUrl } from "@/lib/avatar-config";
import { ModelBadge } from "@/components/game/ModelBadge";
import { playerTitle, seatNumberLabel } from "@/lib/player-label";
import { useTranslations } from "next-intl";

interface PlayerCardCompactProps {
  player: Player;
  isSpeaking: boolean;
  canClick: boolean;
  isSelected: boolean;
  isNight?: boolean;
  isGenshinMode?: boolean;
  onClick: () => void;
  onDetailClick?: () => void;
  animationDelay?: number;
  showWolfBadge?: boolean;
  showRoleBadge?: boolean;
  showModel?: boolean;
  selectionTone?: "wolf" | "seer" | "guard" | "witch" | "hunter" | "badge" | "vote";
  seerCheckResult?: "wolf" | "good" | null;
  humanPlayer?: Player | null;
  isBadgeHolder?: boolean;
  isBadgeCandidate?: boolean;
  variant?: "default" | "mobile" | "round";
  isInSelectionPhase?: boolean;
  /** True only for the human's own unrevealed vote target. */
  showVoteSeal?: boolean;
}

function SeatCandle({ night }: { night: boolean }) {
  return (
    <span className={cn("lh-candle", night && "lh-candle--night")} aria-hidden="true">
      <motion.span
        className="lh-candle-glow"
        animate={{
          opacity: night ? [0.55, 0.95, 0.62] : [0.28, 0.5, 0.32],
          scale: night ? [1, 1.12, 1] : [1, 1.06, 1],
        }}
        transition={{ duration: 1.7, repeat: Infinity, ease: "easeInOut" }}
      />
      <svg className="lh-candle-body" viewBox="0 0 20 28" width="14" height="20">
        <rect x="7" y="13" width="6" height="12" rx="1.2" fill="#E8BE6A" />
        <rect x="8.4" y="11" width="3.2" height="2.4" rx="0.4" fill="#6B4A2E" />
      </svg>
      <motion.span
        className="lh-candle-flame"
        animate={{
          scaleY: [1, 1.18, 0.9, 1.08, 1],
          scaleX: [1, 0.88, 1.06, 0.94, 1],
          opacity: [0.88, 1, 0.78, 0.96, 0.88],
        }}
        transition={{ duration: 1.35, repeat: Infinity, ease: "easeInOut" }}
      />
    </span>
  );
}

export function PlayerCardCompact({
  player,
  isSpeaking,
  canClick,
  isSelected,
  isNight = false,
  isGenshinMode = false,
  onClick,
  onDetailClick,
  animationDelay = 0,
  showModel = false,
  selectionTone,
  seerCheckResult = null,
  humanPlayer,
  isBadgeHolder = false,
  isBadgeCandidate = false,
  variant = "default",
  isInSelectionPhase = false,
  showVoteSeal = false,
}: PlayerCardCompactProps) {
  const t = useTranslations();
  const isDead = !player.alive;
  const isMe = player.isHuman;
  const isReady = isMe ? !!player.displayName?.trim() : !!player.agentProfile?.persona;
  const isDisabledInSelection = isInSelectionPhase && !canClick && isReady && !isDead;

  const prevAliveRef = useRef<boolean>(player.alive);
  const prevIsReadyRef = useRef<boolean | null>(null);
  const [deathPulse, setDeathPulse] = useState(false);
  const [revealPop, setRevealPop] = useState(false);

  useEffect(() => {
    const wasReady = prevIsReadyRef.current;
    prevIsReadyRef.current = isReady;
    
    // 当从 loading 变为 ready 时触发动画（首次渲染时 wasReady 为 null，不触发）
    if (isReady && wasReady === false) {
      setRevealPop(true);
      const timer = window.setTimeout(() => setRevealPop(false), 600);
      return () => window.clearTimeout(timer);
    }
  }, [isReady]);

  useEffect(() => {
    const prevAlive = prevAliveRef.current;
    if (prevAlive && !player.alive) {
      queueMicrotask(() => setDeathPulse(true));
      const t = window.setTimeout(() => setDeathPulse(false), 900);
      return () => window.clearTimeout(t);
    }
    prevAliveRef.current = player.alive;
  }, [player.alive]);
  
  const isWolfTeammate = humanPlayer && isWolfRole(humanPlayer.role) && 
    isWolfRole(player.role) && 
    !player.isHuman;
  const showWolfTeamBadge = humanPlayer && isWolfRole(humanPlayer.role) && isWolfRole(player.role);
  const selectionClass = (() => {
    if (!isSelected) return "";
    switch (selectionTone) {
      case "wolf":
        return "border-[var(--color-blood)] shadow-[0_0_0_2px_var(--color-blood)]";
      case "seer":
        return "border-[var(--color-seer)] shadow-[0_0_0_2px_var(--color-seer)]";
      case "guard":
        return "border-[var(--color-success)] shadow-[0_0_0_2px_var(--color-success)]";
      case "witch":
        return "border-[var(--color-witch)] shadow-[0_0_0_2px_var(--color-witch)]";
      case "hunter":
        return "border-[var(--color-warning)] shadow-[0_0_0_2px_var(--color-warning)]";
      case "badge":
        return "border-[#A9B2BC] shadow-[0_0_0_2px_rgba(169,178,188,0.35)]";
      case "vote":
        return "border-[#A9B2BC] shadow-[0_0_0_2px_rgba(169,178,188,0.35)]";
      default:
        return "border-[#A9B2BC] shadow-[0_0_0_2px_rgba(169,178,188,0.35)]";
    }
  })();

  const modelLabel = player.agentProfile?.modelRef?.model;

  const isModelAvatar = isGenshinMode && !player.isHuman;
  const avatarSrc = isModelAvatar
    ? getModelLogoUrl(player.agentProfile?.modelRef)
    : buildSimpleAvatarUrl(player.avatarSeed ?? player.playerId, {
        gender: player.agentProfile?.persona?.gender,
      });
  const avatarClassName = cn(
    "w-full h-full transition-transform duration-500",
    isModelAvatar ? "object-contain p-2 bg-[var(--bg-secondary)]" : "object-cover group-hover:scale-110",
    isSpeaking && isMe && "border-[var(--human-gold)]"
  );

  const handleClick = (e: React.MouseEvent) => {
    if (!isReady) return; // Prevent clicking when not ready
    if (canClick) {
      onClick();
    } else if (onDetailClick) {
      onDetailClick();
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10, scale: 0.95 }}
      animate={
        deathPulse
          ? {
              opacity: 1,
              y: [0, -2, 0],
              scale: [1, 1.015, 1],
            }
          : revealPop
          ? {
              opacity: 1,
              y: 0,
              scale: [1, 1.08, 1.03, 1],
            }
          : { opacity: 1, y: 0, scale: 1 }
      }
      transition={
        revealPop
          ? { delay: 0, duration: 0.5, ease: [0.34, 1.56, 0.64, 1] }
          : { delay: animationDelay, duration: 0.3 }
      }
      whileHover={variant === "mobile" ? {} : {}}
      whileTap={isReady ? { scale: 0.98 } : {}}
      onClick={handleClick}
      className={cn(
        "wc-player-card relative group transition-all duration-300",
        variant === "mobile" && "wc-player-card--mobile",
        variant === "round" && "wc-player-card--round",
        !isReady && "wc-player-card--loading opacity-80",
        isReady && "bg-[var(--bg-card)]/80 backdrop-blur-sm",
        isDead && "wc-player-card--dead",
        isNight && !isMe && "lh-seat-night",
        isSpeaking && "wc-player-card--speaking",
        isSpeaking && !isMe && "wc-player-card--speaking-ai",
        isMe && "wc-player-card--me",
        isWolfTeammate && "border-[var(--color-blood)]/70 bg-[var(--color-wolf-bg)]",
        isDisabledInSelection && "wc-player-card--disabled opacity-50 grayscale-[0.3] pointer-events-none",
        canClick && isReady && "wc-player-card--selectable cursor-pointer",
        isSelected && "scale-[1.02]",
        isSelected && selectionClass
      )}
    >
      {/* Loading Shimmer Effect */}
      {!isReady && (
        <div className="absolute inset-0 overflow-hidden rounded-lg z-0">
          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent -translate-x-full animate-[shimmer_2s_infinite]" />
          <div className="absolute inset-0 bg-[var(--bg-card)] opacity-50" />
        </div>
      )}
      {!isReady && (
        <motion.div
          className="absolute inset-0 rounded-lg pointer-events-none z-10"
          animate={{ boxShadow: ["inset 0 0 0 rgba(197,160,89,0)", "inset 0 0 18px rgba(197,160,89,0.18)", "inset 0 0 0 rgba(197,160,89,0)"] }}
          transition={{ duration: 2.6, repeat: Infinity, ease: "easeInOut" }}
        />
      )}

      {/* 头像区域 */}
      <div className={cn("wc-player-card__avatar-wrap relative", isMe && "wc-player-card__avatar-wrap--human")}>
      <motion.div
        className={cn("wc-player-card__avatar relative overflow-hidden", isMe && "lh-human-frame", !isMe && "lh-avatar-moon")}
        animate={isSpeaking ? {
          y: [0, -1.5, 0],
          boxShadow: isMe
            ? ["0 0 6px rgba(232,190,106,0.35)", "0 0 16px rgba(232,190,106,0.8)", "0 0 6px rgba(232,190,106,0.35)"]
            : ["0 0 4px rgba(169,178,188,0.2)", "0 0 14px rgba(169,178,188,0.72)", "0 0 4px rgba(169,178,188,0.2)"],
        } : { y: 0, boxShadow: isMe ? "0 0 8px rgba(232,190,106,0.55)" : "none" }}
        transition={{ duration: 2.4, repeat: isSpeaking ? Infinity : 0, ease: "easeInOut" }}
      >
        <AnimatePresence mode="wait">
          {isReady ? (
            <motion.div
              key="avatar-image"
              initial={{ opacity: 0, scale: 0.8, filter: "blur(8px)" }}
              animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
              transition={{ duration: 0.5, ease: "easeOut" }}
              className="w-full h-full"
            >
              <img 
                src={avatarSrc} 
                alt={player.displayName} 
                className={cn(
                  avatarClassName,
                  !isMe && !isDead && "lh-avatar-moon",
                  isDead && "lh-avatar-photo-dead",
                )} 
              />
            </motion.div>
          ) : (
            <motion.div
              key="avatar-placeholder"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="w-full h-full flex items-center justify-center bg-black/10"
            >
              <div className="relative flex items-center justify-center">
                <motion.div
                  className="absolute inset-0 rounded-full border border-[#A9B2BC]/40"
                  style={{ width: 46, height: 46 }}
                  animate={{ rotate: 360 }}
                  transition={{ duration: 6, repeat: Infinity, ease: "linear" }}
                />
                <motion.div
                  className="absolute inset-2 rounded-full border border-dashed border-[var(--color-blood)]/30"
                  animate={{ rotate: -360, opacity: [0.4, 0.9, 0.4] }}
                  transition={{ duration: 4.8, repeat: Infinity, ease: "linear" }}
                />
                <div className="absolute inset-0 bg-[#A9B2BC]/20 blur-xl rounded-full animate-pulse" />
                <Sparkle
                  size={22}
                  weight="fill"
                  className="text-[var(--text-secondary)]/45 animate-[spin_5s_linear_infinite]"
                />
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {isDead && isReady && (
          <span className="lh-death-slash" aria-hidden="true" />
        )}
      </motion.div>
      {isReady && !isMe && (
        <ModelBadge modelRef={player.agentProfile?.modelRef} />
      )}
      {isMe && isReady && !isDead && <SeatCandle night={isNight} />}
      {isMe && isReady && (
        <span className="lh-you-capsule">你 · {seatNumberLabel(player.seat)}</span>
      )}
      {showVoteSeal && isReady && (
        <span className="lh-wax-seal" aria-label="你的票">票</span>
      )}
      {isBadgeHolder && !isDead && isReady && (
        <div className="lh-sheriff-mark" title={t("playerCard.badgeHolder")}>
          <Medal size={variant === "mobile" ? 10 : 12} weight="fill" />
        </div>
      )}
      {isBadgeCandidate && !isBadgeHolder && !isDead && isReady && (
        <div className="lh-sheriff-mark lh-sheriff-mark--candidate" title={t("playerCard.badgeCandidate")}>
          <Medal size={variant === "mobile" ? 10 : 12} weight="regular" />
        </div>
      )}
      {(variant === "mobile" || variant === "round") && isSpeaking && !isMe && (
        <motion.span
          aria-hidden
          className="lh-speaker-ring"
          animate={{ opacity: [0.45, 1, 0.45], scale: [0.96, 1.08, 0.96] }}
          transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
        />
      )}
      </div>

      {/* 狼人队友标记 */}
      {showWolfTeamBadge && !isDead && isReady && (
        <div className="absolute top-1.5 left-1.5 px-1.5 py-0.5 rounded-sm flex items-center justify-center z-10 bg-[var(--color-blood)] text-white border border-black/20 shadow-sm text-[10px] font-semibold tracking-wide">
          {t("playerCard.wolfTeam")}
        </div>
      )}

      {/* 预言家查验结果 */}
      {seerCheckResult && !isDead && isReady && (
        <div className={cn(
          "absolute top-1.5 left-1.5 px-1.5 py-0.5 rounded-sm flex items-center justify-center z-10 border border-black/20 shadow-sm text-[10px] font-semibold tracking-wide text-white",
          seerCheckResult === 'wolf' ? 'bg-[var(--color-blood)]' : 'bg-[var(--color-success)]'
        )}>
          {seerCheckResult === "wolf" ? t("alignments.wolf") : t("alignments.good")}
        </div>
      )}

      {/* 信息区 */}
      <div className="wc-player-card__info relative z-10">
        {variant === "round" ? (
          <div className="wc-player-card__name lh-round-name" title={player.displayName}>
            {isReady ? player.displayName : t("playerCard.joining")}
          </div>
        ) : variant === "mobile" ? (
          <div className="wc-player-card__name relative flex items-center gap-1 min-w-0" title={playerTitle(player.seat, player.displayName)}>
            <span className={cn(
              "wc-seat-badge transition-colors duration-300",
              isSpeaking && isMe ? "bg-[var(--color-gold)] text-[#0F0D0C]" : "bg-black/20 text-[var(--text-secondary)]",
              !isReady && "opacity-50"
            )}>{seatNumberLabel(player.seat)}</span>
            <AnimatePresence mode="wait">
              {isReady ? (
                <motion.span
                  key="name-text"
                  initial={{ opacity: 0, y: 5 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={cn(
                  "truncate font-medium flex-1 min-w-0",
                  isDead ? "lh-name-dim" : "text-[var(--text-primary)]",
                )}
                >
                  {player.displayName}
                </motion.span>
              ) : (
                <motion.div
                  key="name-loading"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="flex-1 h-3 flex items-center"
                >
                  <div className="h-2 w-16 bg-[var(--text-secondary)]/10 rounded-full animate-pulse" />
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        ) : (
          <>
            <div className="wc-player-card__name relative h-5" title={playerTitle(player.seat, player.displayName)}>
              <AnimatePresence mode="wait">
                {isReady ? (
                  <motion.span
                    key="name-text"
                    initial={{ opacity: 0, y: 5 }}
                    animate={{ opacity: 1, y: 0 }}
                    className={cn(
                      "block truncate font-medium",
                      isDead ? "lh-name-dim" : "text-[var(--text-primary)]",
                    )}
                  >
                    {playerTitle(player.seat, player.displayName)}
                  </motion.span>
                ) : (
                  <motion.div
                    key="name-loading"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="h-full flex items-center"
                  >
                    <div className="h-2 w-16 bg-[var(--text-secondary)]/10 rounded-full animate-pulse" />
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </>
        )}

        {variant !== "round" && (
        <div className="wc-player-card__meta min-h-[1.25rem] space-y-0.5">
          {isReady && showModel && modelLabel && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.25 }}
              className="text-[10px] text-[var(--text-muted)] truncate"
              title={modelLabel}
            >
              {modelLabel}
            </motion.div>
          )}
          {!isReady && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: [0.4, 0.9, 0.4] }}
              transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut" }}
              className="text-[var(--text-muted)] text-xs flex items-center gap-1"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-[#A9B2BC]" />
              {t("playerCard.joining")}
            </motion.div>
          )}
        </div>
        )}
      </div>
      
      
      {/* 边框高亮流光 (Highlight border on ready) */}
      <AnimatePresence>
        {revealPop && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, transition: { duration: 1 } }}
            className="absolute inset-0 rounded-lg pointer-events-none z-30"
            style={{
              boxShadow: "inset 0 0 20px rgba(184,134,11,0.3), 0 0 10px rgba(184,134,11,0.2)"
            }}
          />
        )}
      </AnimatePresence>
    </motion.div>
  );
}

"use client";

import { motion, AnimatePresence } from "framer-motion";
import { PawPrint, Sparkle, Wrench, GearSix, UserCircle, GithubLogo, EnvelopeSimple, Handshake, DotsThreeOutlineVertical, Users, UsersFour } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAtom } from "jotai";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import type { DevPreset, DifficultyLevel, Role, StartGameOptions } from "@/types/game";
import { DevModeButton } from "@/components/DevTools";
import { GameSetupModal } from "@/components/game/GameSetupModal";
import { AuthModal } from "@/components/game/AuthModal";
import { SharePanel } from "@/components/game/SharePanel";
import { AccountModal } from "@/components/game/AccountModal";
import { ResetPasswordModal } from "@/components/game/ResetPasswordModal";
import { UserProfileModal } from "@/components/game/UserProfileModal";
import { LowCreditModal, LOW_CREDIT_THRESHOLD } from "@/components/game/LowCreditModal";
import { LocaleSwitcher } from "@/components/game/LocaleSwitcher";
import { CustomCharacterModal } from "@/components/game/CustomCharacterModal";
import { useCustomCharacters } from "@/hooks/useCustomCharacters";
import { useCredits, type ConsumeCreditResult } from "@/hooks/useCredits";
import { difficultyAtom, playerCountAtom, preferredRoleAtom } from "@/store/settings";
import {
  getGeneratorModel,
  getModelSource,
  hasDashscopeKey,
  hasTokendanceKey,
  hasZenmuxKey,
  isTokenPayConnected,
  MODEL_SOURCE_CHANGE_EVENT,
  setModelSource,
  syncTokenPayConnectionState,
  type ModelSource,
} from "@/lib/api-keys";
import { loadTokenPayConnectionWithRetry } from "@/lib/tokenpay-client";
import { fetchPublicQuota, reservePublicGame, type PublicQuota } from "@/lib/demo-game-client";
import { WolfCover } from "@/components/home/WolfCover";
import { isSealDisabled, nameFieldEnterAction } from "@/components/home/oath-card";

const GITHUB_REPO_URL = "https://github.com/WillAI9527/last-human";

const PUBLIC_DEMO = true;
import { useAppLocale } from "@/i18n/useAppLocale";
import {
  SPRING_CAMPAIGN_CODE,
  SPRING_CAMPAIGN_DAILY_QUOTA,
  getShanghaiDateKey,
  isSpringCampaignActive,
} from "@/lib/spring-campaign";
import {
  FREE_ROUNDS_PROMO_ENABLED,
  REFERRAL_BONUS_ENABLED,
  SPRING_CAMPAIGN_ENABLED,
} from "@/lib/welfare-config";

type SponsorCardProps = {
  sponsorId: string;
  href: string;
  className: string;
  rotate: string;
  delay: number;
  logoSrc?: string;
  logoAlt?: string;
  label?: string;
  name?: string;
  note?: string;
  children?: React.ReactNode;
};

const CUSTOM_CHARACTER_SELECTION_STORAGE_KEY = "wolfcha_custom_character_selection";

// Track sponsor click
async function trackSponsorClick(sponsorId: string) {
  try {
    await fetch("/api/sponsor/click", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sponsorId, ref: "homepage" }),
    });
  } catch {
    // Silently fail - don't block navigation
  }
}

function SponsorCard({
  sponsorId,
  href,
  className,
  rotate,
  delay,
  logoSrc,
  logoAlt,
  label,
  name,
  note,
  children,
}: SponsorCardProps) {
  const ariaLabel = [label, name, note].filter(Boolean).join(" · ");

  const handleClick = () => {
    void trackSponsorClick(sponsorId);
  };

  // Add ref parameter to href for tracking on sponsor's side
  // Special handling for OpenCreator: use promo parameter instead of ref
  const hrefWithRef = sponsorId === "opencreator"
    ? (href.includes("?") ? `${href}&promo=wolfcha` : `${href}?promo=wolfcha`)
    : (href.includes("?") ? `${href}&ref=wolfcha` : `${href}?ref=wolfcha`);

  return (
    <motion.a
      href={hrefWithRef}
      target="_blank"
      rel="noopener noreferrer"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ delay, duration: 0.5 }}
      className={className}
      style={{ "--card-rotate": rotate } as React.CSSProperties}
      aria-label={ariaLabel || undefined}
      title={ariaLabel || undefined}
      onClick={handleClick}
    >
      <span className="wc-sponsor-card__border" aria-hidden="true" />
      <div className="wc-sponsor-card__content">
        {logoSrc && (
          <img src={logoSrc} alt={logoAlt ?? ""} className="wc-sponsor-card__logo" />
        )}
        {label && <div className="wc-sponsor-card__label">{label}</div>}
        {name && <div className="wc-sponsor-card__name">{name}</div>}
        {note && <div className="wc-sponsor-card__note">{note}</div>}
        {children}
      </div>
    </motion.a>
  );
}

function buildDefaultRoles(playerCount: number): Role[] {
  switch (playerCount) {
    case 6:
      return ["Werewolf", "Werewolf", "Seer", "Witch", "Villager", "Villager"];
    case 8:
      return ["Werewolf", "Werewolf", "Werewolf", "Seer", "Witch", "Hunter", "Villager", "Villager"];
    case 9:
      return [
        "Werewolf",
        "Werewolf",
        "Werewolf",
        "Seer",
        "Witch",
        "Hunter",
        "Villager",
        "Villager",
        "Villager",
      ];
    case 11:
      return [
        "Werewolf",
        "Werewolf",
        "Werewolf",
        "WhiteWolfKing",
        "Seer",
        "Witch",
        "Hunter",
        "Guard",
        "Idiot",
        "Villager",
        "Villager",
      ];
    case 12:
      return [
        "Werewolf",
        "Werewolf",
        "Werewolf",
        "WhiteWolfKing",
        "Seer",
        "Witch",
        "Hunter",
        "Guard",
        "Idiot",
        "Villager",
        "Villager",
        "Villager",
      ];
    case 10:
    default:
      return [
        "Werewolf",
        "Werewolf",
        "WhiteWolfKing",
        "Seer",
        "Witch",
        "Hunter",
        "Guard",
        "Villager",
        "Villager",
        "Villager",
      ];
  }
}

function getRoleCountConfig(playerCount: number) {
  if (playerCount <= 6) {
    return {
      werewolfCount: 2,
      whiteWolfKingCount: 0,
      wolfCount: 2,
      guardCount: 0,
      seerCount: 1,
      witchCount: 1,
      hunterCount: 0,
      idiotCount: 0,
      villagerCount: 2,
      godCount: 2,
    };
  }
  const werewolfCount = playerCount >= 11 ? 3 : 2;
  const whiteWolfKingCount = 1;
  const wolfCount = werewolfCount + whiteWolfKingCount;
  const guardCount = playerCount >= 10 ? 1 : 0;
  const idiotCount = playerCount >= 11 ? 1 : 0;
  const seerCount = 1;
  const witchCount = 1;
  const hunterCount = 1;
  const godCount = seerCount + witchCount + hunterCount + guardCount + idiotCount;
  const villagerCount = Math.max(0, playerCount - wolfCount - godCount);
  return {
    werewolfCount,
    whiteWolfKingCount,
    wolfCount,
    guardCount,
    seerCount,
    witchCount,
    hunterCount,
    idiotCount,
    villagerCount,
  };
}

interface WelcomeScreenProps {
  humanName: string;
  setHumanName: (name: string) => void;
  onStart: (options?: StartGameOptions) => void | Promise<void>;
  onAbort?: () => void;
  isLoading: boolean;
  isGenshinMode: boolean;
  onGenshinModeChange: (value: boolean) => void;
  isSpectatorMode: boolean;
  onSpectatorModeChange: (value: boolean) => void;
  bgmVolume: number;
  isSoundEnabled: boolean;
  isAiVoiceEnabled: boolean;
  isAutoAdvanceDialogueEnabled: boolean;
  onBgmVolumeChange: (value: number) => void;
  onSoundEnabledChange: (value: boolean) => void;
  onAiVoiceEnabledChange: (value: boolean) => void;
  onAutoAdvanceDialogueEnabledChange: (value: boolean) => void;
}

export function WelcomeScreen({
  humanName,
  setHumanName,
  onStart,
  onAbort,
  isLoading,
  isGenshinMode,
  onGenshinModeChange,
  isSpectatorMode,
  onSpectatorModeChange,
  bgmVolume,
  isSoundEnabled,
  isAiVoiceEnabled,
  isAutoAdvanceDialogueEnabled,
  onBgmVolumeChange,
  onSoundEnabledChange,
  onAiVoiceEnabledChange,
  onAutoAdvanceDialogueEnabledChange,
}: WelcomeScreenProps) {
  const t = useTranslations();
  const { locale } = useAppLocale();
  const discordInviteUrl = "https://discord.gg/ETkdZWgy";
  const sponsorEmail = "zhihuang.oiloil@gmail.com";
  const sponsorMailto = useMemo(() => {
    const subject = t("welcome.sponsor.mailSubject");
    const body = t("welcome.sponsor.mailBody");
    return `mailto:${sponsorEmail}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  }, [sponsorEmail, t]);

  const {
    user,
    session,
    credits,
    referralCode,
    totalReferrals,
    loading: creditsLoading,
    consumeCredit,
    completeGameStartRequest,
    hasPendingGameStartRequest,
    redeemCode,
    signOut,
    isPasswordRecovery,
    clearPasswordRecovery,
    fetchCredits,
    springCampaign,
    refreshDemoConfig,
  } = useCredits();
  const [isSetupOpen, setIsSetupOpen] = useState(false);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const sealButtonRef = useRef<HTMLButtonElement | null>(null);
  const isStartingRef = useRef(false);
  const [isAuthOpen, setIsAuthOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/check-config")
      .then((response) => response.json())
      .then((payload: { zenmuxConfigured?: boolean; message?: string | null }) => {
        if (cancelled) return;
        if (!payload.zenmuxConfigured) {
          toast.error(payload.message || "服务器未配置，暂时无法开局。");
        }
      })
      .catch(() => {
        if (!cancelled) toast.error("服务器未配置，暂时无法开局。");
      });
    return () => {
      cancelled = true;
    };
  }, []);
  const [isShareOpen, setIsShareOpen] = useState(false);
  const [isAccountOpen, setIsAccountOpen] = useState(false);
  const [isUserProfileOpen, setIsUserProfileOpen] = useState(false);
  const [isSponsorOpen, setIsSponsorOpen] = useState(false);
  const [isSpringFestivalOpen, setIsSpringFestivalOpen] = useState(false);
  const [isGroupOpen, setIsGroupOpen] = useState(false);
  const [groupImgOk, setGroupImgOk] = useState<boolean | null>(null);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isCustomCharacterOpen, setIsCustomCharacterOpen] = useState(false);
  const [isLowCreditOpen, setIsLowCreditOpen] = useState(false);
  const [userProfileDefaultTab, setUserProfileDefaultTab] = useState<string | undefined>(undefined);
  const [tokenPayConnected, setTokenPayConnectedState] = useState(false);
  const tokenPaySyncVersionRef = useRef(0);
  const tokenPaySyncInFlightRef = useRef<{
    userId: string;
    promise: Promise<boolean | null>;
  } | null>(null);
  const tokenPayQueryHandledRef = useRef(false);
  const selectionStorageKey = useMemo(() => {
    return user?.id
      ? `${CUSTOM_CHARACTER_SELECTION_STORAGE_KEY}:${user.id}`
      : CUSTOM_CHARACTER_SELECTION_STORAGE_KEY;
  }, [user?.id]);

  const readSelectionFromStorage = useCallback(() => {
    if (typeof window === "undefined") return new Set<string>();
    try {
      const raw = window.localStorage.getItem(selectionStorageKey);
      if (!raw) return new Set<string>();
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return new Set<string>();
      return new Set(parsed.filter((item): item is string => typeof item === "string"));
    } catch {
      return new Set<string>();
    }
  }, [selectionStorageKey]);

  const selectionStorageKeyRef = useRef<string | null>(null);
  const [selectedCharacterIds, setSelectedCharacterIds] = useState<Set<string>>(() =>
    readSelectionFromStorage()
  );

  const customCharacters = useCustomCharacters(user);
  const [difficulty, setDifficulty] = useAtom(difficultyAtom);
  const [playerCount, setPlayerCount] = useAtom(playerCountAtom);
  const [preferredRole, setPreferredRole] = useAtom(preferredRoleAtom);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [dailyQuota, setDailyQuota] = useState<PublicQuota | null>(null);
  const [sealHint, setSealHint] = useState(false);
  const sealHintTimerRef = useRef<number | null>(null);
  const springCampaignRemainingQuota = springCampaign?.remainingQuota ?? 0;
  const springCampaignTotalQuota = springCampaign?.totalQuota ?? 0;
  const springCampaignActiveNow = SPRING_CAMPAIGN_ENABLED
    && (springCampaign?.active ?? isSpringCampaignActive());
  const springCampaignDateToday = springCampaignActiveNow ? getShanghaiDateKey() : null;
  const isSpringCampaignForToday = springCampaignActiveNow
    && springCampaign?.quotaDate === springCampaignDateToday;
  const effectiveSpringRemainingQuota = springCampaignActiveNow
    ? (isSpringCampaignForToday ? springCampaignRemainingQuota : SPRING_CAMPAIGN_DAILY_QUOTA)
    : 0;
  const effectiveSpringTotalQuota = springCampaignActiveNow
    ? (isSpringCampaignForToday ? springCampaignTotalQuota : SPRING_CAMPAIGN_DAILY_QUOTA)
    : 0;
  const hasSpringQuota = springCampaignActiveNow && effectiveSpringRemainingQuota > 0;
  const mayHaveUnclaimedSpringQuota = springCampaignActiveNow && !isSpringCampaignForToday;
  const springFestivalSeenKey = `wolfcha:${SPRING_CAMPAIGN_CODE}:welcome_seen`;

  useEffect(() => {
    if (locale === "en") setIsGroupOpen(false);
  }, [locale]);

  useEffect(() => {
    if (!SPRING_CAMPAIGN_ENABLED || !springCampaign?.active || !springCampaign.justClaimed) return;
    toast.success(t("welcome.springCampaign.toast.claimed.title"), {
      description: t("welcome.springCampaign.toast.claimed.description"),
    });
  }, [springCampaign?.active, springCampaign?.justClaimed, t]);

  useEffect(() => {
    if (typeof window === "undefined" || tokenPayQueryHandledRef.current) return;
    const url = new URL(window.location.href);
    const tokenPayResult = url.searchParams.get("tokenpay");
    if (!tokenPayResult) return;
    const tokenPayErrorResults = new Set(["error", "denied", "invalid_callback", "failed"]);
    if (tokenPayResult !== "connected" && !tokenPayErrorResults.has(tokenPayResult)) return;

    tokenPayQueryHandledRef.current = true;
    url.searchParams.delete("tokenpay");
    window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
    setUserProfileDefaultTab("tokenpay");
    setIsUserProfileOpen(true);
    if (tokenPayResult === "connected") {
      setModelSource("tokenpay");
    }
    if (tokenPayErrorResults.has(tokenPayResult)) {
      toast.error(t("tokenPay.oauthError"));
    }
  }, [t]);

  useEffect(() => {
    if (!springCampaignActiveNow) return;
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const popupDebugMode = params.get("spring_popup_debug") === "1";
    const seen = window.localStorage.getItem(springFestivalSeenKey);
    if (!popupDebugMode && seen === "1") return;
    if (!popupDebugMode) {
      window.localStorage.setItem(springFestivalSeenKey, "1");
    }
    setIsSpringFestivalOpen(true);
  }, [springCampaignActiveNow, springFestivalSeenKey]);

  useEffect(() => {
    selectionStorageKeyRef.current = selectionStorageKey;
    setSelectedCharacterIds(readSelectionFromStorage());
  }, [readSelectionFromStorage, selectionStorageKey]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (selectionStorageKeyRef.current !== selectionStorageKey) return;
    const ids = Array.from(selectedCharacterIds);
    window.localStorage.setItem(selectionStorageKey, JSON.stringify(ids));
  }, [selectedCharacterIds, selectionStorageKey]);

  useEffect(() => {
    if (customCharacters.loading) return;
    const validIds = new Set(customCharacters.characters.map((char) => char.id));
    const filtered = new Set(
      Array.from(selectedCharacterIds).filter((id) => validIds.has(id))
    );
    if (filtered.size !== selectedCharacterIds.size) {
      setSelectedCharacterIds(filtered);
    }
  }, [customCharacters.characters, customCharacters.loading, selectedCharacterIds]);

  const [modelSource, setModelSourceState] = useState<ModelSource>(() => getModelSource());

  const handleTokenPayConnectionChange = useCallback((connected: boolean) => {
    const nextSource = syncTokenPayConnectionState(connected);
    setTokenPayConnectedState(connected);
    setModelSourceState(nextSource);
  }, []);

  const refreshTokenPayConnection = useCallback((): Promise<boolean | null> => {
    const userId = session?.user.id;
    if (!userId) {
      handleTokenPayConnectionChange(false);
      return Promise.resolve(false);
    }

    const currentRequest = tokenPaySyncInFlightRef.current;
    if (currentRequest?.userId === userId) return currentRequest.promise;

    const version = ++tokenPaySyncVersionRef.current;
    const promise = loadTokenPayConnectionWithRetry(userId)
      .then((connection) => {
        if (tokenPaySyncVersionRef.current !== version) return null;
        handleTokenPayConnectionChange(connection.connected);
        return connection.connected;
      })
      .catch((error) => {
        if (tokenPaySyncVersionRef.current !== version) return null;
        console.warn("[TokenPay] Connection sync failed", error);
        return null;
      })
      .finally(() => {
        if (tokenPaySyncVersionRef.current === version) {
          tokenPaySyncInFlightRef.current = null;
        }
      });
    tokenPaySyncInFlightRef.current = { userId, promise };
    return promise;
  }, [handleTokenPayConnectionChange, session?.user.id]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const syncModelSource = () => {
      setModelSourceState(getModelSource());
      setTokenPayConnectedState(isTokenPayConnected());
    };
    const onStorage = (event: StorageEvent) => {
      if (
        event.key !== "wolfcha_model_source" &&
        event.key !== "wolfcha_custom_key_enabled" &&
        event.key !== "wolfcha_tokenpay_connected"
      ) return;
      syncModelSource();
    };
    window.addEventListener("storage", onStorage);
    window.addEventListener(MODEL_SOURCE_CHANGE_EVENT, syncModelSource);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(MODEL_SOURCE_CHANGE_EVENT, syncModelSource);
    };
  }, []);

  useEffect(() => {
    tokenPaySyncVersionRef.current += 1;
    tokenPaySyncInFlightRef.current = null;
    handleTokenPayConnectionChange(false);
    if (!session?.user.id) {
      return;
    }
    void refreshTokenPayConnection();
  }, [handleTokenPayConnectionChange, refreshTokenPayConnection, session?.user.id]);

  useEffect(() => {
    if (!session?.user.id) return;
    const refresh = () => void refreshTokenPayConnection();
    window.addEventListener("focus", refresh);
    window.addEventListener("online", refresh);
    return () => {
      window.removeEventListener("focus", refresh);
      window.removeEventListener("online", refresh);
    };
  }, [refreshTokenPayConnection, session?.user.id]);

  // 调试面板状态
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  const [isDevModeEnabled, setIsDevModeEnabled] = useState(false);
  const [isDevConsoleOpen, setIsDevConsoleOpen] = useState(false);
  const [devTab, setDevTab] = useState<"preset" | "roles">("preset");
  const [devPreset, setDevPreset] = useState<DevPreset | "">("");
  const showDevTools =
    process.env.NODE_ENV !== "production" && (process.env.NEXT_PUBLIC_SHOW_DEVTOOLS ?? "true") === "true";

  const roleOptions: Role[] = ["Villager", "Werewolf", "WhiteWolfKing", "Seer", "Witch", "Hunter", "Guard", "Idiot"];
  const roleLabels = useMemo<Record<Role, string>>(
    () => ({
      Villager: t("roles.villager"),
      Werewolf: t("roles.werewolf"),
      WhiteWolfKing: t("roles.whiteWolfKing"),
      Seer: t("roles.seer"),
      Witch: t("roles.witch"),
      Hunter: t("roles.hunter"),
      Guard: t("roles.guard"),
      Idiot: t("roles.idiot"),
    }),
    [t]
  );

  const [devRoleOverrideEnabled, setDevRoleOverrideEnabled] = useState(false);
  const [fixedRoles, setFixedRoles] = useState<(Role | "")[]>(() => buildDefaultRoles(10));

  useEffect(() => {
    setFixedRoles(buildDefaultRoles(playerCount));
  }, [playerCount]);

  useEffect(() => {
    let cancelled = false;
    void fetchPublicQuota().then((quota) => {
      if (!cancelled) setDailyQuota(quota);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const roleConfigValid = useMemo(() => {
    if (fixedRoles.length !== playerCount) return false;
    if (fixedRoles.some((r) => !r)) return false;

    const counts: Record<Role, number> = {
      Villager: 0,
      Werewolf: 0,
      Seer: 0,
      Witch: 0,
      Hunter: 0,
      Guard: 0,
      Idiot: 0,
      WhiteWolfKing: 0,
    };
    for (const r of fixedRoles) {
      counts[r as Role] += 1;
    }

    const expected = getRoleCountConfig(playerCount);
    return (
      counts.Werewolf === expected.werewolfCount &&
      counts.WhiteWolfKing === expected.whiteWolfKingCount &&
      counts.Seer === expected.seerCount &&
      counts.Witch === expected.witchCount &&
      counts.Hunter === expected.hunterCount &&
      counts.Guard === expected.guardCount &&
      counts.Idiot === expected.idiotCount &&
      counts.Villager === expected.villagerCount
    );
  }, [fixedRoles, playerCount]);

  const roleConfigHint = useMemo(() => {
    const expected = getRoleCountConfig(playerCount);
    const godLabel =
      expected.guardCount > 0 ? t("welcome.roleConfig.godLabelFull") : t("welcome.roleConfig.godLabelNoGuard");
    return t("welcome.roleConfig.hint", {
      wolfCount: expected.wolfCount,
      godLabel,
      villagerCount: expected.villagerCount,
    });
  }, [playerCount, t]);

  const shownName = mounted ? humanName : "";
  const sealDisabled = isSealDisabled({
    name: shownName,
    quota: dailyQuota,
    busy: isLoading || isTransitioning || (!PUBLIC_DEMO && creditsLoading),
  });

  const pulseSeal = () => {
    if (nameFieldEnterAction() !== "hint-seal" || sealDisabled) return;
    setSealHint(true);
    if (sealHintTimerRef.current !== null) window.clearTimeout(sealHintTimerRef.current);
    sealHintTimerRef.current = window.setTimeout(() => setSealHint(false), 720);
  };

  const createParticles = (element: HTMLElement) => {
    const rect = element.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;

    for (let i = 0; i < 18; i += 1) {
      const particle = document.createElement("div");
      particle.className = "wc-particle";
      document.body.appendChild(particle);

      const size = Math.random() * 7 + 2;
      particle.style.width = `${size}px`;
      particle.style.height = `${size}px`;
      particle.style.left = `${centerX}px`;
      particle.style.top = `${centerY}px`;

      const angle = Math.random() * Math.PI * 2;
      const velocity = Math.random() * 90 + 40;
      const tx = Math.cos(angle) * velocity;
      const ty = Math.sin(angle) * velocity - 90;

      particle.animate(
        [
          { transform: "translate(0, 0) scale(1)", opacity: 1 },
          { transform: `translate(${tx}px, ${ty}px) scale(0)`, opacity: 0 },
        ],
        {
          duration: 900 + Math.random() * 450,
          easing: "cubic-bezier(0, .9, .57, 1)",
          fill: "forwards",
        }
      );

      window.setTimeout(() => particle.remove(), 1600);
    }
  };

  const handleCopySponsorEmail = async () => {
    try {
      await navigator.clipboard.writeText(sponsorEmail);
      toast.success(t("welcome.sponsor.copySuccess"), { description: sponsorEmail });
    } catch {
      toast(t("welcome.sponsor.copyFallback"), { description: sponsorEmail });
    }
  };

  const openTokenPayConnection = (reauthorize: boolean) => {
    syncTokenPayConnectionState(false);
    setTokenPayConnectedState(false);
    setUserProfileDefaultTab("tokenpay");
    setIsUserProfileOpen(true);
    toast.error(
      t(reauthorize ? "tokenPay.reauthorizeTitle" : "tokenPay.disconnectedTitle"),
      {
        description: t(
          reauthorize
            ? "tokenPay.reauthorizeDescription"
            : "tokenPay.disconnectedDescription",
        ),
      },
    );
  };

  const handleCreditFailure = (result?: ConsumeCreditResult) => {
    setIsTransitioning(false);
    onAbort?.();
    if (
      getModelSource() === "tokenpay" &&
      (result?.recoveryAction === "reauthorize_api_key" ||
        result?.code === "tokenpay_connection_unavailable")
    ) {
      openTokenPayConnection(true);
      return;
    }
    const insufficientCredits =
      result?.status === 400 &&
      result.error?.toLowerCase().includes("insufficient") === true;
    if (!insufficientCredits) {
      toast.error(t("welcome.toast.startFail.title"), {
        description: t("welcome.toast.startFail.description"),
      });
      return;
    }
    if (REFERRAL_BONUS_ENABLED) {
      setIsShareOpen(true);
    } else {
      setUserProfileDefaultTab("payAsYouGo");
      setIsUserProfileOpen(true);
    }
    toast.error(t("welcome.toast.creditFail.title"), { description: t("welcome.toast.creditFail.description") });
  };

  const hasActiveExternalModelSource = () => (
    (getModelSource() === "custom" &&
      (hasZenmuxKey() || hasDashscopeKey() || hasTokendanceKey())) ||
    (getModelSource() === "tokenpay" && (tokenPayConnected || isTokenPayConnected()))
  );

  const buildStartOptions = (gameSessionId?: string | null): StartGameOptions => {
    const roles = devTab === "roles" && devRoleOverrideEnabled && roleConfigValid ? (fixedRoles as Role[]) : undefined;
    const preset = devTab === "preset" && devPreset ? (devPreset as DevPreset) : undefined;
    const selectedCustomChars = customCharacters.characters
      .filter(c => selectedCharacterIds.has(c.id))
      .map(c => ({
        id: c.id,
        display_name: c.display_name,
        gender: c.gender,
        age: c.age,
        mbti: c.mbti,
        basic_info: c.basic_info,
        style_label: c.style_label,
        avatar_seed: c.avatar_seed,
      }));

    return {
      fixedRoles: roles,
      devPreset: preset,
      difficulty,
      playerCount: 6,
      gameSessionId: gameSessionId || undefined,
      customCharacters: selectedCustomChars,
      preferredRole: undefined,
    };
  };

  const getClientRegion = () => {
    if (typeof navigator === "undefined") return null;
    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || "unknown";
    return `${navigator.language || "unknown"}|${timeZone}`;
  };

  const buildCreditConsumeOptions = () => ({
    createSession: true,
    playerCount,
    difficulty,
    usedCustomKey: getModelSource() !== "project",
    modelUsed: getGeneratorModel(),
    userEmail: user?.email ?? null,
    region: getClientRegion(),
  });

  const waitForStartAnimation = async (startedAt: number) => {
    const remaining = Math.max(0, 800 - (Date.now() - startedAt));
    if (remaining <= 0) return;
    await new Promise<void>((resolve) => {
      window.setTimeout(resolve, remaining);
    });
  };

  const startGameWithCreditGuard = async (skipCredit: boolean) => {
    if (isStartingRef.current) {
      return;
    }

    isStartingRef.current = true;
    const animationStartedAt = Date.now();

    const seal = sealButtonRef.current;
    if (seal) createParticles(seal);

    setIsTransitioning(true);

    let creditAuthorized = skipCredit;
    let startRequestId: string | undefined;
    try {
      let gameSessionId: string | null = null;
      if (!skipCredit) {
        const result = await consumeCredit(buildCreditConsumeOptions());
        if (!result.success) {
          handleCreditFailure(result);
          return;
        }
        creditAuthorized = true;
        startRequestId = result.startRequestId;
        gameSessionId = result.sessionId ?? null;
      }

      const reservation = await reservePublicGame();
      if (!reservation.ok) {
        toast.error(reservation.message);
        setIsTransitioning(false);
        return;
      }

      await waitForStartAnimation(animationStartedAt);
      await onStart(buildStartOptions(gameSessionId));
      completeGameStartRequest(startRequestId);
    } catch (error) {
      console.error("[welcome] failed to start game", error);
      if (!creditAuthorized) {
        handleCreditFailure();
      } else {
        setIsTransitioning(false);
        onAbort?.();
      }
    } finally {
      isStartingRef.current = false;
    }
  };

  const handleConfirm = async () => {
    if (sealDisabled) {
      return;
    }
    if (isStartingRef.current) {
      return;
    }
    const latestDemoConfig = await refreshDemoConfig(true);
    const demoModeActive = latestDemoConfig.active;

    // Public demo: no account, no credits. Guests start straight from this screen.
    if (!PUBLIC_DEMO && !user && !demoModeActive) {
      setIsAuthOpen(true);
      toast(t("welcome.toast.signInFirst"));
      return;
    }

    if (!PUBLIC_DEMO && getModelSource() === "tokenpay") {
      const connected = tokenPayConnected
        ? true
        : await refreshTokenPayConnection();
      if (!connected) {
        openTokenPayConnection(false);
        return;
      }
    }

    const hasExternalSource = hasActiveExternalModelSource();

    if (
      !PUBLIC_DEMO &&
      !demoModeActive &&
      !hasExternalSource &&
      !hasPendingGameStartRequest(buildCreditConsumeOptions()) &&
      credits !== null &&
      credits <= LOW_CREDIT_THRESHOLD &&
      !hasSpringQuota &&
      !mayHaveUnclaimedSpringQuota
    ) {
      setIsLowCreditOpen(true);
      return;
    }

    await startGameWithCreditGuard(PUBLIC_DEMO || demoModeActive);
  };

  const handleOpenPayAsYouGo = () => {
    setUserProfileDefaultTab("payAsYouGo");
    setIsUserProfileOpen(true);
  };

  const handleOpenTokenPay = () => {
    setUserProfileDefaultTab("tokenpay");
    setIsUserProfileOpen(true);
  };

  const handleStartGameFromLowCreditModal = async () => {
    if (!PUBLIC_DEMO && getModelSource() === "tokenpay") {
      const connected = tokenPayConnected
        ? true
        : await refreshTokenPayConnection();
      if (!connected) {
        setIsLowCreditOpen(false);
        openTokenPayConnection(false);
        return;
      }
    }
    const latestDemoConfig = await refreshDemoConfig(true);
    await startGameWithCreditGuard(PUBLIC_DEMO || latestDemoConfig.active);
  };

  const handleOpenGroup = () => {
    if (locale === "en") {
      if (typeof window !== "undefined") {
        window.open(discordInviteUrl, "_blank", "noopener,noreferrer");
      }
      return;
    }
    setIsGroupOpen(true);
  };

  const groupIcon =
    locale === "en" ? (
      <img
        src="/Discord-Symbol-Blurple.svg"
        alt="Discord"
        className="h-4 w-4"
      />
    ) : (
      <Users size={16} />
    );

  return (
    <>
      <div className="wc-contract-screen wc-contract-screen--hero selection:bg-[var(--color-accent)] selection:text-white">
        <WolfCover
          name={shownName}
          onNameChange={setHumanName}
          quota={dailyQuota}
          sealDisabled={sealDisabled}
          sealHint={sealHint}
          sealRef={sealButtonRef}
          rulesOpen={rulesOpen}
          onNameEnter={pulseSeal}
          onSeal={() => { void handleConfirm(); }}
          onOpenRules={() => setRulesOpen(true)}
          onCloseRules={() => setRulesOpen(false)}
        />
        <div className="wc-contract-fog" aria-hidden="true" />
        <div className="wc-contract-vignette" aria-hidden="true" />

        <GameSetupModal
          open={isSetupOpen}
          onOpenChange={setIsSetupOpen}
          playerCount={playerCount}
          onPlayerCountChange={setPlayerCount}
          preferredRole={preferredRole}
          onPreferredRoleChange={setPreferredRole}
          isGenshinMode={isGenshinMode}
          onGenshinModeChange={onGenshinModeChange}
          isSpectatorMode={isSpectatorMode}
          onSpectatorModeChange={onSpectatorModeChange}
          bgmVolume={bgmVolume}
          isSoundEnabled={isSoundEnabled}
          isAiVoiceEnabled={isAiVoiceEnabled}
          isAutoAdvanceDialogueEnabled={isAutoAdvanceDialogueEnabled}
          onBgmVolumeChange={onBgmVolumeChange}
          onSoundEnabledChange={onSoundEnabledChange}
          onAiVoiceEnabledChange={onAiVoiceEnabledChange}
          onAutoAdvanceDialogueEnabledChange={onAutoAdvanceDialogueEnabledChange}
          onOpenHowToPlay={() => {
            setIsSetupOpen(false);
            setRulesOpen(true);
          }}
        />
        <AuthModal open={isAuthOpen} onOpenChange={setIsAuthOpen} />
        <AccountModal open={isAccountOpen} onOpenChange={setIsAccountOpen} />
        <UserProfileModal
          open={isUserProfileOpen}
          onOpenChange={(open) => {
            setIsUserProfileOpen(open);
            if (!open) setUserProfileDefaultTab(undefined);
          }}
          email={user?.email}
          credits={credits ?? undefined}
          springCampaign={springCampaign}
          referralCode={referralCode}
          totalReferrals={totalReferrals}
          onChangePassword={() => setIsAccountOpen(true)}
          onShareInvite={() => setIsShareOpen(true)}
          onSignOut={signOut}
          onRedeemCode={redeemCode}
          onModelSourceChange={setModelSourceState}
          onTokenPayConnectionChange={handleTokenPayConnectionChange}
          onCreditsChange={fetchCredits}
          defaultTab={userProfileDefaultTab}
        />
        <LowCreditModal
          open={isLowCreditOpen}
          onOpenChange={setIsLowCreditOpen}
          credits={credits ?? 0}
          onStartGame={handleStartGameFromLowCreditModal}
          onOpenPayAsYouGo={handleOpenPayAsYouGo}
          onOpenTokenPay={handleOpenTokenPay}
        />
        <ResetPasswordModal
          open={isPasswordRecovery}
          onOpenChange={(open) => !open && clearPasswordRecovery()}
          onSuccess={clearPasswordRecovery}
        />
        {REFERRAL_BONUS_ENABLED && (
          <SharePanel
            open={isShareOpen}
            onOpenChange={setIsShareOpen}
            referralCode={referralCode}
            totalReferrals={totalReferrals}
          />
        )}
        <CustomCharacterModal
          open={isCustomCharacterOpen}
          onOpenChange={setIsCustomCharacterOpen}
          characters={customCharacters.characters}
          loading={customCharacters.loading}
          canAddMore={customCharacters.canAddMore}
          remainingSlots={customCharacters.remainingSlots}
          selectedIds={selectedCharacterIds}
          onSelectionChange={setSelectedCharacterIds}
          onCreateCharacter={customCharacters.createCharacter}
          onUpdateCharacter={customCharacters.updateCharacter}
          onDeleteCharacter={customCharacters.deleteCharacter}
        />

        <Dialog
          open={locale === "en" ? false : isGroupOpen}
          onOpenChange={(open) => {
            if (locale === "en") return;
            setIsGroupOpen(open);
          }}
        >
          <DialogContent className="max-w-[420px]">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Users size={18} weight="duotone" />
                {t("welcome.group.title")}
              </DialogTitle>
              <DialogDescription>{t("welcome.group.description")}</DialogDescription>
            </DialogHeader>

            <div className="mt-2 flex items-center justify-center">
              {groupImgOk !== false && (
                <img
                  src="/group.png"
                  alt={t("settings.about.group.alt")}
                  className="w-full max-w-[280px] max-h-[50vh] rounded-md border-2 border-[var(--border-color)] bg-white object-contain"
                  onLoad={() => setGroupImgOk(true)}
                  onError={() => setGroupImgOk(false)}
                />
              )}
              {groupImgOk === false && (
                <div className="text-xs text-[var(--text-muted)]">{t("settings.about.group.missing")}</div>
              )}
            </div>
          </DialogContent>
        </Dialog>

        <Dialog open={isSponsorOpen} onOpenChange={setIsSponsorOpen}>
          <DialogContent className="max-w-[560px]">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Handshake size={18} weight="duotone" />
                {t("welcome.sponsor.title")}
              </DialogTitle>
              <DialogDescription>
                {t("welcome.sponsor.subtitle")}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3 text-sm leading-relaxed text-[var(--text-primary)]">
              <p>
                {t("welcome.sponsor.description")}
              </p>
              <ul className="list-disc pl-5 space-y-1 text-[var(--text-secondary)]">
                <li>{t("welcome.sponsor.items.credits")}</li>
                <li>{t("welcome.sponsor.items.media")}</li>
                <li>{t("welcome.sponsor.items.collaboration")}</li>
                <li>{t("welcome.sponsor.items.community")}</li>
              </ul>
              <p className="text-[var(--text-secondary)]">
                {t("welcome.sponsor.note")}
              </p>
            </div>

            <div className="flex flex-col sm:flex-row gap-2 sm:justify-end">
              <Button type="button" variant="outline" onClick={handleCopySponsorEmail} className="gap-2">
                <EnvelopeSimple size={16} />
                {t("welcome.sponsor.copyEmail")}
              </Button>
              <Button asChild className="gap-2">
                <a href={sponsorMailto} target="_blank" rel="noopener noreferrer">
                  <EnvelopeSimple size={16} />
                  {t("welcome.sponsor.sendEmail")}
                </a>
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {SPRING_CAMPAIGN_ENABLED && (
          <Dialog open={isSpringFestivalOpen} onOpenChange={setIsSpringFestivalOpen}>
            <DialogContent className="max-w-[560px] overflow-hidden border-2 border-[var(--border-color)] bg-[var(--bg-card)] p-0">
              <motion.div
                initial={{ opacity: 0, y: 18, scale: 0.92, rotateX: -14, filter: "blur(8px)" }}
                animate={{ opacity: 1, y: 0, scale: 1, rotateX: 0, filter: "blur(0px)" }}
                transition={{ duration: 0.55, ease: "easeOut" }}
                style={{ transformOrigin: "top center", perspective: 1100 }}
                className="relative"
              >
                <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.22),transparent_40%)]" />
                <div className="bg-gradient-to-r from-[#8b1a1a] via-[#b4232b] to-[#8b1a1a] px-6 py-5 text-white">
                  <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.18em] text-white/80">
                    <Sparkle size={14} weight="fill" />
                    {t("welcome.springCampaign.modal.badge")}
                  </div>
                  <h3 className="mt-2 text-2xl font-semibold tracking-wide">
                    {t("welcome.springCampaign.modal.title")}
                  </h3>
                  <p className="mt-1 text-sm text-white/90">
                    {t("welcome.springCampaign.modal.subtitle")}
                  </p>
                </div>
                <div className="space-y-3 px-6 py-5 text-sm">
                  <p className="text-[var(--text-primary)]">{t("welcome.springCampaign.modal.line1")}</p>
                  <p className="text-[var(--text-secondary)]">{t("welcome.springCampaign.modal.line2")}</p>
                  <p className="text-[var(--text-secondary)]">{t("welcome.springCampaign.modal.line3")}</p>
                  <div className="rounded-lg border border-[var(--border-color)] bg-white/60 px-3 py-2 text-xs text-[var(--text-secondary)]">
                    {t("welcome.springCampaign.modal.note")}
                  </div>
                  <Button
                    type="button"
                    className="w-full bg-[#b4232b] text-white hover:bg-[#9f1f26]"
                    onClick={() => setIsSpringFestivalOpen(false)}
                  >
                    {t("welcome.springCampaign.modal.action")}
                  </Button>
                </div>
              </motion.div>
            </DialogContent>
          </Dialog>
        )}

        <Dialog open={isMobileMenuOpen} onOpenChange={setIsMobileMenuOpen}>
          <DialogContent className="max-w-[420px]">
            <DialogHeader>
              <DialogTitle>{t("welcome.mobileMenu.title")}</DialogTitle>
              <DialogDescription>{t("welcome.mobileMenu.description")}</DialogDescription>
            </DialogHeader>
            <div className="grid gap-2">
              {!PUBLIC_DEMO && (
              <Button
                type="button"
                variant="outline"
                className="justify-start"
                onClick={() => {
                  setIsMobileMenuOpen(false);
                  setIsSponsorOpen(true);
                }}
              >
                <Handshake size={16} />
                {t("welcome.sponsor.action")}
              </Button>
              )}
              <Button
                type="button"
                variant="outline"
                className="justify-start"
                onClick={() => {
                  setIsMobileMenuOpen(false);
                  setIsSetupOpen(true);
                }}
              >
                <GearSix size={16} />
                {t("welcome.settings")}
              </Button>
              {user ? (
                <Button
                  type="button"
                  variant="outline"
                  className="justify-start"
                  onClick={() => {
                    setIsMobileMenuOpen(false);
                    setIsUserProfileOpen(true);
                  }}
                >
                  <UserCircle size={16} />
                  {t("welcome.account.info")}
                </Button>
              ) : !PUBLIC_DEMO ? (
                <Button
                  type="button"
                  variant="outline"
                  className="justify-start"
                  onClick={() => {
                    setIsMobileMenuOpen(false);
                    setIsAuthOpen(true);
                  }}
                >
                  <UserCircle size={16} />
                  {t("welcome.auth.signIn")}
                </Button>
              ) : null}
              <Button asChild variant="outline" className="justify-start">
                <a
                  href={GITHUB_REPO_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => setIsMobileMenuOpen(false)}
                >
                  <GithubLogo size={16} />
                  {t("welcome.github.title")}
                </a>
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Scattered sponsor cards (upstream sponsors; hidden in LAST HUMAN demo) */}
        {!PUBLIC_DEMO && (
        <div className="wc-sponsor-cards" aria-label={t("welcome.sponsor.showcaseLabel")}>
          {/* Sponsor card - Bailian (左上) */}
          <SponsorCard
            sponsorId="bailian"
            href="https://bailian.console.aliyun.com/"
            className="wc-sponsor-card wc-sponsor-card--with-logo wc-sponsor-card--top-left"
            rotate="4deg"
            delay={0.15}
            logoSrc="/sponsor/bailian.png"
            logoAlt="Bailian"
            name="Bailian"
            note={t("welcome.sponsor.cards.bailian")}
          />

          {/* Sponsor card - TokenDance (右下) */}
          <SponsorCard
            sponsorId="tokendance"
            href="https://tokendance.space/"
            className="wc-sponsor-card wc-sponsor-card--with-logo wc-sponsor-card--right-bottom wc-sponsor-card--tokendance"
            rotate="-4deg"
            delay={0.6}
            logoSrc="/sponsor/tokendance-icon.svg"
            logoAlt="TokenDance"
            name="TokenDance"
            note={t("welcome.sponsor.cards.tokendance")}
          />

          {/* Temporarily hidden: Sponsor card - Watcha (right-center)
          <SponsorCard
            sponsorId="watcha"
            href="https://watcha.cn/"
            className="wc-sponsor-card wc-sponsor-card--with-logo wc-sponsor-card--watcha"
            rotate="5deg"
            delay={0.45}
            logoSrc="/sponsor/watcha.svg"
            logoAlt="观猹"
            name="观猹"
            note={t("welcome.sponsor.cards.watcha")}
          />
          */}
        </div>
        )}

        <div className="wc-welcome-actions absolute top-[calc(16px+env(safe-area-inset-top,0px))] right-5 z-30 flex items-center gap-2">
          <div className="hidden sm:flex items-center gap-2">
            <LocaleSwitcher className="shrink-0" />
            <a
              href={GITHUB_REPO_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="hidden sm:flex items-center gap-1.5 rounded-md border-2 border-[var(--border-color)] bg-[var(--bg-card)] px-2 py-1 text-[11px] text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-all group"
              title="View on GitHub"
            >
              <GithubLogo size={15} className="group-hover:scale-110 transition-transform" />
              <span className="hidden lg:inline">GitHub</span>
            </a>
            {!PUBLIC_DEMO && (
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsSponsorOpen(true)}
              className="h-8 text-xs gap-2"
            >
              <Handshake size={16} />
              {t("welcome.sponsor.action")}
            </Button>
            )}
            {!PUBLIC_DEMO && (
            <Button
              type="button"
              variant="outline"
              onClick={handleOpenGroup}
              className="h-8 text-xs gap-2"
            >
              {groupIcon}
              {t("welcome.group.title")}
            </Button>
            )}

            {user ? (
              <button
                type="button"
                onClick={() => setIsUserProfileOpen(true)}
                className="hidden md:flex items-center gap-2 rounded-md border-2 border-[var(--border-color)] bg-[var(--bg-card)] px-2.5 py-1.5 text-xs text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors"
                title={t("welcome.account.viewInfo")}
              >
                <UserCircle size={16} />
                <span className="truncate max-w-[160px]">{user.email ?? t("userProfile.loggedIn")}</span>
                {modelSource === "tokenpay" && tokenPayConnected ? (
                  <span className="opacity-70">{t("tokenPay.connectedShort")}</span>
                ) : modelSource === "custom" ? (
                  <span className="opacity-70">{t("customKey.title")}</span>
                ) : (
                  <span className="opacity-70">
                    {springCampaignActiveNow ? t("welcome.account.tempQuotaShort", { count: effectiveSpringRemainingQuota }) : null}
                    {springCampaignActiveNow ? " · " : null}
                    {t("welcome.account.remaining", { count: creditsLoading ? "..." : (credits ?? 0) })}
                  </span>
                )}
              </button>
            ) : !PUBLIC_DEMO ? (
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsAuthOpen(true)}
                className="h-8 text-xs gap-2"
              >
                <UserCircle size={16} />
                {t("welcome.auth.signIn")}
              </Button>
            ) : null}

            {user && (
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsUserProfileOpen(true)}
                className="h-8 text-xs gap-2 md:hidden"
              >
                <UserCircle size={16} />
                {t("welcome.account.info")}
              </Button>
            )}

            <Button
              type="button"
              variant="outline"
              onClick={() => setIsSetupOpen(true)}
              className="h-8 text-xs gap-2"
            >
              <GearSix size={16} />
              {t("welcome.settings")}
            </Button>
          </div>

          <div className="flex sm:hidden items-center gap-2">
            <LocaleSwitcher className="shrink-0" />
            {!PUBLIC_DEMO && (
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsSponsorOpen(true)}
              className="h-8 text-xs gap-2"
            >
              <Handshake size={16} />
              {t("welcome.sponsor.short")}
            </Button>
            )}
            {!PUBLIC_DEMO && (
            <Button
              type="button"
              variant="outline"
              onClick={handleOpenGroup}
              className="h-8 text-xs gap-2"
            >
              {groupIcon}
              {t("welcome.group.short")}
            </Button>
            )}
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsMobileMenuOpen(true)}
              className="h-8 w-8 px-0"
              aria-label={t("welcome.mobileMenu.more")}
            >
              <DotsThreeOutlineVertical size={18} />
            </Button>
          </div>
        </div>


        <AnimatePresence>
          {isTransitioning && (
            <motion.div
              className="wc-transition-overlay"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.5, ease: "easeOut" }}
            >
              <motion.div
                className="wc-transition-text"
                initial={{ opacity: 0, y: 10, scale: 1.05, filter: "blur(10px)" }}
                animate={{ opacity: 1, y: 0, scale: 1, filter: "blur(0px)" }}
                transition={{ delay: 0.18, duration: 0.55, ease: "easeOut" }}
              >
                <div className="wc-transition-title">{t("welcome.transition.title")}</div>
                <div className="wc-transition-subtitle">{t("welcome.transition.subtitle")}</div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {showDevTools && (
        <>
          <DevModeButton
            onClick={() => {
              setIsDevModeEnabled(true);
              setIsDevConsoleOpen(true);
            }}
          />

          <AnimatePresence>
            {isDevConsoleOpen && (
              <motion.div
                initial={{ opacity: 0, x: 300 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 300 }}
                transition={{ type: "spring", stiffness: 300, damping: 30 }}
                className="wc-dev-console fixed right-0 top-0 bottom-0 w-[400px] z-[120] bg-gray-900/95 backdrop-blur-md border-l border-gray-700 shadow-2xl flex flex-col"
              >
                <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700 bg-gray-800/50">
                  <div className="flex items-center gap-2">
                    <Wrench size={20} className="text-yellow-400" />
                    <span className="font-bold text-white">{t("welcome.dev.title")}</span>
                  </div>
                  <button
                    onClick={() => setIsDevConsoleOpen(false)}
                    className="p-1 rounded hover:bg-gray-700 text-gray-400 hover:text-white transition-colors"
                    type="button"
                  >
                    <span className="text-xl leading-none">×</span>
                  </button>
                </div>

                <div className="flex border-b border-gray-700">
                  <button
                    type="button"
                    onClick={() => setDevTab("preset")}
                    className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 text-sm font-medium transition-colors ${devTab === "preset"
                        ? "text-yellow-400 border-b-2 border-yellow-400 bg-gray-800/50"
                        : "text-gray-400 hover:text-white hover:bg-gray-800/30"
                      }`}
                  >
                    {t("welcome.dev.tabs.preset")}
                  </button>
                  <button
                    type="button"
                    onClick={() => setDevTab("roles")}
                    className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 text-sm font-medium transition-colors ${devTab === "roles"
                        ? "text-yellow-400 border-b-2 border-yellow-400 bg-gray-800/50"
                        : "text-gray-400 hover:text-white hover:bg-gray-800/30"
                      }`}
                  >
                    {t("welcome.dev.tabs.roles")}
                  </button>
                </div>

                <div className="flex-1 overflow-y-auto p-4 space-y-4">
                  {devTab === "preset" && (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="text-xs font-semibold text-gray-300">{t("welcome.dev.preset.title")}</div>
                        <button
                          type="button"
                          onClick={() => setDevPreset("")}
                          className="text-xs text-gray-400 hover:text-white"
                        >
                          {t("welcome.dev.preset.clear")}
                        </button>
                      </div>
                      <select
                        value={devPreset}
                        onChange={(e) => setDevPreset(e.target.value as DevPreset | "")}
                        className="w-full bg-gray-800 border border-gray-600 rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-yellow-400"
                      >
                        <option value="">{t("welcome.dev.preset.none")}</option>
                        <option value="MILK_POISON_TEST">{t("welcome.dev.preset.milkPoison")}</option>
                        <option value="LAST_WORDS_TEST">{t("welcome.dev.preset.lastWords")}</option>
                      </select>
                    </div>
                  )}

                  {devTab === "roles" && (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="text-xs font-semibold text-gray-300">
                          {t("welcome.dev.roles.title", { count: playerCount })}
                        </div>
                        <div className={`text-xs ${roleConfigValid ? "text-green-400" : "text-gray-400"}`}>
                          {roleConfigValid ? t("welcome.dev.roles.ready") : roleConfigHint}
                        </div>
                      </div>

                      <div className="flex items-center justify-between bg-gray-800/50 rounded-lg px-3 py-2 border border-gray-700">
                        <span className="text-xs text-gray-300">{t("welcome.dev.roles.overrideLabel")}</span>
                        <button
                          type="button"
                          role="switch"
                          aria-checked={devRoleOverrideEnabled}
                          onClick={() => setDevRoleOverrideEnabled(prev => !prev)}
                          className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                            devRoleOverrideEnabled ? "bg-yellow-500" : "bg-gray-600"
                          }`}
                        >
                          <span className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow-sm transition-transform ${
                            devRoleOverrideEnabled ? "translate-x-[18px]" : "translate-x-[3px]"
                          }`} />
                        </button>
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        {fixedRoles.map((role, idx) => (
                          <div key={idx} className="flex items-center gap-2">
                            <span className="w-10 text-xs text-gray-400">
                              {t("welcome.dev.roles.seat", { seat: idx + 1 })}
                            </span>
                            <select
                              value={role}
                              onChange={(e) => {
                                const next = [...fixedRoles];
                                next[idx] = e.target.value as Role;
                                setFixedRoles(next);
                              }}
                              className="flex-1 bg-gray-800 border border-gray-600 rounded px-2 py-1 text-white text-xs focus:outline-none focus:border-yellow-400"
                            >
                              {roleOptions.map((r) => (
                                <option key={r} value={r}>
                                  {roleLabels[r]}
                                </option>
                              ))}
                            </select>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </>
      )}
    </>
  );
}

"use client";

import { useCallback, useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import { SixSeatMark } from "@/components/home/SixSeatMark";
import { keyboardInset } from "@/components/home/oath-card";
import {
  IDLE_RETURN_MS,
  MIN_DWELL_MS,
  WOLF_TURN_FRAME_COUNT,
  WOLF_TURN_NOSE,
  pickWolfFrameHysteresis,
  smoothPointer,
  stepWolfDwell,
  wolfSpritePosition,
} from "@/components/home/wolf-turn";
import type { PublicQuota } from "@/lib/demo-game-client";
import "./wolf-cover.css";

const FRONT_SRC = "/cover/frame_front.webp";
const SPRITE_SRC = "/cover/sprite.webp";
const FRAME_INDEXES = Array.from({ length: WOLF_TURN_FRAME_COUNT }, (_, index) => index);

type DeviceOrientationEventConstructor = typeof DeviceOrientationEvent & {
  requestPermission?: () => Promise<"granted" | "denied" | "default">;
};

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function useWolfTurn(stageRef: React.RefObject<HTMLDivElement | null>) {
  const pausedRef = useRef(false);
  const reducedRef = useRef(false);
  const requestFrameRef = useRef<(frame: number) => void>(() => {});
  const lookAtRef = useRef<(px: number, py: number) => void>(() => {});
  const lastPointRef = useRef<{ x: number; y: number } | null>(null);
  const gyroPointRef = useRef<{ x: number; y: number } | null>(null);
  const orientationCleanupRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    let disposed = false;
    let current = 0;
    let shownAt = performance.now() - MIN_DWELL_MS;
    let pending: number | null = null;
    let painted = false;
    let spriteReady = false;
    let dwellTimer = 0;
    let idleTimer = 0;
    let wasHidden = document.visibilityState === "hidden";
    reducedRef.current = media.matches;

    const nosePoint = () => {
      const rect = stage.getBoundingClientRect();
      return [rect.left + rect.width * WOLF_TURN_NOSE.x, rect.top + rect.height * WOLF_TURN_NOSE.y] as const;
    };

    const paint = (frame: number) => {
      const layers = stage.querySelectorAll<HTMLElement>("[data-wolf-frame]");
      layers.forEach((layer, index) => {
        layer.style.opacity = index === frame ? "1" : "0";
      });
      current = frame;
      painted = true;
      stage.dataset.frame = String(frame);
    };

    const clearDwell = () => {
      window.clearTimeout(dwellTimer);
      dwellTimer = 0;
    };

    const armDwell = () => {
      clearDwell();
      if (pending == null) return;
      const delay = Math.max(0, shownAt + MIN_DWELL_MS - performance.now());
      dwellTimer = window.setTimeout(() => {
        dwellTimer = 0;
        if (pending == null) return;
        requestFrame(pending);
      }, delay);
    };

    const requestFrame = (frame: number, force = false) => {
      if (reducedRef.current) return;
      if (!spriteReady) {
        stage.dataset.frame = "0";
        return;
      }
      if (force) {
        clearDwell();
        pending = null;
        paint(frame);
        shownAt = performance.now();
        return;
      }
      const now = performance.now();
      const next = stepWolfDwell({ shown: current, shownAt, pending }, frame, now);
      const changed = next.shown !== current || !painted;
      pending = next.pending;
      shownAt = next.shownAt;
      if (changed) paint(next.shown);
      armDwell();
    };
    requestFrameRef.current = (frame) => requestFrame(frame);

    const lookAt = (px: number, py: number) => {
      if (reducedRef.current) return;
      window.clearTimeout(idleTimer);
      idleTimer = 0;
      lastPointRef.current = { x: px, y: py };
      if (pausedRef.current) return;
      const [noseX, noseY] = nosePoint();
      const frame = pickWolfFrameHysteresis({
        px,
        py,
        noseX,
        noseY,
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight,
        currentFrame: current,
      });
      requestFrame(frame);
    };
    lookAtRef.current = lookAt;

    const returnFront = () => {
      lastPointRef.current = null;
      gyroPointRef.current = null;
      requestFrame(0);
    };

    const scheduleIdle = () => {
      window.clearTimeout(idleTimer);
      idleTimer = window.setTimeout(() => {
        idleTimer = 0;
        if (!disposed && !reducedRef.current) returnFront();
      }, IDLE_RETURN_MS);
    };

    const onPointerMove = (event: PointerEvent) => {
      if (event.pointerType === "touch") return;
      lookAt(event.clientX, event.clientY);
    };
    const onTouchStart = () => {
      window.clearTimeout(idleTimer);
      idleTimer = 0;
    };
    const onTouchMove = (event: TouchEvent) => {
      const touch = event.touches[0];
      if (!touch) return;
      lookAt(touch.clientX, touch.clientY);
    };
    const onTouchEnd = (event: TouchEvent) => {
      if (event.touches.length > 0) return;
      scheduleIdle();
    };
    const onPointerLeave = (event: PointerEvent) => {
      if (event.pointerType === "touch" || reducedRef.current) return;
      window.clearTimeout(idleTimer);
      idleTimer = 0;
      returnFront();
    };
    const onVisibility = () => {
      if (document.visibilityState === "hidden") {
        wasHidden = true;
        return;
      }
      if (!wasHidden) return;
      wasHidden = false;
      if (reducedRef.current) return;
      window.clearTimeout(idleTimer);
      idleTimer = 0;
      returnFront();
    };

    const applyDebugLook = () => {
      if (process.env.NODE_ENV === "production" || reducedRef.current) return false;
      const look = new URLSearchParams(window.location.search).get("look");
      if (!look) return false;
      const [x, y] = look.split(",").map(Number);
      if (!Number.isFinite(x) || !Number.isFinite(y)) return false;
      const px = (x + 1) / 2 * window.innerWidth;
      const py = (y + 1) / 2 * window.innerHeight;
      lastPointRef.current = { x: px, y: py };
      const [noseX, noseY] = nosePoint();
      const frame = pickWolfFrameHysteresis({
        px,
        py,
        noseX,
        noseY,
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight,
        currentFrame: 0,
      });
      requestFrame(frame, true);
      return true;
    };

    let cancelSpriteIdle = () => {};
    let revealTimer = 0;
    const revealSprite = () => {
      if (disposed || !spriteReady) return;
      const layers = stage.querySelectorAll<HTMLElement>("[data-wolf-frame]");
      layers.forEach((layer, index) => {
        layer.style.backgroundImage = `url("${SPRITE_SRC}")`;
        layer.style.backgroundPosition = wolfSpritePosition(index);
      });
      current = 0;
      shownAt = performance.now() - MIN_DWELL_MS;
      pending = null;
      painted = false;
      clearDwell();
      if (!applyDebugLook()) {
        const last = lastPointRef.current;
        if (last && !pausedRef.current) lookAt(last.x, last.y);
        else requestFrame(0);
      }
      revealTimer = window.setTimeout(() => {
        if (!disposed) stage.dataset.sprite = "live";
      }, 160);
    };

    const bootSprite = () => {
      if (disposed || reducedRef.current || spriteReady) return;
      const image = new Image();
      image.onload = () => {
        if (disposed || reducedRef.current) return;
        spriteReady = true;
        revealSprite();
      };
      image.onerror = () => {
        if (!disposed) stage.dataset.sprite = "front";
      };
      image.src = SPRITE_SRC;
    };

    stage.dataset.gaze = "ready";
    stage.dataset.frame = "0";
    if (media.matches) {
      stage.dataset.sprite = "static";
    } else {
      stage.dataset.sprite = "front";
      window.addEventListener("pointermove", onPointerMove, { passive: true });
      window.addEventListener("touchstart", onTouchStart, { passive: true });
      window.addEventListener("touchmove", onTouchMove, { passive: true });
      window.addEventListener("touchend", onTouchEnd, { passive: true });
      window.addEventListener("touchcancel", onTouchEnd, { passive: true });
      window.addEventListener("pointerleave", onPointerLeave);
      document.addEventListener("visibilitychange", onVisibility);
      const start = () => {
        if (!disposed && !reducedRef.current) bootSprite();
      };
      if (typeof window.requestIdleCallback === "function") {
        const idle = window.requestIdleCallback(start, { timeout: 1000 });
        cancelSpriteIdle = () => window.cancelIdleCallback(idle);
      } else {
        const idle = window.setTimeout(start, 0);
        cancelSpriteIdle = () => window.clearTimeout(idle);
      }
    }

    const onReduce = () => {
      reducedRef.current = media.matches;
      if (!media.matches) return;
      clearDwell();
      window.clearTimeout(idleTimer);
      idleTimer = 0;
      pending = null;
      if (spriteReady) paint(0);
      else stage.dataset.frame = "0";
      stage.dataset.sprite = "static";
    };
    media.addEventListener("change", onReduce);

    return () => {
      disposed = true;
      cancelSpriteIdle();
      clearDwell();
      window.clearTimeout(idleTimer);
      window.clearTimeout(revealTimer);
      requestFrameRef.current = () => {};
      lookAtRef.current = () => {};
      media.removeEventListener("change", onReduce);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("touchstart", onTouchStart);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("touchend", onTouchEnd);
      window.removeEventListener("touchcancel", onTouchEnd);
      window.removeEventListener("pointerleave", onPointerLeave);
      document.removeEventListener("visibilitychange", onVisibility);
      orientationCleanupRef.current?.();
      orientationCleanupRef.current = null;
    };
  }, [stageRef]);

  const enableOrientation = useCallback(() => {
    if (reducedRef.current || orientationCleanupRef.current) return;
    const Doe = window.DeviceOrientationEvent as DeviceOrientationEventConstructor | undefined;
    if (!Doe) return;

    const attach = () => {
      if (orientationCleanupRef.current || reducedRef.current) return;
      const onOrientation = (event: DeviceOrientationEvent) => {
        if (reducedRef.current || event.gamma == null) return;
        const stage = stageRef.current;
        if (!stage) return;
        const rect = stage.getBoundingClientRect();
        const noseX = rect.left + rect.width * WOLF_TURN_NOSE.x;
        const noseY = rect.top + rect.height * WOLF_TURN_NOSE.y;
        const reach = Math.min(window.innerWidth, window.innerHeight) * 0.45;
        const raw = {
          x: noseX + clamp(event.gamma / 30, -1, 1) * reach,
          y: noseY + clamp(((event.beta ?? 0) - 45) / 30, -1, 1) * reach,
        };
        const smoothed = smoothPointer(gyroPointRef.current, raw);
        gyroPointRef.current = smoothed;
        lookAtRef.current(smoothed.x, smoothed.y);
      };
      window.addEventListener("deviceorientation", onOrientation);
      orientationCleanupRef.current = () => {
        window.removeEventListener("deviceorientation", onOrientation);
        orientationCleanupRef.current = null;
      };
    };

    if (typeof Doe.requestPermission === "function") {
      void Doe.requestPermission().then((result) => {
        if (result === "granted") attach();
      }).catch(() => {
        // Denied or dismissed: finger tracking stays on.
      });
      return;
    }

    const coarse = window.matchMedia("(pointer: coarse)").matches || navigator.maxTouchPoints > 0;
    if (coarse) attach();
  }, [stageRef]);

  const setGazePaused = useCallback((paused: boolean) => {
    const wasPaused = pausedRef.current;
    pausedRef.current = paused;
    if (stageRef.current) stageRef.current.dataset.gazePaused = paused ? "1" : "0";
    if (paused && !wasPaused) requestFrameRef.current(0);
    if (!paused && wasPaused && lastPointRef.current && !reducedRef.current) {
      lookAtRef.current(lastPointRef.current.x, lastPointRef.current.y);
    }
  }, [stageRef]);

  return { enableOrientation, setGazePaused };
}

function CloseIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
      <path
        d="M3.5 3.5 L12.5 12.5 M12.5 3.5 L3.5 12.5"
        fill="none"
        stroke="#A9B2BC"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function WolfCover({
  name,
  onNameChange,
  quota,
  sealDisabled,
  sealHint,
  sealRef,
  rulesOpen,
  onNameEnter,
  onSeal,
  onOpenRules,
  onCloseRules,
}: {
  name: string;
  onNameChange: (name: string) => void;
  quota: PublicQuota | null;
  sealDisabled: boolean;
  sealHint: boolean;
  sealRef: React.RefObject<HTMLButtonElement | null>;
  rulesOpen: boolean;
  onNameEnter: () => void;
  onSeal: () => void;
  onOpenRules: () => void;
  onCloseRules: () => void;
}) {
  const t = useTranslations();
  const stageRef = useRef<HTMLDivElement>(null);
  const chromeRef = useRef<HTMLDivElement>(null);
  const { enableOrientation, setGazePaused } = useWolfTurn(stageRef);
  const quotaSpent = quota !== null && !quota.unlimited && quota.remaining <= 0;
  const showQuota = quota !== null && !quota.unlimited;

  useEffect(() => {
    const chrome = chromeRef.current;
    const viewport = window.visualViewport;
    if (!chrome || !viewport) return;
    const sync = () => {
      const inset = keyboardInset(window.innerHeight, viewport.height, viewport.offsetTop);
      chrome.style.setProperty("--wolf-keyboard-inset", `${inset}px`);
      const input = chrome.querySelector("input");
      const focused = Boolean(input && document.activeElement === input);
      setGazePaused(focused || inset > 0);
      if (focused && input) {
        input.scrollIntoView({ block: "center", inline: "nearest" });
      }
    };
    sync();
    viewport.addEventListener("resize", sync);
    viewport.addEventListener("scroll", sync);
    return () => {
      viewport.removeEventListener("resize", sync);
      viewport.removeEventListener("scroll", sync);
      chrome.style.removeProperty("--wolf-keyboard-inset");
    };
  }, [setGazePaused]);

  useEffect(() => {
    if (!rulesOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCloseRules();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCloseRules, rulesOpen]);

  const handleSeal = () => {
    if (sealDisabled) return;
    enableOrientation();
    onSeal();
  };

  return (
    <section className="wolf-cover" aria-label="LAST HUMAN">
      <link rel="preload" as="image" href={FRONT_SRC} type="image/webp" fetchPriority="high" />
      <div className="wolf-cover__bg" />
      <div className="wolf-cover__moon" aria-hidden="true" />
      <div className="wolf-cover__stage" ref={stageRef} data-wolf-art="" data-sprite="front" data-frame="0">
        <img
          className="wolf-cover__front"
          src={FRONT_SRC}
          alt={t("welcome.cover.imageAlt")}
          width={640}
          height={360}
          draggable={false}
          fetchPriority="high"
          decoding="async"
        />
        {FRAME_INDEXES.map((index) => (
          <div key={index} className="wolf-cover__frame" data-wolf-frame={index} />
        ))}
      </div>
      <div className="wolf-cover__fog" />
      <div className="wolf-cover__chrome" ref={chromeRef} data-wolf-chrome="">
        <h1 className="wolf-cover__title">
          LAST HUMAN
          <span className="wolf-cover__line">{t("welcome.cover.line")}</span>
          <span className="wolf-cover__only">{t("welcome.subtitle")}</span>
        </h1>
        <input
          className="wolf-cover__sign"
          value={name}
          placeholder={t("welcome.signature.placeholder")}
          aria-label={t("welcome.signature.label")}
          autoComplete="off"
          enterKeyHint="done"
          onChange={(event) => onNameChange(event.target.value)}
          onFocus={(event) => {
            setGazePaused(true);
            event.currentTarget.scrollIntoView({ block: "center", inline: "nearest" });
          }}
          onBlur={() => {
            setGazePaused(false);
          }}
          onKeyDown={(event) => {
            if (event.key !== "Enter" || event.nativeEvent.isComposing) return;
            event.preventDefault();
            onNameEnter();
          }}
        />
        {showQuota && (
          <p className="wolf-cover__quota">
            {quotaSpent
              ? t.rich("welcome.quotaSpent", {
                  limit: quota.limit,
                  b: (chunks) => <strong>{chunks}</strong>,
                })
              : t.rich("welcome.quotaRemaining", {
                  count: quota.remaining,
                  b: (chunks) => <strong>{chunks}</strong>,
                })}
          </p>
        )}
        <button
          ref={sealRef}
          type="button"
          className={`wolf-cover__seal${sealDisabled ? " is-muted" : ""}${sealHint ? " is-hint" : ""}`}
          disabled={sealDisabled}
          aria-disabled={sealDisabled}
          aria-label={t("welcome.cover.sealLabel")}
          onClick={handleSeal}
        >
          <SixSeatMark muted={sealDisabled} />
        </button>
        <div className="wolf-cover__seal-label">{t("welcome.cover.sealLabel")}</div>
        <button type="button" className="wolf-cover__how" onClick={onOpenRules}>
          {t("welcome.howToPlay.link")}
        </button>
      </div>

      <div
        className={rulesOpen ? "wolf-rules-sheet is-open" : "wolf-rules-sheet"}
        onClick={(event) => {
          if (event.target === event.currentTarget) onCloseRules();
        }}
        aria-hidden={!rulesOpen}
        inert={rulesOpen ? undefined : true}
      >
        <div
          className="wolf-rules-panel"
          role="dialog"
          aria-modal="true"
          aria-labelledby="wolf-rules-title"
        >
          <button
            type="button"
            className="wolf-rules-close"
            aria-label={t("welcome.closeCard")}
            onClick={onCloseRules}
          >
            <CloseIcon />
          </button>
          <h2 id="wolf-rules-title" className="wolf-rules-title">{t("welcome.howToPlay.title")}</h2>
          <div className="wolf-rules-body">
            <p>{t("welcome.howToPlay.p1")}</p>
            <p>{t("welcome.howToPlay.p2")}</p>
            <p>{t("welcome.howToPlay.p3")}</p>
            <p>{t("welcome.howToPlay.p4")}</p>
            <p>{t("welcome.howToPlay.p5")}</p>
            <p>{t("welcome.howToPlay.p6")}</p>
          </div>
        </div>
      </div>
    </section>
  );
}

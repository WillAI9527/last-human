"use client";

import { useCallback, useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import { LocaleSwitcher } from "@/components/game/LocaleSwitcher";
import { keyboardInset } from "@/components/home/oath-card";
import {
  IDLE_RETURN_MS,
  WOLF_TURN_NOSE,
  WOLF_TURN_SPRITE_COLS,
  WOLF_TURN_SPRITE_ROWS,
  easeWolfFrameFloat,
  pickWolfFrameFloat,
  smoothPointer,
  wolfFrameBlend,
} from "@/components/home/wolf-turn";
import type { PublicQuota } from "@/lib/demo-game-client";
import "./wolf-cover.css";

const FRONT_SRC = "/cover/frame_front.webp";
const SPRITE_SRC = "/cover/sprite.webp";
const BACKGROUND_SRC = "/cover/background.png";
const BACKGROUND_VIDEO_SRC = "/cover/background-loop.mp4";

type DeviceOrientationEventConstructor = typeof DeviceOrientationEvent & {
  requestPermission?: () => Promise<"granted" | "denied" | "default">;
};

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function useWolfTurn(stageRef: React.RefObject<HTMLDivElement | null>) {
  const pausedRef = useRef(false);
  const reducedRef = useRef(false);
  const requestFrameRef = useRef<(frame: number, force?: boolean) => void>(() => {});
  const lookAtRef = useRef<(px: number, py: number) => void>(() => {});
  const lastPointRef = useRef<{ x: number; y: number } | null>(null);
  const gyroPointRef = useRef<{ x: number; y: number } | null>(null);
  const sealGazeTimerRef = useRef<number | null>(null);
  const orientationCleanupRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    let disposed = false;
    let currentFrameFloat = 0;
    let targetFrameFloat = 0;
    let spriteReady = false;
    let spriteImage: HTMLImageElement | null = null;
    let animationFrame = 0;
    let idleTimer = 0;
    let stageWidth = 0;
    let stageHeight = 0;
    let wasHidden = document.visibilityState === "hidden";
    reducedRef.current = media.matches;
    const canvas = stage.querySelector<HTMLCanvasElement>("[data-wolf-canvas]");
    const ctx = canvas?.getContext("2d", { alpha: true });

    const nosePoint = () => {
      const rect = stage.getBoundingClientRect();
      return [rect.left + rect.width * WOLF_TURN_NOSE.x, rect.top + rect.height * WOLF_TURN_NOSE.y] as const;
    };

    const syncCanvasSize = () => {
      if (!canvas || !ctx) return false;
      const rect = stage.getBoundingClientRect();
      stageWidth = rect.width;
      stageHeight = rect.height;
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      const width = Math.max(1, Math.round(rect.width * dpr));
      const height = Math.max(1, Math.round(rect.height * dpr));
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      return true;
    };

    const drawFrame = (index: number, opacity: number) => {
      if (!ctx || !canvas || !spriteImage || opacity <= 0) return;
      const cellWidth = spriteImage.naturalWidth / WOLF_TURN_SPRITE_COLS;
      const cellHeight = spriteImage.naturalHeight / WOLF_TURN_SPRITE_ROWS;
      const sx = (index % WOLF_TURN_SPRITE_COLS) * cellWidth;
      const sy = Math.floor(index / WOLF_TURN_SPRITE_COLS) * cellHeight;
      ctx.globalAlpha = opacity;
      ctx.drawImage(spriteImage, sx, sy, cellWidth, cellHeight, 0, 0, stageWidth, stageHeight);
      ctx.globalAlpha = 1;
    };

    const paint = (frameFloat: number) => {
      if (!ctx || !canvas || !spriteImage || !syncCanvasSize()) return;
      const blend = wolfFrameBlend(frameFloat);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      if (blend.a === blend.b) {
        drawFrame(blend.a, 1);
      } else {
        drawFrame(blend.a, 1 - blend.bOpacity);
        drawFrame(blend.b, blend.bOpacity);
      }
      currentFrameFloat = frameFloat;
      stage.dataset.frame = frameFloat.toFixed(2);
    };

    const stopAnimation = () => {
      window.cancelAnimationFrame(animationFrame);
      animationFrame = 0;
    };

    const animate = () => {
      animationFrame = 0;
      if (disposed || reducedRef.current || !spriteReady) return;
      const next = easeWolfFrameFloat(currentFrameFloat, targetFrameFloat);
      paint(Math.abs(next - targetFrameFloat) < 0.015 ? targetFrameFloat : next);
      if (Math.abs(currentFrameFloat - targetFrameFloat) >= 0.015) {
        animationFrame = window.requestAnimationFrame(animate);
      }
    };

    const requestFrame = (frame: number, force = false) => {
      if (reducedRef.current) return;
      if (!spriteReady) {
        stage.dataset.frame = "0";
        return;
      }
      targetFrameFloat = frame;
      if (force) {
        paint(frame);
        stopAnimation();
        return;
      }
      if (!animationFrame) animationFrame = window.requestAnimationFrame(animate);
    };
    requestFrameRef.current = (frame, force = false) => requestFrame(frame, force);

    const lookAt = (px: number, py: number) => {
      if (reducedRef.current) return;
      window.clearTimeout(idleTimer);
      idleTimer = 0;
      lastPointRef.current = { x: px, y: py };
      if (pausedRef.current) return;
      const [noseX, noseY] = nosePoint();
      const frame = pickWolfFrameFloat(px, py, noseX, noseY, window.innerWidth, window.innerHeight);
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
      const frame = pickWolfFrameFloat(px, py, noseX, noseY, window.innerWidth, window.innerHeight);
      requestFrame(frame, true);
      return true;
    };

    let cancelSpriteIdle = () => {};
    let revealTimer = 0;
    const revealSprite = () => {
      if (disposed || !spriteReady || !spriteImage) return;
      currentFrameFloat = 0;
      targetFrameFloat = 0;
      stopAnimation();
      paint(0);
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
      image.decoding = "async";
      image.onload = () => {
        if (disposed || reducedRef.current) return;
        spriteImage = image;
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
      stopAnimation();
      window.clearTimeout(idleTimer);
      idleTimer = 0;
      targetFrameFloat = 0;
      if (spriteReady) paint(0);
      else stage.dataset.frame = "0";
      stage.dataset.sprite = "static";
    };
    media.addEventListener("change", onReduce);

    return () => {
      disposed = true;
      cancelSpriteIdle();
      stopAnimation();
      window.clearTimeout(idleTimer);
      window.clearTimeout(revealTimer);
      requestFrameRef.current = () => {};
      lookAtRef.current = () => {};
      if (sealGazeTimerRef.current !== null) {
        window.clearTimeout(sealGazeTimerRef.current);
        sealGazeTimerRef.current = null;
      }
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
      if (ctx && canvas) ctx.clearRect(0, 0, canvas.width, canvas.height);
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

  const triggerSealGaze = useCallback(() => {
    const stage = stageRef.current;
    if (!stage) return;
    if (sealGazeTimerRef.current !== null) {
      window.clearTimeout(sealGazeTimerRef.current);
      sealGazeTimerRef.current = null;
    }
    pausedRef.current = true;
    stage.dataset.gazePaused = "1";
    // Align the glow only after painting the calibrated neutral sprite frame.
    requestFrameRef.current(0, true);
    delete stage.dataset.ritual;
    void stage.offsetWidth;
    stage.dataset.ritual = "seal";
    sealGazeTimerRef.current = window.setTimeout(() => {
      sealGazeTimerRef.current = null;
      const currentStage = stageRef.current;
      if (!currentStage) return;
      delete currentStage.dataset.ritual;
      pausedRef.current = false;
      currentStage.dataset.gazePaused = "0";
    }, 1200);
  }, [stageRef]);

  return { enableOrientation, setGazePaused, triggerSealGaze };
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
  sealRef,
  rulesOpen,
  onSeal,
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
  const bgVideoRef = useRef<HTMLVideoElement>(null);
  const startTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { enableOrientation, setGazePaused, triggerSealGaze } = useWolfTurn(stageRef);

  useEffect(() => () => {
    if (startTimerRef.current !== null) clearTimeout(startTimerRef.current);
  }, []);

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

  useEffect(() => {
    const video = bgVideoRef.current;
    if (!video) return;
    video.volume = 0.28;
    video.muted = true;
    void video.play().catch(() => {
      // Autoplay can be blocked; the first user gesture below retries playback.
    });

    const unlockAudio = () => {
      video.muted = false;
      video.volume = 0.28;
      void video.play().catch(() => {
        video.muted = true;
      });
      window.removeEventListener("pointerdown", unlockAudio);
      window.removeEventListener("keydown", unlockAudio);
      window.removeEventListener("touchstart", unlockAudio);
    };

    window.addEventListener("pointerdown", unlockAudio, { once: true });
    window.addEventListener("keydown", unlockAudio, { once: true });
    window.addEventListener("touchstart", unlockAudio, { once: true });
    return () => {
      window.removeEventListener("pointerdown", unlockAudio);
      window.removeEventListener("keydown", unlockAudio);
      window.removeEventListener("touchstart", unlockAudio);
    };
  }, []);

  const handleSeal = () => {
    triggerSealGaze();
    enableOrientation();
    if (startTimerRef.current !== null) clearTimeout(startTimerRef.current);
    startTimerRef.current = setTimeout(() => {
      startTimerRef.current = null;
      onSeal();
    }, 1200);
  };

  return (
    <section className="wolf-cover" aria-label="LAST HUMAN">
      <div className="wolf-cover__language"><LocaleSwitcher /></div>
      <link rel="preload" as="image" href={FRONT_SRC} type="image/webp" fetchPriority="high" />
      <link rel="preload" as="image" href={SPRITE_SRC} type="image/webp" />
      <link rel="preload" as="image" href={BACKGROUND_SRC} fetchPriority="high" />
      <div className="wolf-cover__bg" aria-hidden="true">
        <video
          ref={bgVideoRef}
          className="wolf-cover__bg-video"
          poster={BACKGROUND_SRC}
          autoPlay
          muted
          loop
          playsInline
          preload="auto"
        >
          <source src={BACKGROUND_VIDEO_SRC} type="video/mp4" />
        </video>
      </div>
      <div className="wolf-cover__mist" aria-hidden="true" />
      <div className="wolf-cover__stage" ref={stageRef} data-wolf-art="" data-sprite="front" data-frame="0">
        <img
          className="wolf-cover__front"
          src={FRONT_SRC}
          alt={t("welcome.cover.imageAlt")}
          width={900}
          height={760}
          draggable={false}
          fetchPriority="high"
          decoding="async"
        />
        <canvas className="wolf-cover__canvas" data-wolf-canvas="" aria-hidden="true" />
        <div className="wolf-cover__eye-glow" aria-hidden="true" />
      </div>
      <div className="wolf-cover__fog" />
      <div className="wolf-cover__chrome" ref={chromeRef} data-wolf-chrome="">
        <button
          ref={sealRef}
          type="button"
          className="wolf-cover__seal"
          aria-label="Start"
          onClick={handleSeal}
        >
          <img className="wolf-cover__seal-image" src="/cover/start-button.png" alt="" draggable={false} />
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

"use client";

import { useCallback, useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import { SixSeatMark } from "@/components/home/SixSeatMark";
import { keyboardInset } from "@/components/home/oath-card";
import {
  WOLF_PARALLAX_EYES,
  WOLF_PARALLAX_LERP,
  createWolfHeadRenderer,
  eyeDepthShift,
  type WolfHeadRenderer,
} from "@/components/home/wolf-head-parallax";
import type { PublicQuota } from "@/lib/demo-game-client";
import "./wolf-cover.css";

const COVER_SRC = "/cover/wolf.webp";
const DEPTH_SRC = "/cover/wolf-depth-rg.png";
type DeviceOrientationEventConstructor = typeof DeviceOrientationEvent & {
  requestPermission?: () => Promise<"granted" | "denied" | "default">;
};

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function useWolfHead(
  artRef: React.RefObject<HTMLDivElement | null>,
  canvasRef: React.RefObject<HTMLCanvasElement | null>,
  leftEyeRef: React.RefObject<HTMLDivElement | null>,
  rightEyeRef: React.RefObject<HTMLDivElement | null>,
  leftPupilRef: React.RefObject<HTMLDivElement | null>,
  rightPupilRef: React.RefObject<HTMLDivElement | null>,
) {
  const targetRef = useRef({ x: 0, y: 0 });
  const currentRef = useRef({ x: 0, y: 0 });
  const reducedRef = useRef(false);
  const kickRef = useRef<() => void>(() => {});
  const orientationCleanupRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    const art = artRef.current;
    const canvas = canvasRef.current;
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    let renderer: WolfHeadRenderer | null = null;
    let frame = 0;
    let running = false;
    let disposed = false;
    let booting = false;

    const paint = (x: number, y: number) => {
      const pupil = `translate3d(calc(-50% + ${x * 120}%), calc(-50% + ${y * 45}%), 0)`;
      if (leftPupilRef.current) leftPupilRef.current.style.transform = pupil;
      if (rightPupilRef.current) rightPupilRef.current.style.transform = pupil;
      if (!renderer) return;
      renderer.draw(x, y);
      const eyes = [leftEyeRef.current, rightEyeRef.current];
      for (let index = 0; index < WOLF_PARALLAX_EYES.length; index += 1) {
        const eye = eyes[index];
        const point = WOLF_PARALLAX_EYES[index];
        if (!eye || !point) continue;
        const [ex, ey] = point;
        const [dx, dy] = eyeDepthShift(renderer.depth, ex, ey, x, y);
        eye.style.left = `${(ex + dx) * 100}%`;
        eye.style.top = `${(ey + dy) * 100}%`;
      }
      if (process.env.NODE_ENV !== "production") {
        const host = window as Window & { __wolfHeadDraws?: number };
        host.__wolfHeadDraws = (host.__wolfHeadDraws ?? 0) + 1;
      }
    };

    const step = () => {
      running = false;
      if (disposed || reducedRef.current || document.hidden) return;
      const tx = targetRef.current.x;
      const ty = targetRef.current.y;
      const cx = currentRef.current.x;
      const cy = currentRef.current.y;
      if (Math.abs(cx - tx) < 0.001 && Math.abs(cy - ty) < 0.001) {
        currentRef.current = { x: tx, y: ty };
        return;
      }
      let nx = cx + (tx - cx) * WOLF_PARALLAX_LERP;
      let ny = cy + (ty - cy) * WOLF_PARALLAX_LERP;
      if (Math.abs(tx - nx) < 0.001 && Math.abs(ty - ny) < 0.001) {
        nx = tx;
        ny = ty;
      }
      currentRef.current = { x: nx, y: ny };
      paint(nx, ny);
      if (nx === tx && ny === ty) return;
      running = true;
      frame = window.requestAnimationFrame(step);
    };

    const kick = () => {
      if (running || reducedRef.current || document.hidden) return;
      running = true;
      frame = window.requestAnimationFrame(step);
    };
    kickRef.current = kick;

    const restEyes = () => {
      const eyes = [leftEyeRef.current, rightEyeRef.current];
      WOLF_PARALLAX_EYES.forEach(([ex, ey], index) => {
        const eye = eyes[index];
        if (!eye) return;
        eye.style.left = `${ex * 100}%`;
        eye.style.top = `${ey * 100}%`;
      });
    };

    const showFrame = () => {
      if (!renderer || !art || reducedRef.current) return false;
      const rect = art.getBoundingClientRect();
      if (rect.width < 2 || rect.height < 2) return false;
      renderer.resize(rect.width, rect.height, window.devicePixelRatio || 1);
      paint(currentRef.current.x, currentRef.current.y);
      art.dataset.head = "gl";
      return true;
    };

    const boot = () => {
      if (disposed || renderer || booting || reducedRef.current || !canvas) return;
      booting = true;
      void createWolfHeadRenderer(canvas, COVER_SRC, DEPTH_SRC).then((next) => {
        booting = false;
        if (disposed || reducedRef.current) {
          next.dispose();
          return;
        }
        renderer = next;
        if (!showFrame()) paint(currentRef.current.x, currentRef.current.y);
      }).catch(() => {
        booting = false;
        renderer = null;
        if (!disposed && art) art.dataset.head = "fallback";
        paint(currentRef.current.x, currentRef.current.y);
      });
    };

    const syncReduced = () => {
      const reduced = media.matches;
      reducedRef.current = reduced;
      if (!reduced) {
        if (renderer) showFrame();
        else boot();
        return;
      }
      window.cancelAnimationFrame(frame);
      running = false;
      targetRef.current = { x: 0, y: 0 };
      currentRef.current = { x: 0, y: 0 };
      restEyes();
      paint(0, 0);
      if (art) art.dataset.head = "static";
    };

    reducedRef.current = media.matches;
    if (process.env.NODE_ENV !== "production" && !media.matches) {
      const look = new URLSearchParams(window.location.search).get("look");
      if (look) {
        const [rawX, rawY] = look.split(",").map(Number);
        if (Number.isFinite(rawX) && Number.isFinite(rawY)) {
          const x = clamp(rawX, -1, 1);
          const y = clamp(rawY, -1, 1);
          targetRef.current = { x, y };
          currentRef.current = { x, y };
        }
      }
    }

    const lookAt = (clientX: number, clientY: number) => {
      if (reducedRef.current) return;
      targetRef.current = {
        x: clamp(clientX / window.innerWidth * 2 - 1, -1, 1),
        y: clamp(clientY / window.innerHeight * 2 - 1, -1, 1),
      };
      kick();
    };
    const onPointerMove = (event: PointerEvent) => lookAt(event.clientX, event.clientY);
    const onTouchMove = (event: TouchEvent) => {
      const touch = event.touches[0];
      if (!touch) return;
      lookAt(touch.clientX, touch.clientY);
    };
    const onVisibility = () => {
      if (!document.hidden) kick();
    };

    window.addEventListener("pointermove", onPointerMove, { passive: true });
    window.addEventListener("touchmove", onTouchMove, { passive: true });
    document.addEventListener("visibilitychange", onVisibility);
    media.addEventListener("change", syncReduced);
    if (art) art.dataset.gaze = "ready";

    const observer = new ResizeObserver(() => {
      showFrame();
    });
    if (art) observer.observe(art);
    if (media.matches) {
      restEyes();
      paint(0, 0);
      if (art) art.dataset.head = "static";
    } else {
      boot();
    }

    return () => {
      disposed = true;
      window.cancelAnimationFrame(frame);
      kickRef.current = () => {};
      media.removeEventListener("change", syncReduced);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("touchmove", onTouchMove);
      orientationCleanupRef.current?.();
      orientationCleanupRef.current = null;
      observer.disconnect();
      renderer?.dispose();
      renderer = null;
    };
  }, [artRef, canvasRef, leftEyeRef, leftPupilRef, rightEyeRef, rightPupilRef]);

  const enableOrientation = useCallback(() => {
    if (reducedRef.current || orientationCleanupRef.current) return;
    const Doe = window.DeviceOrientationEvent as DeviceOrientationEventConstructor | undefined;
    if (!Doe) return;

    const attach = () => {
      if (orientationCleanupRef.current || reducedRef.current) return;
      const onOrientation = (event: DeviceOrientationEvent) => {
        if (reducedRef.current || event.gamma == null) return;
        targetRef.current = {
          x: clamp(event.gamma / 30, -1, 1),
          y: clamp(((event.beta ?? 0) - 45) / 30, -1, 1),
        };
        kickRef.current();
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
  }, []);

  return enableOrientation;
}

function Eye({
  side,
  eyeRef,
  pupilRef,
}: {
  side: "l" | "r";
  eyeRef: React.RefObject<HTMLDivElement | null>;
  pupilRef: React.RefObject<HTMLDivElement | null>;
}) {
  return (
    <div ref={eyeRef} className={`wolf-cover__eye wolf-cover__eye--${side}`} data-eye={side} aria-hidden="true">
      <div ref={pupilRef} className="wolf-cover__pupil" data-pupil={side} />
      <div className="wolf-cover__glint" />
    </div>
  );
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
  const artRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const leftEyeRef = useRef<HTMLDivElement>(null);
  const rightEyeRef = useRef<HTMLDivElement>(null);
  const leftPupilRef = useRef<HTMLDivElement>(null);
  const rightPupilRef = useRef<HTMLDivElement>(null);
  const chromeRef = useRef<HTMLDivElement>(null);
  const enableOrientation = useWolfHead(
    artRef,
    canvasRef,
    leftEyeRef,
    rightEyeRef,
    leftPupilRef,
    rightPupilRef,
  );
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
      if (input && document.activeElement === input) {
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
  }, []);

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
      <link rel="preload" as="image" href={COVER_SRC} type="image/webp" fetchPriority="high" />
      <div className="wolf-cover__stage">
        <div className="wolf-cover__art" ref={artRef} data-wolf-art="">
          <img
            src={COVER_SRC}
            alt={t("welcome.cover.imageAlt")}
            width={1280}
            height={720}
            draggable={false}
            fetchPriority="high"
            decoding="async"
          />
          <canvas ref={canvasRef} className="wolf-cover__canvas" aria-hidden="true" />
          <Eye side="l" eyeRef={leftEyeRef} pupilRef={leftPupilRef} />
          <Eye side="r" eyeRef={rightEyeRef} pupilRef={rightPupilRef} />
        </div>
      </div>
      <div className="wolf-cover__vignette" />
      <div className="wolf-cover__chrome" ref={chromeRef}>
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
            event.currentTarget.scrollIntoView({ block: "center", inline: "nearest" });
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

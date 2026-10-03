"use client";

import { useCallback, useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import { SixSeatMark } from "@/components/home/SixSeatMark";
import { keyboardInset } from "@/components/home/oath-card";
import type { PublicQuota } from "@/lib/demo-game-client";
import "./wolf-cover.css";

const COVER_SRC = "/cover/wolf.webp";
type DeviceOrientationEventConstructor = typeof DeviceOrientationEvent & {
  requestPermission?: () => Promise<"granted" | "denied" | "default">;
};

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function useWolfGaze(
  artRef: React.RefObject<HTMLDivElement | null>,
  leftPupilRef: React.RefObject<HTMLDivElement | null>,
  rightPupilRef: React.RefObject<HTMLDivElement | null>,
) {
  const targetRef = useRef({ x: 0, y: 0 });
  const currentRef = useRef({ x: 0, y: 0 });
  const reducedRef = useRef(false);
  const kickRef = useRef<() => void>(() => {});
  const orientationCleanupRef = useRef<(() => void) | null>(null);

  const apply = useCallback((x: number, y: number) => {
    const pupil = `translate3d(calc(-50% + ${x * 120}%), calc(-50% + ${y * 45}%), 0)`;
    if (leftPupilRef.current) leftPupilRef.current.style.transform = pupil;
    if (rightPupilRef.current) rightPupilRef.current.style.transform = pupil;
    if (artRef.current) {
      artRef.current.style.transform =
        `translate3d(-50%, -50%, 0) rotateY(${x * 4}deg) rotateX(${-y * 3}deg) translate3d(${-x * 0.8}%, ${-y * 0.6}%, 0)`;
    }
  }, [artRef, leftPupilRef, rightPupilRef]);

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const syncReduced = () => {
      reducedRef.current = media.matches;
      if (!media.matches) return;
      targetRef.current = { x: 0, y: 0 };
      currentRef.current = { x: 0, y: 0 };
      apply(0, 0);
    };
    syncReduced();
    if (artRef.current) artRef.current.dataset.gaze = "ready";
    media.addEventListener("change", syncReduced);

    const look = new URLSearchParams(window.location.search).get("look");
    if (look && !media.matches) {
      const [rawX, rawY] = look.split(",").map(Number);
      if (Number.isFinite(rawX) && Number.isFinite(rawY)) {
        const x = clamp(rawX, -1, 1);
        const y = clamp(rawY, -1, 1);
        targetRef.current = { x, y };
        currentRef.current = { x, y };
        apply(x, y);
      }
    }

    let frame = 0;
    let running = false;
    const step = () => {
      running = false;
      if (reducedRef.current || document.hidden) return;
      const nextX = currentRef.current.x + (targetRef.current.x - currentRef.current.x) * 0.12;
      const nextY = currentRef.current.y + (targetRef.current.y - currentRef.current.y) * 0.12;
      const atTarget = Math.abs(currentRef.current.x - targetRef.current.x) < 0.001
        && Math.abs(currentRef.current.y - targetRef.current.y) < 0.001;
      if (atTarget) return;
      const snap = Math.abs(targetRef.current.x - nextX) < 0.001 && Math.abs(targetRef.current.y - nextY) < 0.001;
      currentRef.current = snap
        ? { x: targetRef.current.x, y: targetRef.current.y }
        : { x: nextX, y: nextY };
      apply(currentRef.current.x, currentRef.current.y);
      running = true;
      frame = window.requestAnimationFrame(step);
    };
    const kick = () => {
      if (running || reducedRef.current) return;
      running = true;
      frame = window.requestAnimationFrame(step);
    };
    kickRef.current = kick;

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

    const onMouseMove = (event: MouseEvent) => lookAt(event.clientX, event.clientY);
    window.addEventListener("pointermove", onPointerMove, { passive: true });
    window.addEventListener("mousemove", onMouseMove, { passive: true });
    window.addEventListener("touchmove", onTouchMove, { passive: true });

    return () => {
      window.cancelAnimationFrame(frame);
      kickRef.current = () => {};
      media.removeEventListener("change", syncReduced);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("touchmove", onTouchMove);
      orientationCleanupRef.current?.();
      orientationCleanupRef.current = null;
    };
  }, [apply]);

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
  pupilRef,
}: {
  side: "l" | "r";
  pupilRef: React.RefObject<HTMLDivElement | null>;
}) {
  return (
    <div className={`wolf-cover__eye wolf-cover__eye--${side}`} aria-hidden="true">
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
  const leftPupilRef = useRef<HTMLDivElement>(null);
  const rightPupilRef = useRef<HTMLDivElement>(null);
  const chromeRef = useRef<HTMLDivElement>(null);
  const enableOrientation = useWolfGaze(artRef, leftPupilRef, rightPupilRef);
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
          <Eye side="l" pupilRef={leftPupilRef} />
          <Eye side="r" pupilRef={rightPupilRef} />
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

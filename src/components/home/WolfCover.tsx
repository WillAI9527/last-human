"use client";

import { useCallback, useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
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

function SixSeatMark() {
  return (
    <svg className="wolf-cover__mark" viewBox="0 0 512 512" aria-hidden="true">
      <circle cx="256" cy="88" r="18" fill="#F2EDE4" />
      <circle cx="401.5" cy="172" r="18" fill="#F2EDE4" />
      <circle cx="401.5" cy="340" r="18" fill="#F2EDE4" />
      <circle cx="110.5" cy="172" r="18" fill="#F2EDE4" />
      <circle cx="110.5" cy="340" r="18" fill="#F2EDE4" />
      <circle cx="256" cy="424" r="26" fill="#E8BE6A" />
    </svg>
  );
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

export function WolfCover({
  sheetOpen,
  onEnter,
}: {
  sheetOpen: boolean;
  onEnter: () => void;
}) {
  const t = useTranslations();
  const artRef = useRef<HTMLDivElement>(null);
  const leftPupilRef = useRef<HTMLDivElement>(null);
  const rightPupilRef = useRef<HTMLDivElement>(null);
  const enableOrientation = useWolfGaze(artRef, leftPupilRef, rightPupilRef);
  const dragRef = useRef(false);
  const originRef = useRef({ x: 0, y: 0 });

  const handleEnter = () => {
    if (dragRef.current) return;
    enableOrientation();
    onEnter();
  };

  return (
    <section className={sheetOpen ? "wolf-cover is-sheet" : "wolf-cover"} aria-label="LAST HUMAN">
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
      <div className="wolf-cover__chrome">
        <h1 className="wolf-cover__title">
          LAST HUMAN
          <span className="wolf-cover__line">{t("welcome.cover.line")}</span>
        </h1>
        <button
          type="button"
          className="wolf-cover__enter"
          onPointerDown={(event) => {
            dragRef.current = false;
            originRef.current = { x: event.clientX, y: event.clientY };
          }}
          onPointerMove={(event) => {
            const dx = event.clientX - originRef.current.x;
            const dy = event.clientY - originRef.current.y;
            if (dx * dx + dy * dy > 64) dragRef.current = true;
          }}
          onClick={handleEnter}
        >
          <span className="wolf-cover__seal" aria-hidden="true">
            <SixSeatMark />
          </span>
          <span className="wolf-cover__enter-label">{t("welcome.cover.enter")}</span>
        </button>
      </div>
    </section>
  );
}

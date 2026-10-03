"use client";

import { useEffect, useState } from "react";

/**
 * Tracks the visible viewport (iOS Safari toolbar + on-screen keyboard).
 * Sets --lh-viewport and --lh-viewport-offset on <html> so the game shell
 * uses the visual viewport instead of 100vh.
 */
export function useVisualViewportShell(): boolean {
  const [keyboardOpen, setKeyboardOpen] = useState(false);

  useEffect(() => {
    const root = document.documentElement;
    const sync = () => {
      const viewport = window.visualViewport;
      const height = viewport?.height ?? window.innerHeight;
      const offset = viewport?.offsetTop ?? 0;
      root.style.setProperty("--lh-viewport", `${Math.round(height)}px`);
      root.style.setProperty("--lh-viewport-offset", `${Math.round(offset)}px`);
      setKeyboardOpen(window.innerHeight - height > 140);
    };

    sync();
    const viewport = window.visualViewport;
    viewport?.addEventListener("resize", sync);
    viewport?.addEventListener("scroll", sync);
    window.addEventListener("resize", sync);
    window.addEventListener("orientationchange", sync);
    return () => {
      viewport?.removeEventListener("resize", sync);
      viewport?.removeEventListener("scroll", sync);
      window.removeEventListener("resize", sync);
      window.removeEventListener("orientationchange", sync);
      root.style.removeProperty("--lh-viewport");
      root.style.removeProperty("--lh-viewport-offset");
    };
  }, []);

  return keyboardOpen;
}

"use client";

import { motion } from "framer-motion";

interface GameBackgroundProps {
  isNight: boolean;
  isBlinking?: boolean;
}

function CornerDeco({ className }: { className: string }) {
  return (
    <svg className={`wc-corner-deco ${className}`} width="80" height="80" viewBox="0 0 80 80">
      <path d="M10,10 L70,10" stroke="#8a1c1c" strokeWidth="2" fill="none" />
      <path d="M10,10 L10,70" stroke="#8a1c1c" strokeWidth="2" fill="none" />
      <circle cx="10" cy="10" r="4" fill="#c5a059" />
      <circle cx="70" cy="10" r="2" fill="#c5a059" opacity="0.5" />
      <circle cx="10" cy="70" r="2" fill="#c5a059" opacity="0.5" />
    </svg>
  );
}

export function GameBackground({ isNight, isBlinking = false }: GameBackgroundProps) {
  const fadeDuration = isBlinking ? 0 : 1.5;
  return (
    <div className="fixed inset-0 -z-10 overflow-hidden">
      <motion.div
        className="lh-scene lh-scene--day absolute inset-0"
        initial={false}
        animate={{ opacity: isNight ? 0 : 1 }}
        transition={{ duration: fadeDuration }}
        style={{ willChange: "opacity", transform: "translateZ(0)" }}
      />
      <motion.div
        className="lh-scene lh-scene--night absolute inset-0"
        initial={false}
        animate={{ opacity: isNight ? 1 : 0 }}
        transition={{ duration: fadeDuration }}
        style={{ willChange: "opacity", transform: "translateZ(0)" }}
      />
      <div className="lh-scene-scrim absolute inset-0 pointer-events-none" />

      <motion.div
        className="pointer-events-none"
        initial={false}
        animate={{ opacity: isNight ? 0.22 : 0.12 }}
        transition={{ duration: fadeDuration }}
      >
        <CornerDeco className="wc-corner-deco--tl" />
        <CornerDeco className="wc-corner-deco--tr" />
        <CornerDeco className="wc-corner-deco--bl" />
        <CornerDeco className="wc-corner-deco--br" />
      </motion.div>
    </div>
  );
}

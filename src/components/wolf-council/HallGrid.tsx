"use client";

import { useState, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { Coins, Briefcase, Scales, Books, Megaphone, Moon } from "@phosphor-icons/react";
import { useAppLocale } from "@/i18n/useAppLocale";
import { BOARDS, type Board } from "@/lib/wolf-council/data";
import { hallCopy } from "@/lib/wolf-council/copy";
import { werewolfStartPath, withLocale } from "@/lib/wolf-council/paths";
import { BoardArt } from "./BoardArt";

const ICONS = {
  invest: Coins,
  business: Briefcase,
  legal: Scales,
  learning: Books,
  social: Megaphone,
  werewolf: Moon,
} as const;

function boardHref(locale: "zh" | "en", board: Board): string {
  if (board.type === "game") return werewolfStartPath(locale);
  return withLocale(locale, `/hall/${board.id}`);
}

export function HallGrid() {
  const router = useRouter();
  const { locale } = useAppLocale();
  const copy = hallCopy(locale);
  const [selected, setSelected] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const openBoard = (board: Board) => {
    setSelected(board.id);
    router.push(boardHref(locale, board));
  };

  return (
    <section>
      <h1>{copy.hallTitle}</h1>
      <p className="wh-sub">{copy.hallSub}</p>
      <p className="wh-sub2">{copy.hallSub2}</p>
      <div className="wolf-hall__grid">
        {BOARDS.map((board) => {
          const Icon = ICONS[board.id];
          const badge = board.type === "game" ? copy.badgeGame : board.disclaimer ? copy.badgeRef : "";
          return (
            <button
              key={board.id}
              type="button"
              className={`wh-card${selected === board.id ? " is-selected" : ""}`}
              style={{ "--tint": board.tint } as CSSProperties}
              onClick={() => openBoard(board)}
            >
              <span className="wh-card__art"><BoardArt id={board.id} /></span>
              {badge ? <span className="wh-card__badge">{badge}</span> : null}
              <span className="wh-card__info">
                <Icon size={28} color="#f1d89a" />
                <span>
                  <b>{board.name[locale]}</b>
                  <em>{board.tagline[locale]}</em>
                </span>
              </span>
            </button>
          );
        })}
      </div>
      <button
        type="button"
        className="wh-cta"
        onClick={() => {
          const board = BOARDS.find((item) => item.id === selected);
          if (!board) {
            setToast(copy.pickFirst);
            window.setTimeout(() => setToast(null), 1600);
            return;
          }
          openBoard(board);
        }}
      >
        <span aria-hidden="true">♛</span>
        <span>{copy.hallCta}</span>
        <span aria-hidden="true">›</span>
      </button>
      {toast ? <div className="wh-toast" role="status">{toast}</div> : null}
    </section>
  );
}

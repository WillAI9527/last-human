"use client";

import { useAtomValue } from "jotai";
import { gameStateAtom } from "@/store/game-machine";
import { buildSuspicionReview, type SuspicionEntry } from "@/lib/suspicion";
import type { Player } from "@/types/game";

interface SuspicionReviewProps {
  log?: SuspicionEntry[];
  phase?: string;
  players?: Player[];
  humanSeat?: number;
}

export function SuspicionReview({ log, phase, players, humanSeat }: SuspicionReviewProps = {}) {
  const atomState = useAtomValue(gameStateAtom);
  const resolvedPhase = phase ?? atomState.phase;
  const resolvedLog = log ?? atomState.suspicionLog;
  const resolvedPlayers = players ?? atomState.players;
  const focusSeat = humanSeat ?? resolvedPlayers.find((player) => player.isHuman)?.seat;
  const review = buildSuspicionReview(resolvedLog, resolvedPhase, focusSeat);
  if (!review) return null;

  const nameOf = (seat: number) => {
    const player = resolvedPlayers.find((item) => item.seat === seat);
    return player ? `${seat + 1}号 ${player.displayName}` : `${seat + 1}号`;
  };

  const scoreOnHuman = new Map<number, number>();
  for (const voter of review.voters) {
    const scores = review.focus.filter((point) => point.voterSeat === voter.voterSeat).map((point) => point.score);
    scoreOnHuman.set(voter.voterSeat, scores.length ? Math.max(...scores) : 0);
  }
  const ranked = [...scoreOnHuman.entries()];
  const maxScore = ranked.reduce((max, [, score]) => Math.max(max, score), 0);
  const minScore = ranked.reduce((min, [, score]) => Math.min(min, score), maxScore);

  return (
    <section className="lh-suspicion" aria-label="村民心声">
      <h3 className="text-center font-bold text-[var(--color-gold)] text-xs mb-2 tracking-[0.28em]">村民心声</h3>
      <p className="text-center text-xs text-[var(--text-secondary)] mb-6">
        对局结束后才翻开。数字是他们投票时私下记下的怀疑程度，0 到 100。
      </p>
      <div className="space-y-4">
        {review.voters.map((voter) => {
          const peak = scoreOnHuman.get(voter.voterSeat) ?? 0;
          const most = ranked.length > 0 && peak === maxScore && maxScore > 0;
          const least = ranked.length > 1 && peak === minScore && minScore < maxScore;
          return (
            <article
              key={voter.voterId}
              className={`rounded-xl border p-4 ${most ? "border-[var(--color-gold)] bg-[var(--color-gold)]/10" : "border-white/10 bg-black/20"}`}
            >
              <header className="flex items-center justify-between gap-2 mb-3">
                <h4 className="font-semibold text-sm text-[var(--text-primary)]">{nameOf(voter.voterSeat)}</h4>
                <div className="flex gap-1">
                  {most && <span className="lh-suspicion-tag">最怀疑你</span>}
                  {least && <span className="lh-suspicion-tag lh-suspicion-tag--least">最不怀疑你</span>}
                </div>
              </header>
              {voter.rounds.map((round) => (
                <div key={`${round.day}-${round.round}`} className="mb-3 last:mb-0">
                  <div className="text-[11px] tracking-wide text-[var(--text-muted)] mb-1">
                    第 {round.day} 天{round.round > 0 ? ` · 第 ${round.round + 1} 轮` : ""} · 票给 {round.voteSeat >= 0 ? nameOf(round.voteSeat) : "弃票"}
                  </div>
                  {round.reason && <p className="text-sm text-[var(--text-secondary)] mb-2">{round.reason}</p>}
                  <ul className="space-y-1.5">
                    {round.suspects.length === 0 && <li className="text-xs text-[var(--text-muted)]">这一轮没有留下怀疑名单。</li>}
                    {round.suspects.map((suspect) => (
                      <li key={suspect.seat} className="flex items-center gap-2">
                        <span className="w-24 shrink-0 truncate text-xs text-[var(--text-primary)]">{nameOf(suspect.seat)}</span>
                        <span className="lh-suspicion-bar" aria-hidden="true">
                          <span style={{ width: `${suspect.score}%` }} />
                        </span>
                        <span className="w-8 text-right text-xs tabular-nums text-[var(--color-gold)]">{suspect.score}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </article>
          );
        })}
        {review.voters.length === 0 && (
          <p className="text-sm text-center text-[var(--text-muted)]">这局里没有记下村民心声。</p>
        )}
      </div>
    </section>
  );
}

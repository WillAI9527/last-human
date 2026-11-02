"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { Users } from "@phosphor-icons/react";
import { useAppLocale } from "@/i18n/useAppLocale";
import { fill, hallCopy, type HallCopy } from "@/lib/wolf-council/copy";
import { boardWolves, getBoard, replyNotices, WOLVES, type Board, type Wolf } from "@/lib/wolf-council/data";
import { adviceLines, seatedIndexes, STANCES, tally, voteSentence } from "@/lib/wolf-council/logic";
import { clientSample, type ClientReview } from "@/lib/wolf-council/review/sample-client";
import { withLocale } from "@/lib/wolf-council/paths";
import {
  appendHistory,
  emptyMemory,
  loadMemory,
  memoryFilled,
  subscribeMemory,
  type CouncilDecision,
} from "@/lib/wolf-council/storage";

type Phase = "setup" | "ask" | "discuss" | "vote" | "decide" | "done";
type LogEntry =
  | { type: "sys"; key: "sysMock" | "sysLive" | "sysStart" | "sysVote" | "sysDecide"; n?: number }
  | { type: "user"; text: string }
  | {
      type: "wolf";
      seat: number;
      kind: "reply" | "vote";
      typing: boolean;
      prev: number;
      stance: number;
      voteFor: number;
      voteN: number;
      text?: string;
      review?: ClientReview;
    };

type ModalState = {
  title: string;
  body: string;
  ok: string;
  input?: boolean;
  value?: string;
  onOk: (value: string) => void;
};

export function CouncilRoom({ boardId }: { boardId: string }) {
  const { locale } = useAppLocale();
  const copy = hallCopy(locale);
  const router = useRouter();
  const board = getBoard(boardId);
  const wolves = useMemo(() => (board && board.type === "advisor" ? boardWolves(board) : []), [board]);
  const [selected, setSelected] = useState<boolean[]>(() => wolves.map(() => true));
  const [phase, setPhase] = useState<Phase>("setup");
  const [log, setLog] = useState<LogEntry[]>([]);
  const [speaking, setSpeaking] = useState(-1);
  const [stances, setStances] = useState<Array<number | null>>([]);
  const [votes, setVotes] = useState<Array<number | null>>([]);
  const [draft, setDraft] = useState("");
  const [question, setQuestion] = useState("");
  const [decision, setDecision] = useState<CouncilDecision | null>(null);
  const [modal, setModal] = useState<ModalState | null>(null);
  const [detail, setDetail] = useState<number | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [demoFail, setDemoFail] = useState(false);
  const [points, setPoints] = useState<string[]>([]);
  const alive = useRef(true);
  const memory = useSyncExternalStore(subscribeMemory, loadMemory, emptyMemory);
  const memoryOn = memoryFilled(memory);
  const timers = useRef<number[]>([]);
  const chatRef = useRef<HTMLDivElement | null>(null);
  const hallHref = withLocale(locale, "/hall");

  useEffect(() => {
    const timerIds = timers.current;
    return () => {
      alive.current = false;
      timerIds.forEach((id) => window.clearTimeout(id));
      timerIds.length = 0;
    };
  }, []);

  useEffect(() => {
    chatRef.current?.scrollTo({ top: chatRef.current.scrollHeight });
  }, [log, phase]);

  if (!board || board.type !== "advisor") {
    return (
      <section>
        <h1>{copy.missing}</h1>
        <button type="button" className="wh-btn" onClick={() => router.push(hallHref)}>{copy.back}</button>
      </section>
    );
  }

  const seated = seatedIndexes(selected);
  const showToast = (message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(null), 1600);
  };
  const later = (fn: () => void, ms: number) => {
    const id = window.setTimeout(fn, ms);
    timers.current.push(id);
  };

  const goHall = () => {
    if (phase === "discuss" || phase === "vote" || phase === "decide") {
      setModal({
        title: copy.leaveTitle,
        body: copy.leaveBody,
        ok: copy.leave,
        onOk: () => router.push(hallHref),
      });
      return;
    }
    router.push(hallHref);
  };

  const startChat = () => {
    if (seated.length < 2) {
      showToast(copy.setupMin);
      return;
    }
    setPhase("ask");
    setLog([{ type: "sys", key: "sysLive" }, { type: "sys", key: "sysStart", n: seated.length }]);
  };

  const allSelected = selected.length > 0 && selected.every(Boolean);
  const someSelected = selected.some(Boolean);

  const runRound = (text: string) => {
    void runLive(text);
  };

  const runLive = async (text: string) => {
    const seats = seatedIndexes(selected);
    const stanceLocal: Array<number | null> = wolves.map(() => null);
    const voteLocal: Array<number | null> = wolves.map(() => null);
    const pointLocal = wolves.map(() => "");
    setQuestion(text);
    setDecision(null);
    setStances(stanceLocal);
    setVotes(voteLocal);
    setPoints(pointLocal);
    setLog((prev) => [...prev, { type: "user", text }]);
    setPhase("discuss");
    let previous = "";
    for (let step = 0; step < seats.length; step += 1) {
      if (!alive.current) return;
      const seat = seats[step];
      setSpeaking(seat);
      setLog((prev) => [...prev, {
        type: "wolf",
        seat,
        kind: "reply",
        typing: true,
        prev: step > 0 ? seats[step - 1] : -1,
        stance: 0,
        voteFor: -1,
        voteN: 1,
      }]);
      const controller = new AbortController();
      const killer = window.setTimeout(() => controller.abort(), 180000);
      let spoken = "";
      let review: ClientReview | undefined;
      try {
        const response = await fetch("/api/council-turn", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            wolfId: wolves[seat].id,
            question: text,
            previousWolfAnswer: previous,
            mode: "debate",
            locale,
            demo: board.id === "social" && demoFail ? "fail" : undefined,
          }),
          signal: controller.signal,
        });
        const data = await response.json() as Record<string, unknown>;
        if (response.ok && typeof data.final === "string" && data.final) {
          spoken = data.final;
          review = reviewFrom(data, spoken);
        }
      } catch {
        spoken = "";
      } finally {
        window.clearTimeout(killer);
      }
      if (!alive.current) return;
      if (!spoken || !review) {
        const fallback = clientSample(wolves[seat].id, locale, board.id === "social" && demoFail);
        spoken = fallback.final;
        review = fallback.review;
      }
      previous = spoken;
      const stance = parseStance(spoken);
      stanceLocal[seat] = stance;
      pointLocal[seat] = pointFrom(spoken);
      const others = seats.filter((index) => index !== seat);
      const voteFor = others[step % Math.max(others.length, 1)] ?? seats[0];
      voteLocal[seat] = voteFor;
      setStances(stanceLocal.slice());
      setPoints(pointLocal.slice());
      setVotes(voteLocal.slice());
      setLog((prev) => prev.map((item) => (
        item.type === "wolf" && item.seat === seat && item.kind === "reply" && item.typing
          ? { ...item, typing: false, text: spoken, stance, voteFor, voteN: seats.indexOf(voteFor) + 1, review }
          : item
      )));
    }
    if (!alive.current) return;
    setSpeaking(-1);
    setLog((prev) => [...prev, { type: "sys", key: "sysVote" }]);
    setPhase("vote");
    const speakVotes = (step: number) => {
      if (!alive.current) return;
      if (step >= seats.length) {
        setSpeaking(-1);
        setLog((prev) => [...prev, { type: "sys", key: "sysDecide" }]);
        setPhase("decide");
        return;
      }
      const seat = seats[step];
      const voteFor = voteLocal[seat] ?? seats[0];
      setSpeaking(seat);
      setLog((prev) => [...prev, {
        type: "wolf",
        seat,
        kind: "vote",
        typing: true,
        prev: -1,
        stance: stanceLocal[seat] ?? 0,
        voteFor,
        voteN: seats.indexOf(voteFor) + 1,
      }]);
      later(() => {
        setLog((prev) => prev.map((item, index) => (
          index === prev.length - 1 && item.type === "wolf" ? { ...item, typing: false } : item
        )));
        later(() => speakVotes(step + 1), 220);
      }, 520);
    };
    later(() => speakVotes(0), 280);
  };

  const finish = (kind: CouncilDecision, note: string) => {
    const result = tally(seated, votes);
    const lines = seated.map((seat, index) => ({
      label: wolves[seat].modelLabel,
      votes: result.counts[index] ?? 0,
    }));
    appendHistory({
      boardId: board.id,
      question,
      decision: kind,
      note,
      top: result.top + 1,
      lines,
    });
    setDecision(kind);
    setPhase("done");
    showToast(copy.saved);
  };

  const result = tally(seated, votes);
  const topNumber = result.top + 1;

  return (
    <section className="wh-council">
      <div className="wh-board-head">
        <button type="button" className="wh-back" onClick={goHall}>← {copy.back}</button>
        <div className="wh-board-title">
          <h1>{board.name[locale]}</h1>
          {phase !== "setup" ? <span className="wh-phase">{phaseLabel(copy, phase)}</span> : null}
        </div>
        {phase === "setup" ? <p className="wh-choose">{copy.choose}</p> : <p className="wh-mem">{memoryOn ? copy.memOn : copy.memOff}</p>}
      </div>
      {phase === "setup" ? (
        <>
          <div className="wh-portraits">
            {wolves.map((wolf, index) => (
              <button
                key={wolf.id}
                type="button"
                className={`wh-portrait${selected[index] ? " is-on" : ""}`}
                aria-pressed={selected[index]}
                onClick={() => {
                  const next = selected.slice();
                  next[index] = !next[index];
                  setSelected(next);
                }}
              >
                <img src={wolf.avatar} alt="" />
                <span className={`wh-tick${selected[index] ? " is-on" : ""}`} aria-hidden="true">
                  {selected[index] ? "✓" : ""}
                </span>
                <span className="wh-pill">
                  <ModelMark label={wolf.modelLabel} />
                  {wolf.modelLabel}
                </span>
              </button>
            ))}
          </div>
          <div className="wh-summon">
            <label className="wh-select-all">
              <input
                type="checkbox"
                checked={allSelected}
                ref={(node) => {
                  if (node) node.indeterminate = someSelected && !allSelected;
                }}
                onChange={() => setSelected(wolves.map(() => !allSelected))}
              />
              <span>{copy.selectAll}</span>
            </label>
            <button type="button" className="wh-summon-btn" onClick={startChat} disabled={seated.length < 2}>
              <Users size={18} weight="fill" />
              {fill(copy.summon, { n: seated.length })}
              <span aria-hidden="true">→</span>
            </button>
            <span className="wh-chosen">{fill(copy.chosen, { n: seated.length })}</span>
          </div>
          {board.id === "social" ? (
            <label className="wh-demo-toggle">
              <input type="checkbox" checked={demoFail} onChange={(event) => setDemoFail(event.target.checked)} />
              <span>{copy.demoToggle}</span>
            </label>
          ) : null}
        </>
      ) : null}
      {board.id === "social" && demoFail ? <p className="wh-demo-banner">{copy.demoBanner}</p> : null}
      {board.id === "social" && phase === "ask" ? (
        <label className="wh-demo-toggle">
          <input type="checkbox" checked={demoFail} onChange={(event) => setDemoFail(event.target.checked)} />
          <span>{copy.demoToggle}</span>
        </label>
      ) : null}
      {phase === "ask" ? (
        <div className="wh-chips">
          <span>{copy.chips}</span>
          {questionsFor(board, wolves, selected, locale).map((prompt) => (
            <button
              key={prompt}
              type="button"
              className="wh-chip"
              onClick={() => setDraft(prompt)}
            >
              {prompt}
            </button>
          ))}
        </div>
      ) : null}
      {phase === "setup" ? null : (
      <div className="wh-chat" ref={chatRef} role="log" aria-live="polite">
        {log.map((entry, index) => (
          <Message key={index} entry={entry} wolves={wolves} board={board} copy={copy} locale={locale} />
        ))}
      </div>
      )}
      {phase === "decide" || phase === "done" ? (
        <div className="wh-decision">
          <h2>{copy.decTitle}</h2>
          <p className="wh-sub2">{copy.decSub}</p>
          <p className="wh-vote">{copy.stanceSum}</p>
          {seated.map((seat, index) => {
            const wolf = wolves[seat];
            const stance = stances[seat];
            return (
              <div key={wolf.id} className={`wh-sugg${index === result.top ? " is-top" : ""}`}>
                <b>#{index + 1}</b>
                <span>
                  {wolf.modelLabel}
                  {locale === "zh" ? "：" : ": "}
                  {points[seat] || wolf.mock.point[locale]}
                  {stance != null ? <span className="wh-mock">{STANCES[locale][stance]}</span> : null}
                </span>
                <span className="wh-bar" aria-hidden="true"><i style={{ width: `${((result.counts[index] ?? 0) / Math.max(seated.length, 1)) * 100}%` }} /></span>
                <span>{result.counts[index] ?? 0}</span>
              </div>
            );
          })}
          <div className="wh-actions">
            {phase === "decide" ? (
              <>
                <button type="button" className="wh-btn" onClick={() => setModal({
                  title: copy.rejectTitle,
                  body: copy.rejectBody,
                  ok: copy.reject,
                  onOk: () => finish("reject", ""),
                })}>{copy.reject}</button>
                <button type="button" className="wh-btn" onClick={() => setModal({
                  title: copy.modifyTitle,
                  body: copy.modifyBody,
                  ok: copy.modify,
                  input: true,
                  value: points[seated[result.top]] || wolves[seated[result.top]]?.mock.point[locale] || "",
                  onOk: (value) => finish("modify", value),
                })}>{copy.modify}</button>
                <button type="button" className="wh-btn is-red" onClick={() => setModal({
                  title: copy.adoptTitle,
                  body: fill(copy.adoptBody, { k: topNumber }),
                  ok: copy.adopt,
                  onOk: () => finish("adopt", ""),
                })}>{copy.adopt} #{topNumber}</button>
              </>
            ) : (
              <>
                <span className="wh-mock">{decision ? decisionLabel(copy, decision) : ""}</span>
                <button type="button" className="wh-btn" onClick={() => router.push(withLocale(locale, "/hall/history"))}>{copy.toHist}</button>
                <button type="button" className="wh-btn is-red" onClick={() => {
                  setPhase("ask");
                  setLog((prev) => [...prev, { type: "sys", key: "sysStart", n: seated.length }]);
                  setVotes(wolves.map(() => null));
                  setDecision(null);
                }}>{copy.newQ}</button>
              </>
            )}
          </div>
        </div>
      ) : null}
      {phase === "setup" ? null : (
      <form
        className="wh-composer"
        onSubmit={(event) => {
          event.preventDefault();
          const text = draft.trim();
          if (!text || phase !== "ask") return;
          setDraft("");
          runRound(text);
        }}
      >
        <input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder={copy.inputPh}
          disabled={phase !== "ask"}
          aria-label={copy.inputPh}
        />
        <button type="submit" className="wh-btn is-red" disabled={phase !== "ask"}>{copy.send}</button>
      </form>
      )}
      {modal ? (
        <div className="wh-modal-back" role="presentation" onClick={() => setModal(null)}>
          <div className="wh-modal" role="dialog" aria-modal="true" aria-labelledby="wh-modal-title" onClick={(event) => event.stopPropagation()}>
            <h2 id="wh-modal-title">{modal.title}</h2>
            <p>{modal.body}</p>
            <ModalForm modal={modal} copy={copy} onClose={() => setModal(null)} />
          </div>
        </div>
      ) : null}
      {detail != null && wolves[detail] ? (
        <WolfDetail wolf={wolves[detail]} copy={copy} locale={locale} onClose={() => setDetail(null)} />
      ) : null}
      {toast ? <div className="wh-toast" role="status">{toast}</div> : null}
    </section>
  );
}

function ModalForm({ modal, copy, onClose }: { modal: ModalState; copy: HallCopy; onClose: () => void }) {
  const [value, setValue] = useState(modal.value ?? "");
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        if (modal.input && !value.trim()) return;
        modal.onOk(value.trim());
        onClose();
      }}
    >
      {modal.input ? <textarea value={value} onChange={(event) => setValue(event.target.value)} /> : null}
      <div className="wh-modal__actions">
        <button type="button" className="wh-btn" onClick={onClose}>{copy.cancel}</button>
        <button type="submit" className="wh-btn is-red">{modal.ok}</button>
      </div>
    </form>
  );
}

function WolfDetail({
  wolf,
  copy,
  locale,
  onClose,
}: {
  wolf: Wolf;
  copy: HallCopy;
  locale: "zh" | "en";
  onClose: () => void;
}) {
  const rows: Array<[string, string]> = [
    [copy.dModel, wolf.modelLabel],
    [copy.dPersonality, wolf.personality[locale].join(locale === "zh" ? "，" : ", ")],
    [copy.dDecision, wolf.decisionStyle[locale]],
    [copy.dOutput, copy.styles[wolf.outputStyle]],
    [copy.dHobbies, wolf.hobbies[locale]],
    [copy.dCatch, wolf.catchphrase[locale]],
    [copy.dDisc, [wolf.disclaimer[locale], wolf.crisis[locale]].filter(Boolean).join(locale === "zh" ? "。" : " ") || copy.dNone],
  ];
  return (
    <div className="wh-modal-back" role="presentation" onClick={onClose}>
      <div className="wh-modal" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
        <h2>{wolf.modelLabel}</h2>
        <p>{wolf.tagline[locale]}</p>
        <div className="wh-detail">
          {rows.map(([label, value]) => (
            <FragmentRow key={label} label={label} value={value} />
          ))}
        </div>
        <div className="wh-modal__actions">
          <button type="button" className="wh-btn is-red" onClick={onClose}>{copy.close}</button>
        </div>
      </div>
    </div>
  );
}

function FragmentRow({ label, value }: { label: string; value: string }) {
  return (
    <>
      <b>{label}</b>
      <span>{value}</span>
    </>
  );
}

function Message({
  entry,
  wolves,
  board,
  copy,
  locale,
}: {
  entry: LogEntry;
  wolves: Wolf[];
  board: Board;
  copy: HallCopy;
  locale: "zh" | "en";
}) {
  if (entry.type === "sys") {
    const template = copy[entry.key];
    return <div className="wh-msg is-sys"><div className="wh-bub">{fill(template, { n: entry.n ?? 0 })}</div></div>;
  }
  if (entry.type === "user") {
    return <div className="wh-msg is-user"><div className="wh-bub">{entry.text}</div></div>;
  }
  const wolf = wolves[entry.seat];
  const previous = entry.prev >= 0 ? wolves[entry.prev]?.modelLabel ?? null : null;
  const notices = replyNotices(wolf, board, locale);
  return (
    <div className="wh-msg">
      <img src={wolf.avatar} alt="" width={40} height={48} style={{ width: 40, height: 48, objectFit: "cover", borderRadius: 20 }} />
      <div>
        <div className="wh-who">
          {wolf.modelLabel}
          {entry.typing && entry.kind === "reply" ? <span className="wh-mock">{copy.reviewing}</span> : null}
          {!entry.typing && entry.review?.sample ? <span className="wh-mock">{copy.sample}</span> : null}
          {!entry.typing && entry.review ? <ReviewMark review={entry.review} copy={copy} locale={locale} /> : null}
          {!entry.typing && !entry.review && entry.kind === "reply" ? <span className="wh-mock">{copy.mock}</span> : null}
        </div>
        <div className="wh-bub">
          {entry.typing ? "…" : entry.kind === "vote"
            ? <p className="wh-vote">{voteSentence(locale, entry.voteN, wolves[entry.voteFor]?.modelLabel ?? "")}</p>
            : entry.text
              ? <p className="wh-speech">{entry.text}</p>
              : adviceLines(wolf, locale, previous, entry.stance).map((line, lineIndex) => <p key={lineIndex}>{line}</p>)}
          {!entry.typing && notices.disclaimer ? <p className="wh-disc">{notices.disclaimer}</p> : null}
          {!entry.typing && notices.crisis ? <p className="wh-crisis">{notices.crisis}</p> : null}
        </div>
      </div>
    </div>
  );
}

function ReviewMark({ review, copy, locale }: { review: ClientReview; copy: HallCopy; locale: "zh" | "en" }) {
  const [open, setOpen] = useState(false);
  const status = reviewStatus(review, copy);
  const gap = locale === "zh" ? "：" : ": ";
  return (
    <>
      {status ? (
        <button type="button" className={`wh-rv is-${status.kind}`} onClick={() => setOpen((value) => !value)}>
          {status.label}
        </button>
      ) : null}
      {open ? (
        <div className="wh-rv-detail">
          {review.original && review.original !== review.final ? (
            <>
              <b>{copy.draftTitle}</b>
              <p>{review.original}</p>
              <b>{copy.fixTitle}</b>
              <p>{review.final}</p>
            </>
          ) : null}
          {review.checks.length ? (
            <>
              <b>{copy.checkTitle}</b>
              <ul>
                {review.checks.map((check) => (
                  <li key={check.id}>
                    {check.skipped ? "–" : check.pass ? "✓" : "✗"} {check.name}
                    {check.reason ? `${gap}${check.reason}` : ""}
                  </li>
                ))}
              </ul>
            </>
          ) : null}
        </div>
      ) : null}
    </>
  );
}

function reviewStatus(review: ClientReview, copy: HallCopy): { kind: "pass" | "fixed" | "fail"; label: string } | null {
  if (review.originalPassed && review.passed) {
    return review.sample ? null : { kind: "pass", label: copy.badgePass };
  }
  if (review.passed) return { kind: "fixed", label: fill(copy.badgeFixed, { n: Math.max(review.fixedCount, 1) }) };
  if (!review.sample) return { kind: "fail", label: copy.badgeFail };
  return null;
}

function reviewFrom(data: Record<string, unknown>, spoken: string): ClientReview {
  return {
    sample: Boolean(data.sample),
    demo: Boolean(data.demo),
    originalPassed: Boolean(data.originalPassed),
    passed: data.passed !== false,
    fixedCount: typeof data.fixedCount === "number" ? data.fixedCount : 0,
    original: typeof data.original === "string" ? data.original : spoken,
    final: spoken,
    checks: asChecks(data.finalChecks),
  };
}

function asChecks(value: unknown): ClientReview["checks"] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const row = item as Record<string, unknown>;
    return [{
      id: String(row.id || ""),
      name: String(row.name || ""),
      pass: Boolean(row.pass),
      skipped: Boolean(row.skipped),
      reason: String(row.reason || ""),
    }];
  });
}

function parseStance(text: string): number {
  if (/有条件支持|conditional/i.test(text)) return 2;
  if (/反对|oppose/i.test(text)) return 1;
  if (/支持|support/i.test(text)) return 0;
  return 2;
}

function pointFrom(text: string): string {
  const lines = text.split("\n").map((line) => line.trim()).filter(Boolean);
  const body = lines.filter((line) => !/^(投票|Vote)\s*[:：]/i.test(line));
  return (body[1] || body[0] || "").replace(/[（(][^）)]*[）)]$/, "").trim();
}

function ModelMark({ label }: { label: Wolf["modelLabel"] }) {
  if (label === "GPT") {
    return (
      <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
        <path d="M8 1.5l1.2 2.2 2.4.3-1.8 1.6.5 2.4L8 6.8 5.7 8l.5-2.4L4.4 4l2.4-.3L8 1.5z" fill="none" stroke="#f4ead2" strokeWidth="1.2" />
        <circle cx="8" cy="8" r="2.1" fill="none" stroke="#f4ead2" strokeWidth="1.2" />
      </svg>
    );
  }
  if (label === "Claude") {
    return (
      <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
        <path d="M8 1.2l1.1 3.2H12.6L9.8 6.6l1 3.3L8 7.8 5.2 9.9l1-3.3L3.4 4.4h3.5L8 1.2z" fill="#e39a4a" />
      </svg>
    );
  }
  if (label === "Gemini") {
    return (
      <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
        <path d="M8 1.5l2 4.2L14.5 8 10 9.8 8 14.5 6 9.8 1.5 8 6 5.7 8 1.5z" fill="#7aa2ff" />
        <path d="M8 4.2l.8 1.8L10.6 8 8.8 8.8 8 10.6 7.2 8.8 5.4 8l1.8-.8L8 4.2z" fill="#f2c14e" />
      </svg>
    );
  }
  if (label === "DeepSeek") {
    return (
      <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
        <path d="M2 9c2.2-3 4.2-4.2 6.2-3.2 1.2.6 1.6 1.8.6 3.2 1.8-.2 3.2.4 4.2 1.8-2 .2-3.6-.2-4.8-1.2-.8 1.6-2.2 2.4-4.2 2.2C2.6 11.6 1.8 10.4 2 9z" fill="#3d8bfd" />
      </svg>
    );
  }
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
      <path d="M3 10V6M6 12V4M9 11V5M12 9V7" stroke="#e15b64" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function questionsFor(board: Board, wolves: Wolf[], selected: boolean[], locale: "zh" | "en"): string[] {
  if (board.id === "learning") return WOLVES.study.sampleQuestions[locale];
  if (board.sampleQuestions) return board.sampleQuestions[locale];
  const prompts: string[] = [];
  wolves.forEach((wolf, index) => {
    if (!selected[index]) return;
    const list = wolf.sampleQuestions[locale];
    prompts.push(...(wolf.id === board.lead ? list : list.slice(0, 1)));
  });
  return prompts.slice(0, 6);
}

function phaseLabel(copy: HallCopy, phase: Phase): string {
  if (phase === "setup") return copy.phaseSetup;
  if (phase === "ask") return copy.phaseAsk;
  if (phase === "discuss") return copy.phaseDiscuss;
  if (phase === "vote") return copy.phaseVote;
  if (phase === "decide") return copy.phaseDecide;
  return copy.phaseDone;
}

function decisionLabel(copy: HallCopy, decision: CouncilDecision): string {
  if (decision === "adopt") return copy.adopt;
  if (decision === "modify") return copy.modify;
  return copy.reject;
}

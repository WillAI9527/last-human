"use client";

import { useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { useAppLocale } from "@/i18n/useAppLocale";
import { hallCopy } from "@/lib/wolf-council/copy";
import { getBoard } from "@/lib/wolf-council/data";
import { withLocale } from "@/lib/wolf-council/paths";
import {
  clearMemory,
  emptyHistory,
  emptyMemory,
  loadHistory,
  loadMemory,
  saveHistory,
  saveMemory,
  subscribeHistory,
  subscribeMemory,
  type MemoryCard,
} from "@/lib/wolf-council/storage";

export function HistoryView() {
  const { locale } = useAppLocale();
  const copy = hallCopy(locale);
  const router = useRouter();
  const records = useSyncExternalStore(subscribeHistory, loadHistory, emptyHistory);
  const [openId, setOpenId] = useState<number | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<number | null>(null);

  return (
    <section>
      <h1>{copy.histTitle}</h1>
      <p className="wh-sub2">{copy.histSub}</p>
      <div className="wh-panel">
        {records.length === 0 ? <p>{copy.histEmpty}</p> : records.map((record) => {
          const board = getBoard(record.boardId);
          return (
            <article key={record.id} className="wh-hist">
              <div>
                <p>{record.question}</p>
                <small>
                  {(board ? board.name[locale] : record.boardId)}
                  {" · "}
                  {new Date(record.time).toLocaleString(locale === "zh" ? "zh-CN" : "en")}
                </small>
                {openId === record.id ? (
                  <p>
                    {record.lines.map((line, index) => `#${index + 1} ${line.label} · ${line.votes}`).join(locale === "zh" ? "，" : ", ")}
                    {record.note ? ` · ${record.note}` : ""}
                  </p>
                ) : null}
              </div>
              <div className="wh-actions">
                <span className="wh-mock">{record.decision === "adopt" ? copy.adopt : record.decision === "modify" ? copy.modify : copy.reject}</span>
                <button type="button" className="wh-btn" onClick={() => setOpenId(openId === record.id ? null : record.id)}>{copy.detail}</button>
                <button type="button" className="wh-btn" onClick={() => setPendingDelete(record.id)}>{copy.del}</button>
              </div>
            </article>
          );
        })}
      </div>
      <div className="wh-actions">
        <button type="button" className="wh-btn" onClick={() => router.push(withLocale(locale, "/hall"))}>{copy.navHall}</button>
        <button type="button" className="wh-btn is-red" disabled={records.length === 0} onClick={() => setConfirmClear(true)}>{copy.histClear}</button>
      </div>
      {confirmClear ? (
        <Confirm
          title={copy.histClearTitle}
          body={copy.histClearBody}
          ok={copy.histClear}
          cancel={copy.cancel}
          onCancel={() => setConfirmClear(false)}
          onOk={() => {
            saveHistory([]);
            setConfirmClear(false);
          }}
        />
      ) : null}
      {pendingDelete != null ? (
        <Confirm
          title={copy.delTitle}
          body={copy.delBody}
          ok={copy.del}
          cancel={copy.cancel}
          onCancel={() => setPendingDelete(null)}
          onOk={() => {
            saveHistory(records.filter((record) => record.id !== pendingDelete));
            setPendingDelete(null);
          }}
        />
      ) : null}
    </section>
  );
}

export function SettingsView() {
  const { locale } = useAppLocale();
  const copy = hallCopy(locale);
  const stored = useSyncExternalStore(subscribeMemory, loadMemory, emptyMemory);
  const [draft, setDraft] = useState<MemoryCard | null>(null);
  const card = draft ?? stored;
  const [toast, setToast] = useState<string | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);

  const show = (message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(null), 1600);
  };

  return (
    <section>
      <h1>{copy.setTitle}</h1>
      <p className="wh-sub2">{copy.setSub}</p>
      <form
        className="wh-mem"
        onSubmit={(event) => {
          event.preventDefault();
          saveMemory(card);
          setDraft(null);
          show(copy.memSaved);
        }}
      >
        <h2>{copy.memTitle}</h2>
        <p>{copy.memHint}</p>
        <label htmlFor="mem-name">{copy.memName}</label>
        <input id="mem-name" value={card.name} onChange={(event) => setDraft({ ...card, name: event.target.value })} />
        <label htmlFor="mem-age">{copy.memAge}</label>
        <select id="mem-age" value={card.age} onChange={(event) => setDraft({ ...card, age: event.target.value })}>
          {copy.ages.map((label, index) => (
            <option key={label} value={index === 0 ? "" : String(index)}>{label}</option>
          ))}
        </select>
        <label htmlFor="mem-goal">{copy.memGoal}</label>
        <textarea id="mem-goal" value={card.goal} onChange={(event) => setDraft({ ...card, goal: event.target.value })} />
        <label htmlFor="mem-pref">{copy.memPref}</label>
        <input id="mem-pref" value={card.pref} onChange={(event) => setDraft({ ...card, pref: event.target.value })} />
        <label htmlFor="mem-note">{copy.memNote}</label>
        <textarea id="mem-note" value={card.note} onChange={(event) => setDraft({ ...card, note: event.target.value })} />
        <div className="wh-actions">
          <button type="submit" className="wh-btn is-red">{copy.memSave}</button>
          <button type="button" className="wh-btn" onClick={() => setConfirmClear(true)}>{copy.memClear}</button>
        </div>
      </form>
      {toast ? <div className="wh-toast" role="status">{toast}</div> : null}
      {confirmClear ? (
        <Confirm
          title={copy.memClearTitle}
          body={copy.memClearBody}
          ok={copy.memClear}
          cancel={copy.cancel}
          onCancel={() => setConfirmClear(false)}
          onOk={() => {
            clearMemory();
            setDraft(null);
            setConfirmClear(false);
            show(copy.memCleared);
          }}
        />
      ) : null}
    </section>
  );
}

function Confirm({
  title,
  body,
  ok,
  cancel,
  onOk,
  onCancel,
}: {
  title: string;
  body: string;
  ok: string;
  cancel: string;
  onOk: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="wh-modal-back" role="presentation" onClick={onCancel}>
      <div className="wh-modal" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
        <h2>{title}</h2>
        <p>{body}</p>
        <div className="wh-modal__actions">
          <button type="button" className="wh-btn" onClick={onCancel}>{cancel}</button>
          <button type="button" className="wh-btn is-red" onClick={onOk}>{ok}</button>
        </div>
      </div>
    </div>
  );
}

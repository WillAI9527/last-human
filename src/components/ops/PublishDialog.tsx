"use client";

import { useRef } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import type { CopyDraft } from "@/lib/ops/schemas";
import { postText } from "@/lib/ops/flow";

export function PublishDialog({
  open,
  draft,
  platform,
  nickname,
  when,
  previewUrl,
  copyLabel,
  copiedLabel,
  note,
  cancelLabel,
  confirmLabel,
  title,
  onCancel,
  onConfirm,
  onCopied,
  returnFocusRef,
}: {
  open: boolean;
  draft: CopyDraft | null;
  platform: string;
  nickname: string;
  when: string;
  previewUrl: string | null;
  copyLabel: string;
  copiedLabel: string;
  note: string;
  cancelLabel: string;
  confirmLabel: string;
  title: string;
  onCancel: () => void;
  onConfirm: () => void;
  onCopied: (ok: boolean) => void;
  returnFocusRef: React.RefObject<HTMLButtonElement | null>;
}) {
  const confirmRef = useRef<HTMLButtonElement>(null);
  const text = draft ? postText(draft) : "";
  return (
    <Dialog.Root open={open} onOpenChange={(next) => { if (!next) onCancel(); }}>
      <Dialog.Portal>
        <Dialog.Overlay className="ops-dialog-overlay" />
        <Dialog.Content
          className="ops-dialog"
          aria-describedby="publish-note"
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            confirmRef.current?.focus();
          }}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            returnFocusRef.current?.focus();
          }}
          onInteractOutside={(event) => event.preventDefault()}
          onPointerDownOutside={(event) => event.preventDefault()}
        >
          <Dialog.Title className="ops-dialog-title">{title}</Dialog.Title>
          <dl className="ops-confirm">
            <div><dt>平台</dt><dd>{platform}</dd></div>
            <div><dt>账号</dt><dd>{nickname}</dd></div>
            <div><dt>发布时间</dt><dd className="ops-num">{when}</dd></div>
          </dl>
          <pre className="ops-confirm-body">{text}</pre>
          {previewUrl ? <img className="ops-thumb" src={previewUrl} alt="" /> : null}
          <p id="publish-note" className="ops-note">{note}</p>
          <div className="ops-dialog-actions">
            <button
              type="button"
              className="ops-btn"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(text);
                  onCopied(true);
                } catch {
                  onCopied(false);
                }
              }}
            >
              {copyLabel}
            </button>
            <span className="sr-only">{copiedLabel}</span>
            <button type="button" className="ops-btn" onClick={onCancel}>{cancelLabel}</button>
            <button ref={confirmRef} type="button" className="ops-btn ops-btn--primary" onClick={onConfirm}>{confirmLabel}</button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

"use client";

import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { useLocale } from "next-intl";
import type { AssetMeta, OpsLocale, PlatformId, WizardRecord } from "@/lib/ops/flow";
import {
  answerFor,
  ANSWER_MAX_CHARS,
  commitAccount,
  confirmPublish,
  editDraft,
  measureCopy,
  emptyWizard,
  markPublishFailed,
  questionsReady,
  saveReport,
  selfApprove,
  setCompetitor,
  upsertAnswer,
  WizardRecord as WizardSchema,
} from "@/lib/ops/flow";
import { runXiaolang } from "@/lib/ops/xiaolang-client";
import { compressImage, sniffMime, validateUpload } from "@/lib/ops/image";
import { clearWizard, loadBlob, loadWizard, saveBlob, saveWizard } from "@/lib/ops/storage";
import type { Claim, QuestionCard } from "@/lib/ops/schemas";
import { PublishDialog } from "./PublishDialog";

const PLATFORMS: PlatformId[] = ["x", "xiaohongshu", "tiktok", "instagram", "facebook"];

const zh = {
  brand: "狼群账号运营中心",
  steps: ["添加账号", "小狼提问", "账号分析", "竞品对比", "生成文案", "发布"],
  emptyTitle: "添加你的第一个账号",
  emptyBody: "用主页链接或截图建档。链接读不到时不会编造内容。",
  banner: "模型尚未配置，当前为演示模式",
  config: "查看配置说明",
  configBody: "请在服务端设置 LLM_API_KEY、LLM_BASE_URL、LLM_MODEL。可选 LLM_FALLBACK_MODEL、LLM_VISION_MODEL。未设置时会尝试 ZENMUX_API_KEY 与 ZENMUX_URL。密钥不会进入浏览器。",
  demo: "演示",
  src: { user: "用户提供", fetched: "外部读取", demo: "演示数据", inferred: "小狼推测" },
  uncertainty: "不确定之处",
  pdf: "已上传，暂不分析",
  unread: "无法读取，请上传截图",
  nickname: "昵称",
  link: "主页链接",
  platform: "平台",
  upload: "上传截图或 PDF",
  drop: "点击或拖拽文件到这里",
  next: "下一步",
  back: "上一步",
  save: "保存到账号",
  saved: "已保存到这个账号",
  analyze: "生成分析",
  compare: "生成对比",
  write: "生成文案",
  publish: "发布",
  confirm: "确认发布",
  cancel: "取消",
  copy: "复制文案",
  copied: "已复制文案",
  copyFail: "复制失败",
  note: "这条内容由作者自审。P0 没有审核员角色。确认后会从「已批准」直接标为「已发布」（手动发布，不会调用平台接口）。",
  published: "已发布",
  failed: "发布失败",
  retry: "重试",
  markFailed: "标记为未发出",
  restart: "重新开始",
  skip: "跳过",
  edit: "修改",
  answered: "已回答",
  why: "为什么问",
  status: { draft: "草稿", in_review: "审核中", approved: "已批准", published: "已发布", failed: "失败" },
  competitor: "竞品名称",
  competitorUrl: "竞品链接",
  needCompetitor: "先添加一个竞品，才能看到对比卡。",
  loading: "正在读取本机记录",
  error: "没有读到本机数据或模型状态",
  typeError: "只接受 PNG、JPG、WEBP 或 PDF",
  sizeError: "文件超过 10MB",
  compressError: "图片处理失败",
  remove: "移除",
  replace: "替换",
  live: "已配置",
  unconfigured: "未配置",
  abnormal: "异常",
  tags: "标签，用逗号分隔",
  title: "标题",
  body: "正文",
  over: "超出平台字数，仍可继续",
  when: "发布时间",
  done: "这条内容已标记为已发布。刷新后仍在。",
  self: "作者自审，没有单独审核角色。",
};
const en: typeof zh = {
  ...zh,
  brand: "Pack ops",
  steps: ["Account", "Questions", "Analysis", "Competitor", "Copy", "Publish"],
  emptyTitle: "Add your first account",
  emptyBody: "Use a profile link or a screenshot. If the link cannot be read, nothing is invented.",
  banner: "The model is not configured. You are in demo mode.",
  config: "How to configure",
  configBody: "Set LLM_API_KEY, LLM_BASE_URL, and LLM_MODEL on the server. LLM_FALLBACK_MODEL and LLM_VISION_MODEL are optional. ZENMUX_API_KEY and ZENMUX_URL are used when the LLM_* values are missing. Keys never reach the browser.",
  demo: "Demo",
  src: { user: "From you", fetched: "Fetched", demo: "Demo", inferred: "Xiaolang guess" },
  uncertainty: "Uncertainty",
  pdf: "Uploaded, not analyzed",
  unread: "Could not read this. Upload a screenshot.",
  nickname: "Name",
  link: "Profile link",
  platform: "Platform",
  upload: "Upload a screenshot or PDF",
  drop: "Click or drop a file",
  next: "Next",
  back: "Back",
  save: "Save to account",
  saved: "Saved on this account",
  analyze: "Build analysis",
  compare: "Build comparison",
  write: "Write copy",
  publish: "Publish",
  confirm: "Confirm publish",
  cancel: "Cancel",
  copy: "Copy text",
  copied: "Copied",
  copyFail: "Copy failed",
  note: "You review this yourself. P0 has no reviewer role. Confirm moves it from approved straight to published. Nothing is sent to the platform.",
  published: "Published",
  failed: "Publish failed",
  retry: "Retry",
  markFailed: "Mark as not sent",
  restart: "Start over",
  skip: "Skip",
  edit: "Edit",
  answered: "Answered",
  why: "Why ask",
  status: { draft: "Draft", in_review: "In review", approved: "Approved", published: "Published", failed: "Failed" },
  competitor: "Competitor name",
  competitorUrl: "Competitor link",
  needCompetitor: "Add one competitor to see the comparison card.",
  loading: "Loading this browser’s record",
  error: "Could not read local data or model status",
  typeError: "Only PNG, JPG, WEBP, or PDF",
  sizeError: "File is over 10MB",
  compressError: "Could not process the image",
  remove: "Remove",
  replace: "Replace",
  live: "Configured",
  unconfigured: "Not configured",
  abnormal: "Error",
  tags: "Tags, comma separated",
  title: "Title",
  body: "Body",
  over: "Over the platform limit. You can still continue.",
  when: "Time",
  done: "Marked published. It stays after refresh.",
  self: "The author reviews this. There is no reviewer role.",
};

type LlmSnap = { status: "ok"; model: string | null; vision: boolean } | { status: "not_configured" } | { status: "error" };

function copyOf(locale: string) {
  return locale === "zh" ? zh : en;
}

function SourceTag({ source, t }: { source: Claim["source"]; t: typeof zh }) {
  const kind = source.kind;
  const tone = kind === "user" ? "src-user" : kind === "fetched" ? "src-fetched" : kind === "inferred" ? "src-inferred" : "src-demo";
  return (
    <span className="ops-source">
      <span className={`ops-tag ops-tag--${tone}`}>{t.src[kind]}</span>
      {kind === "inferred" && source.uncertainty ? <span className="ops-uncertainty">{t.uncertainty}：{source.uncertainty}</span> : null}
    </span>
  );
}

function ClaimList({ items, t }: { items: Claim[]; t: typeof zh }) {
  return (
    <ul className="ops-claims">
      {items.map((item, index) => (
        <li key={`${item.source.kind}-${index}`}>
          <p>{item.text}</p>
          <SourceTag source={item.source} t={t} />
        </li>
      ))}
    </ul>
  );
}

export function Wizard() {
  const locale = (useLocale() === "zh" ? "zh" : "en") as OpsLocale;
  const t = copyOf(locale);
  const params = useSearchParams();
  const view = params.get("view");
  const [boot, setBoot] = useState<"loading" | "error" | "ready">("loading");
  const [record, setRecord] = useState<WizardRecord | null>(null);
  const [llm, setLlm] = useState<LlmSnap>({ status: "not_configured" });
  const [accountForm, setAccountForm] = useState<{ platform: PlatformId; nickname: string; profileUrl: string; asset: AssetMeta | null }>({
    platform: "xiaohongshu", nickname: "", profileUrl: "", asset: null,
  });
  const [competitorForm, setCompetitorForm] = useState<{ handle: string; url: string; asset: AssetMeta | null }>({ handle: "", url: "", asset: null });
  const [linkNote, setLinkNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [genError, setGenError] = useState("");
  const [dialog, setDialog] = useState(false);
  const [openQuestion, setOpenQuestion] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, { value: string; text: string }>>({});
  const publishRef = useRef<HTMLButtonElement>(null);
  const recordRef = useRef<WizardRecord | null>(null);
  const fileRef = useRef<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [compPreview, setCompPreview] = useState<string | null>(null);

  useEffect(() => {
    let cancel = false;
    (async () => {
      try {
        const [stored, statusRes] = await Promise.all([
          loadWizard().catch(() => null),
          fetch("/api/llm/status").then((res) => res.json()).catch(() => null),
        ]);
        if (cancel) return;
        if (!statusRes) {
          setBoot("error");
          return;
        }
        const parsed = stored ? WizardSchema.safeParse(stored) : null;
        const next = view === "empty" || !parsed?.success ? emptyWizard() : parsed.data;
        recordRef.current = next;
        setRecord(next);
        if (next.account) {
          setAccountForm({ platform: next.account.platform, nickname: next.account.nickname, profileUrl: next.account.profileUrl, asset: next.account.asset });
        }
        if (next.competitor) setCompetitorForm({ handle: next.competitor.handle, url: next.competitor.url, asset: next.competitor.asset });
        if (statusRes.status === "ok") setLlm({ status: "ok", model: statusRes.model ?? statusRes.data?.model ?? null, vision: Boolean(statusRes.data?.vision) });
        else if (statusRes.status === "not_configured") setLlm({ status: "not_configured" });
        else setLlm({ status: "error" });
        setBoot("ready");
      } catch {
        if (!cancel) setBoot("error");
      }
    })();
    return () => { cancel = true; };
  }, [view]);

  useEffect(() => {
    const id = accountForm.asset?.status === "done" && accountForm.asset.mime !== "application/pdf" ? accountForm.asset.id : "";
    if (!id) { setPreview(null); return; }
    let url = "";
    let stop = false;
    loadBlob(id).then((blob) => {
      if (stop || !blob) return;
      url = URL.createObjectURL(blob);
      setPreview(url);
    });
    return () => { stop = true; if (url) URL.revokeObjectURL(url); };
  }, [accountForm.asset]);

  useEffect(() => {
    const id = competitorForm.asset?.status === "done" && competitorForm.asset.mime !== "application/pdf" ? competitorForm.asset.id : "";
    if (!id) { setCompPreview(null); return; }
    let url = "";
    let stop = false;
    loadBlob(id).then((blob) => {
      if (stop || !blob) return;
      url = URL.createObjectURL(blob);
      setCompPreview(url);
    });
    return () => { stop = true; if (url) URL.revokeObjectURL(url); };
  }, [competitorForm.asset]);

  async function persist(next: WizardRecord) {
    const parsed = WizardSchema.parse(next);
    recordRef.current = parsed;
    setRecord(parsed);
    await saveWizard(parsed);
    return parsed;
  }

  async function takeFile(file: File, target: "account" | "competitor") {
    const code = validateUpload(file);
    const id = crypto.randomUUID();
    const mime = sniffMime(file) ?? "image/png";
    const failed = (error: string): AssetMeta => ({ id, name: file.name, mime, size: file.size, status: "failed", error });
    const apply = (asset: AssetMeta | null) => {
      if (target === "account") setAccountForm((form) => ({ ...form, asset }));
      else setCompetitorForm((form) => ({ ...form, asset }));
    };
    if (code) {
      apply(failed(code === "size" ? t.sizeError : t.typeError));
      return;
    }
    apply({ id, name: file.name, mime, size: file.size, status: "uploading" });
    try {
      const blob = mime === "application/pdf" ? file : await compressImage(file);
      await saveBlob(id, blob);
      fileRef.current = file;
      apply({ id, name: file.name, mime: mime === "application/pdf" ? mime : "image/jpeg", size: blob.size, status: "done" });
    } catch {
      apply(failed(t.compressError));
    }
  }

  if (view === "loading" || boot === "loading") {
    return (
      <main className="ops-shell">
        <p className="ops-muted">{t.loading}</p>
        <div className="ops-skel" />
        <div className="ops-skel" />
      </main>
    );
  }
  if (view === "error" || boot === "error" || !record) {
    return (
      <main className="ops-shell">
        <div className="ops-error">
          <strong>{t.error}</strong>
          <button type="button" className="ops-btn ops-btn--danger" onClick={() => window.location.reload()}>{t.retry}</button>
        </div>
      </main>
    );
  }

  const step = record.step;
  const demoMode = llm.status !== "ok";
  const wolf = step === 1 && !record.account ? "empty" : step === 2 ? "asking" : busy ? "thinking" : "suggest";

  return (
    <main className="ops-shell">
      <header className="ops-top">
        <img src="/xiaolang/xiaolang-avatar.webp" alt="" width={24} height={24} />
        <strong>{t.brand}</strong>
        <span className={llm.status === "ok" ? "ops-lamp ops-lamp--ok" : llm.status === "error" ? "ops-lamp ops-lamp--bad" : "ops-lamp ops-lamp--warn"}>
          {llm.status === "ok" ? `${t.live}${llm.model ? ` · ${llm.model}` : ""}` : llm.status === "error" ? t.abnormal : t.unconfigured}
        </span>
        {demoMode ? <span className="ops-demo-badge bg-demo-soft text-demo">{t.demo}</span> : null}
      </header>
      {demoMode ? (
        <div className="ops-banner">
          <span>{t.banner}</span>
          <details>
            <summary>{t.config}</summary>
            <p>{t.configBody}</p>
          </details>
        </div>
      ) : null}
      <ol className="ops-steps">
        {t.steps.map((label, index) => (
          <li key={label} className={index + 1 === step ? "is-on" : index + 1 < step ? "is-done" : ""}>{index + 1}. {label}</li>
        ))}
      </ol>
      <section className="ops-card">
        <img className="ops-wolf" src={`/xiaolang/xiaolang-${wolf}.webp`} alt="" width={step === 1 ? 96 : 48} height={step === 1 ? 96 : 48} />
        {step === 1 ? (
          <div>
            {!record.account ? <><h1>{t.emptyTitle}</h1><p className="ops-muted">{t.emptyBody}</p></> : <h1>{t.steps[0]}</h1>}
            <label>{t.platform}
              <select value={accountForm.platform} onChange={(event) => setAccountForm({ ...accountForm, platform: event.target.value as PlatformId })}>
                {PLATFORMS.map((item) => <option key={item} value={item}>{item}</option>)}
              </select>
            </label>
            <label>{t.nickname}
              <input value={accountForm.nickname} onChange={(event) => setAccountForm({ ...accountForm, nickname: event.target.value })} />
            </label>
            <label>{t.link}
              <input value={accountForm.profileUrl} placeholder="https://" onChange={(event) => setAccountForm({ ...accountForm, profileUrl: event.target.value })} />
            </label>
            {linkNote ? <p className="ops-warn-text">{linkNote}</p> : null}
            <FileBox t={t} asset={accountForm.asset} preview={preview} onFile={(file) => takeFile(file, "account")} onRemove={() => setAccountForm({ ...accountForm, asset: null })} />
            <button
              type="button"
              className="ops-btn ops-btn--primary"
              disabled={!accountForm.nickname.trim() || (!accountForm.profileUrl.trim() && accountForm.asset?.status !== "done") || accountForm.asset?.status === "uploading"}
              onClick={async () => {
                setLinkNote("");
                if (accountForm.profileUrl.trim()) {
                  const res = await fetch("/api/ops/link-check", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url: accountForm.profileUrl.trim() }) });
                  const body = await res.json().catch(() => ({ readable: false }));
                  if (!body.readable) setLinkNote(t.unread);
                }
                const committed = commitAccount(recordRef.current ?? record, accountForm);
                await persist(await runXiaolang(committed, "questions", locale));
              }}
            >{t.next}</button>
          </div>
        ) : null}
        {step === 2 ? (
          <div>
            <h1>{t.steps[1]}</h1>
            {record.questions.map((card) => (
              <QuestionBlock
                key={card.id}
                card={card}
                t={t}
                open={openQuestion === card.id || !answerFor(record, card.id)}
                answer={answerFor(record, card.id)}
                draft={drafts[card.id] ?? { value: answerFor(record, card.id)?.value ?? "", text: answerFor(record, card.id)?.text ?? "" }}
                onDraft={(value) => setDrafts({ ...drafts, [card.id]: value })}
                onOpen={() => setOpenQuestion(card.id)}
                onSubmit={async (skipped) => {
                  const draft = drafts[card.id] ?? { value: "", text: "" };
                  const next = upsertAnswer(recordRef.current ?? record, card, { ...draft, skipped });
                  await persist(next);
                  setOpenQuestion(null);
                }}
              />
            ))}
            <div className="ops-row">
              <button type="button" className="ops-btn" onClick={() => persist({ ...(recordRef.current ?? record), step: 1 })}>{t.back}</button>
              <button type="button" className="ops-btn ops-btn--primary" disabled={!questionsReady(record)} onClick={() => persist({ ...(recordRef.current ?? record), step: 3 })}>{t.next}</button>
            </div>
          </div>
        ) : null}
        {step === 3 ? (
          <div>
            <h1>{t.steps[2]}</h1>
            {record.account?.profileUrl ? <p className="ops-warn-text">{t.unread}</p> : null}
            {genError ? <div className="ops-error"><span>{genError}</span><button type="button" className="ops-btn ops-btn--danger" onClick={() => setGenError("")}>{t.retry}</button></div> : null}
            {record.report ? (
              <article className={record.report.isDemo ? "ops-subcard border border-dashed border-demo" : "ops-subcard"}>
                {record.report.isDemo ? <span className="ops-demo-badge bg-demo-soft text-demo">{t.demo}</span> : null}
                <ClaimList items={[record.report.positioning]} t={t} />
                <ClaimList items={record.report.audience} t={t} />
                <ClaimList items={record.report.contentStyle} t={t} />
                <ClaimList items={record.report.gaps} t={t} />
                <ClaimList items={record.report.suggestions} t={t} />
                {record.reportSaved ? <p className="ops-ok">{t.saved}</p> : null}
              </article>
            ) : null}
            <div className="ops-row">
              <button type="button" className="ops-btn" onClick={() => persist({ ...(recordRef.current ?? record), step: 2 })}>{t.back}</button>
              <button type="button" className="ops-btn ops-btn--primary" disabled={busy} onClick={async () => {
                setBusy(true);
                setGenError("");
                try {
                  await persist(await runXiaolang(recordRef.current ?? record, "analysis", locale));
                } catch (error) {
                  setGenError(error instanceof Error ? error.message : t.error);
                } finally { setBusy(false); }
              }}>{t.analyze}</button>
              <button type="button" className="ops-btn" disabled={!record.report} onClick={async () => { await persist(saveReport(recordRef.current ?? record)); toast.success(t.saved); }}>{t.save}</button>
              <button type="button" className="ops-btn ops-btn--primary" disabled={!record.reportSaved} onClick={() => persist({ ...(recordRef.current ?? record), step: 4 })}>{t.next}</button>
            </div>
          </div>
        ) : null}
        {step === 4 ? (
          <div>
            <h1>{t.steps[3]}</h1>
            <p className="ops-muted">{t.needCompetitor}</p>
            <label>{t.competitor}<input value={competitorForm.handle} onChange={(event) => setCompetitorForm({ ...competitorForm, handle: event.target.value })} /></label>
            <label>{t.competitorUrl}<input value={competitorForm.url} placeholder="https://" onChange={(event) => setCompetitorForm({ ...competitorForm, url: event.target.value })} /></label>
            <FileBox t={t} asset={competitorForm.asset} preview={compPreview} onFile={(file) => takeFile(file, "competitor")} onRemove={() => setCompetitorForm({ ...competitorForm, asset: null })} />
            {record.comparison ? (
              <article className="ops-subcard border border-dashed border-demo">
                <span className="ops-demo-badge bg-demo-soft text-demo">{t.demo}</span>
                {record.competitor?.url ? <p className="ops-warn-text">{t.unread}</p> : null}
                {record.comparison.rows.map((row) => (
                  <div key={row.dimension}>
                    <h2>{row.dimension}</h2>
                    <ClaimList items={[row.mine, ...row.theirs]} t={t} />
                  </div>
                ))}
                <ClaimList items={record.comparison.takeaways} t={t} />
              </article>
            ) : null}
            <div className="ops-row">
              <button type="button" className="ops-btn" onClick={() => persist({ ...(recordRef.current ?? record), step: 3 })}>{t.back}</button>
              <button type="button" className="ops-btn ops-btn--primary" disabled={!competitorForm.handle.trim() && !competitorForm.url.trim() && competitorForm.asset?.status !== "done"} onClick={async () => {
                const withComp = setCompetitor(recordRef.current ?? record, competitorForm);
                await persist(await runXiaolang(withComp, "comparison", locale));
              }}>{t.compare}</button>
              <button type="button" className="ops-btn ops-btn--primary" disabled={!record.comparison} onClick={() => persist({ ...(recordRef.current ?? record), step: 5 })}>{t.next}</button>
            </div>
          </div>
        ) : null}
        {step >= 5 && record.draft ? (
          <div>
            <h1>{t.steps[4]}</h1>
            <p className={`ops-status ops-status--${record.draft.status}`}>{t.status[record.draft.status]} · {t.self}</p>
            {record.draft.isDemo ? <span className="ops-demo-badge bg-demo-soft text-demo">{t.demo}</span> : null}
            {record.failReason ? <div className="ops-error"><span>{record.failReason}</span></div> : null}
            {(() => {
              const counts = measureCopy(record.account?.platform ?? "xiaohongshu", record.draft);
              return (
                <>
                  <label>{t.title} {counts.title ? <span className={counts.title.over ? "ops-bad" : "ops-muted"}>{counts.title.used}/{counts.title.limit}</span> : null}
                    <input value={record.draft.title ?? ""} disabled={record.draft.status === "published"} onChange={(event) => persist(editDraft(recordRef.current ?? record, { title: event.target.value }))} />
                    {counts.title?.over ? <span className="ops-bad">{t.over}</span> : null}
                  </label>
                  <label>{t.body} <span className={counts.body.over ? "ops-bad" : "ops-muted"}>{counts.body.used}/{counts.body.limit}</span>
                    <textarea rows={8} value={record.draft.body} disabled={record.draft.status === "published"} onChange={(event) => persist(editDraft(recordRef.current ?? record, { body: event.target.value }))} />
                    {counts.body.over ? <span className="ops-bad">{t.over}</span> : null}
                  </label>
                </>
              );
            })()}
            <label>{t.tags}
              <input value={record.draft.hashtags.join(", ")} disabled={record.draft.status === "published"} onChange={(event) => persist(editDraft(recordRef.current ?? record, { hashtags: event.target.value.split(",").map((item) => item.trim()).filter(Boolean) }))} />
            </label>
            <ClaimList items={record.draft.rationale} t={t} />
            {record.draft.status === "published" ? <p className="ops-ok">{t.done}</p> : null}
            <div className="ops-row">
              {record.draft.status !== "published" ? <button type="button" className="ops-btn" onClick={() => persist({ ...(recordRef.current ?? record), step: 4 })}>{t.back}</button> : null}
              {record.draft.status !== "published" ? <button type="button" className="ops-btn" disabled={busy} onClick={async () => { setBusy(true); try { await persist(await runXiaolang(recordRef.current ?? record, "copy", locale)); } finally { setBusy(false); } }}>{t.write}</button> : null}
              {record.draft.status !== "published" ? (
                <button
                  ref={publishRef}
                  type="button"
                  className="ops-btn ops-btn--primary"
                  onClick={async () => {
                    await persist(selfApprove(recordRef.current ?? record));
                    setDialog(true);
                  }}
                >{record.draft.status === "failed" ? t.retry : t.publish}</button>
              ) : null}
              {record.draft.status !== "published" && record.draft.status !== "failed" ? (
                <button type="button" className="ops-btn ops-btn--danger" onClick={() => persist(markPublishFailed(recordRef.current ?? record, t.failed))}>{t.markFailed}</button>
              ) : null}
              <button type="button" className="ops-btn" onClick={async () => { await clearWizard(); const fresh = emptyWizard(); await persist(fresh); setAccountForm({ platform: "xiaohongshu", nickname: "", profileUrl: "", asset: null }); setCompetitorForm({ handle: "", url: "", asset: null }); }}>{t.restart}</button>
            </div>
          </div>
        ) : null}
        {step === 5 && !record.draft ? (
          <div>
            <h1>{t.steps[4]}</h1>
            <button type="button" className="ops-btn ops-btn--primary" disabled={!record.comparison || busy} onClick={async () => { setBusy(true); try { await persist(await runXiaolang(recordRef.current ?? record, "copy", locale)); } finally { setBusy(false); } }}>{t.write}</button>
          </div>
        ) : null}
      </section>
      <PublishDialog
        open={dialog}
        draft={record.draft}
        platform={record.account?.platform ?? ""}
        nickname={record.account?.nickname ?? ""}
        when={new Date().toLocaleString(locale === "zh" ? "zh-CN" : "en")}
        previewUrl={preview}
        copyLabel={t.copy}
        copiedLabel={t.copied}
        note={t.note}
        cancelLabel={t.cancel}
        confirmLabel={t.confirm}
        title={t.confirm}
        returnFocusRef={publishRef}
        onCopied={(ok) => toast(ok ? t.copied : t.copyFail)}
        onCancel={() => setDialog(false)}
        onConfirm={async () => {
          const current = recordRef.current ?? record;
          const approved = current.draft?.status === "approved" ? current : selfApprove(current);
          try {
            await persist(confirmPublish(approved, new Date().toISOString()));
            setDialog(false);
            toast.success(t.published);
          } catch (error) {
            await persist(markPublishFailed(current, error instanceof Error ? error.message : t.failed));
            setDialog(false);
          }
        }}
      />
    </main>
  );
}

function FileBox({ t, asset, preview, onFile, onRemove }: {
  t: typeof zh;
  asset: AssetMeta | null;
  preview: string | null;
  onFile: (file: File) => void;
  onRemove: () => void;
}) {
  return (
    <div
      className="ops-drop"
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => {
        event.preventDefault();
        const file = event.dataTransfer.files?.[0];
        if (file) onFile(file);
      }}
    >
      <p>{t.upload}</p>
      <p className="ops-muted">{t.drop}</p>
      <input type="file" accept="image/png,image/jpeg,image/webp,application/pdf,.png,.jpg,.jpeg,.webp,.pdf" onChange={(event) => { const file = event.target.files?.[0]; if (file) onFile(file); event.target.value = ""; }} />
      {asset ? (
        <div className="ops-file">
          {preview ? <img src={preview} alt="" className="ops-thumb" /> : null}
          <span>{asset.name}</span>
          <span className="ops-num">{Math.ceil(asset.size / 1024)} KB</span>
          <span>{asset.status}</span>
          {asset.mime === "application/pdf" && asset.status === "done" ? <span>{t.pdf}</span> : null}
          {asset.error ? <span className="ops-bad">{asset.error}</span> : null}
          <button type="button" className="ops-btn" onClick={onRemove}>{asset.status === "failed" ? t.retry : t.remove}</button>
        </div>
      ) : null}
    </div>
  );
}

function QuestionBlock({ card, t, open, answer, draft, onDraft, onOpen, onSubmit }: {
  card: QuestionCard;
  t: typeof zh;
  open: boolean;
  answer?: { skipped: boolean; value?: string; text?: string };
  draft: { value: string; text: string };
  onDraft: (value: { value: string; text: string }) => void;
  onOpen: () => void;
  onSubmit: (skipped: boolean) => void;
}) {
  if (!open && answer) {
    return (
      <div className="ops-q ops-q--done">
        <span>{t.answered} · {answer.skipped ? t.skip : (answer.text || card.options.find((option) => option.value === answer.value)?.label || answer.value)}</span>
        <button type="button" className="ops-btn ops-btn--ghost" onClick={onOpen}>{t.edit}</button>
      </div>
    );
  }
  return (
    <div className="ops-q">
      <img src="/xiaolang/xiaolang-asking.webp" alt="" width={24} height={24} />
      <div>
        <p className="ops-q-title">{card.question}</p>
        <p className="ops-muted">{t.why}：{card.why}</p>
        <div className="ops-options">
          {card.options.map((option) => (
            <button type="button" key={option.value} className={draft.value === option.value ? "is-on" : ""} onClick={() => onDraft({ ...draft, value: option.value })}>{option.label}</button>
          ))}
        </div>
        {card.allowText ? <input maxLength={ANSWER_MAX_CHARS} value={draft.text} onChange={(event) => onDraft({ ...draft, text: event.target.value.slice(0, ANSWER_MAX_CHARS) })} /> : null}
        <div className="ops-row">
          {!card.required ? <button type="button" className="ops-btn ops-btn--ghost" onClick={() => onSubmit(true)}>{t.skip}</button> : null}
          <button type="button" className="ops-btn ops-btn--primary" disabled={!draft.value && !draft.text.trim()} onClick={() => onSubmit(false)}>{t.next}</button>
        </div>
        <p className="ops-muted">{card.nextStep}</p>
      </div>
    </div>
  );
}

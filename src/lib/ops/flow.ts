import { z } from "zod";
import { generateUUID } from "@/lib/utils";
import {
  AccountReport,
  Answer,
  CompetitorCompare,
  CopyDraft,
  QuestionCard,
  type Answer as AnswerT,
  type Claim as ClaimT,
  type CopyDraft as CopyDraftT,
  type QuestionCard as QuestionCardT,
} from "./schemas";

export const Platform = z.enum(["x", "xiaohongshu", "tiktok", "instagram", "facebook"]);
export type PlatformId = z.infer<typeof Platform>;

export const AssetMeta = z.object({
  id: z.string(),
  name: z.string(),
  mime: z.enum(["image/png", "image/jpeg", "image/webp", "application/pdf"]),
  size: z.number(),
  status: z.enum(["uploading", "done", "failed"]),
  error: z.string().optional(),
});
export type AssetMeta = z.infer<typeof AssetMeta>;

export const WizardRecord = z.object({
  version: z.literal(1),
  step: z.number().int().min(1).max(6),
  account: z.object({
    id: z.string(),
    platform: Platform,
    nickname: z.string(),
    profileUrl: z.string(),
    asset: AssetMeta.nullable(),
  }).nullable(),
  taskId: z.string(),
  questions: z.array(QuestionCard),
  answers: z.array(Answer),
  report: AccountReport.nullable(),
  reportSaved: z.boolean(),
  competitor: z.object({
    id: z.string(),
    handle: z.string(),
    url: z.string(),
    asset: AssetMeta.nullable(),
  }).nullable(),
  comparison: CompetitorCompare.nullable(),
  draft: CopyDraft.nullable(),
  publishedAt: z.string().nullable(),
  failReason: z.string().nullable(),
  updatedAt: z.string(),
});
export type WizardRecord = z.infer<typeof WizardRecord>;

export type OpsLocale = "zh" | "en";

const FIXTURE = "fixture:ops-wizard-v1";
export const ANSWER_MAX_CHARS = 500;

export function clipAnswer(text: string): string {
  return text.slice(0, ANSWER_MAX_CHARS);
}

const CJK = /[\u1100-\u115F\u2E80-\uA4CF\uAC00-\uD7A3\uF900-\uFAFF\uFE10-\uFE19\uFE30-\uFE6F\uFF00-\uFF60\uFFE0-\uFFE6]/;

export function weightedLength(text: string, cjkWeight = 1): number {
  if (cjkWeight === 1) return Array.from(text).length;
  let count = 0;
  for (const char of text) count += CJK.test(char) ? cjkWeight : 1;
  return count;
}

export function measureCopy(platform: PlatformId, draft: { title?: string; body: string; hashtags?: string[] }): {
  title: { used: number; limit: number; over: boolean } | null;
  body: { used: number; limit: number; over: boolean };
} {
  const title = draft.title ?? "";
  const body = draft.body;
  if (platform === "xiaohongshu") {
    const titleUsed = weightedLength(title);
    const bodyUsed = weightedLength(body);
    return {
      title: { used: titleUsed, limit: 20, over: titleUsed > 20 },
      body: { used: bodyUsed, limit: 1000, over: bodyUsed > 1000 },
    };
  }
  if (platform === "x") {
    const tags = (draft.hashtags ?? []).map((tag) => (tag.startsWith("#") ? tag : `#${tag}`)).join(" ");
    const text = [title, body, tags].filter(Boolean).join("\n");
    const used = weightedLength(text, 2);
    return { title: null, body: { used, limit: 280, over: used > 280 } };
  }
  const limit = platform === "facebook" ? 2000 : 2200;
  const used = weightedLength(body);
  return { title: null, body: { used, limit, over: used > limit } };
}

export function emptyWizard(now = new Date().toISOString()): WizardRecord {
  return {
    version: 1,
    step: 1,
    account: null,
    taskId: generateUUID(),
    questions: [],
    answers: [],
    report: null,
    reportSaved: false,
    competitor: null,
    comparison: null,
    draft: null,
    publishedAt: null,
    failReason: null,
    updatedAt: now,
  };
}

function demoClaim(text: string, sourceRef = FIXTURE): ClaimT {
  return { text, source: { kind: "demo", sourceRef } };
}

function userClaim(text: string, sourceRef: string): ClaimT {
  return { text, source: { kind: "user", sourceRef } };
}

function inferredClaim(text: string, uncertainty: string, sourceRef: string): ClaimT {
  return { text, source: { kind: "inferred", sourceRef, uncertainty } };
}

export function demoQuestions(accountId: string, taskId: string, locale: OpsLocale): QuestionCardT[] {
  const zh = locale === "zh";
  const cards = [
    {
      id: `${taskId}:goal`,
      question: zh ? "这个账号现在最想达成什么？" : "What should this account achieve first?",
      why: zh ? "目标会决定分析里要看的结果，以及后面的文案语气。" : "The goal picks which result the analysis and the copy should aim at.",
      options: zh
        ? [{ value: "growth", label: "涨粉" }, { value: "sales", label: "成交" }, { value: "brand", label: "品牌" }]
        : [{ value: "growth", label: "Grow followers" }, { value: "sales", label: "Drive sales" }, { value: "brand", label: "Build the brand" }],
      required: true,
      nextStep: zh ? "写入账号目标，并用于分析。" : "Save the goal and use it in the analysis.",
    },
    {
      id: `${taskId}:audience`,
      question: zh ? "主要想说给谁听？" : "Who is the audience?",
      why: zh ? "受众不同，选题和用词会不一样。可以跳过。" : "Audience changes the angle. You can skip this.",
      options: zh
        ? [{ value: "fans", label: "已有粉丝" }, { value: "buyers", label: "想下单的人" }, { value: "peers", label: "同行" }]
        : [{ value: "fans", label: "Current followers" }, { value: "buyers", label: "People ready to buy" }, { value: "peers", label: "Peers" }],
      required: false,
      nextStep: zh ? "补充受众。跳过则分析里标成未提供。" : "Add the audience, or leave it marked as not provided.",
    },
    {
      id: `${taskId}:direction`,
      question: zh ? "内容更偏向哪一种？" : "Which content direction fits?",
      why: zh ? "方向用来生成文案结构。可以跳过。" : "Direction shapes the draft. You can skip this.",
      options: zh
        ? [{ value: "teach", label: "干货教程" }, { value: "story", label: "故事经历" }, { value: "offer", label: "产品介绍" }]
        : [{ value: "teach", label: "How-to" }, { value: "story", label: "Story" }, { value: "offer", label: "Offer" }],
      required: false,
      nextStep: zh ? "锁定文案结构。" : "Lock the copy structure.",
    },
  ];
  return z.array(QuestionCard).parse(cards.map((card) => ({
    ...card,
    accountId,
    taskId,
    allowText: true,
  })));
}

export function answerFor(record: WizardRecord, questionId: string): AnswerT | undefined {
  return record.answers.find((item) => item.questionId === questionId);
}

export function answerIsValid(card: QuestionCardT, answer: AnswerT | undefined): boolean {
  if (!answer || answer.questionId !== card.id) return false;
  if (answer.skipped) return !card.required;
  return Boolean(answer.value?.trim() || answer.text?.trim());
}

export function questionsReady(record: WizardRecord): boolean {
  return record.questions.length > 0 && record.questions.length <= 3
    && record.questions.every((card) => answerIsValid(card, answerFor(record, card.id)));
}

export function commitAccount(
  record: WizardRecord,
  input: { platform: PlatformId; nickname: string; profileUrl: string; asset: AssetMeta | null },
  now = new Date().toISOString(),
): WizardRecord {
  const nickname = input.nickname.trim();
  const profileUrl = input.profileUrl.trim();
  if (!nickname) throw new Error("nickname");
  if (!profileUrl && input.asset?.status !== "done") throw new Error("material");
  const id = record.account?.id ?? generateUUID();
  return {
    ...record,
    step: 2,
    account: { id, platform: input.platform, nickname, profileUrl, asset: input.asset },
    questions: record.account?.id === id ? record.questions : [],
    updatedAt: now,
  };
}

export function upsertAnswer(
  record: WizardRecord,
  card: QuestionCardT,
  patch: { value?: string; text?: string; skipped: boolean },
  now = new Date().toISOString(),
): WizardRecord {
  if (!record.account) throw new Error("account");
  if (patch.skipped && card.required) throw new Error("required");
  if (!patch.skipped && !patch.value?.trim() && !patch.text?.trim()) throw new Error("empty");
  const value = patch.skipped ? undefined : clipAnswer(patch.value?.trim() || "") || undefined;
  const text = patch.skipped ? undefined : clipAnswer(patch.text?.trim() || "") || undefined;
  const next: AnswerT = Answer.parse({
    questionId: card.id,
    accountId: record.account.id,
    taskId: record.taskId,
    value,
    text,
    skipped: patch.skipped,
    answeredAt: now,
  });
  const answers = record.answers.filter((item) => item.questionId !== card.id).concat(next);
  return { ...record, answers, updatedAt: now };
}

function labelOf(card: QuestionCardT | undefined, value: string | undefined, locale: OpsLocale): string {
  if (!value) return locale === "zh" ? "未提供" : "not provided";
  return card?.options.find((option) => option.value === value)?.label ?? value;
}

export function makeDemoReport(record: WizardRecord, locale: OpsLocale, now = new Date().toISOString()): WizardRecord {
  if (!record.account) throw new Error("account");
  if (!questionsReady(record)) throw new Error("questions");
  const zh = locale === "zh";
  const account = record.account;
  const goalCard = record.questions.find((card) => card.id.endsWith(":goal"));
  const audienceCard = record.questions.find((card) => card.id.endsWith(":audience"));
  const directionCard = record.questions.find((card) => card.id.endsWith(":direction"));
  const goal = answerFor(record, goalCard?.id ?? "");
  const audience = answerFor(record, audienceCard?.id ?? "");
  const direction = answerFor(record, directionCard?.id ?? "");
  const asset = account.asset?.status === "done" ? account.asset : null;
  const pdf = asset?.mime === "application/pdf";
  const image = asset && !pdf;
  const fileIds = asset ? [asset.id] : [];
  const positioning = goal && !goal.skipped
    ? userClaim(
      zh ? `${account.nickname} 的目标是「${labelOf(goalCard, goal.value, locale)}」。` : `${account.nickname} is aiming at “${labelOf(goalCard, goal.value, locale)}”.`,
      goal.questionId,
    )
    : demoClaim(zh ? "还没有填写目标。" : "No goal was provided.");
  const audienceClaim = audience && !audience.skipped
    ? userClaim(
      zh
        ? `受众：${labelOf(audienceCard, audience.value, locale)}${audience.text ? `（${audience.text}）` : ""}。`
        : `Audience: ${labelOf(audienceCard, audience.value, locale)}${audience.text ? ` (${audience.text})` : ""}.`,
      audience.questionId,
    )
    : demoClaim(zh ? "受众未提供，演示报告不替用户编造人群。" : "Audience was not provided. The demo report does not invent one.");
  const style = direction && !direction.skipped
    ? userClaim(
      zh ? `内容方向：${labelOf(directionCard, direction.value, locale)}。` : `Direction: ${labelOf(directionCard, direction.value, locale)}.`,
      direction.questionId,
    )
    : demoClaim(zh ? "内容方向未提供。" : "Direction was not provided.");
  const material = pdf
    ? demoClaim(zh ? `已上传 PDF「${asset?.name}」。已上传，暂不分析。` : `PDF “${asset?.name}” was uploaded. Uploaded, not analyzed.`)
    : image
      ? demoClaim(zh ? `已收到截图「${asset?.name}」。演示模式不会识别图片里的文字。` : `Screenshot “${asset?.name}” was received. Demo mode does not read text inside the image.`)
      : demoClaim(zh ? "没有可分析的截图。" : "No screenshot is available to analyze.");
  const gaps = [
    account.profileUrl
      ? demoClaim(zh
        ? `链接 ${account.profileUrl} 没有被读取。无法读取，请上传截图。这里没有任何抓取正文。`
        : `The link ${account.profileUrl} was not fetched. It could not be read — upload a screenshot. No page text was invented.`)
      : demoClaim(zh ? "没有填写主页链接。" : "No profile link was entered."),
  ];
  const report = AccountReport.parse({
    id: record.report?.id ?? generateUUID(),
    accountId: account.id,
    platform: account.platform,
    fileIds,
    url: account.profileUrl || undefined,
    positioning,
    audience: [audienceClaim],
    contentStyle: [style, material],
    strengths: [demoClaim(zh ? "资料来自你刚刚的回答，来源可以回溯到问题卡。" : "The profile comes from your answers and points back at the question cards.")],
    gaps,
    suggestions: [inferredClaim(
      zh ? "下一轮先补一张主页截图，再谈具体选题。" : "Next round, add a homepage screenshot before picking topics.",
      zh ? "没有读取链接，也没有识别截图，所以这只是流程建议。" : "The link was not read and the screenshot was not interpreted, so this is only a process note.",
      "rule:ask-for-screenshot",
    )],
    createdAt: now,
    isDemo: true,
  });
  return { ...record, step: 3, report, reportSaved: false, updatedAt: now };
}

export function saveReport(record: WizardRecord, now = new Date().toISOString()): WizardRecord {
  if (!record.report) throw new Error("report");
  return { ...record, reportSaved: true, updatedAt: now };
}

export function setCompetitor(
  record: WizardRecord,
  input: { handle: string; url: string; asset: AssetMeta | null },
  now = new Date().toISOString(),
): WizardRecord {
  const handle = input.handle.trim();
  const url = input.url.trim();
  if (!handle && !url && input.asset?.status !== "done") throw new Error("competitor");
  return {
    ...record,
    competitor: {
      id: record.competitor?.id ?? generateUUID(),
      handle: handle || url,
      url,
      asset: input.asset,
    },
    comparison: null,
    updatedAt: now,
  };
}

export function makeComparison(record: WizardRecord, locale: OpsLocale, now = new Date().toISOString()): WizardRecord {
  if (!record.account || !record.report || !record.competitor) throw new Error("competitor");
  const zh = locale === "zh";
  const mine = record.report.positioning;
  const unread = record.competitor.url
    ? (zh
      ? `对方链接 ${record.competitor.url} 没有被读取。这张卡片是演示对比，不是抓取结果。`
      : `Their link ${record.competitor.url} was not fetched. This card is a demo comparison, not a scrape.`)
    : (zh
      ? "没有读取对方主页。这张卡片是演示对比，不是抓取结果。"
      : "Their profile was not fetched. This card is a demo comparison, not a scrape.");
  const comparison = CompetitorCompare.parse({
    id: record.comparison?.id ?? generateUUID(),
    accountId: record.account.id,
    competitorIds: [record.competitor.id],
    rows: [
      {
        dimension: zh ? "定位" : "Positioning",
        mine,
        theirs: [demoClaim(zh ? `${record.competitor.handle}：${unread}` : `${record.competitor.handle}: ${unread}`)],
      },
      {
        dimension: zh ? "更新频率" : "Cadence",
        mine: demoClaim(zh ? "你的更新频率还没有数据。" : "Your posting cadence has no data yet."),
        theirs: [demoClaim(zh ? "未读取，不能写对方的更新频率。" : "Not fetched, so their cadence is unknown.")],
      },
    ],
    takeaways: [inferredClaim(
      zh ? "先对齐你自己的目标，再决定要不要学对方的栏目。" : "Match your own goal before copying their format.",
      zh ? "对方页面没有读取，借鉴点不能当成事实。" : "Their page was not read, so this takeaway is not a fact.",
      "rule:competitor-unread",
    )],
    isDemo: true,
  });
  return { ...record, step: 4, comparison, updatedAt: now };
}

export function makeDemoCopy(record: WizardRecord, locale: OpsLocale, now = new Date().toISOString()): WizardRecord {
  if (!record.account || !record.report || !record.comparison || !record.competitor) throw new Error("copy");
  const zh = locale === "zh";
  const goal = answerFor(record, record.questions.find((card) => card.id.endsWith(":goal"))?.id ?? "");
  const goalLabel = labelOf(record.questions.find((card) => card.id.endsWith(":goal")), goal?.skipped ? undefined : goal?.value, locale);
  const draft = CopyDraft.parse({
    id: record.draft?.id ?? generateUUID(),
    accountId: record.account.id,
    taskId: record.taskId,
    title: zh ? `${record.account.nickname}：先把一件小事说清楚` : `${record.account.nickname}: say one small thing clearly`,
    body: zh
      ? `大家好，我是 ${record.account.nickname}。这条是演示文案，不是模型对主页的读取结果。\n\n这周想先靠近「${goalLabel}」。我看了一眼同类账号 ${record.competitor.handle}，但没有打开他们的主页，所以不会假装知道他们的爆款结构。\n\n如果你也在做同样的事，评论里告诉我你卡在哪一步。`
      : `Hi, this is ${record.account.nickname}. This draft is demo copy. It is not a reading of anyone's profile.\n\nThis week I want to move toward “${goalLabel}”. I noted ${record.competitor.handle}, but their page was not fetched, so this does not claim to know their hits.\n\nIf you are stuck on the same step, say where.`,
    hashtags: zh ? ["演示文案", record.account.platform] : ["demo", record.account.platform],
    imagePrompt: zh ? "一张干净的浅色桌面，上面只有一张便签，写着本周目标。不要出现不存在的数据截图。" : "A clean light desk with one note naming this week's goal. Do not fake a stats screenshot.",
    rationale: [demoClaim(zh ? "文案只用了你填写的昵称、目标和竞品名称。" : "The copy uses only the nickname, goal, and competitor name you entered.")],
    status: "draft",
    isDemo: true,
  });
  return { ...record, step: 5, draft, publishedAt: null, failReason: null, updatedAt: now };
}

export function editDraft(
  record: WizardRecord,
  patch: { title?: string; body?: string; hashtags?: string[] },
  now = new Date().toISOString(),
): WizardRecord {
  if (!record.draft || record.draft.status === "published") return record;
  const status = record.draft.status === "failed" ? "failed" : "draft";
  return {
    ...record,
    draft: {
      ...record.draft,
      ...patch,
      status,
    },
    updatedAt: now,
  };
}

export function selfApprove(record: WizardRecord, now = new Date().toISOString()): WizardRecord {
  if (!record.draft) throw new Error("draft");
  if (record.draft.status === "published") throw new Error("published is final");
  if (record.draft.status === "approved") return record;
  return { ...record, failReason: null, draft: { ...record.draft, status: "approved" }, updatedAt: now };
}

export function confirmPublish(record: WizardRecord, now = new Date().toISOString()): WizardRecord {
  if (!record.draft || record.draft.status !== "approved") throw new Error("only approved can publish");
  if (!record.comparison) throw new Error("competitor required");
  return {
    ...record,
    step: 6,
    publishedAt: now,
    failReason: null,
    draft: { ...record.draft, status: "published" },
    updatedAt: now,
  };
}

export function markPublishFailed(record: WizardRecord, reason: string, now = new Date().toISOString()): WizardRecord {
  if (!record.draft || record.draft.status === "published") throw new Error("published is final");
  return {
    ...record,
    step: 5,
    failReason: reason,
    draft: { ...record.draft, status: "failed" },
    updatedAt: now,
  };
}

export function postText(draft: CopyDraftT): string {
  const tags = draft.hashtags.map((tag) => (tag.startsWith("#") ? tag : `#${tag}`)).join(" ");
  return [draft.title, draft.body, tags].filter(Boolean).join("\n\n");
}

export function claimsUseFetched(record: WizardRecord): boolean {
  const claims: ClaimT[] = [];
  const report = record.report;
  if (report) {
    claims.push(report.positioning, ...report.audience, ...report.contentStyle, ...report.strengths, ...report.gaps, ...report.suggestions);
  }
  if (record.comparison) {
    for (const row of record.comparison.rows) claims.push(row.mine, ...row.theirs);
    claims.push(...record.comparison.takeaways);
  }
  if (record.draft) claims.push(...record.draft.rationale);
  return claims.some((claim) => claim.source.kind === "fetched");
}

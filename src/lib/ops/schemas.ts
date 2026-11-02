// 狼群账号运营中心 · 小狼数据结构 V0.1（AI 工程师）
// Field change: CopyStatus adds "failed" so a manual publish can be marked failed and retried.
// approved -> published is a direct manual transition (no reviewer role in P0).
import { z } from "zod";

// ---- 来源标签 ----
export const SourceKind = z.enum(["user", "fetched", "demo", "inferred"]);
export const Source = z.object({
  kind: SourceKind,
  sourceRef: z.string().optional(),     // fileId / URL / questionId
  uncertainty: z.string().optional(),   // kind=inferred 时必填
}).refine(s => s.kind !== "inferred" || !!s.uncertainty, { message: "inferred 需写 uncertainty" });
export const Claim = z.object({ text: z.string(), source: Source });

// ---- 提问卡片与回答（按账号+任务保存） ----
export const QuestionOption = z.object({ value: z.string(), label: z.string() });
export const QuestionCard = z.object({
  id: z.string(), accountId: z.string(), taskId: z.string(),
  question: z.string(), why: z.string(),
  options: z.array(QuestionOption).max(6).default([]),
  allowText: z.boolean().default(true),
  required: z.boolean().default(false),
  nextStep: z.string(),
});
export const Answer = z.object({
  questionId: z.string(), accountId: z.string(), taskId: z.string(),
  value: z.string().optional(), text: z.string().optional(),
  skipped: z.boolean().default(false), answeredAt: z.string(), // ISO
});
// 小狼一轮输出：要么提问（1-3 个），要么给结果
export const AgentTurn = <T extends z.ZodTypeAny>(result: T) => z.discriminatedUnion("type", [
  z.object({ type: z.literal("questions"), questions: z.array(QuestionCard).min(1).max(3) }),
  z.object({ type: z.literal("result"), result }),
]);

// ---- 账号分析报告 ----
export const AccountReport = z.object({
  id: z.string(), accountId: z.string(), platform: z.string(),
  fileIds: z.array(z.string()), url: z.string().optional(),
  positioning: Claim, audience: z.array(Claim),
  contentStyle: z.array(Claim), strengths: z.array(Claim), gaps: z.array(Claim),
  suggestions: z.array(Claim), createdAt: z.string(),
  isDemo: z.boolean(),
});

// ---- 竞品对比 ----
export const CompetitorCompare = z.object({
  id: z.string(), accountId: z.string(), competitorIds: z.array(z.string()),
  rows: z.array(z.object({ dimension: z.string(), mine: Claim, theirs: z.array(Claim) })),
  takeaways: z.array(Claim), isDemo: z.boolean(),
});

// ---- 文案 ----
export const CopyStatus = z.enum(["draft", "in_review", "approved", "published", "failed"]);
export const CopyDraft = z.object({
  id: z.string(), accountId: z.string(), taskId: z.string(),
  title: z.string().optional(), body: z.string(), hashtags: z.array(z.string()),
  imagePrompt: z.string().optional(), rationale: z.array(Claim),
  status: CopyStatus, isDemo: z.boolean(),
});

// ---- 模型调用结果：失败和未配置不能当成功 ----
export const LlmResult = <T extends z.ZodTypeAny>(data: T) => z.discriminatedUnion("status", [
  z.object({ status: z.literal("ok"), data, model: z.string(), latencyMs: z.number() }),
  z.object({ status: z.literal("not_configured"), missing: z.array(z.enum(["LLM_BASE_URL","LLM_API_KEY","LLM_MODEL"])) }),
  z.object({ status: z.literal("error"), code: z.enum(["timeout","http","parse","rate_limit","unknown"]), message: z.string() }),
  z.object({ status: z.literal("demo"), data }), // 演示数据，界面必须挂演示标签
]);

export type Source = z.infer<typeof Source>;
export type Claim = z.infer<typeof Claim>;
export type QuestionCard = z.infer<typeof QuestionCard>;
export type Answer = z.infer<typeof Answer>;
export type AccountReport = z.infer<typeof AccountReport>;
export type CompetitorCompare = z.infer<typeof CompetitorCompare>;
export type CopyStatus = z.infer<typeof CopyStatus>;
export type CopyDraft = z.infer<typeof CopyDraft>;

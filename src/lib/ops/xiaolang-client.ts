import type { OpsLocale, WizardRecord } from "./flow";
import { clipCopy, demoQuestions, makeComparison, makeDemoCopy, makeDemoReport } from "./flow";

/** Tasks the wizard asks 小狼 to do. Swap this file for the teammate client. */
export type XiaolangTask = "questions" | "analysis" | "comparison" | "copy";

/**
 * Single entry the ops page calls for 小狼.
 * The current body is the demo fixture path. Replace this function with the
 * shared client, prompts, and fixtures without changing the page.
 */
export async function runXiaolang(
  record: WizardRecord,
  task: XiaolangTask,
  locale: OpsLocale,
): Promise<WizardRecord> {
  if (!record.account) throw new Error("account");
  const now = new Date().toISOString();
  if (task === "questions") {
    return {
      ...record,
      step: 2,
      questions: demoQuestions(record.account.id, record.taskId, locale),
      updatedAt: now,
    };
  }
  if (task === "analysis") return makeDemoReport(record, locale, now);
  if (task === "comparison") return makeComparison(record, locale, now);
  const next = makeDemoCopy(record, locale, now);
  if (!next.draft) return next;
  return { ...next, draft: { ...next.draft, body: clipCopy(next.draft.body) } };
}

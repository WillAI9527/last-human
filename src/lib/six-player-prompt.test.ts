import test from "node:test";
import assert from "node:assert/strict";
import { setLocale } from "@/i18n/locale-store";
import { createSixPlayerState } from "./six-player-isolation.test";
import { adaptPromptForSixPlayer, NO_SHERIFF_LINE_EN, NO_SHERIFF_LINE_ZH } from "./six-player-prompt";

process.env.NEXT_PUBLIC_SUPABASE_URL ||= "http://127.0.0.1:54321";
process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY ||= "k";

const FORBIDDEN = /警徽|警长|警上|上警|竞选|sheriff|badge|campaign/i;
// 允许的唯一出现：明确告诉模型“没有警长”的规则句
const ALLOWED = [/没有警长/, /no sheriff/i];

test("6 人局：所有阶段、中英文、第 1/2 天的 AI prompt 都不含警长/警徽/竞选概念", async () => {
  await import("@/lib/game-master");
  const { PhaseManager } = await import("@/game/core/PhaseManager");
  const leaks: string[] = [];
  let checked = 0;
  for (const loc of ["zh", "en"] as const) {
    setLocale(loc);
    for (const phase of ["NIGHT_WOLF_ACTION", "NIGHT_WITCH_ACTION", "NIGHT_SEER_ACTION", "DAY_SPEECH", "DAY_LAST_WORDS", "DAY_VOTE", "DAY_PK_SPEECH"] as const) {
      for (const day of [1, 2]) {
        const s = createSixPlayerState(phase);
        s.day = day;
        s.messages = s.messages.filter((m) => !FORBIDDEN.test(m.content));
        for (const pl of s.players.filter((p) => p.alive && !p.isHuman)) {
          let raw;
          try { raw = new PhaseManager().getPrompt(phase, { state: s, extras: { wolfTarget: 1 } } as never, pl); } catch { continue; }
          if (!raw) continue;
          const p = adaptPromptForSixPlayer(raw, loc);
          checked++;
          const text = [p.system, p.user, ...(p.systemParts ?? []).map((x) => x.text)].join("\n").split(NO_SHERIFF_LINE_ZH).join("").split(NO_SHERIFF_LINE_EN).join("");
          for (const line of text.split(/\n|。|\. /)) {
            if (FORBIDDEN.test(line) && !ALLOWED.some((a) => a.test(line))) leaks.push(`${loc} ${phase} d${day}: ${line.trim().slice(0, 160)}`);
          }
        }
      }
    }
  }
  assert.ok(checked > 40, `checked only ${checked} prompts`);
  assert.deepEqual([...new Set(leaks)], []);
});

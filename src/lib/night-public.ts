import { getI18n } from "@/i18n/translator";
import { addSystemMessage } from "@/lib/game-master";
import type { GameState } from "@/types/game";

/** Public night lines that name a role. Shared transcript, overlay, and cards must not show these. */
const NIGHT_ROLE_LEAKS = new Set([
  "守卫请睁眼",
  "狼人请睁眼",
  "女巫请睁眼",
  "预言家请睁眼",
  "守卫请闭眼",
  "狼人请闭眼",
  "女巫请闭眼",
  "预言家请闭眼",
  "狼人正在商量要击杀的目标…",
  "女巫正在决定是否使用药水…",
  "预言家正在选择要查验的对象…",
  "守卫正在选择要守护的对象…",
  "狼人正在选择目标",
  "女巫正在行动",
  "预言家正在查验",
  "Guard, open your eyes.",
  "Werewolves, open your eyes.",
  "Witch, open your eyes.",
  "Seer, open your eyes.",
  "Werewolves, open your eyes",
  "Witch, open your eyes",
  "Seer, open your eyes",
  "Werewolves are choosing a target",
  "Witch is acting",
  "Seer is checking",
  "The seer is choosing a target...",
  "Werewolves are deciding their target...",
  "The witch is deciding whether to use a potion...",
  "The guard is choosing a target...",
]);

export function publicNightActionLine(): string {
  return getI18n().t("system.publicNightAction");
}

export function isNightRoleLeak(content: string): boolean {
  return NIGHT_ROLE_LEAKS.has(content.trim());
}

/** Legacy saves and any missed path still render the generic public line. */
export function redactNightRoleLeak(content: string): string {
  return isNightRoleLeak(content) ? publicNightActionLine() : content;
}

/** One shared night beat. Repeating the same public line does not stack another message. */
export function addPublicNightBeat(state: GameState): GameState {
  const line = publicNightActionLine();
  const last = state.messages[state.messages.length - 1];
  if (last?.isSystem && last.content === line) return state;
  return addSystemMessage(state, line);
}

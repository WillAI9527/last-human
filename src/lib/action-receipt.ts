import type { Phase } from "@/types/game";

export type ActionReceiptKind = "commit" | "speech";

export interface ActionReceipt {
  text: string;
  kind: ActionReceiptKind;
}

function seatLabel(seat: number): string {
  return `${seat + 1}号`;
}

/** One-line receipt after the human confirms a seat action. Stays until the next phase. */
export function receiptForSeatAction(phase: Phase, targetSeat: number | null): ActionReceipt | null {
  if (targetSeat === null || targetSeat < 0) {
    if (phase === "HUNTER_SHOOT") return { kind: "commit", text: "✓ 已弃枪" };
    if (phase === "BADGE_TRANSFER") return { kind: "commit", text: "✓ 已撕毁警徽" };
    return null;
  }
  const seat = seatLabel(targetSeat);
  switch (phase) {
    case "DAY_VOTE":
    case "DAY_BADGE_ELECTION":
      return { kind: "commit", text: `✓ 已投 ${seat}` };
    case "NIGHT_SEER_ACTION":
      return { kind: "commit", text: `✓ 已查验 ${seat}` };
    case "NIGHT_WOLF_ACTION":
      return { kind: "commit", text: `✓ 已刀 ${seat}` };
    case "NIGHT_GUARD_ACTION":
      return { kind: "commit", text: `✓ 已守护 ${seat}` };
    case "HUNTER_SHOOT":
      return { kind: "commit", text: `✓ 已开枪 ${seat}` };
    case "BADGE_TRANSFER":
      return { kind: "commit", text: `✓ 已移交警徽给 ${seat}` };
    case "WHITE_WOLF_KING_BOOM":
      return { kind: "commit", text: `✓ 已自爆带走 ${seat}` };
    default:
      return null;
  }
}

export function receiptForWitch(
  action: "save" | "poison" | "pass",
  targetSeat: number,
): ActionReceipt {
  if (action === "pass") return { kind: "commit", text: "✓ 已跳过用药" };
  if (action === "save") return { kind: "commit", text: `✓ 已救 ${seatLabel(targetSeat)}` };
  return { kind: "commit", text: `✓ 已毒 ${seatLabel(targetSeat)}` };
}

export function receiptForSpeech(): ActionReceipt {
  return { kind: "speech", text: "✓ 已发言" };
}

export function receiptForFinishSpeech(): ActionReceipt {
  return { kind: "commit", text: "✓ 已结束发言" };
}

export function receiptForBadgeSignup(wants: boolean): ActionReceipt {
  return { kind: "commit", text: wants ? "✓ 已上警" : "✓ 已放弃上警" };
}

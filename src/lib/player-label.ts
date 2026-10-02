export function seatNumberLabel(seat: number): string {
  return `${seat + 1}号`;
}

/** Display label: seat first, then the name. `3号 · 老汉斯`. */
export function playerTitle(seat: number, name: string | undefined | null): string {
  const seatLabel = seatNumberLabel(seat);
  const trimmed = (name ?? "").trim();
  return trimmed ? `${seatLabel} · ${trimmed}` : seatLabel;
}

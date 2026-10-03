/**
 * Calibrated screen angles for the 3×3 head sprite.
 * 0° is right, 90° is down. These are measured from the contact sheet, not evenly spaced.
 */
export const WOLF_TURN_ANGLE_KEYS = [
  { deg: -90, frame: 1 },
  { deg: -51, frame: 2 },
  { deg: 3, frame: 3 },
  { deg: 30, frame: 4 },
  { deg: 90, frame: 5 },
  { deg: 150, frame: 6 },
  { deg: 177, frame: 7 },
  { deg: -141, frame: 8 },
] as const;

/** Inside this fraction of the short viewport side, the wolf looks straight ahead. */
export const WOLF_TURN_DEAD = 0.10;

export const WOLF_TURN_FRAME_COUNT = 9;

/** Nose sits at 50% / 53% of the stage. */
export const WOLF_TURN_NOSE = { x: 0.5, y: 0.53 } as const;

export function wolfSpritePosition(index: number) {
  return `${(index % 3) * 50}% ${Math.floor(index / 3) * 50}%`;
}

export function pickWolfFrame(
  px: number,
  py: number,
  noseX: number,
  noseY: number,
  viewportWidth: number,
  viewportHeight: number,
) {
  const dx = px - noseX;
  const dy = py - noseY;
  const shortSide = Math.min(viewportWidth, viewportHeight);
  if (Math.hypot(dx, dy) < shortSide * WOLF_TURN_DEAD) return 0;
  const angle = Math.atan2(dy, dx) * 180 / Math.PI;
  let best = 0;
  let bestDistance = 999;
  for (const key of WOLF_TURN_ANGLE_KEYS) {
    const distance = Math.abs(((angle - key.deg + 540) % 360) - 180);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = key.frame;
    }
  }
  return best;
}

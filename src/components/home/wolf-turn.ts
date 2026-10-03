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

/** Inside this fraction of the short viewport side, a turned head returns to front. */
export const WOLF_TURN_DEAD = 0.10;

/** A front head stays front until the pointer reaches this fraction of the short side. */
export const WOLF_TURN_DEAD_LEAVE = 0.12;

/** Degrees past the midpoint between adjacent keys before the head leaves the current key. */
export const HYSTERESIS_DEG = 10;

/** After the last touch ends, the head returns to front. */
export const IDLE_RETURN_MS = 1500;

/** A frame stays up at least this long; a newer target replaces any queued one. */
export const MIN_DWELL_MS = 120;

/** Per-sample lerp for gyroscope samples before they enter the same picker. */
export const GYRO_SMOOTH = 0.2;

export const WOLF_TURN_FRAME_COUNT = 9;

/** Nose sits at 50% / 53% of the stage. */
export const WOLF_TURN_NOSE = { x: 0.5, y: 0.53 } as const;

const ORDERED_ANGLE_KEYS = [...WOLF_TURN_ANGLE_KEYS].sort((a, b) => a.deg - b.deg);

export function wolfSpritePosition(index: number) {
  return `${(index % 3) * 50}% ${Math.floor(index / 3) * 50}%`;
}

/** Shortest signed arc from `fromDeg` to `toDeg`, in (-180, 180]. */
export function circularDelta(fromDeg: number, toDeg: number) {
  return ((toDeg - fromDeg + 540) % 360) - 180;
}

function nearestFrame(angle: number) {
  let best = 0;
  let bestDistance = 999;
  for (const key of WOLF_TURN_ANGLE_KEYS) {
    const distance = Math.abs(circularDelta(key.deg, angle));
    if (distance < bestDistance) {
      bestDistance = distance;
      best = key.frame;
    }
  }
  return best;
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
  return nearestFrame(angle);
}

export function pickWolfFrameHysteresis(input: {
  px: number;
  py: number;
  noseX: number;
  noseY: number;
  viewportWidth: number;
  viewportHeight: number;
  currentFrame: number;
}) {
  const dx = input.px - input.noseX;
  const dy = input.py - input.noseY;
  const radius = Math.hypot(dx, dy);
  const shortSide = Math.min(input.viewportWidth, input.viewportHeight);
  const enterFront = shortSide * WOLF_TURN_DEAD;
  const leaveFront = shortSide * WOLF_TURN_DEAD_LEAVE;

  if (input.currentFrame === 0) {
    if (radius < leaveFront) return 0;
    return nearestFrame(Math.atan2(dy, dx) * 180 / Math.PI);
  }

  if (radius < enterFront) return 0;

  const angle = Math.atan2(dy, dx) * 180 / Math.PI;
  const nearest = nearestFrame(angle);
  if (nearest === input.currentFrame) return input.currentFrame;

  const index = ORDERED_ANGLE_KEYS.findIndex((key) => key.frame === input.currentFrame);
  if (index < 0) return nearest;
  const currentKey = ORDERED_ANGLE_KEYS[index];
  const toward = circularDelta(currentKey.deg, angle);
  const neighbor = toward >= 0
    ? ORDERED_ANGLE_KEYS[(index + 1) % ORDERED_ANGLE_KEYS.length]
    : ORDERED_ANGLE_KEYS[(index - 1 + ORDERED_ANGLE_KEYS.length) % ORDERED_ANGLE_KEYS.length];
  const span = circularDelta(currentKey.deg, neighbor.deg);
  const boundary = currentKey.deg + span / 2;
  const pastBoundary = Math.sign(span) * circularDelta(boundary, angle);
  if (pastBoundary > HYSTERESIS_DEG) return nearest;
  return input.currentFrame;
}

export type WolfDwellState = {
  shown: number;
  shownAt: number;
  pending: number | null;
};

export function stepWolfDwell(state: WolfDwellState, target: number, now: number): WolfDwellState {
  if (target === state.shown) {
    return { shown: state.shown, shownAt: state.shownAt, pending: null };
  }
  if (now - state.shownAt >= MIN_DWELL_MS) {
    return { shown: target, shownAt: now, pending: null };
  }
  return { shown: state.shown, shownAt: state.shownAt, pending: target };
}

export function smoothPointer(
  previous: { x: number; y: number } | null,
  next: { x: number; y: number },
  factor = GYRO_SMOOTH,
) {
  if (!previous) return { x: next.x, y: next.y };
  return {
    x: previous.x + (next.x - previous.x) * factor,
    y: previous.y + (next.y - previous.y) * factor,
  };
}

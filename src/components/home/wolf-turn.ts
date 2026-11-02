/**
 * Calibrated screen angles for the head sprite.
 * 0° is right, 90° is down. Frame 0 is the neutral front portrait.
 */
export const WOLF_TURN_ANGLE_KEYS = Array.from({ length: 128 }, (_, index) => ({
  deg: index <= 96 ? -90 + index * 2.8125 : -450 + index * 2.8125,
  frame: index + 1,
}));

/** Inside this fraction of the short viewport side, a turned head returns to front. */
export const WOLF_TURN_DEAD = 0.025;

/** A front head stays front until the pointer reaches this fraction of the short side. */
export const WOLF_TURN_DEAD_LEAVE = 0.035;

/** Degrees past the midpoint between adjacent keys before the head leaves the current key. */
export const HYSTERESIS_DEG = 0.5;

/** After the last touch ends, the head returns to front. */
export const IDLE_RETURN_MS = 1500;

/** A frame stays up briefly enough to feel continuous while still avoiding shimmer. */
export const MIN_DWELL_MS = 32;

/** Per-sample lerp for gyroscope samples before they enter the same picker. */
export const GYRO_SMOOTH = 0.2;

/** Portrait heads need extra horizontal intent so ear corners are reachable. */
export const GAZE_X_WEIGHT = 1.42;

export const WOLF_TURN_FRAME_COUNT = 129;

export const WOLF_TURN_RING_FRAME_COUNT = WOLF_TURN_FRAME_COUNT - 1;

export const WOLF_TURN_SPRITE_COLS = 10;

export const WOLF_TURN_SPRITE_ROWS = 13;

/** Nose sits at about the visual center of the keyed wolf portrait. */
export const WOLF_TURN_NOSE = { x: 0.5, y: 0.43 } as const;

const ORDERED_ANGLE_KEYS = [...WOLF_TURN_ANGLE_KEYS].sort((a, b) => a.deg - b.deg);

export function wolfSpritePosition(index: number) {
  const x = WOLF_TURN_SPRITE_COLS <= 1 ? 0 : (index % WOLF_TURN_SPRITE_COLS) / (WOLF_TURN_SPRITE_COLS - 1) * 100;
  const y = WOLF_TURN_SPRITE_ROWS <= 1 ? 0 : Math.floor(index / WOLF_TURN_SPRITE_COLS) / (WOLF_TURN_SPRITE_ROWS - 1) * 100;
  return `${x}% ${y}%`;
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

function frameFloatForAngle(angle: number) {
  return 1 + ((angle + 90 + 360) % 360) / (360 / WOLF_TURN_RING_FRAME_COUNT);
}

function gazeAngle(dx: number, dy: number) {
  return Math.atan2(dy, dx * GAZE_X_WEIGHT) * 180 / Math.PI;
}

export function pickWolfFrameFloat(
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
  return frameFloatForAngle(gazeAngle(dx, dy));
}

export function wolfFrameBlend(frameFloat: number) {
  if (frameFloat <= 0) return { a: 0, b: 0, bOpacity: 0 };
  const ringValue = ((frameFloat - 1) % WOLF_TURN_RING_FRAME_COUNT + WOLF_TURN_RING_FRAME_COUNT) % WOLF_TURN_RING_FRAME_COUNT;
  const lower = Math.floor(ringValue);
  const bOpacity = ringValue - lower;
  return {
    a: lower + 1,
    b: (lower + 1) % WOLF_TURN_RING_FRAME_COUNT + 1,
    bOpacity,
  };
}

export function easeWolfFrameFloat(current: number, target: number, factor = 0.26) {
  if (target <= 0 || current <= 0) return current + (target - current) * factor;
  const ring = WOLF_TURN_RING_FRAME_COUNT;
  const from = current - 1;
  const to = target - 1;
  const delta = ((to - from + ring * 1.5) % ring) - ring / 2;
  return 1 + ((from + delta * factor) % ring + ring) % ring;
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
  const angle = gazeAngle(dx, dy);
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
    return nearestFrame(gazeAngle(dx, dy));
  }

  if (radius < enterFront) return 0;

  const angle = gazeAngle(dx, dy);
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

export function nextWolfFrameToward(current: number, target: number) {
  if (current === target) return current;
  if (current === 0 || target === 0) return target;
  const ring = WOLF_TURN_FRAME_COUNT - 1;
  const from = current - 1;
  const to = target - 1;
  const clockwise = (to - from + ring) % ring;
  const counter = (from - to + ring) % ring;
  if (clockwise <= counter) return (from + 1) % ring + 1;
  return (from - 1 + ring) % ring + 1;
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

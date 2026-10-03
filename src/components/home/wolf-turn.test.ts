import assert from "node:assert/strict";
import test from "node:test";
import {
  GYRO_SMOOTH,
  HYSTERESIS_DEG,
  IDLE_RETURN_MS,
  MIN_DWELL_MS,
  WOLF_TURN_ANGLE_KEYS,
  WOLF_TURN_DEAD,
  WOLF_TURN_DEAD_LEAVE,
  pickWolfFrame,
  pickWolfFrameHysteresis,
  smoothPointer,
  stepWolfDwell,
  wolfSpritePosition,
  type WolfDwellState,
} from "./wolf-turn";

test("sprite turn keeps the calibrated angle keys and dead zone", () => {
  assert.equal(WOLF_TURN_DEAD, 0.10);
  assert.deepEqual(WOLF_TURN_ANGLE_KEYS, [
    { deg: -90, frame: 1 },
    { deg: -51, frame: 2 },
    { deg: 3, frame: 3 },
    { deg: 30, frame: 4 },
    { deg: 90, frame: 5 },
    { deg: 150, frame: 6 },
    { deg: 177, frame: 7 },
    { deg: -141, frame: 8 },
  ]);
});

test("sprite cells run across the sheet in frame order", () => {
  assert.equal(wolfSpritePosition(0), "0% 0%");
  assert.equal(wolfSpritePosition(1), "50% 0%");
  assert.equal(wolfSpritePosition(2), "100% 0%");
  assert.equal(wolfSpritePosition(3), "0% 50%");
  assert.equal(wolfSpritePosition(5), "100% 50%");
  assert.equal(wolfSpritePosition(6), "0% 100%");
  assert.equal(wolfSpritePosition(8), "100% 100%");
});

test("the dead zone and the eight directions pick the contact-sheet frames", () => {
  const nose = { x: 500, y: 500 };
  const view = { w: 1000, h: 800 };
  const pick = (x: number, y: number) => pickWolfFrame(x, y, nose.x, nose.y, view.w, view.h);
  assert.equal(pick(500, 520), 0);
  assert.equal(pick(500, 100), 1);
  assert.equal(pick(700, 300), 2);
  assert.equal(pick(900, 500), 3);
  assert.equal(pick(700, 700), 4);
  assert.equal(pick(500, 900), 5);
  assert.equal(pick(300, 700), 6);
  assert.equal(pick(100, 500), 7);
  assert.equal(pick(300, 300), 8);
});

test("turn hold constants are the named interaction thresholds", () => {
  assert.equal(HYSTERESIS_DEG, 10);
  assert.equal(IDLE_RETURN_MS, 1500);
  assert.equal(MIN_DWELL_MS, 120);
  assert.equal(WOLF_TURN_DEAD, 0.10);
  assert.equal(WOLF_TURN_DEAD_LEAVE, 0.12);
  assert.equal(GYRO_SMOOTH, 0.2);
});

function pickHeld(angleDeg: number, radius: number, currentFrame: number) {
  const rad = angleDeg * Math.PI / 180;
  return pickWolfFrameHysteresis({
    px: 500 + Math.cos(rad) * radius,
    py: 500 + Math.sin(rad) * radius,
    noseX: 500,
    noseY: 500,
    viewportWidth: 1000,
    viewportHeight: 1000,
    currentFrame,
  });
}

test("a direction holds until the pointer is more than 10° past the midpoint", () => {
  // Right (3°) and down-right (30°) meet at 16.5°. Leave right after 26.5°, come back before 6.5°.
  assert.equal(pickHeld(20, 400, 3), 3);
  assert.equal(pickHeld(27, 400, 3), 4);
  assert.equal(pickHeld(10, 400, 4), 4);
  assert.equal(pickHeld(6, 400, 4), 3);

  // Right (3°) and up-right (-51°) meet at -24°.
  assert.equal(pickHeld(-30, 400, 3), 3);
  assert.equal(pickHeld(-35, 400, 3), 2);
  assert.equal(pickHeld(-20, 400, 2), 2);
  assert.equal(pickHeld(-13, 400, 2), 3);
});

test("a fast sweep commits the nearest key instead of the neighbour", () => {
  assert.equal(pickHeld(90, 400, 3), 5);
});

test("the dead zone uses a wider radius to leave front than to enter it", () => {
  assert.equal(pickHeld(0, 110, 0), 0);
  assert.equal(pickHeld(0, 130, 0), 3);
  assert.equal(pickHeld(0, 110, 3), 3);
  assert.equal(pickHeld(0, 90, 3), 0);
});

test("dwell keeps the shown frame and commits only the latest target", () => {
  let state: WolfDwellState = { shown: 3, shownAt: 0, pending: null };
  state = stepWolfDwell(state, 4, 50);
  assert.deepEqual(state, { shown: 3, shownAt: 0, pending: 4 });
  state = stepWolfDwell(state, 5, 80);
  assert.deepEqual(state, { shown: 3, shownAt: 0, pending: 5 });
  state = stepWolfDwell(state, 5, 120);
  assert.deepEqual(state, { shown: 5, shownAt: 120, pending: null });

  state = stepWolfDwell({ shown: 3, shownAt: 0, pending: 4 }, 3, 40);
  assert.deepEqual(state, { shown: 3, shownAt: 0, pending: null });
  state = stepWolfDwell(state, 3, 200);
  assert.deepEqual(state, { shown: 3, shownAt: 0, pending: null });
});

test("gyroscope samples ease toward the next point", () => {
  assert.deepEqual(smoothPointer(null, { x: 10, y: 20 }), { x: 10, y: 20 });
  assert.deepEqual(smoothPointer({ x: 0, y: 0 }, { x: 10, y: 20 }), { x: 2, y: 4 });
});

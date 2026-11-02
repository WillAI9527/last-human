import assert from "node:assert/strict";
import test from "node:test";
import {
  GYRO_SMOOTH,
  GAZE_X_WEIGHT,
  HYSTERESIS_DEG,
  IDLE_RETURN_MS,
  MIN_DWELL_MS,
  WOLF_TURN_ANGLE_KEYS,
  WOLF_TURN_DEAD,
  WOLF_TURN_DEAD_LEAVE,
  WOLF_TURN_FRAME_COUNT,
  nextWolfFrameToward,
  pickWolfFrame,
  pickWolfFrameHysteresis,
  smoothPointer,
  stepWolfDwell,
  wolfSpritePosition,
  type WolfDwellState,
} from "./wolf-turn";

test("sprite turn keeps the calibrated angle keys and dead zone", () => {
  assert.equal(WOLF_TURN_DEAD, 0.025);
  assert.equal(WOLF_TURN_FRAME_COUNT, 129);
  assert.equal(WOLF_TURN_ANGLE_KEYS.length, 128);
  assert.deepEqual(WOLF_TURN_ANGLE_KEYS.slice(0, 5), [
    { deg: -90.00, frame: 1 },
    { deg: -87.1875, frame: 2 },
    { deg: -84.375, frame: 3 },
    { deg: -81.5625, frame: 4 },
    { deg: -78.75, frame: 5 },
  ]);
  assert.deepEqual(WOLF_TURN_ANGLE_KEYS.slice(-4), [
    { deg: -101.25, frame: 125 },
    { deg: -98.4375, frame: 126 },
    { deg: -95.625, frame: 127 },
    { deg: -92.8125, frame: 128 },
  ]);
});

test("sprite cells run across the sheet in frame order", () => {
  assert.equal(wolfSpritePosition(0), "0% 0%");
  assert.equal(wolfSpritePosition(1), "11.11111111111111% 0%");
  assert.equal(wolfSpritePosition(9), "100% 0%");
  assert.equal(wolfSpritePosition(10), "0% 8.333333333333332%");
  assert.equal(wolfSpritePosition(128), "88.88888888888889% 100%");
});

test("the dead zone and the eight directions pick the contact-sheet frames", () => {
  const nose = { x: 500, y: 500 };
  const view = { w: 1000, h: 800 };
  const pick = (x: number, y: number) => pickWolfFrame(x, y, nose.x, nose.y, view.w, view.h);
  assert.equal(pick(500, 510), 0);
  assert.equal(pick(500, 100), 1);
  assert.equal(pick(700, 300), 21);
  assert.equal(pick(900, 500), 33);
  assert.equal(pick(700, 700), 45);
  assert.equal(pick(500, 900), 65);
  assert.equal(pick(300, 700), 85);
  assert.equal(pick(100, 500), 97);
  assert.equal(pick(300, 300), 109);
});

test("turn hold constants are the named interaction thresholds", () => {
  assert.equal(HYSTERESIS_DEG, 0.5);
  assert.equal(IDLE_RETURN_MS, 1500);
  assert.equal(MIN_DWELL_MS, 32);
  assert.equal(WOLF_TURN_DEAD, 0.025);
  assert.equal(WOLF_TURN_DEAD_LEAVE, 0.035);
  assert.equal(GYRO_SMOOTH, 0.2);
  assert.equal(GAZE_X_WEIGHT, 1.42);
});

test("ear-corner targets reach the diagonal gaze frames", () => {
  const nose = { x: 500, y: 500 };
  const view = { w: 1000, h: 800 };
  const pick = (x: number, y: number) => pickWolfFrame(x, y, nose.x, nose.y, view.w, view.h);
  assert.equal(pick(260, 140), 114);
  assert.equal(pick(740, 140), 16);
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

test("a direction holds until the pointer is past the narrow midpoint buffer", () => {
  assert.equal(pickHeld(1, 400, 33), 33);
  assert.equal(pickHeld(3, 400, 33), 34);
  assert.equal(pickHeld(2, 400, 34), 34);
  assert.equal(pickHeld(1, 400, 34), 33);

  assert.equal(pickHeld(-1, 400, 33), 33);
  assert.equal(pickHeld(-3, 400, 33), 32);
  assert.equal(pickHeld(-2, 400, 32), 32);
  assert.equal(pickHeld(-1, 400, 32), 33);
});

test("a fast sweep commits the nearest key instead of the neighbour", () => {
  assert.equal(pickHeld(90, 400, 33), 65);
});

test("the dead zone uses a wider radius to leave front than to enter it", () => {
  assert.equal(pickHeld(0, 30, 0), 0);
  assert.equal(pickHeld(0, 40, 0), 33);
  assert.equal(pickHeld(0, 30, 33), 33);
  assert.equal(pickHeld(0, 20, 33), 0);
});

test("continuous turn advances one sprite frame along the shortest ring path", () => {
  assert.equal(nextWolfFrameToward(0, 65), 65);
  assert.equal(nextWolfFrameToward(33, 65), 34);
  assert.equal(nextWolfFrameToward(65, 33), 64);
  assert.equal(nextWolfFrameToward(128, 2), 1);
  assert.equal(nextWolfFrameToward(2, 128), 1);
  assert.equal(nextWolfFrameToward(12, 0), 0);
});

test("dwell keeps the shown frame and commits only the latest target", () => {
  let state: WolfDwellState = { shown: 3, shownAt: 0, pending: null };
  state = stepWolfDwell(state, 4, 20);
  assert.deepEqual(state, { shown: 3, shownAt: 0, pending: 4 });
  state = stepWolfDwell(state, 5, 28);
  assert.deepEqual(state, { shown: 3, shownAt: 0, pending: 5 });
  state = stepWolfDwell(state, 5, 32);
  assert.deepEqual(state, { shown: 5, shownAt: 32, pending: null });

  state = stepWolfDwell({ shown: 3, shownAt: 0, pending: 4 }, 3, 20);
  assert.deepEqual(state, { shown: 3, shownAt: 0, pending: null });
  state = stepWolfDwell(state, 3, 200);
  assert.deepEqual(state, { shown: 3, shownAt: 0, pending: null });
});

test("gyroscope samples ease toward the next point", () => {
  assert.deepEqual(smoothPointer(null, { x: 10, y: 20 }), { x: 10, y: 20 });
  assert.deepEqual(smoothPointer({ x: 0, y: 0 }, { x: 10, y: 20 }), { x: 2, y: 4 });
});

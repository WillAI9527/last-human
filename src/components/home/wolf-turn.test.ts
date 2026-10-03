import assert from "node:assert/strict";
import test from "node:test";
import {
  WOLF_TURN_ANGLE_KEYS,
  WOLF_TURN_DEAD,
  pickWolfFrame,
  wolfSpritePosition,
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

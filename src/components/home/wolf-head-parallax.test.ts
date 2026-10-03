import assert from "node:assert/strict";
import test from "node:test";
import {
  WOLF_PARALLAX_EYES,
  WOLF_PARALLAX_FRAGMENT,
  WOLF_PARALLAX_HB,
  WOLF_PARALLAX_LERP,
  WOLF_PARALLAX_S,
  canvasBackingSize,
  eyeDepthShift,
} from "./wolf-head-parallax";

test("head parallax keeps the prototype strength constants", () => {
  assert.equal(WOLF_PARALLAX_S, 0.022);
  assert.equal(WOLF_PARALLAX_HB, 1.6);
  assert.equal(WOLF_PARALLAX_LERP, 0.1);
  assert.deepEqual(WOLF_PARALLAX_EYES, [
    [0.451, 0.311],
    [0.548, 0.310],
  ]);
  assert.match(WOLF_PARALLAX_FRAGMENT, /for\(int i=0;i<3;i\+\+\)/);
  assert.match(WOLF_PARALLAX_FRAGMENT, /u=uv-m\*S\*\(\(d\.r-\.35\)\+HB\*d\.g\*\(d\.r-\.2\)\)/);
});

test("eye overlay shift uses depth at the eye texel", () => {
  const w = 10;
  const h = 10;
  const d = new Uint8ClampedArray(w * h * 4);
  const i = (5 * w + 5) * 4;
  d[i] = 255;
  d[i + 1] = 255;
  const [dx, dy] = eyeDepthShift({ w, h, d }, 0.5, 0.5, 1, -1);
  const k = WOLF_PARALLAX_S * ((1 - 0.35) + WOLF_PARALLAX_HB * 1 * (1 - 0.2));
  assert.ok(Math.abs(dx - k) < 1e-12);
  assert.ok(Math.abs(dy + k) < 1e-12);
});

test("canvas backing store respects the dpr and width caps", () => {
  assert.deepEqual(canvasBackingSize(1000, 500, 3), { width: 2000, height: 1000 });
  assert.deepEqual(canvasBackingSize(2000, 1000, 2), { width: 2048, height: 1024 });
  assert.deepEqual(canvasBackingSize(390, 220, 1), { width: 390, height: 220 });
});

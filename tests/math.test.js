import { test, expect } from 'vitest';
import { dirFromYawPitch, segCircle, rayPointDist, lerpAngle } from '../src/core/math.js';

test('dirFromYawPitch follows the yaw convention', () => {
  expect(dirFromYawPitch(0, 0)).toEqual([expect.closeTo(0), expect.closeTo(0), expect.closeTo(-1)]);
  expect(dirFromYawPitch(Math.PI / 2, 0)[0]).toBeCloseTo(-1);
  expect(dirFromYawPitch(0, Math.PI / 2)[1]).toBeCloseTo(1);
});
test('segCircle', () => {
  expect(segCircle(-2, 0, 2, 0, 0, 0.5, 1)).toBe(true);
  expect(segCircle(-2, 0, 2, 0, 0, 1.5, 1)).toBe(false);
  expect(segCircle(-2, 0, -1.5, 0, 0, 0, 1)).toBe(false); // segment ends short
});
test('rayPointDist ignores points behind the origin', () => {
  expect(rayPointDist([0,0,0],[0,0,-1],[0.5,0,-4])).toEqual({ d: expect.closeTo(0.5), t: expect.closeTo(4) });
  expect(rayPointDist([0,0,0],[0,0,-1],[0,0,3]).t).toBe(0);
});
test('lerpAngle takes the short way round', () => {
  expect(Math.abs(lerpAngle(3.1, -3.1, 0.5))).toBeCloseTo(Math.PI, 1);
});

import { rng } from '../src/core/math.js';
test('rng is seeded, in [0,1), and varies by seed', () => {
  const a = rng(42), b = rng(42), c = rng(43);
  const xs = [a(), a(), a()], ys = [b(), b(), b()];
  expect(xs).toEqual(ys);
  expect(xs.every((v) => v >= 0 && v < 1)).toBe(true);
  expect(c()).not.toBe(xs[0]);
});

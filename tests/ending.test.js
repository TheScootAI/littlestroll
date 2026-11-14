import { test, expect } from 'vitest';
import { endingProgress, END_SECS, END_CARD } from '../src/core/ending.js';

test('endingProgress: 0 at the start, 1 once the ease time has passed, card at END_CARD', () => {
  expect(endingProgress(0)).toEqual({ k: 0, card: false });
  expect(endingProgress(END_SECS / 2).k).toBeCloseTo(0.5, 6);
  expect(endingProgress(END_SECS).k).toBe(1);
  expect(endingProgress(END_SECS + 100).k).toBe(1);
  expect(endingProgress(END_CARD - 0.01).card).toBe(false);
  expect(endingProgress(END_CARD).card).toBe(true);
  expect(endingProgress(-3)).toEqual({ k: 0, card: false });
  expect(endingProgress(NaN)).toEqual({ k: 0, card: false });
});

test('the card is due at the same real time however many updates ran (wall clock, no per-update dt)', () => {
  const start = 1000;
  for (const updates of [1, 3, 44, 600]) {
    let shownAt = null;
    const step = (END_CARD * 1000 + 50) / updates;
    for (let i = 1; i <= updates; i++) {
      const now = start + i * step;
      if (shownAt === null && endingProgress((now - start) / 1000).card) shownAt = now - start;
    }
    expect(shownAt).toBeLessThanOrEqual(END_CARD * 1000 + 51);
    expect(shownAt).toBeGreaterThanOrEqual(END_CARD * 1000);
  }
});

import { endShot } from '../src/core/ending.js';

const horiz = (a, b) => Math.hypot(b[0] - a[0], b[2] - a[2]);
const bearing = (dx, dz) => Math.atan2(dx, dz);
const angleBetween = (a, b) => { let d = Math.abs(a - b) % (2 * Math.PI); return d > Math.PI ? 2 * Math.PI - d : d; };

test('endShot: the camera stands 20-35 m off the focus horizontally and above it, looking back past it, below it', () => {
  const cases = [[[152.5, 30, -162], [144, -37]], [[0, 5, 0], [0, 100]], [[10, 12, 10], [-90, 10]], [[-5, 0, 3], [200, 3]]];
  for (const [focus, behind] of cases) {
    const { pos, look } = endShot(focus, behind);
    const d = horiz(focus, pos);
    expect(d).toBeGreaterThanOrEqual(20); expect(d).toBeLessThanOrEqual(35);
    expect(pos[1]).toBeGreaterThan(focus[1]);
    expect(look[1]).toBeLessThan(focus[1]);
    const toBehind = bearing(behind[0] - focus[0], behind[1] - focus[2]);
    expect(angleBetween(bearing(look[0] - pos[0], look[2] - pos[2]), toBehind)).toBeLessThan(20 * Math.PI / 180);
    // the camera is on the far side of the focus from `behind`
    expect((pos[0] - focus[0]) * (behind[0] - focus[0]) + (pos[2] - focus[2]) * (behind[1] - focus[2])).toBeLessThan(0);
    expect([...pos, ...look].every(Number.isFinite)).toBe(true);
  }
});

test('endShot: a focus on top of `behind` still gives a finite shot', () => {
  const { pos, look } = endShot([1, 2, 3], [1, 3]);
  expect([...pos, ...look].every(Number.isFinite)).toBe(true);
});

// Where the focus lands in a 60-degree-vertical-FOV frame: 0 = top edge, 1 = bottom edge.
const frameY = (pos, look, focus) => {
  const sub = (a, b) => a.map((v, i) => v - b[i]), dot = (a, b) => a.reduce((s, v, i) => s + v * b[i], 0);
  const n = (a) => { const l = Math.hypot(...a); return a.map((v) => v / l); };
  const f = n(sub(look, pos)), r = n([f[2], 0, -f[0]]), u = [r[1] * f[2] - r[2] * f[1], r[2] * f[0] - r[0] * f[2], r[0] * f[1] - r[1] * f[0]];
  const v = sub(focus, pos), up = Math.abs(u[1]) > 0 ? (u[1] < 0 ? u.map((x) => -x) : u) : u;
  return 0.5 - (dot(v, up) / dot(v, f)) / (2 * Math.tan(Math.PI / 6));
};

test('endShot: the focus lands 35-40% of the way down the frame, clear of the card in the lower half', () => {
  for (const [focus, behind] of [[[152.5, 32, -162], [144, -37]], [[0, 5, 0], [0, 100]], [[10, 12, 10], [-90, 10]]]) {
    const { pos, look } = endShot(focus, behind);
    const y = frameY(pos, look, focus);
    expect(y).toBeGreaterThan(0.33); expect(y).toBeLessThan(0.42);
  }
});

import { test, expect } from 'vitest';
import { FINDS, FOUND_R, FOUND_DY, NAMES, create, step, count, countBy, wornMask, valid, news } from '../src/puzzles/finds.js';
import { SITES, heightAt } from '../src/world/layout.js';

const P = (x, z, o = {}) => ({ present: true, x, y: heightAt(x, z), z, aim: [0, 0, -1], hold: false, pressed: false, ...o });
const FAR = P(0, 1000);
const [fx, fz] = SITES.finds[3];
const only = (i, who) => create().map((_, k) => (k === i ? who : -1));

test('ten finds, none found at the start; ten distinct names', () => {
  expect(FINDS).toBe(10);
  expect(SITES.finds.length).toBe(FINDS);
  expect(create()).toEqual(Array(10).fill(-1));
  expect(NAMES).toHaveLength(10);
  expect(new Set(NAMES).size).toBe(10);
  expect(NAMES[9]).toBe('pirate hat');
});
test('a walker within reach finds it and becomes its owner; just outside does not', () => {
  expect(step(create(), [P(fx + 1.1, fz), FAR])).toEqual(only(3, 0));
  expect(step(create(), [FAR, P(fx, fz + FOUND_R - 0.01)])).toEqual(only(3, 1));
  expect(step(create(), [P(fx + 1.3, fz), FAR])).toEqual(create());
});
test('a walker also has to be at its height: 1 m away on the ground finds it, 5 m above or below does not', () => {
  const gy = heightAt(fx, fz);
  expect(FOUND_DY).toBe(1.5);
  expect(step(create(), [P(fx + 1, fz, { y: gy }), FAR])).toEqual(only(3, 0));
  expect(step(create(), [P(fx + 1, fz, { y: gy + 1.4 }), FAR])).toEqual(only(3, 0));
  expect(step(create(), [P(fx + 1, fz, { y: gy + 5 }), FAR])).toEqual(create());
  expect(step(create(), [P(fx + 1, fz, { y: gy - 5 }), FAR])).toEqual(create());
  expect(step(create(), [P(fx, fz, { y: gy + 1.6 }), FAR])).toEqual(create());
});
test('an absent walker finds nothing', () => {
  expect(step(create(), [{ present: false, x: fx, z: fz }, { present: false }])).toEqual(create());
  expect(step(create(), [undefined, null])).toEqual(create());
});
test('found for good: the other walker standing there later changes nothing', () => {
  const f = step(create(), [P(fx, fz), FAR]);
  expect(step(f, [FAR, P(fx, fz)])).toBe(f);
  expect(step(f, [FAR, FAR])).toBe(f);
  expect(step(f, [])).toBe(f);
  expect(f[3]).toBe(0);
});
test('both in reach in one tick: the nearer gets it; an exact tie goes to the host', () => {
  expect(step(create(), [P(fx + 1, fz), P(fx + 0.5, fz)])[3]).toBe(1);
  expect(step(create(), [P(fx + 0.5, fz), P(fx + 1, fz)])[3]).toBe(0);
  expect(step(create(), [P(fx + 0.7, fz), P(fx - 0.7, fz)])[3]).toBe(0);
  expect(step(create(), [P(fx, fz + 0.7), P(fx, fz - 0.7)])[3]).toBe(0);
});
test('step returns the same array when nothing changed and never mutates its argument', () => {
  const a = create();
  expect(step(a, [FAR, FAR])).toBe(a);
  const frozen = Object.freeze(create());
  const b = step(frozen, [P(fx, fz), FAR]);
  expect(b).not.toBe(frozen);
  expect(frozen).toEqual(create());
  expect(b[3]).toBe(0);
});
test('each find is found at its own site', () => {
  SITES.finds.forEach(([x, z], i) => expect(step(create(), [P(x, z), FAR])).toEqual(only(i, 0)));
});
test('finds are more than 2 x FOUND_R apart, so one walker never finds two at once (restored from the owl tests)', () => {
  for (let i = 0; i < FINDS; i++) for (let j = i + 1; j < FINDS; j++) {
    expect(Math.hypot(SITES.finds[i][0] - SITES.finds[j][0], SITES.finds[i][1] - SITES.finds[j][1]), `${i}, ${j}`).toBeGreaterThan(2 * FOUND_R);
  }
});
test('count, countBy, wornMask on a mixed array', () => {
  const f = [0, -1, 1, 1, -1, -1, 0, -1, -1, 1];
  expect(count(create())).toBe(0);
  expect(count(f)).toBe(5);
  expect(count(Array(10).fill(1))).toBe(10);
  expect(countBy(f, 0)).toBe(2);
  expect(countBy(f, 1)).toBe(3);
  expect(wornMask(f, 0)).toBe((1 << 0) | (1 << 6));
  expect(wornMask(f, 1)).toBe((1 << 2) | (1 << 3) | (1 << 9));
  expect(wornMask(create(), 0)).toBe(0);
});
test('news: no baseline, no lines; one new find reads right for each walker; two at once in index order; nothing new, none', () => {
  const a = create(), b = a.map((v, i) => (i === 4 ? 1 : v));
  expect(news(null, b, 0)).toEqual({ lines: [], next: b });
  expect(news(undefined, b, 1)).toEqual({ lines: [], next: b });
  expect(news(a, b, 1).lines).toEqual(['You found the backpack']);
  expect(news(a, b, 0).lines).toEqual(['Your friend found the backpack']);
  const c = b.map((v, i) => (i === 1 ? 0 : i === 9 ? 1 : v));
  expect(news(b, c, 0).lines).toEqual(['You found the boots', 'Your friend found the pirate hat']);
  expect(news(b, c, 1).lines).toEqual(['Your friend found the boots', 'You found the pirate hat']);
  expect(news(c, c, 0)).toEqual({ lines: [], next: c });
});
test('valid: every array step can produce; not the old bitmask, null, wrong length or bad entries', () => {
  expect(valid(create())).toBe(true);
  expect(valid(step(create(), [P(fx, fz), P(...SITES.finds[9])]))).toBe(true);
  expect(valid(Array(10).fill(1))).toBe(true);
  expect(valid([0, 1, -1, 0, 1, -1, 0, 1, -1, 0])).toBe(true);
  for (const v of [511, 0, null, undefined, {}, 'x', Array(9).fill(-1), Array(11).fill(-1)]) expect(valid(v)).toBe(false);
  for (const bad of [2, -2, 0.5, '0', NaN, null, undefined, Infinity]) expect(valid(create().map((x, i) => (i === 5 ? bad : x)))).toBe(false);
});
test('the ninth find hides behind the boulder and the round tree east of the Signal\'s dials; the first sits between the lookout\'s pines', () => {
  expect(SITES.finds[0]).toEqual([-35.3, 70.8]);
  expect(SITES.finds[8]).toEqual([11.1, 80.2]);
  expect(step(create(), [P(...SITES.finds[8]), FAR])).toEqual(only(8, 0));
});

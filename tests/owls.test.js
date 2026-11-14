import { test, expect } from 'vitest';
import { OWLS, FOUND_R, FOUND_DY, create, step, count, valid, news } from '../src/puzzles/owls.js';
import { SITES, heightAt } from '../src/world/layout.js';

const P = (x, z, o = {}) => ({ present: true, x, y: heightAt(x, z), z, aim: [0, 0, -1], hold: false, pressed: false, ...o });
const [ox, oz] = SITES.owls[3];

test('eight owls, none found at the start', () => {
  expect(OWLS).toBe(8);
  expect(SITES.owls.length).toBe(OWLS);
  expect(create()).toBe(0);
});
test('a walker within reach finds an owl; just outside does not', () => {
  expect(step(0, [P(ox + 1.1, oz), P(0, 1000)])).toBe(1 << 3);
  expect(step(0, [P(0, 1000), P(ox, oz + FOUND_R - 0.01)])).toBe(1 << 3);
  expect(step(0, [P(ox + 1.3, oz), P(0, 1000)])).toBe(0);
});
test('a walker also has to be at the owl\'s height: 1 m away on the ground finds it, 5 m above or below does not', () => {
  const gy = heightAt(ox, oz);
  expect(FOUND_DY).toBe(1.5);
  expect(step(0, [P(ox + 1, oz, { y: gy }), P(0, 1000)])).toBe(1 << 3);
  expect(step(0, [P(ox + 1, oz, { y: gy + 1.4 }), P(0, 1000)])).toBe(1 << 3);
  expect(step(0, [P(ox + 1, oz, { y: gy + 5 }), P(0, 1000)])).toBe(0);
  expect(step(0, [P(ox + 1, oz, { y: gy - 5 }), P(0, 1000)])).toBe(0);
  expect(step(0, [P(ox, oz, { y: gy + 1.6 }), P(0, 1000)])).toBe(0);
});
test('an absent walker finds nothing', () => {
  expect(step(0, [{ present: false, x: ox, z: oz }, { present: false }])).toBe(0);
  expect(step(0, [undefined, null])).toBe(0);
});
test('a found owl stays found', () => {
  const m = step(0, [P(ox, oz), P(0, 1000)]);
  expect(step(m, [P(0, 1000), P(0, 1000)])).toBe(m);
  expect(step(m, [])).toBe(m);
});
test('owls are more than 2.4 m apart, so one walker never finds two at once', () => {
  for (let i = 0; i < OWLS; i++) for (let j = i + 1; j < OWLS; j++) {
    expect(Math.hypot(SITES.owls[i][0] - SITES.owls[j][0], SITES.owls[i][1] - SITES.owls[j][1])).toBeGreaterThan(2.4);
  }
});
test('each owl is found at its own site', () => {
  SITES.owls.forEach(([x, z], i) => expect(step(0, [P(x, z), P(0, 1000)])).toBe(1 << i));
});
test('count', () => {
  expect(count(0)).toBe(0);
  expect(count(255)).toBe(8);
  expect(count(0b10100101)).toBe(4);
});
test('valid', () => {
  for (const v of [0, 1, 255]) expect(valid(v)).toBe(true);
  for (const v of [256, -1, 1.5, NaN, Infinity, '3', null, undefined, {}]) expect(valid(v)).toBe(false);
});

test('news: no baseline, no line; a rise gives one line with the total; no change or a fall gives none', () => {
  expect(news(null, 3)).toEqual({ line: null, next: 3 });
  expect(news(undefined, 0)).toEqual({ line: null, next: 0 });
  expect(news(2, 3)).toEqual({ line: 'An owl — 3 of 8', next: 3 });
  expect(news(2, 4)).toEqual({ line: 'An owl — 4 of 8', next: 4 });
  expect(news(0, 1).line).toBe('An owl — 1 of 8');
  expect(news(3, 3)).toEqual({ line: null, next: 3 });
  expect(news(5, 2)).toEqual({ line: null, next: 2 });
  // a reset (as after a welcome) puts the baseline back to null: the next state only sets it
  let prev = news(null, 6).next;
  expect(prev).toBe(6);
  expect(news(prev, 7).line).toBe('An owl — 7 of 8');
});

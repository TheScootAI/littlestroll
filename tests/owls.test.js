import { test, expect } from 'vitest';
import { OWLS, FOUND_R, create, step, count, valid } from '../src/puzzles/owls.js';
import { SITES } from '../src/world/layout.js';

const P = (x, z, o = {}) => ({ present: true, x, y: 0, z, aim: [0, 0, -1], hold: false, pressed: false, ...o });
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

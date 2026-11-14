import { test, expect } from 'vitest';
import { STONES, LEN, REACH, facePos, deal, create, inside, bothInside, atSpot, seesFace, step, prompt, valid, forceSolve } from '../src/puzzles/ring.js';
import { createAll, stepAll, dynOf } from '../src/puzzles/index.js';
import { SITES } from '../src/world/layout.js';

const R = SITES.ring;
const P = (xz, o = {}) => ({ present: true, x: xz[0], y: 0, z: xz[1], aim: [0, 0, -1], hold: false, pressed: false, ...o });
const gone = { present: false };
const centre = R.centre;
const out = [R.centre[0], R.centre[1] + 20];
const spot = (i) => [R.seeing[i].spot.x, R.seeing[i].spot.z];
// a walker beside stone k (0.5 m towards the centre), pressing
const by = (k, o = {}) => {
  const [sx, sz] = R.stones[k], d = Math.hypot(centre[0] - sx, centre[1] - sz);
  return P([sx + (centre[0] - sx) * 0.5 / d, sz + (centre[1] - sz) * 0.5 / d], o);
};
const touch = (s, k, other = P(centre)) => step(s, [by(k, { pressed: true }), other], 0.05);
const run = (s, secs, a = P(centre), b = P(centre)) => { for (let t = 0; t < secs; t += 0.05) step(s, [a, b], 0.05); };

test('constants', () => { expect([STONES, LEN, REACH]).toEqual([8, 4, 1.5]); });

test('deal is deterministic, a permutation of 0-7 with four different stones, and varies with the seed', () => {
  expect(deal(5)).toEqual(deal(5));
  const seen = new Set();
  for (let seed = 0; seed < 200; seed++) {
    const { signs, order } = deal(seed);
    expect([...signs].sort()).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    expect(order).toHaveLength(4);
    expect(new Set(order).size).toBe(4);
    expect(order.every((i) => Number.isInteger(i) && i >= 0 && i < 8)).toBe(true);
    seen.add(JSON.stringify(deal(seed)));
  }
  expect(seen.size).toBeGreaterThanOrEqual(150);
});

test('create holds the deal and a clean slate', () => {
  const s = create(3);
  expect(s).toMatchObject({ ...deal(3), touched: [], miss: 999, steps: 0, solved: false });
});

test('inside, bothInside, atSpot', () => {
  expect(inside(P(centre))).toBe(true);
  expect(inside(P(R.entrance))).toBe(true);
  expect(inside(P(out))).toBe(false);
  expect(inside(gone)).toBe(false);
  expect(bothInside([P(centre), P(centre)])).toBe(true);
  expect(bothInside([P(centre), P(out)])).toBe(false);
  expect(bothInside([P(centre), gone])).toBe(false);
  expect(atSpot(P(spot(0)), 0)).toBe(true);
  expect(atSpot(P(spot(0)), 1)).toBe(false);
  expect(atSpot(P([spot(1)[0] + 1.6, spot(1)[1]]), 1)).toBe(false);
  expect(atSpot(gone, 0)).toBe(false);
});

test('one walker alone cannot touch anything', () => {
  const s = create(1);
  for (const k of s.order) step(s, [by(k, { pressed: true }), gone], 0.05);
  for (const k of s.order) step(s, [gone, by(k, { pressed: true })], 0.05);
  expect(s.touched).toEqual([]);
});

test('two walkers, one outside the ring: nothing counts', () => {
  const s = create(1);
  for (const k of s.order) touch(s, k, P(out));
  expect(s.touched).toEqual([]);
});

test('both inside, the right four in order: solved, stones stay lit, the steps rise only after 2.5 s', () => {
  const s = create(2);
  for (const k of s.order) touch(s, k);
  expect(s.solved).toBe(true);
  expect(s.touched).toEqual(s.order);
  const S = createAll(2); S.ring = s;
  expect(dynOf(S).ring).toBe(false);
  run(s, 1.2);
  expect(s.steps).toBeGreaterThan(0); expect(s.steps).toBeLessThan(1);
  expect(dynOf(S).ring).toBe(false);
  run(s, 1.5);
  expect(s.steps).toBe(1);
  expect(dynOf(S).ring).toBe(true);
  expect(s.touched).toEqual(s.order);
});

test('a wrong stone lights exactly like a right one and gives nothing away', () => {
  const s = create(4);
  const wrong = [0, 1, 2, 3, 4, 5, 6, 7].filter((k) => !s.order.includes(k));
  touch(s, wrong[0]); expect(s.touched).toEqual([wrong[0]]);
  touch(s, s.order[0]); expect(s.touched).toEqual([wrong[0], s.order[0]]);
  touch(s, wrong[1]); expect(s.touched).toEqual([wrong[0], s.order[0], wrong[1]]);
  expect(s.miss).toBe(999);
  expect(s.solved).toBe(false);
});

test('four that are not the order (even the right four in the wrong order) go out; the deal stays', () => {
  const s = create(6);
  const deal0 = JSON.stringify({ signs: s.signs, order: s.order });
  for (const k of [...s.order].reverse()) touch(s, k);
  expect(s.touched).toEqual([]); expect(s.miss).toBe(0); expect(s.solved).toBe(false);
  expect(JSON.stringify({ signs: s.signs, order: s.order })).toBe(deal0);
  run(s, 1); expect(s.miss).toBeCloseTo(1, 1);
  for (const k of s.order) touch(s, k);
  expect(s.solved).toBe(true);
});

test('a wrong four with other stones also clears', () => {
  const s = create(6);
  const wrong = [0, 1, 2, 3, 4, 5, 6, 7].filter((k) => !s.order.includes(k));
  for (const k of wrong.slice(0, 4)) touch(s, k);
  expect(s.touched).toEqual([]); expect(s.miss).toBe(0);
});

test('touching a lit stone does nothing', () => {
  const s = create(1);
  touch(s, 2); touch(s, 2); touch(s, 2);
  expect(s.touched).toEqual([2]);
});

test('a touch 1.6 m from a stone is not a touch; a touch in reach lands on that stone', () => {
  const s = create(1);
  const [sx, sz] = R.stones[3];
  const d = Math.hypot(centre[0] - sx, centre[1] - sz);
  const at = (m) => P([sx + (centre[0] - sx) * m / d, sz + (centre[1] - sz) * m / d], { pressed: true });
  step(s, [at(1.6), P(centre)], 0.05);
  expect(s.touched).toEqual([]);
  // 1.4 m from stone 7 on the line towards stone 0: in reach of 7 only
  const a = R.stones[7], b = R.stones[0], f = 1.4 / Math.hypot(b[0] - a[0], b[1] - a[1]);
  step(s, [P([a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f], { pressed: true }), P(centre)], 0.05);
  expect(s.touched).toEqual([7]);
});

test('both pressing in one tick: the host is recorded first', () => {
  const s = create(1);
  step(s, [by(5, { pressed: true }), by(1, { pressed: true })], 0.05);
  expect(s.touched).toEqual([5, 1]);
});

test('a walker leaving mid-order keeps touched, but touches stop counting', () => {
  const s = create(1);
  touch(s, 0);
  step(s, [by(1, { pressed: true }), P(out)], 0.05);
  expect(s.touched).toEqual([0]);
  step(s, [gone, gone], 0.05);
  expect(s.touched).toEqual([0]);
  touch(s, 1);
  expect(s.touched).toEqual([0, 1]);
});

test('seesFace over the whole table', () => {
  const s = create(1);
  const A = P(spot(0)), B = P(spot(1)), C = P(centre);
  expect(seesFace(s, 0, [A, gone], 0)).toBe(false);
  expect(seesFace(s, 0, [A, C], 0)).toBe(false);
  expect(seesFace(s, 0, [C, B], 0)).toBe(false);
  expect(seesFace(s, 0, [A, B], 0)).toBe(true);
  expect(seesFace(s, 1, [A, B], 0)).toBe(false);
  expect(seesFace(s, 1, [A, B], 1)).toBe(true);
  expect(seesFace(s, 0, [A, B], 1)).toBe(false);
  // swapped
  expect(seesFace(s, 1, [B, A], 0)).toBe(true);
  expect(seesFace(s, 0, [B, A], 0)).toBe(false);
  expect(seesFace(s, 0, [B, A], 1)).toBe(true);
  expect(seesFace(s, 1, [B, A], 1)).toBe(false);
  // both at the same spot: no
  expect(seesFace(s, 0, [A, A], 0)).toBe(false);
  s.solved = true;
  expect(seesFace(s, 0, [C, C], 0)).toBe(true);
  expect(seesFace(s, 1, [gone, gone], 1)).toBe(true);
});

test('prompt only beside a stone with both inside and not solved', () => {
  const s = create(1);
  expect(prompt(s, 0, [by(2), P(centre)])).toBe('E — touch the stone');
  expect(prompt(s, 1, [P(centre), by(2)])).toBe('E — touch the stone');
  expect(prompt(s, 0, [P(centre), P(centre)])).toBeNull();
  expect(prompt(s, 0, [by(2), P(out)])).toBeNull();
  expect(prompt(s, 0, [by(2), gone])).toBeNull();
  expect(prompt(s, 0, [gone, P(centre)])).toBeNull();
  s.solved = true;
  expect(prompt(s, 0, [by(2), P(centre)])).toBeNull();
});

test('valid accepts create and its JSON round-trip; rejects bad slices', () => {
  const s = create(9);
  expect(valid(s)).toBe(true);
  expect(valid(JSON.parse(JSON.stringify(s)))).toBe(true);
  const bad = (f) => { const t = JSON.parse(JSON.stringify(s)); f(t); return valid(t); };
  expect(valid(null)).toBe(false);
  expect(bad((t) => { t.signs[1] = t.signs[0]; })).toBe(false);
  expect(bad((t) => { t.signs.pop(); })).toBe(false);
  expect(bad((t) => { t.signs[0] = 8; })).toBe(false);
  expect(bad((t) => { t.order[1] = t.order[0]; })).toBe(false);
  expect(bad((t) => { t.order[0] = 8; })).toBe(false);
  expect(bad((t) => { t.order.push(0); })).toBe(false);
  expect(bad((t) => { t.order.pop(); })).toBe(false);
  expect(bad((t) => { t.touched = [0, 1, 2, 3, 4]; })).toBe(false);
  expect(bad((t) => { t.touched = [1, 1]; })).toBe(false);
  expect(bad((t) => { t.touched = [8]; })).toBe(false);
  expect(bad((t) => { t.touched = 'x'; })).toBe(false);
  expect(bad((t) => { t.steps = 1.5; })).toBe(false);
  expect(bad((t) => { t.steps = NaN; })).toBe(false);
  expect(bad((t) => { t.miss = NaN; })).toBe(false);
  expect(bad((t) => { t.miss = -1; })).toBe(false);
  expect(bad((t) => { t.solved = 1; })).toBe(false);
  expect(bad((t) => { t.touched = [0, 1, 2, 3]; })).toBe(true);
});

test('forceSolve', () => {
  const s = create(3); forceSolve(s);
  expect(s).toMatchObject({ touched: s.order, steps: 1, solved: true });
  expect(valid(s)).toBe(true);
});

test('wired: a ring slice in createAll is stepped by stepAll', () => {
  const S = createAll(3);
  const k = S.ring.order[0], [sx, sz] = R.stones[k];
  stepAll(S, [P([sx, sz + 0.9], { pressed: true }), P(centre)], 0.05);
  expect(S.ring.touched).toEqual([k]);
});

test('facePos: the ring picture, x right, y up, entrance at the bottom, matches where the stones stand', () => {
  const [x0, y0] = facePos(0), [x7, y7] = facePos(7);
  expect(x0).toBeLessThan(0); expect(y0).toBeLessThan(0);
  expect(x7).toBeGreaterThan(0); expect(y7).toBeLessThan(0);
  expect(facePos(3)[1]).toBeGreaterThan(0); expect(facePos(4)[1]).toBeGreaterThan(0);
  for (let i = 0; i < STONES; i++) {
    const [x, y] = facePos(i);
    expect(Math.hypot(x, y)).toBeCloseTo(1, 6);
    expect(Math.sign(x)).toBe(Math.sign(R.stones[i][0] - R.centre[0]));
    expect(Math.sign(y)).toBe(Math.sign(R.centre[1] - R.stones[i][1]));
  }
});

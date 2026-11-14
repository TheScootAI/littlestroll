import { test, expect } from 'vitest';
import {
  HIT_R, LENS_R, CHARGE, REACH, CHEST, occluded, trace, create, step, prompt, valid, forceSolve,
} from '../src/puzzles/beam.js';
import { SITES, heightAt, DYN_NONE } from '../src/world/layout.js';

const P = (xz, o = {}) => ({ present: true, x: xz[0], y: 0, z: xz[1], aim: [0, 0, -1], hold: false, pressed: false, ...o });
const gone = { present: false };
const far = SITES.spawn[0];

const { lamp, lens, hint, rocks } = SITES.beam;
const chest = ([x, z]) => [x, heightAt(x, z, DYN_NONE) + 0.9, z];
const aimAt = (from, to) => { const d = to.map((v, i) => v - from[i]); const l = Math.hypot(...d); return d.map((v) => v / l); };

test('constants', () => {
  expect([HIT_R, LENS_R, CHARGE, REACH, CHEST]).toEqual([0.9, 1.5, 2, 60, 0.9]);
  expect(rocks.length).toBeGreaterThan(0);
});
test('with no mirrors the beam leaves the lamp and misses the lens', () => {
  const r = trace([null, null]);
  expect(r.segs).toHaveLength(1); expect(r.onLens).toBe(false);
});
test('no single bounce can reach the lens', () => {
  for (let t = 0.5; t < 40; t += 0.5) {
    const p = lamp.o.map((v, i) => v + lamp.d[i] * t);
    if (occluded(lamp.o, p)) break;
    expect(occluded(p, lens)).toBe(true);
  }
});
test('the designed two-bounce path lights the lens', () => {
  const a = chest(hint.p1), b = chest(hint.p2);
  const r = trace([{ pos: a, aim: aimAt(a, b) }, { pos: b, aim: aimAt(b, lens) }]);
  expect(r.onLens).toBe(true); expect(r.segs).toHaveLength(3);
  expect(r.segs[2].slice(3)).toEqual(lens.map((v) => expect.closeTo(v)));
});
test('aim is forgiving by a few degrees and no more', () => {
  const a = chest(hint.p1), b = chest(hint.p2);
  const yawed = (d, rad) => [d[0] * Math.cos(rad) - d[2] * Math.sin(rad), d[1], d[0] * Math.sin(rad) + d[2] * Math.cos(rad)];
  const go = (rad) => trace([{ pos: a, aim: aimAt(a, b) }, { pos: b, aim: yawed(aimAt(b, lens), rad) }]).onLens;
  expect(go(0.03)).toBe(true); expect(go(0.35)).toBe(false);
});
test('a mirror out of the beam does nothing, whatever it points at', () => {
  const b = chest(hint.p2);
  expect(trace([null, { pos: b, aim: aimAt(b, lens) }]).onLens).toBe(false);
});
const carrying = () => { const s = create(); s.mirrors[0].by = 0; s.mirrors[1].by = 1; return s; };
const pair = (good) => {
  const a = chest(hint.p1), b = chest(hint.p2);
  return [P(hint.p1, { y: a[1] - 0.9, aim: aimAt(a, b) }),
          P(hint.p2, { y: b[1] - 0.9, aim: good ? aimAt(b, lens) : [0, 1, 0] })];
};
const hold = (s, good, t) => { for (let i = 0; i < Math.round(t * 30); i++) step(s, pair(good), 1 / 30); };
test('two seconds on the lens lights the beacon', () => {
  const s = carrying(); hold(s, true, 1.9); expect(s.solved).toBe(false);
  hold(s, true, 0.2); expect(s.solved).toBe(true);
});
test('a flicker does not', () => {
  const s = carrying(); hold(s, true, 1); hold(s, false, 1.5); hold(s, true, 1);
  expect(s.solved).toBe(false);
});
test('picking up and setting down a mirror', () => {
  const s = create(); const m = SITES.beam.mirrors[0];
  step(s, [P(m, { pressed: true }), P(far)], 0.03); expect(s.mirrors[0].by).toBe(0);
  step(s, [P(far, { y: heightAt(far[0], far[1], DYN_NONE), pressed: true }), P(far)], 0.03);   // feet on the ground
  expect(s.mirrors[0]).toMatchObject({ by: null, x: far[0], z: far[1] });
});

// ---- beyond the brief

test('create: both mirrors on their stands, nothing lit', () => {
  expect(create()).toEqual({
    mirrors: SITES.beam.mirrors.map(([x, z]) => ({ x, z, by: null })),
    segs: [], onLens: false, charge: 0, solved: false,
  });
});
test('the lamp ray alone ends on a rock, inside REACH', () => {
  const [s] = trace([null, null]).segs;
  expect(s.slice(0, 3)).toEqual(lamp.o);
  const end = s.slice(3);
  const len = Math.hypot(end[0] - lamp.o[0], end[1] - lamp.o[1], end[2] - lamp.o[2]);
  expect(len).toBeLessThan(40);
  expect(occluded(lamp.o, end.map((v, i) => v + lamp.d[i] * 0.05))).toBe(true);
  expect(occluded(lamp.o, end.map((v, i) => v - lamp.d[i] * 0.05))).toBe(false);
});
test('a leg that hits nothing runs REACH metres', () => {
  const a = chest(hint.p1);
  const r = trace([{ pos: a, aim: [0, 1, 0] }, null]);
  expect(r.segs).toHaveLength(2);
  expect(r.segs[1].slice(3)).toEqual([a[0], a[1] + REACH, a[2]].map((v) => expect.closeTo(v)));
});
test('the first leg ends exactly on the first holder', () => {
  const a = chest(hint.p1), b = chest(hint.p2);
  const r = trace([null, { pos: a, aim: aimAt(a, b) }]);   // order of holders does not matter
  expect(r.segs[0].slice(3)).toEqual(a);
  expect(r.segs[1].slice(0, 3)).toEqual(a);
  expect(r.hit).toEqual([1]);
});
test('a holder behind the lamp is not lit', () => {
  const back = [lamp.o[0] - lamp.d[0] * 3, lamp.o[1] - lamp.d[1] * 3, lamp.o[2]];
  const r = trace([{ pos: back, aim: [1, 0, 0] }, null]);
  expect(r.hit).toEqual([]);
  expect(r.segs).toHaveLength(1);
});
test('one mirror aimed straight at the lens from inside the lamp beam is blocked by the rocks', () => {
  const a = chest(hint.p1);
  const r = trace([{ pos: a, aim: aimAt(a, lens) }, null]);
  expect(r.onLens).toBe(false);
  expect(r.segs).toHaveLength(2);
});
test('a mirror cannot bounce the beam back to itself, and each holder is used once', () => {
  const a = chest(hint.p1), b = chest(hint.p2);
  const r = trace([{ pos: a, aim: aimAt(a, b) }, { pos: b, aim: aimAt(b, a) }]);
  expect(r.hit).toEqual([0, 1]);
  expect(r.segs).toHaveLength(3);
  expect(r.onLens).toBe(false);
});

test('a walker only reaches a mirror within 1.2 m, and a walker carrying one cannot take the other', () => {
  const s = create(); const [m0, m1] = SITES.beam.mirrors;
  step(s, [P([m0[0], m0[1] + 1.3], { pressed: true }), P(far)], 0.03);
  expect(s.mirrors[0].by).toBe(null);
  step(s, [P(m0, { pressed: true }), P(far)], 0.03);
  expect(s.mirrors[0].by).toBe(0);
  expect(s.mirrors[1].by).toBe(null);
  // carrier presses beside the other mirror: that sets hers down, it does not swap
  step(s, [P(m1, { pressed: true }), P(far)], 0.03);
  expect(s.mirrors.map((m) => m.by)).toEqual([null, null]);
  // the other walker picks the nearer free mirror
  step(s, [P(far), P([m1[0] - 0.3, m1[1]], { pressed: true })], 0.03);
  expect(s.mirrors.map((m) => m.by)).toEqual([null, 1]);
});
test('holding E is not a press', () => {
  const s = create(); const m = SITES.beam.mirrors[0];
  step(s, [P(m, { hold: true }), P(far)], 0.03);
  expect(s.mirrors[0].by).toBe(null);
});
test('a carried mirror follows its carrier and drops where they were if they leave', () => {
  const s = carrying();
  step(s, [P([1, -51]), P([-6, -58])], 0.03);
  expect(s.mirrors[0]).toMatchObject({ x: 1, z: -51, by: 0 });
  step(s, [P([1, -51]), gone], 0.03);
  expect(s.mirrors[1]).toMatchObject({ x: -6, z: -58, by: null });
});
test('a mirror lying on the ground does not catch the beam', () => {
  const s = create(); s.mirrors[0].x = hint.p1[0]; s.mirrors[0].z = hint.p1[1];
  hold(s, true, 0.1);   // walkers stand on the path but neither carries
  expect(s.segs).toHaveLength(1);
});
test('segs, onLens and charge are stored for the joiner; segs are rounded', () => {
  const s = carrying(); hold(s, true, 0.5);
  expect(s.onLens).toBe(true);
  expect(s.segs).toHaveLength(3);
  for (const g of s.segs) for (const v of g) expect(Math.round(v * 100) / 100).toBe(v);
  expect(s.charge).toBeCloseTo(0.5);
  expect(JSON.parse(JSON.stringify(s))).toEqual(s);
  expect(valid(JSON.parse(JSON.stringify(s)))).toBe(true);
});
test('charge falls at the rise rate and never below 0', () => {
  const s = carrying(); hold(s, true, 1); hold(s, false, 0.5);
  expect(s.charge).toBeCloseTo(0.5);
  hold(s, false, 3); expect(s.charge).toBe(0);
});
test('once lit the beacon stays lit: nothing moves, nothing drops', () => {
  const s = carrying(); hold(s, true, 2.1); expect(s.solved).toBe(true);
  const before = JSON.stringify(s);
  step(s, [P(far, { pressed: true }), P(far, { pressed: true })], 0.03);
  expect(JSON.stringify(s)).toBe(before);
  expect(s.charge).toBe(CHARGE);
});
test('prompts', () => {
  const s = create(); const m = SITES.beam.mirrors[0];
  expect(prompt(s, 0, [P(m), P(far)])).toBe('E — pick up the mirror');
  expect(prompt(s, 0, [P(far), P(far)])).toBe(null);
  expect(prompt(s, 0, [gone, P(far)])).toBe(null);
  const c = carrying();
  const away = [P(far), P(far)];
  expect(prompt(c, 0, away)).toBe('E — put down the mirror');
  expect(prompt(c, 0, pair(false))).toBe('E — put down the mirror');
  // walker 1 carries but the beam does reach them in pair(false)
  expect(prompt(c, 1, pair(false))).toBe('E — put down the mirror');
  hold(c, true, 0.5);
  expect(prompt(c, 0, pair(true))).toBe('E — put down the mirror');
  expect(prompt(c, 1, pair(true))).toBe('E — put down the mirror');
  const w = create(); w.charge = 1;
  expect(prompt(w, 0, [P(far), P(far)])).toBe(null);
  forceSolve(c);
  expect(prompt(c, 0, pair(true))).toBe(null);
});
test('forceSolve: solved with a full charge', () => {
  const s = create(); forceSolve(s);
  expect(s).toMatchObject({ solved: true, charge: CHARGE });
  expect(valid(s)).toBe(true);
});
test('valid checks the slice', () => {
  expect(valid(create())).toBe(true);
  const bad = [null, undefined, 5, []];
  const c = (f) => { const s = create(); f(s); bad.push(s); };
  c((s) => { s.mirrors.pop(); });
  c((s) => { s.mirrors[0].by = 2; });
  c((s) => { s.mirrors[0].by = undefined; });
  c((s) => { s.mirrors[1].x = NaN; });
  c((s) => { s.segs = [[1, 2, 3, 4, 5]]; });
  c((s) => { s.segs = [[1, 2, 3, 4, 5, Infinity]]; });
  c((s) => { s.segs = [0, 0, 0, 0].map(() => [0, 0, 0, 0, 0, 0]); });
  c((s) => { s.segs = null; });
  c((s) => { s.onLens = 1; });
  c((s) => { s.charge = 2.5; });
  c((s) => { s.charge = -0.1; });
  c((s) => { s.solved = 'no'; });
  c((s) => { delete s.charge; });
  for (const b of bad) expect(valid(b)).toBe(false);
});

// ---- final review fixes

const ground = (xz) => heightAt(xz[0], xz[1], DYN_NONE);
test('C2: a mirror set down over water goes back to its own stand', () => {
  const s = create(); const m = SITES.beam.mirrors[0];
  step(s, [P(m, { y: ground(m), pressed: true }), P(far)], 0.03); expect(s.mirrors[0].by).toBe(0);
  const sea = [-15.63, -44];
  expect(ground(sea)).toBeLessThan(0.2);
  step(s, [P(sea, { y: -0.3 }), P(far)], 0.03);
  step(s, [P(sea, { y: -0.3, pressed: true }), P(far)], 0.03);
  expect(s.mirrors[0]).toMatchObject({ by: null, x: m[0], z: m[1] });
});
test('C2: a mirror set down mid-fall (feet far above the ground) goes back to its stand', () => {
  const s = create(); const m = SITES.beam.mirrors[1];
  step(s, [P(far), P(m, { y: ground(m), pressed: true })], 0.03); expect(s.mirrors[1].by).toBe(1);
  const spot = [-4, -50];
  step(s, [P(far), P(spot, { y: ground(spot) + 2 })], 0.03);
  step(s, [P(far), P(spot, { y: ground(spot) + 2, pressed: true })], 0.03);
  expect(s.mirrors[1]).toMatchObject({ by: null, x: m[0], z: m[1] });
  // on the ground there it stays where it was set down
  step(s, [P(far), P(m, { y: ground(m), pressed: true })], 0.03); expect(s.mirrors[1].by).toBe(1);
  step(s, [P(far), P(spot, { y: ground(spot) + 0.3, pressed: true })], 0.03);
  expect(s.mirrors[1]).toMatchObject({ by: null, x: spot[0], z: spot[1] });
});
test('C2: a carrier who disconnects over water leaves the mirror on its stand', () => {
  const s = create(); const m = SITES.beam.mirrors[0];
  step(s, [P(m, { y: ground(m), pressed: true }), P(far)], 0.03);
  const sea = [-15.63, -44];
  step(s, [P(sea, { y: -0.3 }), P(far)], 0.03);
  step(s, [gone, P(far)], 0.03);
  expect(s.mirrors[0]).toMatchObject({ by: null, x: m[0], z: m[1] });
});

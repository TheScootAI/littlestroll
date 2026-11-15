// The shipwreck's layout: four timbers on the starting beach, leaning on a scenery boulder.
import { test, expect } from 'vitest';
import { SITES, TRAIL, zoneAt, heightAt, DYN_NONE } from '../src/world/layout.js';
import { placeScenery } from '../src/world/terrain.js';
import { reachable } from './helpers/reach.js';
import { blockers } from '../src/world/layout.js';
import { pointSegDist } from '../src/core/math.js';
import { DEBRIS, leanEnds, TIP_R, TIP_RISE, fallPose, hitTime, FALL_END } from '../src/world/wreck.js';
import { WATER_Y } from '../src/config.js';

const W = SITES.wreck, scenery = placeScenery();
const ends = W.pieces.flatMap((p, i) => [[i, 'a', p.a], [i, 'b', p.b]]);
const d = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1]);
const others = [...scenery.trees, ...scenery.boulders, ...scenery.rocks].filter((o) => d([o.x, o.z], W.rock) > 0.05);

test('four timbers; the first is the plank; lengths and ends agree', () => {
  expect(W.pieces.map((p) => p.kind)).toEqual(['plank', 'spar', 'board', 'hatch']);
  expect(W.pieces.map((p) => p.len)).toEqual([4, 6.5, 2.5, 1.8]);
  for (const p of W.pieces) expect(Math.abs(d(p.a, p.b) - p.len)).toBeLessThan(1e-9);
});
test('the rock is a real scenery boulder', () => {
  expect(scenery.boulders.some((b) => d([b.x, b.z], W.rock) < 0.05)).toBe(true);
});
test('each b end is 1.4 to 2.2 m from the rock, and each piece points away from it', () => {
  for (const p of W.pieces) {
    expect(d(p.b, W.rock)).toBeGreaterThanOrEqual(1.4);
    expect(d(p.b, W.rock)).toBeLessThanOrEqual(2.2);
    expect(d(p.a, W.rock)).toBeGreaterThan(d(p.b, W.rock));
  }
});
test('every end is on the beach flat sand', () => {
  for (const [, , p] of ends) {
    expect(zoneAt(...p)).toBe('A');
    expect(Math.abs(heightAt(...p, DYN_NONE) - heightAt(0, 120, DYN_NONE))).toBeLessThan(0.05);
  }
});
test('ends of different pieces are at least 1.5 m apart', () => {
  for (const [i, , p] of ends) for (const [j, , q] of ends) if (i < j) expect(d(p, q)).toBeGreaterThanOrEqual(1.5);
});
test('ends keep clear of the spawn slots, the first leg of the trail, the find, and the scenery', () => {
  const leg = [TRAIL[0], TRAIL[1]];
  for (const [, , p] of ends) {
    for (const s of SITES.spawn) expect(d(p, s)).toBeGreaterThanOrEqual(2.5);
    expect(pointSegDist(p[0], p[1], leg[0][0], leg[0][1], leg[1][0], leg[1][1]).d).toBeGreaterThanOrEqual(2.5);
    expect(d(p, SITES.finds[1])).toBeGreaterThanOrEqual(3);
    for (const o of others) expect(d(p, [o.x, o.z])).toBeGreaterThanOrEqual(1);
  }
});
test('the hull lies on the beach east or south-east of the rock, clear of the spawn and the ends', () => {
  const h = W.hull;
  expect(h.x).toBeGreaterThan(W.rock[0]);
  expect(h.z).toBeGreaterThanOrEqual(W.rock[1]);
  expect(d([h.x, h.z], [0, 120])).toBeLessThan(20);
  expect(heightAt(h.x, h.z, DYN_NONE)).toBeGreaterThan(0);
  expect(Number.isFinite(h.yaw)).toBe(true);
  for (const s of SITES.spawn) expect(d([h.x, h.z], s)).toBeGreaterThanOrEqual(6);
  for (const [, , p] of ends) expect(d([h.x, h.z], p)).toBeGreaterThanOrEqual(4);
});

// ---- the debris on the sand and the way a timber leans on the rock (what is drawn)
test('2 to 3 barrels (one on its side), a crate or two, rope or sail, an anchor or a wheel', () => {
  const n = (k) => DEBRIS.filter((o) => o.kind === k).length;
  expect(n('barrel') + n('barrelSide')).toBeGreaterThanOrEqual(2);
  expect(n('barrel') + n('barrelSide')).toBeLessThanOrEqual(3);
  expect(n('barrelSide')).toBe(1);
  expect(n('crate')).toBeGreaterThanOrEqual(1);
  expect(n('crate')).toBeLessThanOrEqual(2);
  expect(n('rope') + n('sail')).toBeGreaterThanOrEqual(1);
  expect(n('anchor') + n('wheel')).toBeGreaterThanOrEqual(1);
});
test('debris keeps clear of every piece end, the spawn slots, the trail, the find, the rock and the scenery', () => {
  const leg = [TRAIL[0], TRAIL[1]];
  for (const o of DEBRIS) {
    const p = [o.x, o.z];
    for (const [, , e] of ends) expect(d(p, e)).toBeGreaterThanOrEqual(1.5);
    for (const s of SITES.spawn) expect(d(p, s)).toBeGreaterThanOrEqual(2.5);
    expect(pointSegDist(p[0], p[1], leg[0][0], leg[0][1], leg[1][0], leg[1][1]).d).toBeGreaterThanOrEqual(2.5);
    expect(d(p, SITES.finds[1])).toBeGreaterThanOrEqual(2);
    expect(d(p, W.rock)).toBeGreaterThanOrEqual(2);
    for (const q of others) expect(d(p, [q.x, q.z])).toBeGreaterThanOrEqual(1);
    for (const q of DEBRIS) if (q !== o) expect(d(p, [q.x, q.z])).toBeGreaterThanOrEqual(0.9);
  }
});
test('every item stands on dry ground, off the hull', () => {
  for (const o of DEBRIS) {
    expect(Number.isFinite(o.yaw)).toBe(true);
    expect(heightAt(o.x, o.z, DYN_NONE)).toBeGreaterThan(0.3);
    const c = Math.cos(W.hull.yaw), sn = Math.sin(W.hull.yaw), k = [W.hull.x - c * 5.5, W.hull.z + sn * 5.5], m = [W.hull.x + c * 5.5, W.hull.z - sn * 5.5];
    expect(pointSegDist(o.x, o.z, k[0], k[1], m[0], m[1]).d).toBeGreaterThanOrEqual(2.2);   // the keel line; the ribs reach about 1.6 m either side
  }
});
test('a leaning timber keeps its full length, its tip is on the rock and it slides little from its end', () => {
  for (const p of W.pieces) {
    const e = leanEnds(p.a, p.b, W.rock, p.len);
    expect(Math.hypot(e.b[0] - e.a[0], e.b[1] - e.a[1], TIP_RISE)).toBeCloseTo(p.len, 6);
    expect(d(e.b, W.rock)).toBeCloseTo(TIP_R, 6);
    expect(d(e.a, p.a)).toBeLessThanOrEqual(1.1);   // a walker who comes for its end A still finds it (grab radius 1.2)
    const u = [(p.b[0] - p.a[0]) / p.len, (p.b[1] - p.a[1]) / p.len];   // same line as before
    expect((e.b[0] - e.a[0]) * u[1] - (e.b[1] - e.a[1]) * u[0]).toBeCloseTo(0, 6);
  }
});

test('every end is reachable from the spawn with nothing solved', () => {
  const r = reachable(SITES.spawn[0], DYN_NONE);
  for (const [, , p] of ends) expect(r(...p)).toBe(true);
});
test('the wreck adds nothing to blockers(): no circle near its rock or any end', () => {
  const { circles, segments } = blockers(DYN_NONE);
  for (const p of [W.rock, ...ends.map((e) => e[2])]) {
    for (const c of circles) expect(d(p, [c.x, c.z])).toBeGreaterThan(0.5);
    for (const s of segments) expect(pointSegDist(p[0], p[1], s.ax, s.az, s.bx, s.bz).d).toBeGreaterThan(0.5);
  }
});
test('debris keeps 1.2 m clear of every resting timber as drawn (slid toward the rock)', () => {
  for (const p of W.pieces) {
    const e = leanEnds(p.a, p.b, W.rock, p.len);
    for (const o of DEBRIS) expect(pointSegDist(o.x, o.z, e.a[0], e.a[1], e.b[0], e.b[1]).d).toBeGreaterThanOrEqual(1.2);
  }
});

test('a too-short piece laid out from the near bank, then falling in', () => {
  for (const len of [1.8, 2.5]) {
    const p0 = fallPose(len, 0);
    expect(p0.a[0]).toBe(6); expect(p0.a[2]).toBe(-9);
    expect(p0.a[1]).toBeCloseTo(heightAt(6, -8.5, DYN_NONE), 6);
    expect(p0.b[1]).toBeCloseTo(p0.a[1], 6);   // level
    let prev = Infinity;
    for (let t = 0; t < FALL_END; t += 0.02) {
      const { a, b } = fallPose(len, t);
      expect(Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])).toBeCloseTo(len, 6);
      expect(b[1]).toBeLessThanOrEqual(prev + 1e-9);
      prev = b[1];
      expect(b[2]).toBeGreaterThan(-12.6 + 0.1);   // never reaches the far bank
    }
    const end = fallPose(len, FALL_END - 0.001);
    expect(end.a[1]).toBeLessThan(WATER_Y); expect(end.b[1]).toBeLessThan(WATER_Y);
    expect(fallPose(len, FALL_END)).toBeNull();
    expect(hitTime(len)).toBeGreaterThan(0.4); expect(hitTime(len)).toBeLessThan(FALL_END);
  }
});

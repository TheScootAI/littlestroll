// The shipwreck's layout: four timbers on the starting beach, leaning on a scenery boulder.
import { test, expect } from 'vitest';
import { SITES, TRAIL, zoneAt, heightAt, DYN_NONE } from '../src/world/layout.js';
import { placeScenery } from '../src/world/terrain.js';
import { pointSegDist } from '../src/core/math.js';

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
test('ends keep clear of the spawn slots, the first leg of the trail, the owl, and the scenery', () => {
  const leg = [TRAIL[0], TRAIL[1]];
  for (const [, , p] of ends) {
    for (const s of SITES.spawn) expect(d(p, s)).toBeGreaterThanOrEqual(2.5);
    expect(pointSegDist(p[0], p[1], leg[0][0], leg[0][1], leg[1][0], leg[1][1]).d).toBeGreaterThanOrEqual(2.5);
    expect(d(p, SITES.owls[1])).toBeGreaterThanOrEqual(3);
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

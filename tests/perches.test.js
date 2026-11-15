// Perches: the flat-topped circles a hop can land on (the wreck's barrels, crates and rope coil, and every boulder).
import { test, expect } from 'vitest';
import { PERCHES } from '../src/world/perches.js';
import { DEBRIS } from '../src/world/wreck.js';
import { SOLIDS, BOULDER_R, obstacles } from '../src/world/solids.js';
import { SITES, DYN_NONE, heightAt } from '../src/world/layout.js';
import { STEP_UP, PLAYER_R } from '../src/config.js';
import { placeScenery, placeFarScenery, placeLanternScenery } from '../src/world/scenery.js';

const SIZE = { barrel: [0.6, 0.95], barrelSide: [0.65, 0.8], crate: [0.7, 0.84], rope: [0.6, 0.5] };
const ALL = { ...DYN_NONE, gateOpen: true, bridge: true, plank: true, ladder: true, causeway: true, bells: true, ring: true, lift: 1, marsh: 0x3fffffff, pillars: 0x3ffff };
const near = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

test('PERCHES: one per barrel, lying barrel, crate and rope of DEBRIS and one per boulder, sized by the rule', () => {
  const wreck = PERCHES.filter((p) => p.kind !== 'boulder');
  const want = DEBRIS.filter((o) => SIZE[o.kind]);
  expect(wreck).toHaveLength(want.length);
  for (const o of want) {
    const p = wreck.find((q) => q.x === o.x && q.z === o.z);
    expect(p, `${o.kind} at ${o.x}, ${o.z}`).toBeTruthy();
    expect(p).toEqual({ kind: o.kind, x: o.x, z: o.z, r: SIZE[o.kind][0], top: SIZE[o.kind][1] });
    expect(Object.keys(p)[0]).toBe('kind');
  }
  const boulders = [placeScenery(), placeFarScenery(), placeLanternScenery()].flatMap((o) => o.boulders);
  const rocks = PERCHES.filter((p) => p.kind === 'boulder');
  expect(rocks).toHaveLength(boulders.length);
  for (const b of boulders) {
    const p = rocks.find((q) => q.x === b.x && q.z === b.z);
    expect(p).toBeTruthy();
    expect(p.r).toBeCloseTo(BOULDER_R * b.s, 9);
    expect(p.top).toBeCloseTo(0.58 * b.s, 9);
    expect(Object.keys(p)[0]).toBe('kind');
  }
  expect(PERCHES).toHaveLength(want.length + boulders.length);
});

test('PERCHES is built once, the same every time', () => {
  expect(obstacles(DYN_NONE).perches).toBe(PERCHES);
  expect(obstacles(ALL).perches).toBe(PERCHES);
});

test('obstacles(dyn).circles holds every boulder and wreck perch (paths and reach go round them); the controller list has trees only', () => {
  for (const dyn of [DYN_NONE, ALL]) {
    const o = obstacles(dyn);
    for (const p of PERCHES) expect(o.circles.some((c) => c.x === p.x && c.z === p.z && c.r === p.r), `${p.kind} at ${p.x}, ${p.z}`).toBe(true);
    for (const s of SOLIDS) expect(o.circles.some((c) => c.x === s.x && c.z === s.z && c.r === s.r)).toBe(true);
    expect(o.hard.some((c) => c.kind === 'boulder')).toBe(false);
    expect(o.hard.some((c) => c.kind === 'pine')).toBe(true);
    for (const p of PERCHES) expect(o.hard.includes(p)).toBe(false);
  }
});

test('no perch gives a way up: nothing within r + PLAYER_R + 0.5 is a step the hop could climb', () => {
  for (const dyn of [DYN_NONE, ALL]) for (const p of PERCHES) {
    const g0 = heightAt(p.x, p.z, dyn), reach = p.r + PLAYER_R + 0.5;
    for (let ring = 0; ring <= 8; ring++) for (let k = 0; k < 32; k++) {
      const d = reach * ring / 8, a = k * Math.PI / 16;
      const rise = heightAt(p.x + d * Math.cos(a), p.z + d * Math.sin(a), dyn) - g0;
      const bad = rise > STEP_UP && rise < p.top + STEP_UP + 0.05;
      expect(bad, `${p.kind} at ${p.x.toFixed(1)}, ${p.z.toFixed(1)}: ground ${rise.toFixed(2)} m above it at ${d.toFixed(1)} m`).toBe(false);
    }
  }
});

test('the wreck perches keep clear of every timber end, rest, spawn, checkpoint and owl', () => {
  const W = SITES.wreck;
  const spots = [
    ...W.pieces.flatMap((p) => [p.a, p.b]),
    SITES.plank.restA, SITES.plank.restB,
    ...SITES.spawn, ...SITES.checkpoints.flat(), ...SITES.owls,
  ];
  for (const p of PERCHES.filter((q) => q.kind !== 'boulder')) for (const s of spots) {
    expect(near([p.x, p.z], s), `${p.kind} at ${p.x}, ${p.z} vs ${s}`).toBeGreaterThanOrEqual(p.r + PLAYER_R + 0.2);
  }
});

// Trees and boulders are solid: the list of them, that nothing a walker must reach is buried in
// one, that the trail stays open, and that obstacles() is blockers() plus them.
import { test, expect } from 'vitest';
import { PERCHES } from '../src/world/perches.js';
import { TREE_R, BOULDER_R, SOLIDS, obstacles } from '../src/world/solids.js';
import { placeScenery, placeFarScenery, placeLanternScenery, siteAnchors, trailDistance } from '../src/world/scenery.js';
import { SITES, DYN_NONE, blockers } from '../src/world/layout.js';
import { PLAYER_R, WATER_Y } from '../src/config.js';
import { GRAB_R } from '../src/puzzles/plank.js';
import { heightAt } from '../src/world/layout.js';

const trees = [placeScenery(), placeFarScenery(), placeLanternScenery()].flatMap((o) => o.trees);
const boulders = [placeScenery(), placeFarScenery(), placeLanternScenery()].flatMap((o) => o.boulders);

test('SOLIDS has one entry per tree and boulder, sized by the rule; built the same every time', () => {
  expect(TREE_R).toEqual({ pine: 0.7, round: 0.3 });
  expect(BOULDER_R).toBe(1.3);
  expect(SOLIDS).toHaveLength(trees.length + boulders.length);
  const want = [
    ...trees.map((t) => ({ x: t.x, z: t.z, r: TREE_R[t.kind] * t.s, kind: t.kind })),
    ...boulders.map((b) => ({ x: b.x, z: b.z, r: BOULDER_R * b.s, kind: 'boulder' })),
  ];
  const key = (a) => `${a.kind} ${a.x} ${a.z} ${a.r}`;
  expect(SOLIDS.map(key).sort()).toEqual(want.map(key).sort());
  expect(SOLIDS.some((s) => s.kind === 'pine') && SOLIDS.some((s) => s.kind === 'round') && SOLIDS.some((s) => s.kind === 'boulder')).toBe(true);
});

const W = SITES.wreck;
const musts = () => [
  ...SITES.spawn, ...SITES.checkpoints.flat(), ...siteAnchors(), ...SITES.finds,
  SITES.plank.restA, SITES.plank.restB,
];

test('nothing a walker must reach is inside or hard against a solid', () => {
  const pts = musts();
  for (const s of SOLIDS) for (const p of pts) {
    expect(Math.hypot(p[0] - s.x, p[1] - s.z), `${s.kind} at ${s.x.toFixed(1)}, ${s.z.toFixed(1)} vs ${p}`).toBeGreaterThanOrEqual(s.r + PLAYER_R + 0.2);
  }
});

test('every end of every wreck timber has a standing place within GRAB_R - 0.3, clear of the solids and above the water', () => {
  for (const [pi, p] of W.pieces.entries()) for (const [name, e] of [['a', p.a], ['b', p.b]]) {
    let found = false;
    for (let dx = -GRAB_R; dx <= GRAB_R && !found; dx += 0.05) for (let dz = -GRAB_R; dz <= GRAB_R && !found; dz += 0.05) {
      const x = e[0] + dx, z = e[1] + dz;
      if (Math.hypot(dx, dz) > GRAB_R - 0.3) continue;
      if (heightAt(x, z, DYN_NONE) > WATER_Y + 0.3 && SOLIDS.every((s) => Math.hypot(x - s.x, z - s.z) >= s.r + PLAYER_R)) found = true;
    }
    expect(found, `piece ${pi} end ${name}`).toBe(true);
  }
});

test('the trail stays open round every solid', () => {
  for (const s of SOLIDS) expect(trailDistance(s.x, s.z), `${s.kind} at ${s.x.toFixed(1)}, ${s.z.toFixed(1)}`).toBeGreaterThanOrEqual(s.r + PLAYER_R + 0.5);
});

test('obstacles(dyn).circles is blockers(dyn), SOLIDS and the wreck\'s perches, one array built once', () => {
  const all = { ...DYN_NONE, gateOpen: true, bridge: true, plank: true, ladder: true, causeway: true, bells: true, ring: true, lift: 1, marsh: 0x3fffffff, pillars: 0x3ffff };
  for (const dyn of [DYN_NONE, all, { ...DYN_NONE, spur: true }]) {
    const b = blockers(dyn), o = obstacles(dyn);
    expect(o.segments).toEqual(b.segments);
    expect(o.circles).toEqual([...b.circles, ...SOLIDS, ...PERCHES.filter((q) => q.kind !== 'boulder')]);
  }
  expect(obstacles(DYN_NONE).circles).toBe(obstacles(DYN_NONE).circles);
});

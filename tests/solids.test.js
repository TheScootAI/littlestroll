// Trees and boulders are solid: the list of them, that nothing a walker must reach is buried in
// one, that the trail stays open, and that obstacles() is blockers() plus them.
import { test, expect } from 'vitest';
import { TREE_R, BOULDER_R, SOLIDS, obstacles } from '../src/world/solids.js';
import { placeScenery, placeFarScenery, placeLanternScenery, siteAnchors, trailDistance } from '../src/world/scenery.js';
import { SITES, DYN_NONE, blockers } from '../src/world/layout.js';
import { PLAYER_R } from '../src/config.js';

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
  ...SITES.spawn, ...SITES.checkpoints.flat(), ...siteAnchors(), ...SITES.owls,
  SITES.plank.restA, SITES.plank.restB, ...W.pieces.flatMap((p) => [p.a, p.b]),
];

test('nothing a walker must reach is inside or hard against a solid', () => {
  const pts = musts();
  for (const s of SOLIDS) for (const p of pts) {
    expect(Math.hypot(p[0] - s.x, p[1] - s.z), `${s.kind} at ${s.x.toFixed(1)}, ${s.z.toFixed(1)} vs ${p}`).toBeGreaterThanOrEqual(s.r + PLAYER_R + 0.2);
  }
});

test('the trail stays open round every solid', () => {
  for (const s of SOLIDS) expect(trailDistance(s.x, s.z), `${s.kind} at ${s.x.toFixed(1)}, ${s.z.toFixed(1)}`).toBeGreaterThanOrEqual(s.r + PLAYER_R + 0.5);
});

test('obstacles(dyn) is blockers(dyn) plus SOLIDS, one array built once', () => {
  const all = { ...DYN_NONE, gateOpen: true, bridge: true, plank: true, ladder: true, causeway: true, bells: true, ring: true, lift: 1, marsh: 0x3fffffff, pillars: 0x3ffff };
  for (const dyn of [DYN_NONE, all, { ...DYN_NONE, spur: true }]) {
    const b = blockers(dyn), o = obstacles(dyn);
    expect(o.segments).toEqual(b.segments);
    expect(o.circles).toEqual([...b.circles, ...SOLIDS]);
  }
  expect(obstacles(DYN_NONE).circles).toBe(obstacles(DYN_NONE).circles);
});

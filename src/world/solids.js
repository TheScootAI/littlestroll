// The trees and boulders a walker cannot pass: one circle each, from the same seeded placement
// both browsers deal. Pure: no three.js, no DOM.
import { blockers } from './layout.js';
import { placeScenery, placeFarScenery, placeLanternScenery } from './scenery.js';

export const TREE_R = { pine: 0.7, round: 0.3 };   // times the tree's s
export const BOULDER_R = 1.3;                      // times the boulder's s

// Every tree and boulder of the three islands, built once. Rocks, tufts and the tor's crag are not solid.
export const SOLIDS = (() => {
  const out = [];
  for (const o of [placeScenery(), placeFarScenery(), placeLanternScenery()]) {
    for (const t of o.trees) out.push({ x: t.x, z: t.z, r: TREE_R[t.kind] * t.s, kind: t.kind });
    for (const b of o.boulders) out.push({ x: b.x, z: b.z, r: BOULDER_R * b.s, kind: 'boulder' });
  }
  return out;
})();

// blockers(dyn) plus SOLIDS. blockers() hands back the same static circles every call, so the
// joined array is built once per that array, not once per call.
let joinedFrom = null, joined = null;
export function obstacles(dyn) {
  const b = blockers(dyn);
  if (b.circles !== joinedFrom) { joinedFrom = b.circles; joined = [...b.circles, ...SOLIDS]; }
  return { circles: joined, segments: b.segments };
}

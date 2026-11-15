// The trees and boulders a walker cannot pass: one circle each, from the same seeded placement
// both browsers deal. Pure: no three.js, no DOM.
import { blockers } from './layout.js';
import { placeScenery, placeFarScenery, placeLanternScenery, TREE_R, BOULDER_R } from './scenery.js';

export { TREE_R, BOULDER_R };


// Every tree and boulder of the three islands, built once. Rocks, tufts and the tor's crag are not solid.
export const SOLIDS = (() => {
  const out = [];
  for (const o of [placeScenery(), placeFarScenery(), placeLanternScenery()]) {
    // `kind` comes FIRST on purpose. A circle written { x, z, r, kind } shares its first fields
    // with the layout's own { x, z, r } objects, and making a hundred of those makes the engine
    // throw away its fast code for heightAt (measured in Node: up to 18 times slower on every
    // later call; the pilot's path grid took three times as long). The "is quick" test in
    // tests/path.test.js is the one that notices.
    for (const t of o.trees) out.push({ kind: t.kind, x: t.x, z: t.z, r: TREE_R[t.kind] * t.s });
    for (const b of o.boulders) out.push({ kind: 'boulder', x: b.x, z: b.z, r: BOULDER_R * b.s });
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

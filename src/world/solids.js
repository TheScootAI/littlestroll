// The trees and boulders a walker cannot pass: one circle each, from the same seeded placement
// both browsers deal. Pure: no three.js, no DOM.
import { blockers } from './layout.js';
import { TREE_R, BOULDER_R } from './scenery.js';
import { SCENES, PERCHES } from './perches.js';

export { TREE_R, BOULDER_R };


// Every tree and boulder of the three islands, built once. Rocks, tufts and the tor's crag are not solid.
export const SOLIDS = (() => {
  const out = [];
  for (const o of SCENES) {
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

// What the walkers and the pilot's paths read, built once per layout circle array (blockers() hands
// back the same static circles every call):
//   circles   every circle a path must go round: layout's, the trees, and every perch (boulders and the wreck's)
//   hard      what blocks a walker at any height: layout's circles and the trees. Perches are not in it
//   perches   PERCHES, the same array every call: a walker may land on these, and is blocked by them only when too low
//   segments  layout's walls and gates
let joinedFrom = null, joined = null, hardList = null;
export function obstacles(dyn) {
  const b = blockers(dyn);
  if (b.circles !== joinedFrom) {
    joinedFrom = b.circles;
    const wreck = PERCHES.filter((p) => p.kind !== 'boulder');
    joined = [...b.circles, ...SOLIDS, ...wreck];
    hardList = [...b.circles, ...SOLIDS.filter((s) => s.kind !== 'boulder')];
  }
  return { circles: joined, hard: hardList, perches: PERCHES, segments: b.segments };
}

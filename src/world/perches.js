// The flat-topped circles a walker can land on with a hop: the wreck's barrels, crates and rope
// coil, and every boulder. A perch is { kind, x, z, r, top }: a circle on the ground, `top`
// metres above the ground at its centre (its absolute height is heightAt(x, z) + top).
// Pure: no three.js, no DOM. Built from fixed data and seeds only, so both browsers agree.
import { DEBRIS, WRECK_PERCH } from './wreck.js';
import { placeScenery, placeFarScenery, placeLanternScenery, BOULDER_R } from './scenery.js';

// The three islands' placed scenery, built once (solids.js reads the same objects).
export const SCENES = [placeScenery(), placeFarScenery(), placeLanternScenery()];

export const BOULDER_TOP = 0.58;   // a boulder's flat top above its ground, times its s

// `kind` comes FIRST in every one of these on purpose, as in solids.js: an object written
// { x, z, r, ... } with a fourth field makes heightAt many times slower in Node for the rest of the run.
export const PERCHES = (() => {
  const out = [];
  for (const o of DEBRIS) {
    const s = WRECK_PERCH[o.kind];
    if (s) out.push({ kind: o.kind, x: o.x, z: o.z, r: s.r, top: s.top });
  }
  for (const sc of SCENES) for (const b of sc.boulders) out.push({ kind: 'boulder', x: b.x, z: b.z, r: BOULDER_R * b.s, top: BOULDER_TOP * b.s });
  return out;
})();

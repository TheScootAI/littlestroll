// The owls: small stone owls off the trail. S.owls is a bitmask, bit i = owl i found.
// Walk within FOUND_R of one (either walker, and within FOUND_DY of its ground height) and it is found, for good. Not a puzzle: no
// prompt, no gate, not in the order, not counted as solved.
import { SITES, heightAt } from '../world/layout.js';

export const OWLS = SITES.owls.length, FOUND_R = 1.2, FOUND_DY = 1.5;

const GROUND = SITES.owls.map(([x, z]) => heightAt(x, z));   // each owl's ground height, once

export const create = () => 0;

export function step(found, players) {
  let m = found;
  for (const p of players) {
    if (!p?.present) continue;
    for (let i = 0; i < OWLS; i++) {
      if (m & (1 << i)) continue;
      const [x, z] = SITES.owls[i];
      if (Math.hypot(p.x - x, p.z - z) <= FOUND_R && Math.abs(p.y - GROUND[i]) <= FOUND_DY) m |= 1 << i;
    }
  }
  return m;
}

export const count = (found) => { let n = 0; for (let i = 0; i < OWLS; i++) if (found & (1 << i)) n++; return n; };

// What a new owl count says. prev = the last count seen (null/undefined: no baseline yet, as after a
// welcome, so nothing is announced). A rise gives one line with the total.
export const news = (prev, n) => ({ line: prev != null && n > prev ? `An owl — ${n} of ${OWLS}` : null, next: n });

export const valid = (found) => Number.isInteger(found) && found >= 0 && found < 1 << OWLS;

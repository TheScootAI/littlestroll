// The owls: eight small stone owls off the trail. S.owls is a bitmask, bit i = owl i found.
// Walk within FOUND_R of one (either walker) and it is found, for good. Not a puzzle: no
// prompt, no gate, not in the order, not counted as solved.
import { SITES } from '../world/layout.js';

export const OWLS = 8, FOUND_R = 1.2;

export const create = () => 0;

export function step(found, players) {
  let m = found;
  for (const p of players) {
    if (!p?.present) continue;
    for (let i = 0; i < OWLS; i++) {
      if (m & (1 << i)) continue;
      const [x, z] = SITES.owls[i];
      if (Math.hypot(p.x - x, p.z - z) <= FOUND_R) m |= 1 << i;
    }
  }
  return m;
}

export const count = (found) => { let n = 0; for (let i = 0; i < OWLS; i++) if (found & (1 << i)) n++; return n; };

export const valid = (found) => Number.isInteger(found) && found >= 0 && found < 1 << OWLS;

// The Pillars: two lines of nine sea pillars run side by side to the Lantern Isle. A pillar
// only rises while the OTHER walker is level with it on the OTHER line (the pillar behind, the
// one beside, the one ahead), so neither can cross alone and the two have to keep abreast; on
// the landing before the lines a walker raises pillar 0 of both. Raised pillars stay up for
// LINGER seconds. It does nothing until the Relay is solved (`open`). Standing on the island
// beyond solves it for good. Pure rules, no three.js.
import { SITES, PILLAR_BITS, pillarAt, zoneAt } from '../world/layout.js';
import { MAX_DT } from '../config.js';

export const LINGER = 0.4;
const N = SITES.pillars.n;
const LANDING_R = SITES.pillars.near.r + 1.5;   // generous: a step back off pillar 0 at a line's edge is still the landing
const ALL = (1 << PILLAR_BITS) - 1;

export const create = () => ({ t: Array(PILLAR_BITS).fill(0), solved: false });

// Where a walker is: on a pillar { line, r }, on the near landing { line: null, r: -1 }, or null.
export function placeOf(p) {
  if (!p?.present) return null;
  const at = pillarAt(p.x, p.z);
  if (at) return { line: at.line, r: at.r };
  const n = SITES.pillars.near;
  return Math.hypot(p.x - n.x, p.z - n.z) <= LANDING_R ? { line: null, r: -1 } : null;
}

export function step(s, players, dt, open = true) {
  dt = Number.isFinite(dt) ? Math.min(Math.max(dt, 0), MAX_DT) : 0;
  const up = new Set();
  if (open) {
    const places = players.map(placeOf);
    // a raising walker needs a present friend (the pillars hold while two are here)
    if (players.length === 2 && places[0] && places[1]) {
      for (const pl of places) {
        if (pl.line === null) { up.add(0); up.add(N); continue; }
        for (let r = pl.r - 1; r <= pl.r + 1; r++) if (r >= 0 && r < N) up.add((1 - pl.line) * N + r);
      }
    }
    if (!s.solved && players.some((p) => p?.present && ['K', 'L'].includes(zoneAt(p.x, p.z)))) s.solved = true;
  }
  for (let i = 0; i < PILLAR_BITS; i++) s.t[i] = up.has(i) ? LINGER : Math.max(0, s.t[i] - dt);
}

export const maskOf = (s) => (s.solved ? ALL : s.t.reduce((m, t, i) => (t > 0 ? m | (1 << i) : m), 0));

export const prompt = () => null;

export const valid = (s) => !!s && typeof s === 'object' && typeof s.solved === 'boolean' &&
  Array.isArray(s.t) && s.t.length === PILLAR_BITS && s.t.every((t) => Number.isFinite(t) && t >= 0 && t <= LINGER);

export function forceSolve(s) { s.solved = true; s.t.fill(0); }

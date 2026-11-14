// The Relay: a flame that burns for six seconds must be carried up the winding trail to the
// great brazier on the summit. Whoever carries it cannot run, so the two walkers leapfrog,
// passing it between them. Lighting the great brazier ends the whole walk. Pure rules, no
// three.js.
import { SITES } from '../world/layout.js';
import { MAX_DT } from '../config.js';

export const BURN = 6;        // seconds a flame lasts after it is taken or passed
export const TAKE_R = 1.5;    // a press this close to the small brazier takes the free flame
export const PASS_R = 1.8;    // a press this close to the holder takes it from them
export const LIGHT_R = 2;     // the holder's press this close to the great brazier lights it

const flat = (p, xz) => Math.hypot(p.x - xz[0], p.z - xz[1]);
const dist3 = (a, b) => Math.hypot(a.x - b.x, (a.y || 0) - (b.y || 0), a.z - b.z);
const here = (p) => !!p?.present;

export const create = () => ({ holder: null, t: 0, solved: false });

export function step(s, players, dt) {
  if (s.solved) return;
  dt = Number.isFinite(dt) ? Math.min(Math.max(dt, 0), MAX_DT) : 0;
  // (1) a holder who has gone takes the flame with them: it returns to the small brazier
  if (s.holder !== null && !here(players[s.holder])) { s.holder = null; s.t = 0; }
  const h = s.holder;
  // (2) presses
  if (h !== null && here(players[h]) && players[h].pressed && flat(players[h], SITES.relay.great) <= LIGHT_R) {
    s.solved = true;
    return;
  }
  const o = h === null ? null : 1 - h;
  if (o !== null && here(players[o]) && players[o].pressed && dist3(players[o], players[h]) <= PASS_R) {
    s.holder = o; s.t = BURN;
  } else if (h === null) {
    for (let i = 0; i < 2; i++) {
      const p = players[i];
      if (here(p) && p.pressed && flat(p, SITES.relay.small) <= TAKE_R) { s.holder = i; s.t = BURN; break; }
    }
  }
  // (3) the flame burns
  if (s.holder !== null) {
    s.t -= dt;
    if (s.t <= 0) { s.holder = null; s.t = 0; }
  }
}

// Carrying the flame: no running.
export const mustWalk = (s, idx) => s.holder === idx && !s.solved;

export function prompt(s, idx, players) {
  const me = players[idx];
  if (s.solved || !here(me)) return null;
  if (s.holder === null) return flat(me, SITES.relay.small) <= TAKE_R ? 'E — take the flame' : null;
  if (s.holder === idx) return flat(me, SITES.relay.great) <= LIGHT_R ? 'E — light the brazier' : "Pass it on before it burns out — you can't run";
  const h = players[s.holder];
  return here(h) && dist3(me, h) <= PASS_R ? 'E — take the flame' : null;
}

export const valid = (s) => !!s && typeof s === 'object' &&
  (s.holder === null || s.holder === 0 || s.holder === 1) &&
  Number.isFinite(s.t) && s.t >= 0 && s.t <= BURN && typeof s.solved === 'boolean';

// Settled: the great brazier burns and nobody carries anything.
export function forceSolve(s) { s.solved = true; s.holder = null; s.t = 0; }

// The Bells: act at the same moment. Two bells stand on two outcrops far apart; ringing one
// alone does nothing, but when both have been rung within WINDOW seconds of each other the
// stone steps to the next island rise. Pure rules, no three.js.
import { SITES } from '../world/layout.js';
import { clamp } from '../core/math.js';

export const WINDOW = 1.0;     // seconds within which both bells must have been rung
const REACH = 1.5;             // a walker this close to a bell can ring it
const RISE_SECS = 2.5;         // the steps take this long to rise once solved
const NEVER = 999;             // "seconds since last rung" for a bell never rung; also the cap

export const create = () => ({ a: NEVER, b: NEVER, steps: 0, solved: false, hint: false });

const dist = (p, xz) => Math.hypot(p.x - xz[0], p.z - xz[1]);

// Which bell (0 = a, 1 = b) is walker p within reach of? The nearer one; never both.
function bellNear(p) {
  const da = dist(p, SITES.bells.a), db = dist(p, SITES.bells.b);
  if (Math.min(da, db) > REACH) return -1;
  return da <= db ? 0 : 1;
}

export function step(s, players, dt) {
  s.a = Math.min(NEVER, s.a + dt);
  s.b = Math.min(NEVER, s.b + dt);
  let rang = false;
  for (const p of players) {
    if (!p?.present || !p.pressed) continue;
    const w = bellNear(p);
    if (w === 0) { s.a = 0; rang = true; } else if (w === 1) { s.b = 0; rang = true; }
  }
  if (!s.solved) {
    if (s.a < WINDOW && s.b < WINDOW) s.solved = true;
    else if (rang) s.hint = true;
  }
  if (s.solved) s.steps = clamp(s.steps + dt / RISE_SECS, 0, 1);
}

export function prompt(s, idx, players) {
  const me = players[idx];
  if (s.solved || !me?.present || bellNear(me) < 0) return null;
  return 'E — ring the bell';
}

export const valid = (s) => !!s && typeof s === 'object' &&
  Number.isFinite(s.a) && s.a >= 0 && s.a <= NEVER && Number.isFinite(s.b) && s.b >= 0 && s.b <= NEVER &&
  Number.isFinite(s.steps) && s.steps >= 0 && s.steps <= 1 &&
  typeof s.solved === 'boolean' && typeof s.hint === 'boolean';

export function forceSolve(s) { s.a = NEVER; s.b = NEVER; s.steps = 1; s.solved = true; s.hint = false; }

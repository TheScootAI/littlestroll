// The Lift: a crank raises a platform only while it is held. One walker cranks, the other
// rides up to the ledge and kicks a rope ladder down so the cranker can follow.
// Pure rules, no three.js.
import { SITES, zoneAt } from '../world/layout.js';
import { clamp } from '../core/math.js';

export const RISE = 0.25;   // fraction per second while cranking
export const SINK = 0.35;   // fraction per second otherwise
const REACH = 1.5;

export const create = () => ({ y: 0, cranking: false, ladder: false, solved: false });

const near = (p, xz) => Math.hypot(p.x - xz[0], p.z - xz[1]) <= REACH;

export function step(s, players, dt) {
  const here = players.filter((p) => p?.present);
  s.cranking = here.some((p) => p.hold && near(p, SITES.lift.crank));
  s.y = clamp(s.y + (s.cranking ? RISE : -SINK) * dt, 0, 1);
  if (!s.ladder) {
    for (const p of here) {
      if (p.pressed && near(p, SITES.lift.post) && zoneAt(p.x, p.z) === 'F') { s.ladder = true; break; }
    }
  }
  s.solved = s.ladder;
}

export function prompt(s, idx, players) {
  const me = players[idx];
  if (s.solved || !me?.present) return null;
  if (near(me, SITES.lift.crank)) return 'Hold E — turn the crank';
  if (near(me, SITES.lift.post) && zoneAt(me.x, me.z) === 'F') return 'E — kick the ladder down';
  return null;
}

export const valid = (s) => !!s && typeof s === 'object' &&
  Number.isFinite(s.y) && s.y >= 0 && s.y <= 1 &&
  typeof s.cranking === 'boolean' && typeof s.ladder === 'boolean' && typeof s.solved === 'boolean';

export function forceSolve(s) {
  s.y = 0; s.cranking = false; s.ladder = true; s.solved = true;
}

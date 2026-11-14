// The Signal: one reads four symbols off the back of a wall, the other sets four dials.
// Pure rules, no three.js.
import { SITES } from '../world/layout.js';
import { rng } from '../core/math.js';

export const SYMBOLS = 6;       // circle, triangle, square, cross, crescent, zigzag
const DIAL_R = 1.0;             // a press this close to a dial turns it
const SWING_S = 2;              // seconds for the bridge to swing out

const near = (p, xz, r) => Math.hypot(p.x - xz[0], p.z - xz[1]) <= r;

function draw(seed) {
  const r = rng(seed);
  const a = [0, 1, 2, 3].map(() => Math.floor(r() * SYMBOLS));
  if (a.every((v) => v === 0)) a[3] = 1 + (a[0] + 3) % (SYMBOLS - 1);   // deterministic fix-up
  return a;
}

export const create = (seed = 0) =>
  ({ answer: draw(seed), dials: [0, 0, 0, 0], lit: false, bridge: 0, solved: false });

export function step(s, players, dt) {
  const { dials, dialZone } = SITES.signal;
  const here = players.filter((p) => p.present);
  s.lit = here.some((p) => near(p, [dialZone.x, dialZone.z], dialZone.r));
  if (!s.solved) {
    for (const p of here) {
      if (!p.pressed) continue;
      let best = -1, bd = DIAL_R;
      dials.forEach((d, i) => {
        const dd = Math.hypot(p.x - d[0], p.z - d[1]);
        if (dd <= bd) { bd = dd; best = i; }
      });
      if (best >= 0) s.dials[best] = (s.dials[best] + 1) % SYMBOLS;
    }
    if (s.dials.every((v, i) => v === s.answer[i])) s.solved = true;
  }
  if (s.solved) s.bridge = Math.min(1, s.bridge + dt / SWING_S);
}

export function prompt(s, idx, players) {
  const me = players[idx];
  if (s.solved || !me?.present) return null;
  if (SITES.signal.dials.some((d) => near(me, d, DIAL_R))) return 'E — turn the dial';
  if (near(me, SITES.signal.lookout, 4))
    return s.lit ? 'Tell your friend what you see' : 'The wall is blank — someone has to stand at the dials';
  return null;
}

// Is (x, z) behind the wall (the lookout's side), past its plane by at least `margin` metres?
// The wall faces `wall.yaw` (toward the dials); forward is (-sin yaw, -cos yaw).
export function onBackSide(wall, x, z, margin = 1) {
  const fx = -Math.sin(wall.yaw), fz = -Math.cos(wall.yaw);
  return (x - wall.x) * fx + (z - wall.z) * fz < -margin;
}

const int4 = (a) => Array.isArray(a) && a.length === 4 && a.every((v) => Number.isInteger(v) && v >= 0 && v < SYMBOLS);

// Is `s` a well-formed signal slice? (checked on every state a joiner receives)
export const valid = (s) => !!s && typeof s === 'object' && int4(s.answer) && int4(s.dials) &&
  s.answer.some((v) => v !== 0) && typeof s.lit === 'boolean' && typeof s.solved === 'boolean' &&
  Number.isFinite(s.bridge) && s.bridge >= 0 && s.bridge <= 1;

export function forceSolve(s) { s.dials = [...s.answer]; s.solved = true; s.bridge = 1; }

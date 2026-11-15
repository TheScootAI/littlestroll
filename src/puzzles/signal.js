// The Signal: one reads four symbols off the back of a wall, the other sets four dials.
// Pure rules, no three.js.
import { SITES } from '../world/layout.js';
import { rng, pointSegDist } from '../core/math.js';

export const SYMBOLS = 6;       // circle, triangle, square, cross, crescent, zigzag
const DIAL_R = 1.0;             // a press this close to a dial turns it
const BARRIER_CLEAR = 0.9;      // the barrier waits to rise while a walker is this close to it
const SWING_S = 2;              // seconds for the bridge to swing out

const near = (p, xz, r) => Math.hypot(p.x - xz[0], p.z - xz[1]) <= r;

// The four symbols for a deal. Deal 0 is the first four of a stroll. Each later deal is
// drawn from its own stream and differs from the one before: the first symbol's parity
// follows the deal's (so consecutive deals from 1 on cannot match), and deal 1 is nudged
// if it happens to equal deal 0. No walk down the deals, so any deal number is O(1).
export function draw(seed, deal = 0) {
  const first = () => {
    const r = rng(seed);
    const a = [0, 1, 2, 3].map(() => Math.floor(r() * SYMBOLS));
    if (a.every((v) => v === 0)) a[3] = 1 + (a[0] + 3) % (SYMBOLS - 1);   // deterministic fix-up
    return a;
  };
  if (deal === 0) return first();
  const r = rng(Math.imul(seed | 0, 0x9e3779b1) ^ Math.imul(deal | 0, 0x85ebca6b) ^ 0x5bd1e995);
  const a = [2 * Math.floor(r() * (SYMBOLS / 2)) + (deal % 2), ...[1, 2, 3].map(() => Math.floor(r() * SYMBOLS))];
  if (a.every((v) => v === 0)) a[3] = 1 + (a[0] + 3) % (SYMBOLS - 1);
  if (deal === 1) { const f = first(); if (a.every((v, i) => v === f[i])) a[3] = (a[3] + 1) % SYMBOLS; }
  return a;
}

export const create = (seed = 0) =>
  ({ answer: draw(seed), dials: [0, 0, 0, 0], seed, deal: 0, held: false, up: false, lit: false, bridge: 0, solved: false });

// Is walker p on the plate at the lookout?
export const onPlate = (p) => !!p.present && near(p, [SITES.signal.plate.x, SITES.signal.plate.z], SITES.signal.plate.r);

export function step(s, players, dt) {
  const { dials, barrier } = SITES.signal;
  const here = players.filter((p) => p.present);
  const was = s.held;
  s.held = here.some(onPlate);
  if (was && !s.held && !s.solved) { s.deal += 1; s.answer = draw(s.seed, s.deal); }
  if (s.solved) s.up = false;
  else if (!s.held) s.up = false;
  else if (!s.up && !here.some((p) => pointSegDist(p.x, p.z, barrier.ax, barrier.az, barrier.bx, barrier.bz).d <= BARRIER_CLEAR)) s.up = true;
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
    if (s.held && s.dials.every((v, i) => v === s.answer[i])) { s.solved = true; s.up = false; }
  }
  s.lit = s.held || s.solved;
  if (s.solved) s.bridge = Math.min(1, s.bridge + dt / SWING_S);
}

export function prompt(s, idx, players) {
  const me = players[idx];
  if (s.solved || !me?.present) return null;
  if (SITES.signal.dials.some((d) => near(me, d, DIAL_R))) return 'E — turn the dial';
  return null;
}

// Is (x, z) behind the wall (the lookout's side), past its plane by at least `margin` metres?
// The wall faces `wall.yaw` (toward the dials); forward is (-sin yaw, -cos yaw).
export function onBackSide(wall, x, z, margin = 1) {
  const fx = -Math.sin(wall.yaw), fz = -Math.cos(wall.yaw);
  return (x - wall.x) * fx + (z - wall.z) * fz < -margin;
}

const sameFour = (a, b) => a.every((v, i) => v === b[i]);
const int4 = (a) => Array.isArray(a) && a.length === 4 && a.every((v) => Number.isInteger(v) && v >= 0 && v < SYMBOLS);

// Is `s` a well-formed signal slice? (checked on every state a joiner receives)
export const valid = (s) => !!s && typeof s === 'object' && int4(s.answer) && int4(s.dials) &&
  s.answer.some((v) => v !== 0) && typeof s.lit === 'boolean' && typeof s.solved === 'boolean' &&
  Number.isFinite(s.bridge) && s.bridge >= 0 && s.bridge <= 1 &&
  Number.isSafeInteger(s.seed) && Number.isInteger(s.deal) && s.deal >= 0 && s.deal <= 1e9 &&
  typeof s.held === 'boolean' && typeof s.up === 'boolean' &&
  sameFour(s.answer, draw(s.seed, s.deal));   // never adopt symbols the host could not have dealt

export function forceSolve(s) { s.dials = [...s.answer]; s.solved = true; s.bridge = 1; s.held = false; s.up = false; s.lit = true; }

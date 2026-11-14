// The Beam: the finale. A lamp throws a fixed ray. A walker carrying a mirror who stands
// in the light sends it on from their chest in the direction they are looking. The rock
// outcrop blocks every single-bounce path, so it takes lamp -> mirror -> mirror -> lens.
// Two seconds on the lens lights the beacon. Pure rules, no three.js.
import { SITES, heightAt, DYN_NONE } from '../world/layout.js';
import { occluded } from '../world/sight.js';
import { clamp } from '../core/math.js';

export { occluded };

export const HIT_R = 0.9;    // a chest this close to the ray takes the beam
export const LENS_R = 1.5;   // the ray passing this close to the lens lands on it
export const CHARGE = 2;     // seconds on the lens to light the beacon
export const REACH = 60;     // a leg that hits nothing stops after this many metres
export const CHEST = 0.9;    // a walker's chest above their feet
const GRAB = 1.2;            // how near a free mirror must be to pick it up (XZ)
const WET = 0.2;             // ground below this is water: a mirror let go there goes home
const OFF_GROUND = 0.6;      // feet this far above/below the ground: mid-fall, it goes home
const EPS = 1e-6;

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const at = (o, d, t) => [o[0] + d[0] * t, o[1] + d[1] * t, o[2] + d[2] * t];
const unit = (v) => {
  const l = Math.hypot(v[0], v[1], v[2]);
  return l > EPS && Number.isFinite(l) ? [v[0] / l, v[1] / l, v[2] / l] : null;
};

// Distance along the ray o + d·t (t > 0, t <= REACH) to point p, or null if p is behind,
// beyond REACH, or more than r off the ray.
function along(o, d, p, r) {
  const v = sub(p, o), t = dot(v, d);
  if (!(t > EPS) || t > REACH) return null;
  const q = sub(v, [d[0] * t, d[1] * t, d[2] * t]);
  return dot(q, q) <= r * r ? t : null;
}

// Where the ray first enters a rock, or REACH. `occluded(o, o + d·t)` can only turn
// from false to true as t grows, so bisection finds the edge.
function rockStop(o, d) {
  if (!occluded(o, at(o, d, REACH))) return REACH;
  let lo = 0, hi = REACH;
  for (let i = 0; i < 30; i++) {
    const mid = (lo + hi) / 2;
    if (occluded(o, at(o, d, mid))) hi = mid; else lo = mid;
  }
  return hi;
}

// Follow the lamp's ray through the holders ([h0, h1], each { pos, aim } or null; pos is
// already at chest height). Returns the legs, whether the last one ends on the lens, and
// which walker indices took the beam, in order.
export function trace(holders) {
  const { lamp, lens } = SITES.beam;
  const segs = [], hit = [];
  let o = lamp.o.slice(), d = unit(lamp.d);
  for (;;) {
    let best = null, bestT = Infinity;
    holders.forEach((h, i) => {
      if (!h || hit.includes(i)) return;
      const t = along(o, d, h.pos, HIT_R);
      if (t !== null && t < bestT && !occluded(o, h.pos)) { best = i; bestT = t; }
    });
    if (best !== null) {
      const pos = holders[best].pos;
      segs.push([...o, ...pos]);
      hit.push(best);
      const nd = unit(holders[best].aim);
      if (!nd) return { segs, onLens: false, hit };   // no direction: the beam stops here
      o = pos.slice(); d = nd;
      continue;
    }
    if (along(o, d, lens, LENS_R) !== null && !occluded(o, lens)) {
      segs.push([...o, ...lens]);
      return { segs, onLens: true, hit };
    }
    segs.push([...o, ...at(o, d, rockStop(o, d))]);
    return { segs, onLens: false, hit };
  }
}

export const create = () => ({
  mirrors: SITES.beam.mirrors.map(([x, z]) => ({ x, z, by: null })),
  segs: [], onLens: false, charge: 0, solved: false,
});

const r2 = (v) => (Math.round(v * 100) / 100) || 0;   // || 0 turns -0 into 0
const carries = (s, i) => s.mirrors.some((m) => m.by === i);

// [h0, h1] for trace: present walkers carrying a mirror, from the chest along their aim.
function holdersOf(s, players) {
  return [0, 1].map((i) => {
    const p = players[i];
    if (!p?.present || !carries(s, i)) return null;
    return { pos: [p.x, p.y + CHEST, p.z], aim: p.aim };
  });
}

// Let go of mirror i at (x, z). Where nobody could reach it again (over water, or the
// carrier mid-fall, y given and well off the ground) it goes back to its own stand.
function release(s, i, x, z, y) {
  const m = s.mirrors[i], g = heightAt(x, z, DYN_NONE);
  m.by = null;
  const lost = !(g >= WET) || (Number.isFinite(y) && Math.abs(y - g) > OFF_GROUND);
  [m.x, m.z] = lost ? SITES.beam.mirrors[i] : [r2(x), r2(z)];
}

function freeNear(s, p) {
  let best = null, bestD = GRAB;
  for (const m of s.mirrors) {
    if (m.by !== null) continue;
    const dd = Math.hypot(m.x - p.x, m.z - p.z);
    if (dd <= bestD) { best = m; bestD = dd; }
  }
  return best;
}

export function step(s, players, dt) {
  if (s.solved) return;   // lit stays lit: the ending must not knock it off the lens
  // carried mirrors go where their carrier is; a carrier who left drops theirs there
  s.mirrors.forEach((m, k) => {
    if (m.by === null) return;
    const c = players[m.by];
    if (!c?.present) { release(s, k, m.x, m.z); return; }   // no y for a walker who has gone
    m.x = r2(c.x); m.z = r2(c.z);
  });
  // E: set yours down where you stand, or pick up the nearest free one in reach
  for (const i of [0, 1]) {
    const p = players[i];
    if (!p?.present || !p.pressed) continue;
    const k = s.mirrors.findIndex((m) => m.by === i);
    if (k >= 0) { release(s, k, p.x, p.z, p.y); continue; }
    const m = freeNear(s, p);
    if (m) { m.by = i; m.x = r2(p.x); m.z = r2(p.z); }
  }
  const r = trace(holdersOf(s, players));
  s.segs = r.segs.map((g) => g.map(r2));
  s.onLens = r.onLens;
  s.charge = clamp(s.charge + (r.onLens ? dt : -dt), 0, CHARGE);
  if (s.charge >= CHARGE - 1e-9) { s.charge = CHARGE; s.solved = true; }
}

export function prompt(s, idx, players) {
  const me = players[idx];
  if (s.solved || !me?.present) return null;
  if (carries(s, idx)) return 'E — put down the mirror';
  return freeNear(s, me) ? 'E — pick up the mirror' : null;
}

const fin = (v) => typeof v === 'number' && Number.isFinite(v);
export const valid = (s) => !!s && typeof s === 'object' && !Array.isArray(s) &&
  Array.isArray(s.mirrors) && s.mirrors.length === 2 &&
  s.mirrors.every((m) => !!m && typeof m === 'object' && fin(m.x) && fin(m.z) && (m.by === null || m.by === 0 || m.by === 1)) &&
  Array.isArray(s.segs) && s.segs.length <= 3 &&
  s.segs.every((g) => Array.isArray(g) && g.length === 6 && g.every(fin)) &&
  typeof s.onLens === 'boolean' && typeof s.solved === 'boolean' &&
  fin(s.charge) && s.charge >= 0 && s.charge <= CHARGE;

export function forceSolve(s) {
  s.charge = CHARGE; s.solved = true;
}

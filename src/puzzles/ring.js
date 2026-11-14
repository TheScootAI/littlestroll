// The Ring: eight blank standing stones; each session carves a different sign on each (never
// shown on them) and picks an order of four. Two far-apart seeing stones show the halves: one
// the order (four signs), one a picture of the ring with every stone's sign. A face shows only
// to a walker at its spot while the other walker is at the other spot (seesFace). Touching
// (E beside a stone) counts only while both walkers are inside the ring and lights the stone,
// right or wrong; four lit are judged: the order exactly -> the steps rise, else all go out.
// Pure rules, no three.js.
import { SITES } from '../world/layout.js';
import { rng } from '../core/math.js';
import { MAX_DT } from '../config.js';

export const STONES = 8, LEN = 4, REACH = 1.5;
const RISE_S = 2.5;             // seconds for the steps to rise
const SEED_OFFSET = 0x52696e67; // keeps the stream apart from the Signal's and the Marsh's

const R = SITES.ring;
const dist = (p, x, z) => Math.hypot(p.x - x, p.z - z);

export function deal(seed) {
  const r = rng((seed >>> 0) + SEED_OFFSET);
  const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const ids = Array.from({ length: STONES }, (_, i) => i);
  return { signs: shuffle([...ids]), order: shuffle([...ids]).slice(0, LEN) };
}

// Where stone i sits in the ring picture (unit circle: x right/east, y up/north, entrance at the
// bottom). Stone i stands at bearing PI + (i + 0.5) * 45 degrees clockwise from north.
export const facePos = (i) => { const b = Math.PI + (i + 0.5) * Math.PI / 4; return [Math.sin(b), Math.cos(b)]; };

export const create = (seed = 0) => ({ ...deal(seed), touched: [], miss: 999, steps: 0, solved: false });

export const inside = (p) => !!p?.present && dist(p, R.centre[0], R.centre[1]) <= R.r;
export const bothInside = (players) => players.length === 2 && players.every(inside);
export const atSpot = (p, i) => !!p?.present && dist(p, R.seeing[i].spot.x, R.seeing[i].spot.z) <= R.seeing[i].spot.r;

// Which face does walker idx see? Face 0 the order, face 1 the ring; everything once solved.
export const seesFace = (s, face, players, idx) =>
  !!s.solved || (atSpot(players[idx], face) && atSpot(players[1 - idx], 1 - face));

// The standing stone this walker would touch (the nearest within REACH), or -1.
function stoneNear(p) {
  let best = -1, bd = REACH;
  R.stones.forEach(([x, z], i) => { const d = dist(p, x, z); if (d <= bd) { bd = d; best = i; } });
  return best;
}

export function step(s, players, dt) {
  dt = Number.isFinite(dt) ? Math.min(Math.max(dt, 0), MAX_DT) : 0;
  s.miss = Math.min(999, s.miss + dt);
  if (!s.solved && bothInside(players)) {
    for (const p of players) {
      if (!p.pressed) continue;
      const k = stoneNear(p);
      if (k < 0 || s.touched.includes(k)) continue;
      s.touched.push(k);
      if (s.touched.length === LEN) {
        if (s.touched.every((v, i) => v === s.order[i])) { s.solved = true; break; }
        s.touched = []; s.miss = 0;
      }
    }
  }
  if (s.solved) s.steps = Math.min(1, s.steps + dt / RISE_S);
}

export function prompt(s, idx, players) {
  const me = players[idx];
  if (s.solved || !me?.present || !bothInside(players)) return null;
  return stoneNear(me) >= 0 ? 'E — touch the stone' : null;
}

const distinct = (a, n, max) => Array.isArray(a) && a.length === n && a.every((v) => Number.isInteger(v) && v >= 0 && v < max) && new Set(a).size === n;

export const valid = (s) => !!s && typeof s === 'object' && distinct(s.signs, STONES, STONES) && distinct(s.order, LEN, STONES) &&
  Array.isArray(s.touched) && s.touched.length <= LEN && distinct(s.touched, s.touched.length, STONES) &&
  Number.isFinite(s.miss) && s.miss >= 0 && s.miss <= 999 && Number.isFinite(s.steps) && s.steps >= 0 && s.steps <= 1 &&
  typeof s.solved === 'boolean';

export function forceSolve(s) { s.touched = [...s.order]; s.steps = 1; s.solved = true; }

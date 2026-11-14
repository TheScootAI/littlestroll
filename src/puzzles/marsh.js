// The Marsh: one watches, one walks. A 5 x 6 grid of identical stone tiles lies over a marsh;
// only one random path of them is solid, and only someone standing on the watch-stone can see
// which (the view decides that, with seesPath). The tiles hold only while a walker stays on the
// watch-stone's plate, so the watcher has to talk the other across. Pure rules, no three.js.
import { SITES } from '../world/layout.js';
import { rng } from '../core/math.js';

const { cols: COLS, rows: ROWS } = SITES.marsh;
const TILES = COLS * ROWS;
const LEVER_R = 1.5;           // a press this close to the lever pulls it
const EDGE_R = 3;              // within this of row 0 (and not on a tile) the walker is told to find a watcher
const MAX_LEN = TILES;

const near = (p, x, z, r) => Math.hypot(p.x - x, p.z - z) <= r;
const rowOf = (i) => Math.floor(i / COLS), colOf = (i) => i % COLS;

// Is `p` (a tile list in walking order) a legal safe path? Forward or sideways one tile at a
// time, never back or diagonal, never revisiting; from row 0 to the last row; at least two
// sideways moves; and no two non-consecutive tiles side by side (corners may touch only where
// the path turns, two steps apart: the 0.3 m margins of corner-touching tiles join there).
export function pathOk(p) {
  if (!Array.isArray(p) || p.length < ROWS || p.length > MAX_LEN) return false;
  if (!p.every((i) => Number.isInteger(i) && i >= 0 && i < TILES)) return false;
  if (new Set(p).size !== p.length) return false;
  if (rowOf(p[0]) !== 0 || rowOf(p.at(-1)) !== ROWS - 1) return false;
  let sideways = 0;
  for (let k = 1; k < p.length; k++) {
    const dr = rowOf(p[k]) - rowOf(p[k - 1]), dc = Math.abs(colOf(p[k]) - colOf(p[k - 1]));
    if (!(dr === 1 && dc === 0) && !(dr === 0 && dc === 1)) return false;
    if (dr === 0) sideways++;
  }
  if (sideways < 2) return false;
  for (let a = 0; a < p.length; a++) for (let b = a + 2; b < p.length; b++) {
    const dr = Math.abs(rowOf(p[a]) - rowOf(p[b])), dc = Math.abs(colOf(p[a]) - colOf(p[b]));
    if (dr + dc === 1) return false;
    if (dr === 1 && dc === 1 && b - a !== 2) return false;
  }
  return true;
}

// The safe path for a seed: tile indexes in walking order. A row's sideways run goes one way
// only (so no tile is revisited); the next row's run goes the same way or none (a U-turn
// would put two tiles side by side). Rejection-sampled against pathOk.
export function makePath(seed = 0) {
  const r = rng(seed);
  for (let attempt = 0; attempt < 200; attempt++) {
    let c = Math.floor(r() * COLS), lastDir = 0;
    const p = [c];
    for (let row = 0; row < ROWS; row++) {
      if (row > 0) { p.push(row * COLS + c); }
      if (r() < 0.55) {
        let dir = r() < 0.5 ? -1 : 1;
        if (lastDir && dir !== lastDir) dir = lastDir;
        const n = 1 + Math.floor(r() * 2);
        let moved = 0;
        for (let k = 0; k < n; k++) {
          const nc = c + dir;
          if (nc < 0 || nc >= COLS) break;
          c = nc; p.push(row * COLS + c); moved++;
        }
        if (moved) lastDir = dir; else lastDir = 0;
      } else lastDir = 0;
    }
    if (pathOk(p)) return p;
  }
  return [2, 7, 8, 13, 18, 17, 22, 27];   // unreachable in practice: a fixed legal path
}

export const create = (seed = 0) => ({ path: makePath(seed), held: false, solved: false });

export const onPlate = (p) => !!p?.present && near(p, SITES.marsh.plate.x, SITES.marsh.plate.z, SITES.marsh.plate.r);

export function step(s, players, dt) {
  s.held = players.some(onPlate);
  if (s.solved) return;
  for (const p of players) {
    if (p?.present && p.pressed && near(p, SITES.marsh.lever[0], SITES.marsh.lever[1], LEVER_R)) { s.solved = true; break; }
  }
}

// The bit mask of solid tiles (bit i = tile i): the path while watched or solved, else none.
export const maskOf = (s) => (s.held || s.solved ? s.path.reduce((m, i) => m | (1 << i), 0) : 0);

// May this walker see which tiles are safe? On the plate, or anyone once it is solved.
export const seesPath = (s, walker) => !!s.solved || onPlate(walker);

// Distance from p to the near edge of the grid (row 0), and whether p is over a tile.
function nearEdge(p) {
  const { origin, right, fwd, tile } = SITES.marsh;
  const u = (p.x - origin[0]) * right[0] + (p.z - origin[1]) * right[1];
  const v = (p.x - origin[0]) * fwd[0] + (p.z - origin[1]) * fwd[1];
  const du = Math.max(0, -u, u - COLS * tile);
  if (v >= 0) return Infinity;           // on the grid or beyond it: not at the near edge
  return Math.hypot(du, v);
}

export function prompt(s, idx, players) {
  const me = players[idx];
  if (s.solved || !me?.present) return null;
  if (onPlate(me)) return 'Stay here — the stones hold while you watch. Guide your friend.';
  if (!s.held && nearEdge(me) <= EDGE_R) return 'Someone has to watch from the stone';
  if (near(me, SITES.marsh.lever[0], SITES.marsh.lever[1], LEVER_R)) return 'E — pull the lever';
  return null;
}

export const valid = (s) => !!s && typeof s === 'object' && typeof s.held === 'boolean' &&
  typeof s.solved === 'boolean' && pathOk(s.path);

export function forceSolve(s) { s.solved = true; s.held = false; }

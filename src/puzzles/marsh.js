// The Marsh: one watches, one walks. A 5 x 6 grid of identical stone tiles lies over a marsh;
// only one random path of them is solid, and only someone standing on the watch-stone can see
// which (the view decides that, with seesPath). The tiles hold only while a walker stays on the
// watch-stone's plate, so the watcher has to talk the other across. Pure rules, no three.js.
import { SITES, MARSH_SURFACE, heightAt, marshTileAt } from '../world/layout.js';
import { rng, pointSegDist } from '../core/math.js';
import { BARRIER_CLEAR } from './signal.js';

const { cols: COLS, rows: ROWS } = SITES.marsh;
const TILES = COLS * ROWS;
const LEVER_R = 1.5;           // a press this close to the lever pulls it
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

// Paths come in two kinds, by the parity of their tile numbers' sum. Deal d is drawn until it
// is of kind d & 1, so consecutive deals always differ (as the Signal's symbols do), and any
// deal is O(1) in the deal number. Two fixed legal paths of opposite kinds back the draw up.
const kind = (p) => p.reduce((a, i) => a + i, 0) & 1;
export const FALLBACK = [[2, 7, 8, 13, 18, 17, 22, 27], [1, 0, 5, 10, 15, 16, 21, 22, 27]];   // by kind, 0 then 1
const TRIES = 12;
export function pathFor(seed, deal = 0) {
  const d = deal | 0, base = Math.imul(seed | 0, 0x9e3779b1) ^ Math.imul(d, 0x85ebca6b) ^ 0x5bd1e995;
  for (let k = 0; k < TRIES; k++) {
    const p = makePath(Math.imul(base ^ Math.imul(k + 1, 0xc2b2ae35), 0x27d4eb2f) >>> 0);
    if (kind(p) === (d & 1)) return p;
  }
  return FALLBACK[d & 1].slice();
}

export const create = (seed = 0) => ({ path: pathFor(seed, 0), seed, deal: 0, held: false, up: false, solved: false });

export const onPlate = (p) => !!p?.present && near(p, SITES.marsh.plate.x, SITES.marsh.plate.z, SITES.marsh.plate.r);

export function step(s, players, dt) {
  const { barrier } = SITES.marsh;
  const here = players.filter((p) => p?.present);
  const was = s.held;
  s.held = here.some(onPlate);
  if (was && !s.held && !s.solved) { s.deal += 1; s.path = pathFor(s.seed, s.deal); }
  if (s.solved || !s.held) s.up = false;
  else if (!s.up && !here.some((p) => pointSegDist(p.x, p.z, barrier.ax, barrier.az, barrier.bx, barrier.bz).d <= BARRIER_CLEAR)) s.up = true;
  if (s.solved) return;
  for (const p of here) {
    if (p.pressed && near(p, SITES.marsh.lever[0], SITES.marsh.lever[1], LEVER_R)) { s.solved = true; s.up = false; break; }
  }
}

// The bit mask of solid tiles (bit i = tile i): the path while watched or solved, else none.
export const maskOf = (s) => (s.held || s.solved ? s.path.reduce((m, i) => m | (1 << i), 0) : 0);

// May this walker see which tiles are safe? On the plate, or anyone once it is solved.
export const seesPath = (s, walker) => !!s.solved || onPlate(walker);

// Does a slab visibly give way under this walker? Only when the walker over it is actually
// unsupported (the ground at their feet is below the surface); a walker on a safe tile's 0.3 m
// margin over an unsafe neighbour is held, so the neighbour must not move (that would show
// which tiles are safe). `dyn` is the real one.
export function sinksUnder(walker, tileIndex, dyn) {
  if (!walker?.present || marshTileAt(walker.x, walker.z) !== tileIndex) return false;
  return heightAt(walker.x, walker.z, dyn) < MARSH_SURFACE - 0.2;
}

export function prompt(s, idx, players) {
  const me = players[idx];
  if (s.solved || !me?.present) return null;
  if (near(me, SITES.marsh.lever[0], SITES.marsh.lever[1], LEVER_R)) return 'E — pull the lever';
  return null;
}

const sameList = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);
export const valid = (s) => !!s && typeof s === 'object' && typeof s.held === 'boolean' &&
  typeof s.solved === 'boolean' && typeof s.up === 'boolean' && pathOk(s.path) &&
  Number.isSafeInteger(s.seed) && Number.isInteger(s.deal) && s.deal >= 0 && s.deal <= 1e9 &&
  sameList(s.path, pathFor(s.seed, s.deal));   // never adopt a path the host could not have dealt

export function forceSolve(s) { s.solved = true; s.held = false; s.up = false; }

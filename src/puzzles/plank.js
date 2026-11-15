// The Plank: timbers from a wreck on the starting beach (SITES.wreck), each too long for one
// walker. Each takes an end, they carry one together through the zigzag of standing stones
// and lay it across the gap. Only a piece NEED long bridges it; a shorter one tips into the
// water and is back at the wreck.
//
// A piece is rigid: it is always its own length long. While two carry it, it lies centred between
// them, pointing from one to the other, and the carriers must stay its length apart (give or
// take SLACK, which is room for two people on two computers to walk in step, not room to
// shorten the board). It is the board, at its full length, that must clear the stones.
// Whoever carries it cannot run. Pure rules, no three.js.
import { SITES, heightAt, DYN_NONE } from '../world/layout.js';
import { pointSegDist } from '../core/math.js';

export const LEN = 4;            // the plank's length (piece 0), for the views
export const NEED = 3.8;         // a piece at least this long bridges the gap
export const SLACK = 0.8;        // carriers may stand this much nearer or further than the piece's length
export const GRAB_R = 1.2;       // press this close to a free end to take it
export const DROP_EXTRA = 1.5;   // holders further apart than the piece's length plus this let go
export const PLACE_R = 2.5;      // letting go with the midpoint this close to the slot lays it
const ROOT_R = 0.6;              // a lone holder may stray this far from their end
const WATER_H = 0.2;
const STONE_PAD = 0.3;           // an end this close outside a stone's rim counts as inside it
const DRY = { ...DYN_NONE, gateOpen: true, bridge: true };   // a piece can only be carried to the signal's bridge once both are done

const pieces = SITES.wreck.pieces;
export const lengthOf = (i) => pieces[i].len;

export const create = () => ({
  boards: pieces.map((p) => ({ ax: p.a[0], az: p.a[1], bx: p.b[0], bz: p.b[1], holdA: null, holdB: null })),
  placed: null, splash: 999, solved: false,
});

const bothHeld = (b) => b.holdA !== null && b.holdB !== null;
const toRest = (b, i) => { const p = pieces[i]; [b.ax, b.az] = p.a; [b.bx, b.bz] = p.b; };

// Which piece and end walker idx holds, if any.
export function held(s, idx) {
  for (let i = 0; i < s.boards.length; i++) {
    if (s.boards[i].holdA === idx) return { i, end: 'A' };
    if (s.boards[i].holdB === idx) return { i, end: 'B' };
  }
  return null;
}
// Carrying it (so: no running).
export const carrying = (s, idx) => s.placed === null && held(s, idx) !== null;
// Piece i lies exactly at its rest with nobody holding it (the view leans it on the rock).
export function atRest(s, i) {
  const b = s.boards[i], p = pieces[i];
  return b.holdA === null && b.holdB === null && b.ax === p.a[0] && b.az === p.a[1] && b.bx === p.b[0] && b.bz === p.b[1];
}

// Come to rest centred on the midpoint, at full length, along the last direction.
function settle(b, i) {
  const len = lengthOf(i);
  const mx = (b.ax + b.bx) / 2, mz = (b.az + b.bz) / 2;
  let dx = b.bx - b.ax, dz = b.bz - b.az;
  const l = Math.hypot(dx, dz);
  if (l < 1e-6) { dx = 1; dz = 0; } else { dx /= l; dz /= l; }
  b.ax = mx - dx * len / 2; b.az = mz - dz * len / 2;
  b.bx = mx + dx * len / 2; b.bz = mz + dz * len / 2;
  const dry = (x, z) => heightAt(x, z, DRY) >= WATER_H;
  // an end inside a standing stone could never be reached again: treat it like water
  const inStone = (x, z) => SITES.plank.stones.some((c) => Math.hypot(x - c.x, z - c.z) < c.r + STONE_PAD);
  if (!dry(mx, mz) || !dry(b.ax, b.az) || !dry(b.bx, b.bz) || inStone(b.ax, b.az) || inStone(b.bx, b.bz)) toRest(b, i);
}

// Laid along the gap at the slot, centred, its own length.
function layAcross(b, i) {
  const [sx, sz] = SITES.plank.slot, len = lengthOf(i);
  Object.assign(b, { ax: sx, az: sz - len / 2, bx: sx, bz: sz + len / 2 });
}

// Did the splash clock just restart? `prev` is null/undefined until a first state has been seen.
export const splashed = (prev, sp) => prev != null && sp < prev;

// The rigid board of length `len` for carriers at (ax, az) and (bx, bz): [ax, az, bx, bz] of
// its two ends, centred between the carriers. `dir` is the way it lay before, for carriers who
// stand on the same spot.
export function board(len, ax, az, bx, bz, dir = [1, 0]) {
  const mx = (ax + bx) / 2, mz = (az + bz) / 2;
  let dx = bx - ax, dz = bz - az;
  const l = Math.hypot(dx, dz);
  if (l < 1e-6) [dx, dz] = dir; else { dx /= l; dz /= l; }
  return [mx - dx * len / 2, mz - dz * len / 2, mx + dx * len / 2, mz + dz * len / 2];
}

const follow = (b, i, players) => {
  const a = players[b.holdA], c = players[b.holdB];
  const l = Math.hypot(b.bx - b.ax, b.bz - b.az) || 1;
  [b.ax, b.az, b.bx, b.bz] = board(lengthOf(i), a.x, a.z, c.x, c.z, [(b.bx - b.ax) / l, (b.bz - b.az) / l]);
};

// Nearest free end within GRAB_R of (x, z): ties go to the lower piece, end A before B.
function nearestFree(s, x, z) {
  let best = null, bd = GRAB_R;
  s.boards.forEach((b, i) => {
    if (b.holdA === null) { const d = Math.hypot(x - b.ax, z - b.az); if (d <= bd && (!best || d < bd)) { best = { i, end: 'A' }; bd = d; } }
    if (b.holdB === null) { const d = Math.hypot(x - b.bx, z - b.bz); if (d <= bd && (!best || d < bd)) { best = { i, end: 'B' }; bd = d; } }
  });
  return best;
}

export function step(s, players, dt) {
  s.splash = Math.min(999, s.splash + dt);
  if (s.placed !== null) return;
  // a holder who has gone lets go; a pair losing one lets both go
  s.boards.forEach((b, i) => {
    const wasBoth = bothHeld(b);
    let gone = false;
    if (b.holdA !== null && !players[b.holdA]?.present) { b.holdA = null; gone = true; }
    if (b.holdB !== null && !players[b.holdB]?.present) { b.holdB = null; gone = true; }
    if (wasBoth && gone) { b.holdA = null; b.holdB = null; settle(b, i); }
    else if (wasBoth) follow(b, i, players);
  });
  const was = s.boards.map(bothHeld);
  const released = new Set();
  players.forEach((p, idx) => {
    if (!p?.present || !p.pressed) return;
    const h = held(s, idx);
    if (h) {
      s.boards[h.i][h.end === 'A' ? 'holdA' : 'holdB'] = null;
      released.add(h.i);
      return;
    }
    const g = nearestFree(s, p.x, p.z);
    if (g) s.boards[g.i][g.end === 'A' ? 'holdA' : 'holdB'] = idx;
  });
  for (const i of released) {
    const b = s.boards[i];
    if (!was[i]) continue;
    const mx = (b.ax + b.bx) / 2, mz = (b.az + b.bz) / 2;
    b.holdA = null; b.holdB = null;   // it is down: the other holder lets go too
    const [sx, sz] = SITES.plank.slot;
    if (Math.hypot(mx - sx, mz - sz) <= PLACE_R) {
      if (lengthOf(i) >= NEED) layAcross(b, i);
      else { toRest(b, i); s.splash = 0; }   // too short: it tips into the water
      if (lengthOf(i) >= NEED) { s.placed = i; s.solved = true; }
    } else settle(b, i);
    return;
  }
  s.boards.forEach((b, i) => {
    if (!bothHeld(b)) return;
    follow(b, i, players);
    const a = players[b.holdA], c = players[b.holdB];
    // carriers this far apart have lost their grip (one fell, or was sent back to a checkpoint)
    if (Math.hypot(c.x - a.x, c.z - a.z) > lengthOf(i) + DROP_EXTRA) { b.holdA = null; b.holdB = null; settle(b, i); }
  });
}

const near = (p, x, z, r) => Math.hypot(p.x - x, p.z - z) <= r;

export function prompt(s, idx, players) {
  const me = players[idx];
  if (s.placed !== null || !me?.present) return null;
  if (held(s, idx)) return 'E — let go';
  if (s.boards.some((b) => (b.holdA === null && near(me, b.ax, b.az, GRAB_R)) || (b.holdB === null && near(me, b.bx, b.bz, GRAB_R))))
    return 'E — pick up this end';
  return null;
}

// A veto on walker idx's next position (true = refuse), or null when they hold nothing.
export function veto(s, idx, players, stones = SITES.plank.stones) {
  if (s.placed !== null) return null;
  const h = held(s, idx);
  if (!h) return null;
  const b = s.boards[h.i], len = lengthOf(h.i), isA = h.end === 'A';
  if (!bothHeld(b)) {
    const me = players[idx];
    const ex = isA ? b.ax : b.bx, ez = isA ? b.az : b.bz;
    return (nx, nz) => {
      const d = Math.hypot(nx - ex, nz - ez);
      return d > ROOT_R && d > Math.hypot((me?.x ?? ex) - ex, (me?.z ?? ez) - ez);   // never trap a walker who grabbed from afar
    };
  }
  const o = players[isA ? b.holdB : b.holdA];
  if (!o?.present) return null;
  const me = players[idx];
  const here = me?.present ? me : null;
  // the board as it lies for me at (x, z): end order does not matter for what it touches
  const lie = (x, z) => (isA ? board(len, x, z, o.x, o.z) : board(len, o.x, o.z, x, z));
  const was = here ? lie(here.x, here.z) : null;
  return (nx, nz) => {
    // (1) The board cannot stretch or shrink: no step that takes the carriers further from its
    // length than SLACK. A pair already outside that (just picked up, or lag) may still step
    // any way that mends it.
    const d0 = here ? Math.hypot(here.x - o.x, here.z - o.z) : len, d1 = Math.hypot(nx - o.x, nz - o.z);
    if (d1 > len + SLACK && d1 > d0) return true;
    if (d1 < len - SLACK && d1 < d0) return true;
    // (2) The board may not newly cross a stone. If it already crosses one (lag can put it
    // there), a move is still allowed as long as it does not bring the board closer to that
    // stone's centre, so the pair can always work their way back out.
    const q = lie(nx, nz);
    return stones.some((c) => {
      const d = pointSegDist(c.x, c.z, q[0], q[1], q[2], q[3]).d;
      if (d > c.r) return false;
      if (!was) return true;
      const before = pointSegDist(c.x, c.z, was[0], was[1], was[2], was[3]).d;
      return before > c.r || d < before - 1e-9;
    });
  };
}

const holdOk = (h) => h === null || h === 0 || h === 1;
export function valid(s) {
  if (!s || typeof s !== 'object' || !Array.isArray(s.boards) || s.boards.length !== pieces.length) return false;
  const used = [];
  for (const b of s.boards) {
    if (!b || typeof b !== 'object' || !['ax', 'az', 'bx', 'bz'].every((k) => Number.isFinite(b[k])) || !holdOk(b.holdA) || !holdOk(b.holdB)) return false;
    if (b.holdA !== null && b.holdA === b.holdB) return false;
    used.push(...[b.holdA, b.holdB].filter((h) => h !== null));
  }
  if (new Set(used).size !== used.length) return false;   // a walker holds at most one end
  if (s.placed !== null && !(Number.isInteger(s.placed) && s.placed >= 0 && s.placed < pieces.length && lengthOf(s.placed) >= NEED)) return false;
  return Number.isFinite(s.splash) && s.splash >= 0 && s.splash <= 999 &&
    typeof s.solved === 'boolean' && s.solved === (s.placed !== null);
}

export function forceSolve(s) {
  s.boards.forEach((b) => { b.holdA = null; b.holdB = null; });
  layAcross(s.boards[0], 0);
  s.placed = 0; s.solved = true;
}

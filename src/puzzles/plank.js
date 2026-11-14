// The Plank: four metres of board, too long for one walker. Each takes an end, they carry
// it together through the zigzag of standing stones and lay it across the gap.
// Pure rules, no three.js.
import { SITES, heightAt, DYN_NONE } from '../world/layout.js';
import { pointSegDist } from '../core/math.js';

export const LEN = 4;
export const GRAB_R = 1.2;       // press this close to a free end to take it
export const DROP_DIST = 5.5;    // holders further apart than this let go
export const PLACE_R = 2.5;      // letting go with the midpoint this close to the slot lays it
const ROOT_R = 0.6;              // a lone holder may stray this far from their end
const WATER_H = 0.2;
const STONE_PAD = 0.3;           // an end this close outside a stone's rim counts as inside it

export const create = () => {
  const [ax, az] = SITES.plank.restA, [bx, bz] = SITES.plank.restB;
  return { ax, az, bx, bz, holdA: null, holdB: null, placed: false, solved: false };
};

const mid = (s) => [(s.ax + s.bx) / 2, (s.az + s.bz) / 2];

// Come to rest centred on the midpoint, at full length, along the last direction.
function settle(s) {
  const [mx, mz] = mid(s);
  let dx = s.bx - s.ax, dz = s.bz - s.az;
  const l = Math.hypot(dx, dz);
  if (l < 1e-6) { dx = 1; dz = 0; } else { dx /= l; dz /= l; }
  s.ax = mx - dx * LEN / 2; s.az = mz - dz * LEN / 2;
  s.bx = mx + dx * LEN / 2; s.bz = mz + dz * LEN / 2;
  const dry = (x, z) => heightAt(x, z, DYN_NONE) >= WATER_H;
  // an end inside a standing stone could never be reached again: treat it like water
  const inStone = (x, z) => SITES.plank.stones.some((c) => Math.hypot(x - c.x, z - c.z) < c.r + STONE_PAD);
  if (!dry(mx, mz) || !dry(s.ax, s.az) || !dry(s.bx, s.bz) || inStone(s.ax, s.az) || inStone(s.bx, s.bz)) {
    const [rax, raz] = SITES.plank.restA, [rbx, rbz] = SITES.plank.restB;
    s.ax = rax; s.az = raz; s.bx = rbx; s.bz = rbz;
  }
}

const bothHeld = (s) => s.holdA !== null && s.holdB !== null;
const follow = (s, players) => {
  const a = players[s.holdA], b = players[s.holdB];
  s.ax = a.x; s.az = a.z; s.bx = b.x; s.bz = b.z;
};

export function step(s, players, dt) {
  if (s.placed) return;
  const wasBoth = bothHeld(s);
  // a holder who has gone lets go
  let released = false;
  if (s.holdA !== null && !players[s.holdA]?.present) { s.holdA = null; released = true; }
  if (s.holdB !== null && !players[s.holdB]?.present) { s.holdB = null; released = true; }
  if (wasBoth && released) { s.holdA = null; s.holdB = null; settle(s); return; }   // a friend left: drop it
  if (wasBoth) follow(s, players);

  players.forEach((p, i) => {
    if (!p?.present || !p.pressed) return;
    if (s.holdA === i || s.holdB === i) {
      if (s.holdA === i) s.holdA = null; else s.holdB = null;
      released = true;
      return;
    }
    const da = s.holdA === null ? Math.hypot(p.x - s.ax, p.z - s.az) : Infinity;
    const db = s.holdB === null ? Math.hypot(p.x - s.bx, p.z - s.bz) : Infinity;
    if (da <= GRAB_R && da <= db) s.holdA = i;
    else if (db <= GRAB_R) s.holdB = i;
  });

  if (wasBoth && released) {
    const [mx, mz] = mid(s);
    s.holdA = null; s.holdB = null;   // it is down: the other holder lets go too
    settle(s);
    const [sx, sz] = SITES.plank.slot;
    if (Math.hypot(mx - sx, mz - sz) <= PLACE_R) { s.placed = true; s.solved = true; }
    return;
  }
  if (bothHeld(s)) {
    follow(s, players);
    if (Math.hypot(s.bx - s.ax, s.bz - s.az) > DROP_DIST) { s.holdA = null; s.holdB = null; settle(s); }
  }
}

const near = (p, x, z, r) => Math.hypot(p.x - x, p.z - z) <= r;

export function prompt(s, idx, players) {
  const me = players[idx];
  if (s.placed || !me?.present) return null;
  const mine = s.holdA === idx || s.holdB === idx;
  if (mine) {
    if (!bothHeld(s)) return 'Your friend needs to take the other end · E to let go';
    const [mx, mz] = mid(s), [sx, sz] = SITES.plank.slot;
    return Math.hypot(mx - sx, mz - sz) <= PLACE_R ? 'E — set it down across the gap' : 'Carry it to the gap together';
  }
  if ((s.holdA === null && near(me, s.ax, s.az, GRAB_R)) || (s.holdB === null && near(me, s.bx, s.bz, GRAB_R)))
    return 'E — pick up this end';
  return null;
}

// A veto on walker idx's next position (true = refuse), or null when they hold nothing.
export function veto(s, idx, players, stones = SITES.plank.stones) {
  if (s.placed) return null;
  const isA = s.holdA === idx, isB = s.holdB === idx;
  if (!isA && !isB) return null;
  if (!bothHeld(s)) {
    const me = players[idx];
    const ex = isA ? s.ax : s.bx, ez = isA ? s.az : s.bz;
    return (nx, nz) => {
      const d = Math.hypot(nx - ex, nz - ez);
      return d > ROOT_R && d > Math.hypot((me?.x ?? ex) - ex, (me?.z ?? ez) - ez);   // never trap a walker who grabbed from afar
    };
  }
  const o = players[isA ? s.holdB : s.holdA];
  if (!o?.present) return null;
  const me = players[idx];
  // The carry line may not newly cross a stone. If it already crosses one (lag can put it
  // there), a move is still allowed as long as it does not bring the line closer to that
  // stone's centre, so the pair can always work their way back out.
  return (nx, nz) => stones.some((c) => {
    const d = pointSegDist(c.x, c.z, nx, nz, o.x, o.z).d;
    if (d > c.r) return false;
    if (!me?.present) return true;
    const was = pointSegDist(c.x, c.z, me.x, me.z, o.x, o.z).d;
    return was > c.r || d < was - 1e-9;
  });
}

export const valid = (s) => !!s && typeof s === 'object' &&
  ['ax', 'az', 'bx', 'bz'].every((k) => Number.isFinite(s[k])) &&
  [s.holdA, s.holdB].every((h) => h === null || h === 0 || h === 1) &&
  !(s.holdA !== null && s.holdA === s.holdB) &&
  typeof s.placed === 'boolean' && typeof s.solved === 'boolean';

export function forceSolve(s) {
  const [sx, sz] = SITES.plank.slot;
  s.holdA = null; s.holdB = null;
  s.ax = sx; s.az = sz - LEN / 2; s.bx = sx; s.bz = sz + LEN / 2;
  s.placed = true; s.solved = true;
}

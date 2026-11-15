// Can two walkers carry a rigid board through the plank course? A breadth-first search over
// where the two carriers stand (a 0.25 m grid), one carrier taking one small step at a time.
// A stand is allowed when both carriers are on the plank terrace's ground and clear of the
// stones and the solids, they are the board's length apart (give or take `slack`), and the board itself (its
// true length, centred between them) clears every stone by `margin`. Used by the tests to
// prove the course can be done, and by nothing else.
import { zoneAt, heightAt, SITES, DYN_NONE } from '../../src/world/layout.js';
import { pointSegDist } from '../../src/core/math.js';
import { PLAYER_R } from '../../src/config.js';
import { SOLIDS } from '../../src/world/solids.js';

const STEP = 0.25;

// The rigid board of length `len` for carriers at a and b: its two ends.
function boardEnds(a, b, len) {
  const mx = (a[0] + b[0]) / 2, mz = (a[1] + b[1]) / 2;
  let dx = b[0] - a[0], dz = b[1] - a[1];
  const l = Math.hypot(dx, dz) || 1;
  dx /= l; dz /= l;
  return [[mx - dx * len / 2, mz - dz * len / 2], [mx + dx * len / 2, mz + dz * len / 2]];
}

// -> { done, states, path? }. `path: true` also returns the way found: [[a, b], ...], one
// carrier moving one grid step between entries.
export function carrySearch({ len, slack, margin = 0.15, stones = SITES.plank.stones, from = [SITES.plank.restA, SITES.plank.restB], slot = SITES.plank.slot, placeR = 2.5, path = false } = {}) {
  const dyn = { ...DYN_NONE, gateOpen: true, bridge: true };
  // every grid cell a carrier may stand on: the plank terrace (zone D), clear of the stones
  const cells = [], index = new Map();
  for (let z = 44; z >= -9.5; z -= STEP) for (let x = -4; x <= 16; x += STEP) {
    if (zoneAt(x, z) !== 'D' || Math.abs(heightAt(x, z, dyn) - heightAt(...SITES.plank.restA, dyn)) > 0.3) continue;
    if (stones.some((c) => Math.hypot(x - c.x, z - c.z) < c.r + PLAYER_R)) continue;
    if (SOLIDS.some((c) => Math.hypot(x - c.x, z - c.z) < c.r + PLAYER_R)) continue;   // trees and boulders stop a carrier too; the board itself still meets the stones only
    index.set(`${x},${z}`, cells.length);
    cells.push([x, z]);
  }
  const N = cells.length;
  const ok = (ia, ib) => {
    const a = cells[ia], b = cells[ib], d = Math.hypot(a[0] - b[0], a[1] - b[1]);
    if (d < len - slack || d > len + slack) return false;
    const [p, q] = boardEnds(a, b, len);
    return !stones.some((c) => pointSegDist(c.x, c.z, p[0], p[1], q[0], q[1]).d < c.r + margin);
  };
  const snap = (p) => index.get(`${Math.round(p[0] / STEP) * STEP},${Math.round(p[1] / STEP) * STEP}`);
  const start = [snap(from[0]), snap(from[1])];
  if (start[0] === undefined || start[1] === undefined || !ok(start[0], start[1])) return { done: false, reason: 'start', states: 0 };
  const seen = new Uint8Array(N * N);
  const queue = [start[0] * N + start[1]];
  seen[queue[0]] = 1;
  const parent = path ? new Map() : null;
  const visit = (kk, k) => { seen[kk] = 1; queue.push(kk); parent?.set(kk, k); };
  let states = 0;
  const nb = (i) => {
    const [x, z] = cells[i], out = [];
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dz) continue;
      const j = index.get(`${x + dx * STEP},${z + dz * STEP}`);
      if (j !== undefined) out.push(j);
    }
    return out;
  };
  for (let h = 0; h < queue.length; h++) {
    const k = queue[h], ia = Math.floor(k / N), ib = k % N;
    states++;
    const a = cells[ia], b = cells[ib], mx = (a[0] + b[0]) / 2, mz = (a[1] + b[1]) / 2;
    if (Math.hypot(mx - slot[0], mz - slot[1]) <= placeR) {
      if (!path) return { done: true, states };
      const way = [];
      for (let c = k; c !== undefined; c = parent.get(c)) way.push([cells[Math.floor(c / N)], cells[c % N]]);
      return { done: true, states, path: way.reverse() };
    }
    for (const ja of nb(ia)) { const kk = ja * N + ib; if (!seen[kk] && ok(ja, ib)) visit(kk, k); }
    for (const jb of nb(ib)) { const kk = ia * N + jb; if (!seen[kk] && ok(ia, jb)) visit(kk, k); }
  }
  return { done: false, reason: 'blocked', states };
}

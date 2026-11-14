// Pilot mode's route finder and steering. Pure: no three.js, no DOM.
// A* over a 0.5 m grid with the walker's own rule: a step is allowed when the neighbour is
// above DROWN_Y, rises no more than STEP_UP, and is clear of every blocker; diagonals may not
// cut a blocked corner. Drops of more than MAX_DROP are avoided so a route never walks off a
// ledge.
//
// Clearance: being allowed on a cell is not enough. A route that runs 0.25 m from a cliff
// edge is walkable on paper, but the follower's steering error is bigger than that, so the
// walker steps off. Every cell therefore has a clearance — its distance to the nearest
// hazard (water, a blocker, or the foot of a drop of more than MAX_DROP) — and the step cost
// rises steeply as clearance falls below CLEAR_WANT. Routes take the middle of ramps, spans
// and corridors, but narrow places (the plank span, the ladder) stay reachable, because low
// clearance only costs more; it is never forbidden. The raw cell path is then string-pulled
// into a few waypoints, and a straight cut is taken only if it keeps as much clearance as the
// cells it replaces (up to CLEAR_KEEP), so simplification never pulls the route to an edge.
import { heightAt, blockers, lookDyn, DYN_NONE } from '../world/layout.js';
import { DROWN_Y, STEP_UP, PLAYER_R } from '../config.js';
import { pointSegDist } from '../core/math.js';

const STEP = 0.5;
const X0 = -100, Z0 = -215;     // grid covers x -100..300, z -215..185
const N = 801;
export const GRID = { X0, Z0, N, STEP };
const MAX_DROP = 0.6;
const MARGIN = 0.1;             // keep this much extra off blockers so steering slack does not snag
const SQRT2 = Math.SQRT2;

const CLEAR_CAP = 2;            // clearance is measured up to this many metres
const CLEAR_WANT = 1.5;         // below this a step costs more ...
const CLEAR_K = 10;             // ... by a factor 1 + CLEAR_K·(CLEAR_WANT − clearance)²
const CLEAR_KEEP = CLEAR_WANT; // a string-pulled cut keeps at least min(this, the least clearance it replaces)
const WIN = Math.ceil((CLEAR_CAP + STEP / 2) / STEP);   // search window, in cells

// window offsets sorted nearest first, so the first hazard found is the nearest
const OFFS = [];
for (let dz = -WIN; dz <= WIN; dz++) for (let dx = -WIN; dx <= WIN; dx++) {
  const d = Math.hypot(dx, dz) * STEP;
  if ((dx || dz) && d - STEP / 2 < CLEAR_CAP) OFFS.push([dx, dz, d]);
}
OFFS.sort((a, b) => a[2] - b[2]);

// ------------------------------------------------------------------ the grid, per dyn

const wx = (i) => X0 + (i % N) * STEP;
const wz = (i) => Z0 + Math.floor(i / N) * STEP;
const cellOf = (x, z) => {
  const ix = Math.round((x - X0) / STEP), iz = Math.round((z - Z0) / STEP);
  return ix < 0 || iz < 0 || ix >= N || iz >= N ? -1 : iz * N + ix;
};

const grids = new Map();          // dyn key -> grid (a few, most recently used last)
const GRID_CACHE = 6;

function gridFor(dyn = DYN_NONE) {
  const d = {
    gateOpen: !!dyn.gateOpen, bridge: !!dyn.bridge, plank: !!dyn.plank,
    lift: Number.isFinite(dyn.lift) ? dyn.lift : 0, ladder: !!dyn.ladder,
    causeway: !!dyn.causeway, bells: !!dyn.bells, marsh: dyn.marsh | 0,
    pillars: dyn.pillars | 0, ring: !!dyn.ring,
  };
  const key = `${+d.gateOpen}${+d.bridge}${+d.plank}${+d.ladder}${+d.causeway}${+d.bells}${+d.ring}:${d.lift}:${d.marsh}:${d.pillars}`;
  let G = grids.get(key);
  if (G) { grids.delete(key); grids.set(key, G); return G; }

  const { circles, segments } = blockers(d);
  const clear = (x, z, m) => {
    for (const c of circles) if (Math.hypot(x - c.x, z - c.z) < c.r + PLAYER_R + m) return false;
    for (const s of segments) if (pointSegDist(x, z, s.ax, s.az, s.bx, s.bz).d < PLAYER_R + m) return false;
    return true;
  };
  const height = new Float32Array(N * N).fill(NaN);
  const okc = new Int8Array(N * N).fill(-1);
  const hazc = new Int8Array(N * N).fill(-1);
  const clr = new Float32Array(N * N).fill(NaN);

  const h = (i) => {
    if (Number.isNaN(height[i])) height[i] = heightAt(wx(i), wz(i), d);
    return height[i];
  };
  const ok = (i) => {
    if (okc[i] < 0) okc[i] = h(i) > DROWN_Y && clear(wx(i), wz(i), MARGIN) ? 1 : 0;
    return okc[i] === 1;
  };
  // A hazard: a cell the walker may not stand on, or the foot of a drop (a neighbour more
  // than MAX_DROP higher). The rim cell above a drop is walkable; its hazard is next door.
  const hazard = (i) => {
    if (hazc[i] < 0) {
      let bad = !ok(i);
      if (!bad) {
        const ix = i % N, iz = (i - ix) / N, hi = h(i);
        for (let dz = -1; dz <= 1 && !bad; dz++) for (let dx = -1; dx <= 1; dx++) {
          const nx = ix + dx, nz = iz + dz;
          if (nx < 0 || nz < 0 || nx >= N || nz >= N) { bad = true; break; }
          if (h(nz * N + nx) - hi > MAX_DROP) { bad = true; break; }
        }
      }
      hazc[i] = bad ? 1 : 0;
    }
    return hazc[i] === 1;
  };
  // Distance from cell i's centre to the edge of the nearest hazard cell, capped.
  const clearance = (i) => {
    if (Number.isNaN(clr[i])) {
      let c = CLEAR_CAP;
      if (hazard(i)) c = 0;
      else {
        const ix = i % N, iz = (i - ix) / N;
        for (const [dx, dz, dist] of OFFS) {
          const nx = ix + dx, nz = iz + dz;
          const out = nx < 0 || nz < 0 || nx >= N || nz >= N;
          if (out || hazard(nz * N + nx)) { c = Math.min(CLEAR_CAP, Math.max(0, dist - STEP / 2)); break; }
        }
      }
      clr[i] = c;
    }
    return clr[i];
  };
  // bilinear between the four surrounding cell centres
  const clearanceXZ = (x, z) => {
    const fx = (x - X0) / STEP, fz = (z - Z0) / STEP;
    const ix = Math.floor(fx), iz = Math.floor(fz);
    if (ix < 0 || iz < 0 || ix + 1 >= N || iz + 1 >= N) return 0;
    const tx = fx - ix, tz = fz - iz, i = iz * N + ix;
    return (clearance(i) * (1 - tx) + clearance(i + 1) * tx) * (1 - tz) +
      (clearance(i + N) * (1 - tx) + clearance(i + N + 1) * tx) * tz;
  };

  G = { d, clear, h, ok, hazard, clearance, clearanceXZ };
  grids.set(key, G);
  while (grids.size > GRID_CACHE) grids.delete(grids.keys().next().value);
  return G;
}

// Clearance from drop-offs, water and blockers at (x, z), in metres, capped at CLEAR_CAP.
export function clearanceAt(x, z, dyn = DYN_NONE) {
  return gridFor(dyn).clearanceXZ(x, z);
}

// ------------------------------------------------------------------ route

export function findPath(from, to, dyn = DYN_NONE) {
  const G = gridFor(dyn);
  const { h, ok, clear, clearance, clearanceXZ } = G;
  dyn = G.d;
  // a step from cell i to an adjacent cell j
  const stepOk = (i, j) => ok(j) && h(j) - h(i) <= STEP_UP && h(i) - h(j) <= MAX_DROP;
  const penalty = (j) => { const s = Math.max(0, CLEAR_WANT - clearance(j)); return 1 + CLEAR_K * s * s; };

  const start = cellOf(from[0], from[1]);
  if (start < 0) return null;
  const goals = new Set();
  const gc = cellOf(to[0], to[1]);
  if (gc < 0) return null;
  for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
    const j = gc + dz * N + dx;
    if (j >= 0 && j < N * N && ok(j) && Math.hypot(wx(j) - to[0], wz(j) - to[1]) <= 0.75) goals.add(j);
  }
  if (!goals.size) return null;

  // string-pulling test: the straight line obeys the same rule, sampled finely, and keeps at
  // least `keep` clearance all the way
  const lineOk = (a, b, keep) => {
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const n = Math.max(1, Math.ceil(len / 0.125));
    // clearance first, on its own: it is cached, and it rejects most lines
    for (let i = 1; i <= n; i++) if (clearanceXZ(a[0] + ((b[0] - a[0]) * i) / n, a[1] + ((b[1] - a[1]) * i) / n) < keep) return false;
    let prev = heightAt(a[0], a[1], dyn);
    for (let i = 1; i <= n; i++) {
      const x = a[0] + ((b[0] - a[0]) * i) / n, z = a[1] + ((b[1] - a[1]) * i) / n;
      const hh = heightAt(x, z, dyn);
      if (!(hh > DROWN_Y) || hh - prev > STEP_UP || prev - hh > MAX_DROP || !clear(x, z, MARGIN * 0.5)) return false;
      prev = hh;
    }
    return true;
  };

  // A*
  const g = new Float32Array(N * N).fill(Infinity);
  const parent = new Int32Array(N * N).fill(-1);
  const closed = new Uint8Array(N * N);
  const heap = [];                       // [f, cell] pairs flattened
  const push = (f, c) => {
    let i = heap.length / 2;
    heap.push(f, c);
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (heap[p * 2] <= f) break;
      heap[i * 2] = heap[p * 2]; heap[i * 2 + 1] = heap[p * 2 + 1];
      i = p;
    }
    heap[i * 2] = f; heap[i * 2 + 1] = c;
  };
  const pop = () => {
    const c = heap[1];
    const lf = heap[heap.length - 2], lc = heap[heap.length - 1];
    heap.length -= 2;
    const n = heap.length / 2;
    if (n > 0) {
      let i = 0;
      for (;;) {
        let k = i * 2 + 1;
        if (k >= n) break;
        if (k + 1 < n && heap[(k + 1) * 2] < heap[k * 2]) k++;
        if (heap[k * 2] >= lf) break;
        heap[i * 2] = heap[k * 2]; heap[i * 2 + 1] = heap[k * 2 + 1];
        i = k;
      }
      heap[i * 2] = lf; heap[i * 2 + 1] = lc;
    }
    return c;
  };
  const hx = (i) => {
    const dx = Math.abs(wx(i) - to[0]) / STEP, dz = Math.abs(wz(i) - to[1]) / STEP;
    return (Math.max(dx, dz) + (SQRT2 - 1) * Math.min(dx, dz)) * STEP;
  };

  g[start] = 0;
  push(hx(start), start);
  let found = -1;
  while (heap.length) {
    const i = pop();
    if (closed[i]) continue;
    closed[i] = 1;
    if (goals.has(i)) { found = i; break; }
    const ix = i % N, iz = (i - ix) / N;
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dz) continue;
        const nx = ix + dx, nz = iz + dz;
        if (nx < 0 || nz < 0 || nx >= N || nz >= N) continue;
        const j = nz * N + nx;
        if (closed[j] || !stepOk(i, j)) continue;
        if (dx && dz && !(stepOk(i, iz * N + nx) && stepOk(i, nz * N + ix))) continue;   // no corner cutting
        const ng = g[i] + (dx && dz ? SQRT2 : 1) * STEP * penalty(j);
        if (ng < g[j]) { g[j] = ng; parent[j] = i; push(ng + hx(j), j); }
      }
    }
  }
  if (found < 0) return null;

  const cells = [];
  for (let c = found; c >= 0; c = parent[c]) cells.push(c);
  cells.reverse();
  const pts = [[from[0], from[1]], ...cells.slice(1).map((c) => [wx(c), wz(c)]), [to[0], to[1]]];
  const clr = [clearanceXZ(from[0], from[1]), ...cells.slice(1).map(clearance), clearanceXZ(to[0], to[1])];
  // greedy string-pull: from each anchor, jump to the furthest point still in a clear line that
  // keeps min(CLEAR_KEEP, the least clearance among the points it replaces)
  const out = [pts[0]];
  let a = 0;
  while (a < pts.length - 1) {
    // keepTo[b]: min(CLEAR_KEEP, clearance of pts a+1 .. b-1)
    const keepTo = new Float32Array(pts.length);
    keepTo[a + 1] = CLEAR_KEEP;
    for (let k = a + 2; k < pts.length; k++) keepTo[k] = Math.min(keepTo[k - 1], clr[k - 1]);
    let b = pts.length - 1;
    while (b > a + 1 && !lineOk(pts[a], pts[b], keepTo[b])) b--;
    out.push(pts[b]);
    a = b;
  }
  runway(out, false);
  out.reverse(); runway(out, true); out.reverse();
  return out;

  // Runways: line up before a narrow passage and leave it straight. When a route turns sharply
  // into a narrow segment (clearance under CLEAR_WANT somewhere along it), the follower comes
  // out of the turn off the line, and a narrow segment has no room for that. So the segment is
  // extended back by up to RUNWAY metres, and the corner moves out there, onto wider ground.
  // The new approach must keep as much clearance as the route it replaces (same rule as the
  // string-pull), must not double back, and may add little length. With rev the array is
  // reversed (exits), so lines are checked in the direction of travel.
  function runway(r, rev) {
    const line = (a, b, keep) => (rev ? lineOk(b, a, keep) : lineOk(a, b, keep));
    for (let k = 1; k < r.length - 1; k++) {
      const w = r[k], q = r[k + 1];
      const len = dist(w, q);
      if (len < 2) continue;
      const segMin = minClear(w, q);
      if (segMin >= CLEAR_WANT || turnAt(r[k - 1], w, q) <= SLOW_TURN) continue;
      const ux = (q[0] - w[0]) / len, uz = (q[1] - w[1]) / len;
      let moved = false;
      for (const L of RUNWAY) {
        const e = [w[0] - ux * L, w[1] - uz * L];
        const ce = cellOf(e[0], e[1]);
        if (ce < 0 || !ok(ce) || clearanceXZ(e[0], e[1]) < segMin) continue;
        if (!line(e, w, Math.min(CLEAR_WANT, segMin))) continue;
        for (let j = 0; j < k && !moved; j++) {        // furthest back first
          if (turnAt(r[j], e, q) >= Math.PI / 2) continue;
          let old = 0, keep = CLEAR_WANT;
          for (let m = j; m < k; m++) { old += dist(r[m], r[m + 1]); keep = Math.min(keep, minClear(r[m], r[m + 1])); }
          if (dist(r[j], e) + L - old > RUNWAY_EXTRA) continue;
          if (!line(r[j], e, keep)) continue;
          r.splice(j + 1, k - j, e);
          k = j + 1;
          moved = true;
        }
        if (moved) break;
      }
    }
  }
  function minClear(a, b) {
    const n = Math.max(1, Math.ceil(dist(a, b) / 0.125));
    let m = Infinity;
    for (let i = 0; i <= n; i++) m = Math.min(m, clearanceXZ(a[0] + ((b[0] - a[0]) * i) / n, a[1] + ((b[1] - a[1]) * i) / n));
    return m;
  }
}

const RUNWAY = [2, 1.5, 1];       // how far back a narrow segment's entry may move, longest first
const RUNWAY_EXTRA = 1.5;         // and how much length that may add
const dist = (a, b) => Math.hypot(b[0] - a[0], b[1] - a[1]);
// how sharply the route turns at w, coming from p and going on to q (radians, 0..π)
function turnAt(p, w, q) {
  const a1 = Math.atan2(w[1] - p[1], w[0] - p[0]), a2 = Math.atan2(q[1] - w[1], q[0] - w[0]);
  return Math.abs(Math.atan2(Math.sin(a2 - a1), Math.cos(a2 - a1)));
}

// ------------------------------------------------------------------ steering

export const POINT_R = 0.35;     // waypoints (other than the last) are passed within this
const SLOW_CLEAR = 1.0;          // walk, don't run, where clearance is under this
const SLOW_NEAR = 1.5;           // walk within this of a sharp turn or of the end
const SLOW_TURN = Math.PI / 6;   // a turn sharper than this is sharp

const yawTo = (dx, dz) => Math.atan2(-dx, -dz);   // yaw 0 faces -Z

// One steering decision for a walker at pos following path, heading for waypoint i.
// Returns the next waypoint index, the camera yaw to face it, forward input mz, whether to
// run, and done when the walker is within `within` of the end.
export function steer(pos, path, i, { dyn = DYN_NONE, run = true, within = 0.4, camYaw = 0 } = {}) {
  const last = path.length - 1;
  const end = path[last];
  if (Math.hypot(pos.x - end[0], pos.z - end[1]) <= within) return { i: last, camYaw, mz: 0, run: false, done: true };
  i = Math.max(1, Math.min(i, last));
  while (i < last && Math.hypot(pos.x - path[i][0], pos.z - path[i][1]) < POINT_R) i++;
  const w = path[i];
  const dx = w[0] - pos.x, dz = w[1] - pos.z, d = Math.hypot(dx, dz);
  let fast = run;
  if (fast && (clearanceAt(pos.x, pos.z, dyn) < SLOW_CLEAR || clearanceAt(w[0], w[1], dyn) < SLOW_CLEAR)) fast = false;
  if (fast && d < SLOW_NEAR && (i === last || turnAt(path[i - 1], w, path[i + 1]) > SLOW_TURN)) fast = false;
  return { i, camYaw: d > 0.02 ? yawTo(dx, dz) : camYaw, mz: 1, run: fast, done: false };
}

// The world the pilot plans and steers on: what a player sees. Until the Marsh is solved every
// tile looks solid (the live mask would show the secret path); after, the real dyn.
export const planningDyn = (dyn, marshSolved) => (marshSolved ? { ...dyn } : lookDyn(dyn));

// The island: plateau heights, ramps, blockers and every puzzle anchor.
// Pure data and geometry — no three.js, no DOM.
//
// World model
// - Plateaus (ZONES) are unions of discs; each zone has one nominal height, rising
//   in trail order A < B < D < E < F (C is a spur just above B). Where discs of two
//   zones overlap, the higher one wins, which makes a sheer cliff.
// - Ramps (RAMPS) are oriented rectangles a→b of half-width hw. Their height is flat
//   at ha for the first `pa` metres, flat at hb for the last `pb` metres and linear
//   between; the flat pads lie on the plateaus at either end so the seams are level.
//   A ramp with a `flag` exists only while that dyn flag is set.
// - The lift platform is a rectangle at low + lift·(high − low).
// - Everything else is sea floor (SEA_Y), except a sloped sand beach around A.
//
// North is −Z. The trail climbs from the beach (south, +Z) to the summit (north).
import { clamp } from '../core/math.js';

export const DYN_NONE = Object.freeze({ gateOpen: false, bridge: false, plank: false, lift: 0, ladder: false });

const SEA_Y = -4;
const BEACH_SLOPE = 0.5;        // metres of drop per metre beyond A's rim
const H = { A: 1, B: 4, C: 6, D: 7, E: 8.5, F: 13.5 };

// ------------------------------------------------------------------ plateaus

const disc = (zone, x, z, r) => ({ zone, h: H[zone], x, z, r });

// The plank corridor: a 3.9 m wide strip of D between the landing terrace and the
// slot terrace, built from overlapping discs (edge ripple < 2 cm).
export const PLANK_CORRIDOR = { ax: 6, az: 29, bx: 6, bz: 2, hw: 1.95 };
const corridorDiscs = [];
for (let z = PLANK_CORRIDOR.az; z >= PLANK_CORRIDOR.bz - 1e-9; z -= 0.5)
  corridorDiscs.push(disc('D', PLANK_CORRIDOR.ax, z, PLANK_CORRIDOR.hw));

export const ZONES = [
  disc('A', 0, 120, 16),        // beach
  disc('B', 0, 76, 15),         // gate-to-signal terrace
  disc('C', -32, 72, 9),        // lookout (spur)
  disc('D', 6, 36, 9),          // plank terrace: bridge landing + rests
  ...corridorDiscs,             // plank terrace: zigzag corridor
  disc('D', 6, -4, 5),          // plank terrace: slot
  disc('E', 6, -24, 11.4),      // lift foot
  disc('F', 6, -56, 22),        // summit
];

// ------------------------------------------------------------------ ramps

const ramp = (from, to, flag, ax, az, bx, bz, hw, pa = 1, pb = 1) =>
  ({ from, to, flag, ax, az, bx, bz, hw, ha: H[from], hb: H[to], pa, pb });

export const RAMPS = [
  ramp('A', 'B', null, 0, 105, 0, 90, 1.5),                 // gate ramp (the door sits on it)
  ramp('B', 'C', null, -9, 66, -27.5, 66, 1.25, 1, 3.2),    // lookout spur
  ramp('B', 'D', 'bridge', 6, 63.25, 6, 44, 1.5),           // signal bridge
  ramp('D', 'E', 'plank', 6, -8, 6, -13.6, 0.8),            // plank span
  ramp('E', 'F', 'ladder', 11, -27.35, 11, -35.6, 0.75, 1, 1.2), // rope ladder
];
const rampGeo = RAMPS.map((r) => {
  const len = Math.hypot(r.bx - r.ax, r.bz - r.az);
  return { r, len, ux: (r.bx - r.ax) / len, uz: (r.bz - r.az) / len };
});
// Position of (x, z) along ramp g: s along the axis, or -1 when outside the rectangle.
function rampS(g, x, z) {
  const dx = x - g.r.ax, dz = z - g.r.az;
  const s = dx * g.ux + dz * g.uz;
  if (s < 0 || s > g.len) return -1;
  if (Math.abs(dx * -g.uz + dz * g.ux) > g.r.hw) return -1;
  return s;
}
function rampHeight(g, s) {
  const { ha, hb, pa, pb } = g.r;
  return ha + (hb - ha) * clamp((s - pa) / (g.len - pa - pb), 0, 1);
}

// ------------------------------------------------------------------ lift

const LIFT = { crank: [12, -24], platform: { x: 6, z: -32, hw: 2, hd: 3 }, low: H.E, high: H.F, post: [10, -37.5] };
const onPlatform = (x, z) =>
  Math.abs(x - LIFT.platform.x) <= LIFT.platform.hw && Math.abs(z - LIFT.platform.z) <= LIFT.platform.hd;

// ------------------------------------------------------------------ height

// Cosmetic undulation on plateaus, |u| ≤ 0.08 m.
const undulate = (x, z) => 0.05 * Math.sin(0.37 * x + 0.5) * Math.sin(0.29 * z) + 0.03 * Math.sin(0.11 * (x + z));

const A = ZONES[0];

export function heightAt(x, z, dyn = DYN_NONE) {
  // the lift platform is a flat deck at its own height, whatever lies beneath it
  if (onPlatform(x, z)) return LIFT.low + clamp(dyn.lift || 0, 0, 1) * (LIFT.high - LIFT.low);
  let h = SEA_Y;
  // sloped beach around A
  const dA = Math.hypot(x - A.x, z - A.z) - A.r;
  if (dA > 0 && dA < (A.h - SEA_Y) / BEACH_SLOPE) h = A.h - BEACH_SLOPE * dA;
  // plateaus
  let top = -Infinity;
  for (let i = 0; i < ZONES.length; i++) {
    const d = ZONES[i];
    const dx = x - d.x, dz = z - d.z;
    if (dx * dx + dz * dz <= d.r * d.r && d.h > top) top = d.h;
  }
  if (top > -Infinity) h = Math.max(h, top + undulate(x, z));
  // ramps
  for (let i = 0; i < rampGeo.length; i++) {
    const g = rampGeo[i];
    if (g.r.flag && !dyn[g.r.flag]) continue;
    const s = rampS(g, x, z);
    if (s >= 0) h = Math.max(h, rampHeight(g, s));
  }
  return h;
}

// Which plateau a point is on: null on ramps (present or not), the lift platform,
// the beach slope and water.
export function zoneAt(x, z) {
  if (onPlatform(x, z)) return null;
  for (const g of rampGeo) if (rampS(g, x, z) >= 0) return null;
  let best = null;
  for (const d of ZONES) {
    const dx = x - d.x, dz = z - d.z;
    if (dx * dx + dz * dz <= d.r * d.r && (!best || d.h > best.h)) best = d;
  }
  return best ? best.zone : null;
}

// ------------------------------------------------------------------ sites

// Signal: the wall stands on B's west rim, back to the water and to the lookout on C.
const WALL = { x: -14.8, z: 76, yaw: -Math.PI / 2 };   // faces +X (into B)
const WALL_HALF = 2.5;

// Plank: six stones, alternately closing the west and east side of the corridor.
const STONE_R = 1.0, STONE_OFF = 0.98;
const STONE_Z = [23, 19.4, 15.8, 12.2, 8.6, 5.0];
const stones = STONE_Z.map((z, i) => ({ x: PLANK_CORRIDOR.ax + (i % 2 ? STONE_OFF : -STONE_OFF), z, r: STONE_R }));
const SLOT = [6, -6.5];

// The carrying line from the rests through the zigzag: the middle of each open passage.
export const PLANK_ROUTE = [
  [6.98, 26],
  ...stones.map((s) => [PLANK_CORRIDOR.ax * 2 - s.x, s.z]),
  [6, 0],
  SLOT,
];

// Beam: summit ground is H.F (± undulation).
const LAMP_XZ = [-8, -50];
const lampDir = (() => { const v = [1, -0.05, 0], l = Math.hypot(...v); return v.map((c) => c / l); })();
const ROCK_TOP = H.F + 7.5;
const beamRocks = [
  ...[0, 1, 2, 3, 4, 5].map((i) => ({ x: -0.5 + 2.6 * i, z: -55, r: 1.5, h: ROCK_TOP })), // the outcrop
  { x: 19, z: -50, r: 1.5, h: ROCK_TOP },                                                 // stops the lamp ray
];
const BEACON = [6, -60];
const BEACON_R = 1.2;
const LAMP_R = 0.5;

const seg = (ax, az, bx, bz) => ({ ax, az, bx, bz });
const rampSeg = (flag) => { const r = RAMPS.find((q) => q.flag === flag); return seg(r.ax, r.az, r.bx, r.bz); };

export const SITES = {
  spawn: [[-1.5, 124], [1.5, 124]],
  checkpoints: [
    [[-1.5, 124], [1.5, 124]],      // 0 spawn, A
    [[-1.5, 84], [1.5, 84]],        // 1 B, just past the gate
    [[3.5, 41], [8.5, 41]],         // 2 D, just past the bridge
    [[4.5, -15.5], [7.5, -15.5]],   // 3 E, just past the plank
    [[4.5, -38.5], [7.5, -38.5]],   // 4 F, top of the lift
    [[3, -64], [9, -64]],           // 5 F, by the beacon
  ],
  gate: {
    plateA: [0, 110],
    plateB: [0, 87],
    door: seg(-2.5, 97, 2.5, 97),
  },
  signal: {
    lookout: [-26, 76],
    wall: WALL,
    dials: [[-10, 74.5], [-10, 77.5], [-7, 74.5], [-7, 77.5]],
    dialZone: { x: -8.5, z: 76, r: 3.5 },
    bridge: rampSeg('bridge'),
  },
  plank: {
    restA: [3, 34],
    restB: [7, 34],
    stones,
    slot: SLOT,
    span: rampSeg('plank'),
  },
  lift: LIFT,
  beam: {
    lamp: { o: [LAMP_XZ[0], heightAt(LAMP_XZ[0], LAMP_XZ[1]) + 1.5, LAMP_XZ[1]], d: lampDir },
    mirrors: [[-5, -44], [-3, -44]],
    lens: [BEACON[0], H.F + 5, BEACON[1]],
    rocks: beamRocks,
    hint: { p1: [0, -50], p2: [-6, -59] },
  },
  beacon: BEACON,
};

// The walkable route from spawn to the beacon (spur to C left out), for drawing a path.
export const TRAIL = [
  [0, 124], SITES.gate.plateA, [0, 97], SITES.gate.plateB, [0, 76], [6, 66],
  [6, 63.25], [6, 44], [6, 38], ...PLANK_ROUTE,
  [6, -13.6], [6, -20], [6, -32], [6, -38.5],
  [-4.5, -45], [-5, -55], [-3, -61], BEACON,
];

// ------------------------------------------------------------------ blockers

const STATIC_CIRCLES = [
  ...stones,
  ...beamRocks.map(({ x, z, r }) => ({ x, z, r })),
  { x: BEACON[0], z: BEACON[1], r: BEACON_R },
  { x: LAMP_XZ[0], z: LAMP_XZ[1], r: LAMP_R },
];
const WALL_SEG = seg(WALL.x, WALL.z - WALL_HALF, WALL.x, WALL.z + WALL_HALF);

export function blockers(dyn = DYN_NONE) {
  const segments = [WALL_SEG];
  if (!dyn.gateOpen) segments.push(SITES.gate.door);
  return { circles: STATIC_CIRCLES, segments };
}

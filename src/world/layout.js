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
//
// The Far Isle (zones G < H < I < J) lies east of the summit, 40 m out to sea, and
// is reached only by the causeway ramp (flag `causeway`). Same model, plus:
// - The marsh: a 5 × 6 grid of tiles between H and I. Over its rectangle the ground
//   is deep water except within MARSH.edge of a tile whose bit is set in dyn.marsh,
//   where it is MARSH_SURFACE. It overrides everything beneath it, like the lift.
// - The watch-stone: a flat-topped rock on H (WATCH_STONE), higher than H; zoneAt
//   still says H there. A ramp from H climbs onto it.
// - The relay climb: three ramp legs round three sides of the summit J and a short
//   bridge in. Legs meet at square corners where both are flat at one height.
// A dyn without the Far Isle keys reads as their defaults (false / 0).
//
// The Lantern Isle (zones K < L < T) lies north of the Far Isle, across open sea. J gains a
// north landing at its own height, reached from the top of the relay climb's east leg by a
// flat jetty. From it two straight lines of nine pillars (PILLARS) run north to K:
// - Pillar ground works like the marsh: over each line's rectangle the ground is the sea
//   floor except within PILLARS.edge of a pillar whose bit is set in dyn.pillars (bit
//   line·9 + r), where it is PILLAR_SURFACE. That margin also reaches `edge` past the
//   rectangle's sides, onto the sea or the landings at either end.
// - K holds the ring of standing stones and a seeing stone on each wing. The steps (flag
//   `ring`) climb 3 m from K to L, the wide interior: a ring of discs round the tor T, a
//   rock mass far above L that nobody can climb. Six lantern posts stand round the tor.
import { clamp } from '../core/math.js';

export const DYN_NONE = Object.freeze({
  gateOpen: false, bridge: false, plank: false, lift: 0, ladder: false,
  causeway: false, bells: false, marsh: 0, pillars: 0, ring: false,
});

const SEA_Y = -4;
const BEACH_SLOPE = 0.5;        // metres of drop per metre beyond A's rim
const H = { A: 1, B: 4, C: 6, D: 7, E: 8.5, F: 13.5, G: 3, H: 6, I: 6.3, J: 12.3, K: 12.6, L: 15.6, T: 24 };
export const MARSH_SURFACE = 6.15;   // H and I sit 0.15 m either side of it (±0.08 undulation)
export const PILLAR_SURFACE = 12.45; // between J (12.3) and K (12.6), ±0.08 undulation either way

// ------------------------------------------------------------------ plateaus

const disc = (zone, x, z, r) => ({ zone, h: H[zone], x, z, r });

// The plank corridor: a 3.9 m wide strip of D between the landing terrace and the
// slot terrace, built from overlapping discs (edge ripple < 2 cm).
export const PLANK_CORRIDOR = { ax: 6, az: 29, bx: 6, bz: 2, hw: 1.95 };
const corridorDiscs = [];
for (let z = PLANK_CORRIDOR.az; z >= PLANK_CORRIDOR.bz - 1e-9; z -= 0.5)
  corridorDiscs.push(disc('D', PLANK_CORRIDOR.ax, z, PLANK_CORRIDOR.hw));

// ------------------------------------------------------------------ Far Isle geometry

// The marsh grid. Row 0 is nearest H; i = row * cols + col; col 0 at `origin`, the
// near-left corner (left as seen walking from H toward I).
const MARSH = { origin: [110, -62], right: [0, 1], fwd: [1, 0], cols: 5, rows: 6, tile: 2.4, edge: 0.3 };
const MARSH_W = MARSH.cols * MARSH.tile, MARSH_L = MARSH.rows * MARSH.tile;
const marshAt = (u, v) => [
  MARSH.origin[0] + MARSH.right[0] * u + MARSH.fwd[0] * v,
  MARSH.origin[1] + MARSH.right[1] * u + MARSH.fwd[1] * v,
];
// The lip discs that meet the marsh's near and far edges: radius 7, centred 3.25 m
// back from the edge, so they cross the edge line 6.2 m either side of its middle —
// the whole 12 m width, with at most a 0.2 m sliver past either side.
const LIP_R = 7, LIP_BACK = 3.25;
const nearLip = marshAt(MARSH_W / 2, -LIP_BACK), farLip = marshAt(MARSH_W / 2, MARSH_L + LIP_BACK);

// The summit J and the relay climb round it: the climb's centre line is a square of
// half-side RING_D round J's centre, with a 1.5 m moat between its inner edge and J.
const J_C = [144.25, -37], J_R = 5, RING_HW = 1.75, RING_D = J_R + 1.5 + RING_HW;

function farDiscs() {
  return [
    disc('G', 76, -56, 8),        // landing: the causeway foot (west), the steps (east)
    disc('G', 77, -64.5, 3),      // neck to the north outcrop
    disc('G', 78, -70, 4),        // north outcrop: bell a
    disc('G', 77, -47.5, 3),      // neck to the south outcrop
    disc('G', 78, -42, 4),        // south outcrop: bell b
    disc('H', 100, -56, 11),      // marsh near side: steps landing, watch-stone, checkpoint
    disc('H', nearLip[0], nearLip[1], LIP_R),  // H's lip along row 0
    disc('I', farLip[0], farLip[1], LIP_R),    // I's lip along row 5
    disc('I', 133, -57, 8),       // marsh far side: lever, small brazier
    disc('J', J_C[0], J_C[1], J_R),            // summit: great brazier
  ];
}

// ------------------------------------------------------------------ Lantern Isle geometry

// The pillar lines. Line 0 is the west one. A line's origin is the middle of its pillar 0's
// near edge; pillar r is the tile × tile square from (r)·tile to (r+1)·tile along `fwd`.
const PILLARS = { n: 9, tile: 2.4, edge: 0.3, fwd: [0, -1] };
const P_AXIS = J_C[0] + RING_D, P_HALF = 2.8, P_Z0 = -54;     // on the east leg's line; 3.2 m of sea between
const P_RIGHT = [-PILLARS.fwd[1], PILLARS.fwd[0]];
const P_LEN = PILLARS.n * PILLARS.tile;
const P_LINES = [[P_AXIS - P_HALF, P_Z0], [P_AXIS + P_HALF, P_Z0]];
const P_END = P_Z0 + PILLARS.fwd[1] * P_LEN;                  // z of the lines' far edge

// The ring of standing stones in the middle of K, its entrance facing the pillars (south).
const RING_C = [152.5, -98], RING_R = 6;
// Bearing b (clockwise from north, seen from above) at distance d from c.
const toward = (c, b, d) => [c[0] + d * Math.sin(b), c[1] - d * Math.cos(b)];
const ENTRANCE_B = Math.PI;

// The tor's centre; the lantern posts stand on a ring of radius POST_R round it, one due north.
const TOR_C = [152.5, -162], POST_R = 34, TOR_R = 21;
const POSTS = [0, 1, 2, 3, 4, 5].map((k) => toward(TOR_C, k * Math.PI / 3, POST_R));
const onTor = (b, d, zone, r) => { const [x, z] = toward(TOR_C, b, d); return disc(zone, x, z, r); };
const deg = Math.PI / 180;

// Kept apart so the first two islands' scenery can be dealt over the ground they had before.
export const LANTERN_ZONES = [
  disc('J', P_AXIS, -50, 6),               // J's north landing, where the lines begin
  disc('K', P_AXIS, -82, 8),               // where the lines arrive
  disc('K', RING_C[0], RING_C[1], 13),     // the ring
  disc('K', 142, -98, 5), disc('K', 134, -98, 6),     // west wing: a seeing stone
  disc('K', 163, -98, 5), disc('K', 171, -98, 6),     // east wing: the other
  disc('K', 142, -88, 4),                  // a nook off the arrival
  disc('L', TOR_C[0], TOR_C[1], 26),       // round the foot of the tor
  ...POSTS.map(([x, z]) => disc('L', x, z, 9)),                                // a bay at each post
  ...[30, 90, 150, 210, 270, 330].map((b) => onTor(b * deg, POST_R * Math.cos(Math.PI / 6), 'L', 8)), // between them
  onTor(Math.PI, 38, 'L', 8),              // the head of the steps
  onTor(90 * deg, 42, 'L', 5), onTor(270 * deg, 42, 'L', 5), onTor(30 * deg, 42, 'L', 4.5), // spurs
  disc('T', TOR_C[0], TOR_C[1], TOR_R),    // the tor
];

export const ZONES = [
  disc('A', 0, 120, 16),        // beach
  disc('B', 0, 76, 15),         // gate-to-signal terrace
  disc('C', -32, 72, 9),        // lookout (spur)
  disc('D', 6, 36, 9),          // plank terrace: bridge landing + rests
  ...corridorDiscs,             // plank terrace: zigzag corridor
  disc('D', 6, -4, 5),          // plank terrace: slot
  disc('E', 6, -24, 11.4),      // lift foot
  disc('F', 6, -56, 22),        // summit
  ...farDiscs(),
  ...LANTERN_ZONES,
];

// ------------------------------------------------------------------ ramps

const ramp = (from, to, flag, ax, az, bx, bz, hw, pa = 1, pb = 1) =>
  ({ from, to, flag, ax, az, bx, bz, hw, ha: H[from], hb: H[to], pa, pb });
// A ramp whose end heights are given rather than taken from its zones.
const rampH = (from, to, flag, ax, az, bx, bz, hw, ha, hb, pa, pb) =>
  ({ from, to, flag, ax, az, bx, bz, hw, ha, hb, pa, pb });

// The watch-stone on H: flat top WATCH_STONE.h, sheer sides, one ramp up from the west.
export const WATCH_STONE = { x: 102.5, z: -56, r: 2.5, h: 9 };

// The relay climb: start on I, south down J's west side, east along its south side,
// north up its east side to the middle, then a bridge west onto J. Each leg runs
// RING_HW past its corner so the two legs meeting there share a square, flat over
// both legs' 2·RING_HW pads. Heights rise evenly over the sloped lengths.
function relayLegs() {
  const P = 2 * RING_HW, W = J_C[0] - RING_D, E = J_C[0] + RING_D, S = J_C[1] + RING_D, M = J_C[1];
  const legs = [
    { ax: W, az: -51, bx: W, bz: S + RING_HW, pa: 1, pb: P },                           // west side, from I
    { ax: W - RING_HW, az: S, bx: E + RING_HW, bz: S, pa: P, pb: P },                   // south side
    { ax: E, az: S + RING_HW, bx: E, bz: M - RING_HW, pa: P, pb: P },                   // east side, to the middle
    { ax: E + RING_HW, az: M, bx: J_C[0] + J_R - 1, bz: M, pa: P, pb: 1, flat: true },  // bridge onto J
  ];
  const sloped = (l) => (l.flat ? 0 : Math.hypot(l.bx - l.ax, l.bz - l.az) - l.pa - l.pb);
  const total = legs.reduce((t, l) => t + sloped(l), 0);
  let done = 0, h = H.I;
  return legs.map((l) => {
    const ha = h;
    done += sloped(l);
    h = done >= total - 1e-9 ? H.J : Math.round((H.I + (H.J - H.I) * done / total) * 100) / 100;
    return rampH('I', 'J', null, l.ax, l.az, l.bx, l.bz, RING_HW, ha, h, l.pa, l.pb);
  });
}

// The jetty runs on north from the top of the relay climb's east leg to J's north landing;
// the steps climb from K to L once the ring is solved.
export const LANTERN_RAMPS = [
  rampH('J', 'J', null, P_AXIS, -38.5, P_AXIS, -45.5, RING_HW, H.J, H.J, 1, 1),
  ramp('K', 'L', 'ring', P_AXIS, -110, P_AXIS, -117, 1.5),
];

export const RAMPS = [
  ramp('A', 'B', null, 0, 105, 0, 90, 1.5),                 // gate ramp (the door sits on it)
  ramp('B', 'C', null, -9, 66, -27.5, 66, 1.25, 1, 3.2),    // lookout spur
  ramp('B', 'D', 'bridge', 6, 63.25, 6, 44, 1.5),           // signal bridge
  ramp('D', 'E', 'plank', 6, -8, 6, -13.6, 0.8),            // plank span
  ramp('E', 'F', 'ladder', 11, -27.35, 11, -35.6, 0.75, 1, 1.2), // rope ladder
  // the Far Isle
  ramp('F', 'G', 'causeway', 27, -56, 69, -56, 2),          // causeway: 40 m of sea, 13.5 → 3
  ramp('G', 'H', 'bells', 83, -56, 90, -56, 1.5),           // the bells' stone steps
  rampH('H', 'H', null, 93.75, -56, 100.75, -56, 1.5, H.H, WATCH_STONE.h, 1, 1), // up the watch-stone
  ...relayLegs(),                                           // the relay climb, I → J
  ...LANTERN_RAMPS,
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

// Cosmetic undulation on plateaus, |u| ≤ 0.08 m.
const undulate = (x, z) => 0.05 * Math.sin(0.37 * x + 0.5) * Math.sin(0.29 * z) + 0.03 * Math.sin(0.11 * (x + z));

const A = ZONES[0];

// ------------------------------------------------------------------ marsh

// Marsh coordinates of (x, z): u across (along `right`), v along (along `fwd`).
const marshU = (x, z) => (x - MARSH.origin[0]) * MARSH.right[0] + (z - MARSH.origin[1]) * MARSH.right[1];
const marshV = (x, z) => (x - MARSH.origin[0]) * MARSH.fwd[0] + (z - MARSH.origin[1]) * MARSH.fwd[1];
const inMarsh = (u, v) => u >= 0 && u <= MARSH_W && v >= 0 && v <= MARSH_L;

// Which tile (x, z) is over, or -1 off the grid. No edge margin.
export function marshTileAt(x, z) {
  const u = marshU(x, z), v = marshV(x, z);
  if (!inMarsh(u, v)) return -1;
  const c = Math.min(MARSH.cols - 1, Math.floor(u / MARSH.tile)), r = Math.min(MARSH.rows - 1, Math.floor(v / MARSH.tile));
  return r * MARSH.cols + c;
}
// The dyn for anything that only LOOKS at the world (pointer rays, the camera boom): every
// marsh tile solid, so the live mask never shows which tiles are safe. Only a walker's own
// footing (stepPlayer, needsRespawn) reads the real dyn. Returns a copy.
export const lookDyn = (dyn) => ({ ...dyn, marsh: (1 << (MARSH.cols * MARSH.rows)) - 1 });
export function marshTileCentre(i) {
  const c = i % MARSH.cols, r = Math.floor(i / MARSH.cols);
  return marshAt((c + 0.5) * MARSH.tile, (r + 0.5) * MARSH.tile);
}
// Ground over the marsh: MARSH_SURFACE within `edge` of a solid tile, else deep.
function marshHeight(u, v, bits) {
  if (!bits) return SEA_Y;
  const t = MARSH.tile, e2 = MARSH.edge * MARSH.edge;
  const c0 = Math.min(MARSH.cols - 1, Math.floor(u / t)), r0 = Math.min(MARSH.rows - 1, Math.floor(v / t));
  for (let r = Math.max(0, r0 - 1); r <= Math.min(MARSH.rows - 1, r0 + 1); r++) {
    for (let c = Math.max(0, c0 - 1); c <= Math.min(MARSH.cols - 1, c0 + 1); c++) {
      if (!(bits & (1 << (r * MARSH.cols + c)))) continue;
      const du = Math.max(c * t - u, 0, u - (c + 1) * t), dv = Math.max(r * t - v, 0, v - (r + 1) * t);
      if (du * du + dv * dv <= e2) return MARSH_SURFACE;
    }
  }
  return SEA_Y;
}

// ------------------------------------------------------------------ pillars

// Which pillar (x, z) is over, or null. No edge margin.
export function pillarAt(x, z) {
  const t = PILLARS.tile;
  for (let line = 0; line < 2; line++) {
    const dx = x - P_LINES[line][0], dz = z - P_LINES[line][1];
    const u = dx * P_RIGHT[0] + dz * P_RIGHT[1], v = dx * PILLARS.fwd[0] + dz * PILLARS.fwd[1];
    if (Math.abs(u) <= t / 2 && v >= 0 && v <= P_LEN) return { line, r: Math.min(PILLARS.n - 1, Math.floor(v / t)) };
  }
  return null;
}
export const pillarCentre = (line, r) => [
  P_LINES[line][0] + PILLARS.fwd[0] * (r + 0.5) * PILLARS.tile,
  P_LINES[line][1] + PILLARS.fwd[1] * (r + 0.5) * PILLARS.tile,
];
export const PILLAR_BITS = 2 * PILLARS.n;
// Pillar ground at (x, z): null away from both lines; else whether (x, z) is inside a line's
// rectangle and whether it is within `edge` of a raised pillar.
function pillarGround(x, z, bits) {
  const t = PILLARS.tile, e = PILLARS.edge;
  for (let line = 0; line < 2; line++) {
    const dx = x - P_LINES[line][0], dz = z - P_LINES[line][1];
    const u = Math.abs(dx * P_RIGHT[0] + dz * P_RIGHT[1]), v = dx * PILLARS.fwd[0] + dz * PILLARS.fwd[1];
    if (u > t / 2 + e || v < -e || v > P_LEN + e) continue;
    const inside = u <= t / 2 && v >= 0 && v <= P_LEN;
    let up = false;
    const r0 = clamp(Math.floor(v / t), 0, PILLARS.n - 1), du = Math.max(0, u - t / 2);
    for (let r = Math.max(0, r0 - 1); r <= Math.min(PILLARS.n - 1, r0 + 1) && !up; r++) {
      if (!(bits & (1 << (line * PILLARS.n + r)))) continue;
      const dv = Math.max(r * t - v, 0, v - (r + 1) * t);
      up = du * du + dv * dv <= e * e;
    }
    return { inside, up };
  }
  return null;
}

// ------------------------------------------------------------------ height

export function heightAt(x, z, dyn = DYN_NONE) {
  // the lift platform is a flat deck at its own height, whatever lies beneath it
  if (onPlatform(x, z)) return LIFT.low + clamp(dyn.lift || 0, 0, 1) * (LIFT.high - LIFT.low);
  // so is the marsh: deep water but for its solid tiles
  const mu = marshU(x, z), mv = marshV(x, z);
  if (inMarsh(mu, mv)) return marshHeight(mu, mv, dyn.marsh | 0);
  // and the pillar lines, whose margin also reaches just past their rectangles
  const pg = pillarGround(x, z, dyn.pillars | 0);
  if (pg && pg.inside) return pg.up ? PILLAR_SURFACE : SEA_Y;
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
  // the watch-stone's flat top
  const sx = x - WATCH_STONE.x, sz = z - WATCH_STONE.z;
  if (sx * sx + sz * sz <= WATCH_STONE.r * WATCH_STONE.r) h = Math.max(h, WATCH_STONE.h);
  // ramps
  for (let i = 0; i < rampGeo.length; i++) {
    const g = rampGeo[i];
    if (g.r.flag && !dyn[g.r.flag]) continue;
    const s = rampS(g, x, z);
    if (s >= 0) h = Math.max(h, rampHeight(g, s));
  }
  if (pg && pg.up) h = Math.max(h, PILLAR_SURFACE);
  return h;
}

// Which plateau a point is on: null on ramps (present or not), the lift platform,
// the marsh, the pillar lines, the beach slope and water. The watch-stone counts as H.
export function zoneAt(x, z) {
  if (onPlatform(x, z)) return null;
  if (inMarsh(marshU(x, z), marshV(x, z))) return null;
  if (pillarAt(x, z)) return null;
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

// The seeing stones stand on K's wings, each facing the place to stand before it.
const SEEING = [
  { stone: [131.5, -98], spot: { x: 133.5, z: -98, r: 1.5 }, yaw: -Math.PI / 2 },   // faces +X
  { stone: [173.5, -98], spot: { x: 171.5, z: -98, r: 1.5 }, yaw: Math.PI / 2 },    // faces -X
];
const TALLY = [157, -123];
const STANDING_R = 0.6, SEEING_R = 0.7, LANTERN_R = 0.3, TALLY_R = 0.8;

// Owls: 0-2 on the first island, 3-4 on the Far Isle, 5-7 on the Lantern Isle.
const OWLS = [
  [-37, 73], [-13, 121], [12, -75],          // behind the lookout, up the beach, the summit's north rim
  [95, -48], [78, -65],                      // H's south rim, the neck to bell a
  [142, -88], toward(TOR_C, 90 * deg, 42), toward(TOR_C, 270 * deg, 42),   // K's nook, L's east and west spurs
];

export const SITES = {
  spawn: [[-1.5, 124], [1.5, 124]],
  checkpoints: [
    [[-1.5, 124], [1.5, 124]],      // 0 spawn, A
    [[-1.5, 84], [1.5, 84]],        // 1 B, just past the gate
    [[3.5, 41], [8.5, 41]],         // 2 D, just past the bridge
    [[4.5, -15.5], [7.5, -15.5]],   // 3 E, just past the plank
    [[4.5, -38.5], [7.5, -38.5]],   // 4 F, top of the lift
    [[3, -64], [9, -64]],           // 5 F, by the beacon
    [[106.5, -59.5], [106.5, -52.5]], // 6 H, by the marsh's near edge
    [[129, -59], [133, -59]],       // 7 I, by the small brazier
    [[142.5, -35.5], [146, -35.5]], // 8 J, the summit
    [[P_AXIS - 2, -86], [P_AXIS + 2, -86]],     // 9 K, where the pillars arrive
    [[P_AXIS - 2, -120], [P_AXIS + 2, -120]],   // 10 L, the head of the steps
    [[146, -122], [146, -125]],                 // 11 L, beside it
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
  causeway: rampSeg('causeway'),
  bells: {
    a: [78, -70],                   // north outcrop
    b: [78, -42],                   // south outcrop
    steps: rampSeg('bells'),
  },
  marsh: {
    ...MARSH,
    plate: { x: WATCH_STONE.x, z: WATCH_STONE.z, r: 1.5 },
    lever: [126.5, -60.5],
  },
  relay: {
    small: [130, -63],
    great: [...J_C],
  },
  pillars: {
    ...PILLARS,
    fwd: [...PILLARS.fwd],
    lines: P_LINES.map((o) => ({ origin: [...o] })),
    // Discs that take in the ground just before and just past both lines without touching a
    // pillar: the near one on J's landing, the far one on K.
    near: { x: P_AXIS, z: P_Z0 - 6.2 * PILLARS.fwd[1], r: 6.38 },
    far: { x: P_AXIS, z: P_END + 4.5 * PILLARS.fwd[1], r: 4.7 },
  },
  ring: {
    centre: RING_C,
    r: RING_R + 2.5,
    stones: [0, 1, 2, 3, 4, 5, 6, 7].map((i) => toward(RING_C, ENTRANCE_B + (i + 0.5) * Math.PI / 4, RING_R)),
    entrance: toward(RING_C, ENTRANCE_B, RING_R),
    seeing: SEEING,
    steps: rampSeg('ring'),
  },
  lanterns: {
    posts: POSTS,
    tally: TALLY,
    lamp: [...TOR_C],
  },
  owls: OWLS,
};

// The relay climb's centre line, from the small brazier to the great one.
export const RELAY_ROUTE = (() => {
  const W = J_C[0] - RING_D, E = J_C[0] + RING_D, S = J_C[1] + RING_D;
  return [SITES.relay.small, [W, -54], [W, S], [E, S], [E, J_C[1]], [...J_C]];
})();

// The walkable route from spawn to the beacon (spur to C left out), then on over the
// causeway, round the watch-stone, up the marsh's middle column and the relay climb.
export const TRAIL = [
  [0, 124], SITES.gate.plateA, [0, 97], SITES.gate.plateB, [0, 76], [6, 66],
  [6, 63.25], [6, 44], [6, 38], ...PLANK_ROUTE,
  [6, -13.6], [6, -20], [6, -32], [6, -38.5],
  [-4.5, -45], [-5, -55], [-3, -61], BEACON,
  [20, -59], [27, -56], [69, -56], [76, -56],                        // causeway to G
  [83, -56], [90, -56],                                               // the steps
  [92, -60], [107, -60], [109, -56],                                  // round the watch-stone
  marshAt(MARSH_W / 2, 0), marshAt(MARSH_W / 2, MARSH_L), [127, -56], // the middle column
  ...RELAY_ROUTE,
  [P_AXIS, J_C[1]], [P_AXIS, -50],                                   // back to the east leg, the jetty
  [SITES.pillars.far.x, SITES.pillars.far.z],                         // between the pillar lines
  SITES.ring.entrance, RING_C,                                        // through the ring
  [SITES.ring.steps.ax, SITES.ring.steps.az], [SITES.ring.steps.bx, SITES.ring.steps.bz],
  [TALLY[0] - 1.5, TALLY[1] + 1.5],                                   // to the tally stone
];

// ------------------------------------------------------------------ blockers

const STATIC_CIRCLES = [
  ...stones,
  ...beamRocks.map(({ x, z, r }) => ({ x, z, r })),
  { x: BEACON[0], z: BEACON[1], r: BEACON_R },
  { x: LAMP_XZ[0], z: LAMP_XZ[1], r: LAMP_R },
  ...SITES.ring.stones.map(([x, z]) => ({ x, z, r: STANDING_R })),
  ...SEEING.map(({ stone: [x, z] }) => ({ x, z, r: SEEING_R })),
  ...POSTS.map(([x, z]) => ({ x, z, r: LANTERN_R })),
  { x: TALLY[0], z: TALLY[1], r: TALLY_R },
];
const WALL_SEG = seg(WALL.x, WALL.z - WALL_HALF, WALL.x, WALL.z + WALL_HALF);

export function blockers(dyn = DYN_NONE) {
  const segments = [WALL_SEG];
  if (!dyn.gateOpen) segments.push(SITES.gate.door);
  return { circles: STATIC_CIRCLES, segments };
}

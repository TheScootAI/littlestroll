// Where the scenery goes: the placement of trees, boulders, rocks and tufts on all three islands,
// and the geometry facts it keeps clear of. Pure: no three.js, no DOM. Placement is seeded and
// deterministic, so both browsers deal the same items. terrain.js draws them.
import { heightAt, zoneAt, ZONES, RAMPS, TRAIL, PLANK_CORRIDOR, SITES, WATCH_STONE, DYN_NONE, LANTERN_ZONES, LANTERN_RAMPS } from './layout.js';
import { pointSegDist, lerp } from '../core/math.js';
import { WATER_Y, PLAYER_R } from '../config.js';

export const TREE_R = { pine: 0.7, round: 0.3 };   // a tree's solid radius, times its s
export const BOULDER_R = 1.3;                      // a boulder's, times its s

const BEACH_RUN = 10;                 // the beach slope runs this far past A's rim
const WALL_HALF = 2.5;                // the signal wall's half-length (layout's WALL_HALF)

// ------------------------------------------------------------------ extent

export function terrainExtent(zones = ZONES, ramps = RAMPS) {
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (const d of zones) {
    const r = d.zone === 'A' ? d.r + BEACH_RUN : d.r;
    x0 = Math.min(x0, d.x - r); x1 = Math.max(x1, d.x + r);
    z0 = Math.min(z0, d.z - r); z1 = Math.max(z1, d.z + r);
  }
  // ramps that are always there (the relay climb) reach past their island's disc
  for (const r of ramps) {
    if (r.flag !== null) continue;
    x0 = Math.min(x0, r.ax - r.hw, r.bx - r.hw); x1 = Math.max(x1, r.ax + r.hw, r.bx + r.hw);
    z0 = Math.min(z0, r.az - r.hw, r.bz - r.hw); z1 = Math.max(z1, r.az + r.hw, r.bz + r.hw);
  }
  const m = 3;
  return { x0: Math.floor(x0 - m), x1: Math.ceil(x1 + m), z0: Math.floor(z0 - m), z1: Math.ceil(z1 + m) };
}

// ------------------------------------------------------------------ features to keep clear

// Every puzzle anchor as an (x, z) point. Listed explicitly: some sites are [x, y, z].
export function siteAnchors() {
  const S = SITES, pts = [];
  const xz = (p) => pts.push([p[0], p[1]]);
  const xyz = (p) => pts.push([p[0], p[2]]);
  const seg = (s) => { pts.push([s.ax, s.az], [s.bx, s.bz]); };
  S.spawn.forEach(xz);
  S.checkpoints.forEach((pair) => pair.forEach(xz));
  xz(S.gate.plateA); xz(S.gate.plateB); seg(S.gate.door);
  xz(S.signal.lookout); pts.push([S.signal.wall.x, S.signal.wall.z]);
  S.signal.dials.forEach(xz); pts.push([S.signal.dialZone.x, S.signal.dialZone.z]); seg(S.signal.bridge);
  xz(S.plank.restA); xz(S.plank.restB); S.plank.stones.forEach((s) => pts.push([s.x, s.z]));
  xz(S.plank.slot); seg(S.plank.span);
  xz(S.lift.crank); pts.push([S.lift.platform.x, S.lift.platform.z]); xz(S.lift.post);
  xyz(S.beam.lamp.o); S.beam.mirrors.forEach(xz); xyz(S.beam.lens);
  S.beam.rocks.forEach((r) => pts.push([r.x, r.z])); xz(S.beam.hint.p1); xz(S.beam.hint.p2);
  xz(S.beacon);
  xz(S.bells.a); xz(S.bells.b); seg(S.bells.steps);
  return pts;
}

// Sites with extent, as segments {ax, az, bx, bz, hw}: distance is to the segment minus hw.
function siteStrips() {
  const S = SITES, w = S.signal.wall;
  const along = [Math.cos(w.yaw), -Math.sin(w.yaw)];   // perpendicular to the wall's facing
  const lastRock = S.beam.rocks[S.beam.rocks.length - 1];
  const P = S.lift.platform;
  return [
    { ...S.gate.door, hw: 0 },
    { ...S.signal.bridge, hw: 0 },
    { ...S.plank.span, hw: 0 },
    { ax: w.x - along[0] * WALL_HALF, az: w.z - along[1] * WALL_HALF, bx: w.x + along[0] * WALL_HALF, bz: w.z + along[1] * WALL_HALF, hw: 0 },
    // the lookout must see the back of the wall
    { ax: S.signal.lookout[0], az: S.signal.lookout[1], bx: w.x, bz: w.z, hw: 0 },
    // the lamp's beam runs to the rock that stops it
    { ax: S.beam.lamp.o[0], az: S.beam.lamp.o[2], bx: lastRock.x, bz: lastRock.z, hw: 0 },
    { ax: P.x, az: P.z - P.hd, bx: P.x, bz: P.z + P.hd, hw: P.hw },
    { ...PLANK_CORRIDOR },
  ];
}

export const rampGeo = RAMPS.map((r) => {
  const len = Math.hypot(r.bx - r.ax, r.bz - r.az);
  return { r, len, ux: (r.bx - r.ax) / len, uz: (r.bz - r.az) / len };
});
// Distance from (x, z) to a ramp rectangle (0 inside).
export function rampDistance(g, x, z) {
  const dx = x - g.r.ax, dz = z - g.r.az;
  const s = dx * g.ux + dz * g.uz, c = Math.abs(-dx * g.uz + dz * g.ux);
  return Math.hypot(Math.max(0, -s, s - g.len), Math.max(0, c - g.r.hw));
}

export function trailDistance(x, z) {
  let d = Infinity;
  for (let i = 1; i < TRAIL.length; i++) {
    const a = TRAIL[i - 1], b = TRAIL[i];
    d = Math.min(d, pointSegDist(x, z, a[0], a[1], b[0], b[1]).d);
  }
  return d;
}

const ANCHORS = siteAnchors();
const STRIPS = siteStrips();

// Distance from (x, z) to the nearest site anchor, site strip, ramp (any, present or
// not), the trail or the plank corridor.
export function featureClearance(x, z) {
  let d = trailDistance(x, z);
  for (const [ax, az] of ANCHORS) d = Math.min(d, Math.hypot(x - ax, z - az));
  for (const s of STRIPS) d = Math.min(d, pointSegDist(x, z, s.ax, s.az, s.bx, s.bz).d - s.hw);
  for (const g of rampGeo) d = Math.min(d, rampDistance(g, x, z));
  return d;
}

// ------------------------------------------------------------------ scenery placement

export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const GREEN = new Set(['B', 'C', 'D', 'E', 'F']);
const F = ZONES.find((d) => d.zone === 'F');
const SUMMIT_KEEP_CLEAR = 15;   // big scenery on the summit only near its rim, clear of the beam

// Ground within `tol` of the centre's height at four points `r` away: not a cliff edge.
function level(x, z, r, tol) {
  const h = heightAt(x, z);
  return [[r, 0], [-r, 0], [0, r], [0, -r]].every(([dx, dz]) => Math.abs(heightAt(x + dx, z + dz) - h) < tol);
}
const onSummitFloor = (x, z) => Math.hypot(x - F.x, z - F.z) < SUMMIT_KEEP_CLEAR;

const RULES = {
  // trees: plateaus only, well off the trail, never overhanging a cliff
  trees: { count: 42, ok: (x, z) => GREEN.has(zoneAt(x, z)) && trailDistance(x, z) >= 6 && !onSummitFloor(x, z) && level(x, z, 1.2, 0.3) },
  // boulders: dry ground off the trail
  boulders: { count: 26, ok: (x, z) => zoneAt(x, z) !== null && heightAt(x, z) > WATER_Y + 0.5 && trailDistance(x, z) >= 4.5 && !onSummitFloor(x, z) && level(x, z, 1, 0.4) },
  // small rocks: anywhere dry or shallow
  rocks: { count: 70, ok: (x, z) => heightAt(x, z) > -0.6 && level(x, z, 0.4, 0.5) },
  // grass tufts: green plateaus
  tufts: { count: 420, ok: (x, z) => GREEN.has(zoneAt(x, z)) && level(x, z, 0.3, 0.2) },
};

// Where the camera hangs behind a walker reading the Signal wall from the lookout: a strip
// running back from the lookout, away from the wall. Tall scenery there fills the screen.
const SEAT_BACK = 6, SEAT_CLEAR = { trees: 3.5, boulders: 2.5 };
function lookoutSeatDistance(x, z) {
  const L = SITES.signal.lookout, w = SITES.signal.wall;
  const len = Math.hypot(w.x - L[0], w.z - L[1]);
  const ux = (w.x - L[0]) / len, uz = (w.z - L[1]) / len;
  return pointSegDist(x, z, L[0], L[1], L[0] - ux * SEAT_BACK, L[1] - uz * SEAT_BACK).d;
}

// The first two islands' scenery is dealt over the extent they had before the Lantern Isle,
// and never onto its ground, so nothing placed there moves.
const OLD_EXTENT = terrainExtent(ZONES.filter((d) => !LANTERN_ZONES.includes(d)), RAMPS.filter((r) => !LANTERN_RAMPS.includes(r)));
const onLantern = (x, z) => LANTERN_ZONES.some((d) => (x - d.x) ** 2 + (z - d.z) ** 2 <= d.r * d.r);

export function placeScenery(seed = 20261113) {
  const rnd = mulberry32(seed);
  const e = OLD_EXTENT;
  const out = {};
  for (const [kind, rule] of Object.entries(RULES)) {
    const list = [];
    for (let tries = 0; list.length < rule.count && tries < rule.count * 400; tries++) {
      const x = lerp(e.x0, e.x1, rnd()), z = lerp(e.z0, e.z1, rnd());
      const r1 = rnd(), r2 = rnd(), r3 = rnd();
      if (onLantern(x, z) || featureClearance(x, z) < 3 || !rule.ok(x, z)) continue;
      const item = { x, y: heightAt(x, z), z, rot: r1 * Math.PI * 2, s: 0.75 + r2 * 0.6, tint: r3 };
      if (kind === 'trees') item.kind = r3 < 0.55 ? 'pine' : 'round';
      if (kind === 'boulders') item.y -= 0.2 * item.s;
      if (kind === 'rocks') item.y -= 0.05;
      list.push(item);
    }
    // Taken out afterwards, not skipped while dealing: skipping would shift every later draw
    // and move the whole island's scenery.
    out[kind] = kind in SEAT_CLEAR ? list.filter((i) => lookoutSeatDistance(i.x, i.z) >= SEAT_CLEAR[kind]) : list;
  }
  return out;
}

// ---- the Far Isle's scenery: the same rules, zones G to J, from its OWN seeded stream so the
// first island's placements (above) are never disturbed.
const FAR_GREEN = new Set(['G', 'H', 'I', 'J']);
const FAR_X0 = 66;                                  // west of this is the first island and the causeway
const MARSH_KEEP = 3;                               // metres off any marsh tile
const FAR_ANCHORS = [SITES.marsh.lever, [SITES.marsh.plate.x, SITES.marsh.plate.z], SITES.relay.small, SITES.relay.great];
const GRID_CENTRE = (() => {
  const { origin, right, fwd, tile, cols, rows } = SITES.marsh;
  const u = (cols * tile) / 2, v = (rows * tile) / 2;
  return [origin[0] + right[0] * u + fwd[0] * v, origin[1] + right[1] * u + fwd[1] * v];
})();

// Distance from (x, z) to the marsh grid's rectangle (0 over it).
function marshDistance(x, z) {
  const { origin, right, fwd, tile, cols, rows } = SITES.marsh;
  const u = (x - origin[0]) * right[0] + (z - origin[1]) * right[1];
  const v = (x - origin[0]) * fwd[0] + (z - origin[1]) * fwd[1];
  return Math.hypot(Math.max(0, -u, u - cols * tile), Math.max(0, -v, v - rows * tile));
}

// Everything the Far Isle must keep clear: sites, ramps, trail, the marsh, the watch-stone and
// its sight line to the grid, the lever, the plate and both braziers.
function farClear(x, z) {
  if (featureClearance(x, z) < 3 || marshDistance(x, z) < MARSH_KEEP) return false;
  for (const [ax, az] of FAR_ANCHORS) if (Math.hypot(x - ax, z - az) < 3) return false;
  if (Math.hypot(x - WATCH_STONE.x, z - WATCH_STONE.z) < WATCH_STONE.r + 3) return false;
  return pointSegDist(x, z, WATCH_STONE.x, WATCH_STONE.z, GRID_CENTRE[0], GRID_CENTRE[1]).d >= 3;
}

const FAR_RULES = {
  trees: { count: 26, ok: (x, z) => FAR_GREEN.has(zoneAt(x, z)) && zoneAt(x, z) !== 'J' && trailDistance(x, z) >= 6 && level(x, z, 1.2, 0.3) },
  boulders: { count: 12, ok: (x, z) => zoneAt(x, z) !== null && zoneAt(x, z) !== 'J' && heightAt(x, z) > WATER_Y + 0.5 && trailDistance(x, z) >= 4.5 && level(x, z, 1, 0.4) },
  rocks: { count: 30, ok: (x, z) => zoneAt(x, z) !== null && heightAt(x, z) > -0.6 && level(x, z, 0.4, 0.5) },
  tufts: { count: 200, ok: (x, z) => FAR_GREEN.has(zoneAt(x, z)) && level(x, z, 0.3, 0.2) },
};

// The approach to each bell: G's landing centre, then that neck's disc centre, then the bell. Taken
// from the zone discs and SITES.bells. The landing is G's widest disc, a bell's neck the other G disc
// nearest to it.
const G_DISCS = ZONES.filter((d) => d.zone === 'G');
const G_LANDING = G_DISCS.reduce((a, d) => (d.r > a.r ? d : a));
const BELL_WAYS = [SITES.bells.a, SITES.bells.b].map((bell) => {
  const neck = G_DISCS.filter((d) => d !== G_LANDING && Math.hypot(d.x - bell[0], d.z - bell[1]) > 0.5)
    .reduce((a, d) => (Math.hypot(d.x - bell[0], d.z - bell[1]) < Math.hypot(a.x - bell[0], a.z - bell[1]) ? d : a));
  return [[G_LANDING.x, G_LANDING.z], [neck.x, neck.z], [...bell]];
});
const NECK_KEEP = 0.6;   // metres a solid keeps off the walker's edge along those lines
function blocksBell(it, radius) {
  const lim = radius + PLAYER_R + NECK_KEEP;
  return BELL_WAYS.some((w) => pointSegDist(it.x, it.z, ...w[0], ...w[1]).d < lim || pointSegDist(it.x, it.z, ...w[1], ...w[2]).d < lim);
}

// keepOpen = false gives the deal as dealt, before the bells' approaches are cleared (for the tests).
export function placeFarScenery(seed = 20261114, keepOpen = true) {
  const rnd = mulberry32(seed);
  const e = OLD_EXTENT;
  const out = {};
  for (const [kind, rule] of Object.entries(FAR_RULES)) {
    const list = [];
    for (let tries = 0; list.length < rule.count && tries < rule.count * 400; tries++) {
      const x = lerp(FAR_X0, e.x1, rnd()), z = lerp(e.z0, e.z1, rnd());
      const r1 = rnd(), r2 = rnd(), r3 = rnd();
      if (onLantern(x, z) || !farClear(x, z) || !rule.ok(x, z)) continue;
      const item = { x, y: heightAt(x, z), z, rot: r1 * Math.PI * 2, s: 0.75 + r2 * 0.6, tint: r3 };
      if (kind === 'trees') item.kind = r3 < 0.55 ? 'pine' : 'round';
      if (kind === 'boulders') item.y -= 0.2 * item.s;
      if (kind === 'rocks') item.y -= 0.05;
      list.push(item);
    }
    out[kind] = list;
  }
  // Taken out afterwards, not skipped while dealing, so no other item moves.
  if (keepOpen) {
    out.trees = out.trees.filter((t) => !blocksBell(t, TREE_R[t.kind] * t.s));
    out.boulders = out.boulders.filter((b) => !blocksBell(b, BOULDER_R * b.s));
  }
  return out;
}

// ---- the Lantern Isle's scenery: zones K and L, from its OWN seeded stream. The tor's crag is
// dealt last from the same stream, so it never shifts the trees, rocks and tufts before it.
const LANTERN_GREEN = new Set(['K', 'L']);
const TOR = LANTERN_ZONES.find((d) => d.zone === 'T');
const RING_KEEP = SITES.ring.r;                    // nothing inside the ring of stones
const LANTERN_KEEP = 3;                            // metres off the tall sites
const LANTERN_ANCHORS = [
  ...SITES.ring.stones, ...SITES.ring.seeing.flatMap((s) => [s.stone, [s.spot.x, s.spot.z]]),
  ...SITES.lanterns.posts, SITES.lanterns.tally, SITES.lanterns.lamp,
  ...SITES.owls, ...SITES.checkpoints.flat(),
];
const SEEING_LINE = SITES.ring.seeing.map((s) => [s.spot.x, s.spot.z]);   // the stones' sight line across the ring

// Everything the Lantern Isle's trees and boulders must keep clear.
function lanternClear(x, z) {
  if (featureClearance(x, z) < 2 || Math.hypot(x - SITES.ring.centre[0], z - SITES.ring.centre[1]) < RING_KEEP) return false;
  return !LANTERN_ANCHORS.some(([ax, az]) => Math.hypot(x - ax, z - az) < LANTERN_KEEP);
}
const lanternGround = (x, z) => LANTERN_GREEN.has(zoneAt(x, z));
const seeingLine = (x, z) => pointSegDist(x, z, ...SEEING_LINE[0], ...SEEING_LINE[1]).d;

const LANTERN_RULES = {
  trees: { count: 56, ok: (x, z) => lanternGround(x, z) && level(x, z, 1.2, 0.3) && seeingLine(x, z) >= 3 },
  boulders: { count: 14, ok: (x, z) => lanternGround(x, z) && level(x, z, 1, 0.4) && seeingLine(x, z) >= 3 },
  rocks: { count: 36, ok: (x, z) => lanternGround(x, z) && level(x, z, 0.4, 0.5) },
  tufts: { count: 260, ok: (x, z) => lanternGround(x, z) && level(x, z, 0.3, 0.2) },
};

const CRAG_TOP = 34, CRAG_WALL = 38, CRAG_OUT = 1.5;   // rocks piled on the tor's top and against its wall

export function placeLanternScenery(seed = 20261115) {
  const rnd = mulberry32(seed);
  const xs = LANTERN_ZONES.filter((d) => LANTERN_GREEN.has(d.zone));
  const x0 = Math.min(...xs.map((d) => d.x - d.r)), x1 = Math.max(...xs.map((d) => d.x + d.r));
  const z0 = Math.min(...xs.map((d) => d.z - d.r)), z1 = Math.max(...xs.map((d) => d.z + d.r));
  const out = {};
  for (const [kind, rule] of Object.entries(LANTERN_RULES)) {
    const list = [];
    for (let tries = 0; list.length < rule.count && tries < rule.count * 400; tries++) {
      const x = lerp(x0, x1, rnd()), z = lerp(z0, z1, rnd());
      const r1 = rnd(), r2 = rnd(), r3 = rnd();
      if (!lanternClear(x, z) || !rule.ok(x, z)) continue;
      const item = { x, y: heightAt(x, z), z, rot: r1 * Math.PI * 2, s: 0.75 + r2 * 0.6, tint: r3 };
      if (kind === 'trees') item.kind = r3 < 0.55 ? 'pine' : 'round';
      if (kind === 'boulders') item.y -= 0.2 * item.s;
      if (kind === 'rocks') item.y -= 0.05;
      list.push(item);
    }
    out[kind] = list;
  }
  // The crag. Scenery only: it blocks nothing. Top rocks rest on the tor's top, wall rocks sit
  // half into its face at any height from the foot up and may stand CRAG_OUT outside the disc.
  const lampXZ = SITES.lanterns.lamp, footY = heightAt(TOR.x + TOR.r + 1, TOR.z, DYN_NONE), topY = heightAt(TOR.x, TOR.z, DYN_NONE);
  const keepOff = (x, z) => Math.hypot(x - lampXZ[0], z - lampXZ[1]) >= LANTERN_KEEP && !LANTERN_ANCHORS.some(([ax, az]) => Math.hypot(x - ax, z - az) < LANTERN_KEEP);
  const crag = [];
  for (const [n, wall] of [[CRAG_TOP, false], [CRAG_WALL, true]]) {
    for (let k = 0, tries = 0; k < n && tries < n * 100; tries++) {
      const a = rnd() * Math.PI * 2, f = rnd(), r1 = rnd(), r2 = rnd(), r3 = rnd();
      const d = wall ? TOR.r - 0.8 + f * (0.8 + CRAG_OUT) : lerp(5, TOR.r - 1, Math.sqrt(f));
      const x = TOR.x + Math.cos(a) * d, z = TOR.z + Math.sin(a) * d;
      if (!keepOff(x, z)) continue;
      const s = 1.5 + r2 * 1.9;
      const y = wall ? lerp(footY - 0.3, topY - 0.8, r1 * r1) : topY - 0.3 * s;
      crag.push({ x, y, z, rot: r3 * Math.PI * 2, s, tint: f, sy: 0.7 + r1 * 0.5 });
      k++;
    }
  }
  out.crag = crag;
  return out;
}

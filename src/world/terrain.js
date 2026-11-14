// The island on screen: terrain mesh, water, sky, lights and scenery.
// Placement helpers (siteAnchors, featureClearance, placeScenery, …) are pure and
// tested without WebGL; buildTerrain turns them into three.js objects.
import {
  BufferGeometry, Float32BufferAttribute, Mesh, MeshLambertMaterial, MeshPhongMaterial, PlaneGeometry,
  Color, Fog, HemisphereLight, DirectionalLight, InstancedMesh, Object3D, IcosahedronGeometry,
  ConeGeometry, CylinderGeometry, DoubleSide,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { heightAt, zoneAt, ZONES, RAMPS, TRAIL, PLANK_CORRIDOR, SITES, WATCH_STONE, DYN_NONE } from './layout.js';
import { pointSegDist, clamp, lerp } from '../core/math.js';
import { WATER_Y } from '../config.js';

export const TERRAIN_STEP = 0.5;      // metres between height samples
const SEA_FLOOR = -4;                 // layout's sea floor
const BEACH_RUN = 10;                 // the beach slope runs this far past A's rim
const SHADOW_BOX = 60;                // metres across the sun's shadow camera
const SHADOW_MAP = 2048;
const SUN_OFFSET = [28, 55, 38];      // sun position relative to the walker
const WALL_HALF = 2.5;                // the signal wall's half-length (layout's WALL_HALF)

// ------------------------------------------------------------------ palette (sRGB)

export const PALETTE = {
  sky: 0xf4e6d0,
  sand: 0xeedcb4, wetSand: 0xd8c39a, shore: 0xf6ecd6, seabed: 0xbfb08c,
  grassLow: 0x9fc67c, grassMid: 0x8cba6f, grassHigh: 0xb0cc8e,
  rock: 0x9d93a8, rockDark: 0x857b91,
  trail: 0xdcc69c,
  water: 0x6cbcb4,
  trunk: 0x8a6a52, pine: 0x6f9e6a, leaf: 0x93c072, boulder: 0xa49aae, tuft: 0x86b562,
};

// ------------------------------------------------------------------ extent

export function terrainExtent() {
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (const d of ZONES) {
    const r = d.zone === 'A' ? d.r + BEACH_RUN : d.r;
    x0 = Math.min(x0, d.x - r); x1 = Math.max(x1, d.x + r);
    z0 = Math.min(z0, d.z - r); z1 = Math.max(z1, d.z + r);
  }
  // ramps that are always there (the relay climb) reach past their island's disc
  for (const r of RAMPS) {
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

const rampGeo = RAMPS.map((r) => {
  const len = Math.hypot(r.bx - r.ax, r.bz - r.az);
  return { r, len, ux: (r.bx - r.ax) / len, uz: (r.bz - r.az) / len };
});
// Distance from (x, z) to a ramp rectangle (0 inside).
function rampDistance(g, x, z) {
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

export function placeScenery(seed = 20261113) {
  const rnd = mulberry32(seed);
  const e = terrainExtent();
  const out = {};
  for (const [kind, rule] of Object.entries(RULES)) {
    const list = [];
    for (let tries = 0; list.length < rule.count && tries < rule.count * 400; tries++) {
      const x = lerp(e.x0, e.x1, rnd()), z = lerp(e.z0, e.z1, rnd());
      const r1 = rnd(), r2 = rnd(), r3 = rnd();
      if (featureClearance(x, z) < 3 || !rule.ok(x, z)) continue;
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

export function placeFarScenery(seed = 20261114) {
  const rnd = mulberry32(seed);
  const e = terrainExtent();
  const out = {};
  for (const [kind, rule] of Object.entries(FAR_RULES)) {
    const list = [];
    for (let tries = 0; list.length < rule.count && tries < rule.count * 400; tries++) {
      const x = lerp(FAR_X0, e.x1, rnd()), z = lerp(e.z0, e.z1, rnd());
      const r1 = rnd(), r2 = rnd(), r3 = rnd();
      if (!farClear(x, z) || !rule.ok(x, z)) continue;
      const item = { x, y: heightAt(x, z), z, rot: r1 * Math.PI * 2, s: 0.75 + r2 * 0.6, tint: r3 };
      if (kind === 'trees') item.kind = r3 < 0.55 ? 'pine' : 'round';
      if (kind === 'boulders') item.y -= 0.2 * item.s;
      if (kind === 'rocks') item.y -= 0.05;
      list.push(item);
    }
    out[kind] = list;
  }
  return out;
}

// ------------------------------------------------------------------ terrain mesh

const col = (hex) => new Color(hex);   // converts sRGB hex to the linear working space
const C = Object.fromEntries(Object.entries(PALETTE).map(([k, v]) => [k, col(v)]));

// Cheap deterministic per-cell noise in [0, 1).
const hash2 = (i, j) => {
  let h = Math.imul(i, 374761393) + Math.imul(j, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};

const tmpC = new Color();
// Colour for one face from its centroid (x, z), height h and normal y.
function faceColour(x, z, h, ny, n) {
  const zone = zoneAt(x, z);
  const c = tmpC;
  if (ny < 0.72) {
    // cliffs: banded grey-violet rock
    const band = Math.floor((h + 4) / 1.3) % 2;
    c.copy(band ? C.rock : C.rockDark);
  } else if (h < -0.35) {
    c.copy(C.seabed).lerp(C.wetSand, clamp((h + 2) / 1.6, 0, 1));
  } else if (h < 0.18) {
    c.copy(C.shore);
  } else if (zone === 'A' || (zone === null && h < 1.3 && !rampGeo.some((g) => rampDistance(g, x, z) === 0))) {
    c.copy(C.wetSand).lerp(C.sand, clamp((h - 0.15) / 0.6, 0, 1));
  } else if (zone === null) {
    c.copy(C.trail);   // ramps and the lift deck
  } else {
    const t = clamp((h - 4) / 9.5, 0, 1);
    c.copy(C.grassLow).lerp(C.grassMid, clamp(t * 2, 0, 1)).lerp(C.grassHigh, clamp(t * 2 - 1, 0, 1));
    if (zone === 'C') c.lerp(C.grassHigh, 0.25);
  }
  // the walkable trail reads as a worn path on dry, gentle ground
  if (ny >= 0.72 && h > 0.3 && zone !== 'A') {
    const td = trailDistance(x, z);
    if (td < 1.6) c.lerp(C.trail, td < 1.0 ? 0.85 : 0.85 * (1.6 - td) / 0.6);
  }
  const v = 0.95 + 0.08 * n;
  return c.multiplyScalar(v);
}

// The height the ground MESH is drawn at: the ground, except under a built top. The lift's deck
// and the watch-stone's cap are drawn at exactly the height a walker stands on them, so ground
// drawn there too would share their plane and flicker through. Under them the mesh is sunk
// out of sight instead. Walking is unaffected: that still asks heightAt.
const DECK_SEAT = 0.35, CAP_SEAT = 0.3;
export function meshHeightAt(x, z) {
  const h = heightAt(x, z, DYN_NONE);
  const P = SITES.lift.platform;
  // strictly inside the deck's edge, so the mesh still meets the ground around it at the edge
  if (Math.abs(x - P.x) < P.hw - 1e-6 && Math.abs(z - P.z) < P.hd - 1e-6) return h - DECK_SEAT;
  if (Math.hypot(x - WATCH_STONE.x, z - WATCH_STONE.z) <= WATCH_STONE.r) return h - CAP_SEAT;
  return h;
}

function terrainGeometry() {
  const e = terrainExtent(), s = TERRAIN_STEP;
  const nx = Math.round((e.x1 - e.x0) / s), nz = Math.round((e.z1 - e.z0) / s);
  const H = new Float32Array((nx + 1) * (nz + 1));
  for (let j = 0; j <= nz; j++) for (let i = 0; i <= nx; i++) H[j * (nx + 1) + i] = meshHeightAt(e.x0 + i * s, e.z0 + j * s);
  const hAt = (i, j) => H[j * (nx + 1) + i];

  const pos = [], colr = [];
  const tri = (ax, ay, az, bx, by, bz, cx, cy, cz, n) => {
    pos.push(ax, ay, az, bx, by, bz, cx, cy, cz);
    // face normal y (unnormalised cross product of b−a and c−a)
    const ux = bx - ax, uy = by - ay, uz = bz - az, vx = cx - ax, vy = cy - ay, vz = cz - az;
    const nX = uy * vz - uz * vy, nY = uz * vx - ux * vz, nZ = ux * vy - uy * vx;
    const ny = nY / Math.hypot(nX, nY, nZ);
    const c = faceColour((ax + bx + cx) / 3, (az + bz + cz) / 3, (ay + by + cy) / 3, ny, n);
    for (let k = 0; k < 3; k++) colr.push(c.r, c.g, c.b);
  };

  for (let j = 0; j < nz; j++) {
    for (let i = 0; i < nx; i++) {
      const h00 = hAt(i, j), h10 = hAt(i + 1, j), h01 = hAt(i, j + 1), h11 = hAt(i + 1, j + 1);
      if (Math.max(h00, h10, h01, h11) <= SEA_FLOOR + 0.01) continue;   // open sea floor: the seabed plane
      const x0 = e.x0 + i * s, x1 = x0 + s, z0 = e.z0 + j * s, z1 = z0 + s;
      const n1 = hash2(i * 2, j), n2 = hash2(i * 2 + 1, j);
      // split along the diagonal whose ends differ least: cliffs keep their line
      if (Math.abs(h00 - h11) <= Math.abs(h10 - h01)) {
        tri(x0, h00, z0, x0, h01, z1, x1, h11, z1, n1);
        tri(x0, h00, z0, x1, h11, z1, x1, h10, z0, n2);
      } else {
        tri(x0, h00, z0, x0, h01, z1, x1, h10, z0, n1);
        tri(x1, h10, z0, x0, h01, z1, x1, h11, z1, n2);
      }
    }
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new Float32BufferAttribute(colr, 3));
  g.computeVertexNormals();   // non-indexed: one normal per face, so facets read
  return g;
}

// ------------------------------------------------------------------ scenery meshes

// A rough low-poly stone: an icosahedron with each corner nudged by a hash of where it
// is, so the corners shared between faces move together and the mesh stays closed.
function rockGeometry(seed) {
  const g = new IcosahedronGeometry(1, 0);
  const p = g.getAttribute('position');
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const k = 0.8 + 0.4 * hash2(Math.round(x * 1000) + seed, Math.round(y * 1000) * 7 + Math.round(z * 1000));
    p.setXYZ(i, x * k, y * k * 0.7, z * k);
  }
  g.computeVertexNormals();
  return g;
}

function pineGeometry() {
  const a = new ConeGeometry(1.25, 2.2, 7); a.translate(0, 2.1, 0);
  const b = new ConeGeometry(0.9, 1.8, 7); b.translate(0, 3.2, 0);
  const c = new ConeGeometry(0.55, 1.3, 7); c.translate(0, 4.1, 0);
  return mergeGeometries([a, b, c]);
}

function tuftGeometry() {
  const blades = [];
  for (let k = 0; k < 4; k++) {
    const b = new ConeGeometry(0.07, 0.42, 3);
    b.translate(0, 0.21, 0);
    b.rotateZ(0.35 * (k % 2 ? 1 : -1));
    b.rotateY((k * Math.PI) / 2 + 0.3);
    blades.push(b);
  }
  return mergeGeometries(blades);
}

const dummy = new Object3D();
function instanced(geo, items, base, place, shadows = true) {
  const m = new InstancedMesh(geo, new MeshLambertMaterial({ color: 0xffffff, flatShading: true }), Math.max(1, items.length));
  m.count = items.length;
  const c = new Color();
  items.forEach((it, i) => {
    place(it, dummy);
    dummy.updateMatrix();
    m.setMatrixAt(i, dummy.matrix);
    m.setColorAt(i, c.copy(base).multiplyScalar(0.88 + 0.22 * it.tint));
  });
  m.instanceMatrix.needsUpdate = true;
  if (m.instanceColor) m.instanceColor.needsUpdate = true;
  m.castShadow = shadows;
  m.receiveShadow = true;
  m.computeBoundingSphere();
  return m;
}

function buildScenery(scene) {
  const a = placeScenery(), b = placeFarScenery();
  const s = Object.fromEntries(Object.keys(a).map((k) => [k, [...a[k], ...b[k]]]));
  const trees = s.trees, pines = trees.filter((t) => t.kind === 'pine'), rounds = trees.filter((t) => t.kind === 'round');
  const put = (sy = 1, dy = 0) => (it, o) => { o.position.set(it.x, it.y + dy, it.z); o.rotation.set(0, it.rot, 0); o.scale.set(it.s, it.s * sy, it.s); };

  const trunkGeo = new CylinderGeometry(0.16, 0.24, 1.6, 6); trunkGeo.translate(0, 0.8, 0);
  const roundGeo = new IcosahedronGeometry(1.35, 0); roundGeo.translate(0, 2.7, 0);
  const parts = [
    ['trunks', instanced(trunkGeo, trees, C.trunk, put(1, -0.1))],
    ['pines', instanced(pineGeometry(), pines, C.pine, put(1, -0.1))],
    ['roundTrees', instanced(roundGeo, rounds, C.leaf, put(0.9, -0.1))],
    ['boulders', instanced(rockGeometry(11), s.boulders, C.boulder, (it, o) => { put()(it, o); o.scale.multiplyScalar(1.4); })],
    ['rocks', instanced(rockGeometry(29), s.rocks, C.boulder, (it, o) => { put()(it, o); o.scale.multiplyScalar(0.35); })],
    ['tufts', instanced(tuftGeometry(), s.tufts, C.tuft, put())],
  ];
  for (const [name, m] of parts) { m.name = name; scene.add(m); }
}

// ------------------------------------------------------------------ sky, water, light

// Keep the sun's shadow box centred on (x, y, z), snapped to whole shadow texels so
// the shadow edges don't crawl as the walker moves.
export function followSun(sun, x, y, z) {
  const t = SHADOW_BOX / SHADOW_MAP;
  const sx = Math.round(x / t) * t, sy = Math.round(y / t) * t, sz = Math.round(z / t) * t;
  sun.target.position.set(sx, sy, sz);
  sun.position.set(sx + SUN_OFFSET[0], sy + SUN_OFFSET[1], sz + SUN_OFFSET[2]);
}

export function buildTerrain(scene) {
  scene.background = col(PALETTE.sky);
  scene.fog = new Fog(col(PALETTE.sky), 70, 280);

  const ground = new Mesh(terrainGeometry(), new MeshLambertMaterial({ vertexColors: true, flatShading: true }));
  ground.name = 'terrain';
  ground.receiveShadow = true;
  ground.castShadow = true;
  scene.add(ground);

  const seabed = new Mesh(new PlaneGeometry(2000, 2000), new MeshLambertMaterial({ color: col(PALETTE.seabed) }));
  seabed.name = 'seabed';
  seabed.rotation.x = -Math.PI / 2;
  seabed.position.y = SEA_FLOOR - 0.01;
  seabed.receiveShadow = true;
  scene.add(seabed);

  const water = new Mesh(
    new PlaneGeometry(2000, 2000),
    new MeshPhongMaterial({ color: col(PALETTE.water), transparent: true, opacity: 0.74, shininess: 80, specular: 0x3a4a48, side: DoubleSide, depthWrite: false }),
  );
  water.name = 'water';
  water.rotation.x = -Math.PI / 2;
  water.position.y = WATER_Y;
  water.receiveShadow = true;
  water.renderOrder = 1;
  scene.add(water);

  const hemi = new HemisphereLight(0xfff3e0, 0xa89a7c, 1.5);
  hemi.name = 'hemi';
  scene.add(hemi);

  const sun = new DirectionalLight(0xfff0d8, 2.3);
  sun.name = 'sun';
  sun.castShadow = true;
  sun.shadow.mapSize.set(SHADOW_MAP, SHADOW_MAP);
  const sc = sun.shadow.camera;
  sc.left = -SHADOW_BOX / 2; sc.right = SHADOW_BOX / 2; sc.top = SHADOW_BOX / 2; sc.bottom = -SHADOW_BOX / 2;
  sc.near = 1; sc.far = 220;
  sc.updateProjectionMatrix();
  sun.shadow.radius = 3;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.04;
  scene.add(sun);
  scene.add(sun.target);
  followSun(sun, SITES.spawn[0][0], heightAt(...SITES.spawn[0]), SITES.spawn[0][1]);

  buildScenery(scene);
}

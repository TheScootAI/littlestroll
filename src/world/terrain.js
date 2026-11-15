// The island on screen: terrain mesh, water, sky, lights and scenery.
// Placement lives in scenery.js; buildTerrain turns it into three.js objects.
import {
  BufferGeometry, Float32BufferAttribute, Mesh, MeshLambertMaterial, MeshPhongMaterial, PlaneGeometry,
  Color, Fog, HemisphereLight, DirectionalLight, InstancedMesh, Object3D, IcosahedronGeometry,
  ConeGeometry, CylinderGeometry, DoubleSide,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { heightAt, zoneAt, SITES, WATCH_STONE, DYN_NONE } from './layout.js';
import { clamp } from '../core/math.js';
import { WATER_Y } from '../config.js';
import { terrainExtent, rampGeo, rampDistance, trailDistance, placeScenery, placeFarScenery, placeLanternScenery } from './scenery.js';

// Placement lives in scenery.js (pure); re-exported so importers of terrain.js keep working.
export { terrainExtent, siteAnchors, trailDistance, featureClearance, mulberry32, placeScenery, placeFarScenery, placeLanternScenery } from './scenery.js';

export const TERRAIN_STEP = 0.5;      // metres between height samples
const SEA_FLOOR = -4;                 // layout's sea floor
const SHADOW_BOX = 60;                // metres across the sun's shadow camera
const SHADOW_MAP = 2048;
const SUN_OFFSET = [28, 55, 38];      // sun position relative to the walker

// ------------------------------------------------------------------ palette (sRGB)

export const PALETTE = {
  sky: 0xf4e6d0,
  sand: 0xeedcb4, wetSand: 0xd8c39a, shore: 0xf6ecd6, seabed: 0xbfb08c,
  grassLow: 0x9fc67c, grassMid: 0x8cba6f, grassHigh: 0xb0cc8e,
  rock: 0x9d93a8, rockDark: 0x857b91,
  trail: 0xdcc69c,
  water: 0x6cbcb4,
  lanternGrass: 0xa4c885, lanternGrassHigh: 0xb9cf92, torRock: 0xaaa0b2, torRockDark: 0x938a9e,
  trunk: 0x8a6a52, pine: 0x6f9e6a, leaf: 0x93c072, boulder: 0xa49aae, tuft: 0x86b562,
};

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
    // the Lantern Isle: a fresher green on K, a paler one on L; the tor is bare rock
    if (zone === 'K') c.copy(C.lanternGrass);
    if (zone === 'L') c.copy(C.lanternGrass).lerp(C.lanternGrassHigh, 0.5);
    if (zone === 'T') c.copy(C.torRock).lerp(C.torRockDark, clamp(n * 1.6 - 0.3, 0, 1));
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
  const a = placeScenery(), b = placeFarScenery(), { crag, ...l } = placeLanternScenery();
  const s = Object.fromEntries(Object.keys(a).map((k) => [k, [...a[k], ...b[k], ...l[k]]]));
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
    // the tor's crag: big rocks, flattened a little by `sy`
    ['crag', instanced(rockGeometry(53), crag, C.torRock, (it, o) => { put()(it, o); o.scale.set(it.s, it.s * it.sy, it.s); })],
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

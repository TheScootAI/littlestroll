// The wreck on the starting beach: the broken lower hull of a small ship lying on its side half in
// the sand (a keel, curved ribs, planking still on one side, the stump of a mast), and the loose
// things between it and the rock. Scenery only: nothing here can be picked up or blocks a
// walker, and it reads no puzzle state. Every part is set on the ground from heightAt.
import {
  Group, Mesh, MeshLambertMaterial, InstancedMesh, Matrix4, Vector3, Color,
  BoxGeometry, CylinderGeometry, TorusGeometry, ConeGeometry,
} from 'three';
import { SITES, heightAt } from '../../world/layout.js';
import { DEBRIS } from '../../world/wreck.js';

const mat = (hex, extra = {}) => new MeshLambertMaterial({ color: hex, flatShading: true, ...extra });
const WOOD = 0xa9774c, WOOD_DARK = 0x7d5638, RIB = 0x6f4d33, STRAKE = 0x93673f, IRON = 0x4a4a52, ROPE = 0xc9b48a, CLOTH = 0xd9ceb0;

const LENGTH = 10.5, STATIONS = 11, ROLL = 0.35;   // metres; it lies heeled over this many radians
const hash = (n) => { const x = Math.sin(n * 12.9898 + 4.1) * 43758.5453; return x - Math.floor(x); };

// Hull-local (x along the keel, y up, z across) to world, for the hull at (hx, hz) turned by yaw.
function frame({ x: hx, z: hz, yaw }) {
  const c = Math.cos(yaw), s = Math.sin(yaw);
  return (xl, zl) => [hx + xl * c + zl * s, hz - xl * s + zl * c];
}

// A flat-ish beam from p to q whose broad face looks along `n`: matrix for an instanced box.
const X = new Vector3(), Y = new Vector3(), Z = new Vector3(), M = new Matrix4();
function beam(p, q, n, w, t) {
  Z.set(q[0] - p[0], q[1] - p[1], q[2] - p[2]);
  const len = Z.length(); Z.divideScalar(len || 1);
  Y.set(n[0], n[1], n[2]); Y.addScaledVector(Z, -Y.dot(Z)).normalize();
  X.crossVectors(Y, Z);
  M.makeBasis(X, Y, Z).scale(new Vector3(w, t, len)).setPosition((p[0] + q[0]) / 2, (p[1] + q[1]) / 2, (p[2] + q[2]) / 2);
  return M.clone();
}

function instanced(list, color, tint) {
  const m = new InstancedMesh(new BoxGeometry(1, 1, 1), mat(0xffffff), list.length);
  list.forEach((mx, i) => { m.setMatrixAt(i, mx); m.setColorAt(i, new Color(color).multiplyScalar(1 - tint + tint * 2 * hash(i + color))); });
  m.castShadow = m.receiveShadow = true;
  m.frustumCulled = false;
  return m;
}

function buildHull(root) {
  const h = SITES.wreck.hull, toWorld = frame(h);
  const ribs = [], strakes = [];
  const cR = Math.cos(ROLL), sR = Math.sin(ROLL);
  // per rib: `at(phi)` is the point `phi` round its bowl (world x, y, z) and `nrm(phi)` the way the wall faces there
  const stations = [];
  for (let i = 0; i < STATIONS; i++) {
    const f = -0.92 + (1.84 * i) / (STATIONS - 1);   // -1 stern .. 1 bow
    const xl = f * LENGTH / 2, [wx, wz] = toWorld(xl, 0);
    const keelY = heightAt(wx, wz) - 0.18 + 0.5 * f * f;   // sunk a little; the ends of the keel rise
    const W = 1.65 * Math.sqrt(1 - f * f * 0.8), H = 1.9 - 0.45 * Math.abs(f);
    // how far up each side the rib still stands: the heeled-up side (-z) mostly stands, the buried one is broken low
    const up = 0.6 + 0.4 * hash(i * 3 + 1), low = 0.35 + 0.35 * hash(i * 5 + 2);
    const max = { port: 1.4 * up * (1 - 0.25 * Math.abs(f)), star: 1.2 * low };
    const at = (phi) => {
      const z = W * Math.sin(phi), y = H * (1 - Math.cos(phi));
      const [px, pz] = toWorld(xl, z * cR + y * sR);
      return [px, keelY + y * cR - z * sR, pz];
    };
    const nrm = (phi) => {   // outward normal of the bowl, rolled
      const tz = W * Math.cos(phi), ty = H * Math.sin(phi), l = Math.hypot(tz, ty);
      const nz = ty / l, ny = -tz / l;
      const [ox, oz] = toWorld(0, nz * cR + ny * sR), [o0x, o0z] = toWorld(0, 0);
      return [ox - o0x, ny * cR - nz * sR, oz - o0z];
    };
    stations.push({ at, nrm, max, keel: [...toWorld(xl, 0)] });
    // the keel piece and the rib's two arms
    const SEG = 5;
    for (const side of [-1, 1]) {
      const lim = side < 0 ? max.port : max.star;
      for (let k = 0; k < SEG; k++) {
        const p0 = side * (lim * k) / SEG, p1 = side * (lim * (k + 1)) / SEG;
        ribs.push(beam(at(p0), at(p1), nrm((p0 + p1) / 2), 0.2, 0.16));
      }
    }
  }
  // the keel: a timber end to end under the ribs
  const keel = [];
  for (let i = 0; i + 1 < STATIONS; i++) keel.push(beam(stations[i].at(0), stations[i + 1].at(0), [0, -1, 0], 0.34, 0.3));
  // planking left on the heeled-up side: strakes between neighbouring ribs, some missing
  for (let i = 0; i + 1 < STATIONS; i++) {
    for (let k = 0; k < 5; k++) {
      const phi = -(0.2 + 0.24 * k), a = stations[i], b = stations[i + 1];
      if (-phi > Math.min(a.max.port, b.max.port) - 0.02 || hash(i * 7 + k * 13) < 0.22) continue;
      strakes.push(beam(a.at(phi), b.at(phi), a.nrm(phi), 0.3, 0.07));
    }
  }
  root.add(instanced(ribs, RIB, 0.18), instanced(keel, WOOD_DARK, 0.1), instanced(strakes, STRAKE, 0.2));

  // the stump of the mast, a little off the vertical, broken off ragged
  {
    const [mx, mz] = toWorld(0.4, 0.2), my = heightAt(mx, mz) + 0.2;
    const mast = new Group();
    mast.position.set(mx, my, mz);
    mast.rotation.set(0.16, 0, -0.1);
    const post = new Mesh(new CylinderGeometry(0.17, 0.24, 2.1, 8), mat(WOOD_DARK));
    post.position.y = 1.0;
    const jag = new Mesh(new ConeGeometry(0.17, 0.5, 5), mat(0xd8b98a));
    jag.position.y = 2.25;
    jag.rotation.z = 0.2;
    mast.add(post, jag);
    mast.traverse((o) => { if (o.isMesh) o.castShadow = o.receiveShadow = true; });
    root.add(mast);
  }
  // a few loose timbers lying beside the hull
  const loose = [[-3.2, -2.9, 0.4], [2.0, -3.0, 2.2], [-0.5, 3.2, 1.2]].map(([xl, zl, ry]) => {
    const [x, z] = toWorld(xl, zl), y = heightAt(x, z) + 0.08, dx = Math.cos(ry) * 1.1, dz = Math.sin(ry) * 1.1;
    return beam([x - dx, y, z - dz], [x + dx, y, z + dz], [0, 1, 0], 0.3, 0.1);
  });
  root.add(instanced(loose, WOOD, 0.1));
}

function buildDebris(root) {
  const wood = mat(WOOD), woodDark = mat(WOOD_DARK), iron = mat(IRON);
  const mesh = (geo, m, x = 0, y = 0, z = 0) => { const o = new Mesh(geo, m); o.position.set(x, y, z); return o; };
  const make = {
    barrel() {
      const g = new Group();
      g.add(mesh(new CylinderGeometry(0.4, 0.4, 0.95, 10), mat(0x8f6240), 0, 0.48, 0));
      for (const y of [0.2, 0.76]) g.add(mesh(new CylinderGeometry(0.43, 0.43, 0.07, 10), iron, 0, y, 0));
      return g;
    },
    barrelSide() {
      const o = new Group(), body = make.barrel();
      body.rotation.z = Math.PI / 2;
      body.position.set(0.48, 0.43, 0);   // lies on its curve
      o.add(body);
      return o;
    },
    crate() {
      const g = new Group();
      g.add(mesh(new BoxGeometry(0.95, 0.8, 0.95), wood, 0, 0.4, 0));
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(mesh(new BoxGeometry(0.12, 0.84, 0.12), woodDark, 0.45 * sx, 0.4, 0.45 * sz));
      g.add(mesh(new BoxGeometry(0.99, 0.08, 0.99), woodDark, 0, 0.8, 0));
      return g;
    },
    rope() {
      const g = new Group();
      for (let k = 0; k < 3; k++) {
        const t = mesh(new TorusGeometry(0.48 - k * 0.02, 0.1, 6, 12), mat(ROPE), 0, 0.1 + k * 0.17, 0);
        t.rotation.x = Math.PI / 2;
        g.add(t);
      }
      return g;
    },
    sail() {
      const g = new Group(), cloth = mat(CLOTH);
      [[0, 0, 2.4, 1.5, 0.1], [0.5, 0.07, 1.4, 1.1, -0.5], [-0.7, 0.05, 1.1, 0.8, 0.8]].forEach(([x, y, w, d, r], i) => {
        const p = mesh(new BoxGeometry(w, 0.05, d), cloth, x, 0.04 + y, i * 0.2);
        p.rotation.set(0.08 * (i + 1), r, 0.06);
        g.add(p);
      });
      return g;
    },
    anchor() {
      const g = new Group();
      g.add(mesh(new BoxGeometry(0.13, 0.13, 1.7), iron, 0, 0.1, 0));
      g.add(mesh(new BoxGeometry(0.95, 0.1, 0.1), iron, 0, 0.12, -0.7));
      const arms = mesh(new TorusGeometry(0.48, 0.07, 6, 10, Math.PI), iron, 0, 0.1, 0.8);
      arms.rotation.x = Math.PI / 2; arms.rotation.z = Math.PI;
      g.add(arms);
      return g;
    },
    wheel() {
      const g = new Group(), w = new Group(), m = mat(WOOD_DARK);
      w.add(mesh(new TorusGeometry(0.5, 0.05, 5, 12), m));
      w.add(mesh(new CylinderGeometry(0.1, 0.1, 0.12, 8).rotateX(Math.PI / 2), m));
      for (let k = 0; k < 8; k++) { const sp = mesh(new BoxGeometry(1.2, 0.05, 0.05), m); sp.rotation.z = (k * Math.PI) / 4 + Math.PI / 8; if (k < 4) w.add(sp); }
      w.position.y = 0.3;
      w.rotation.x = -1.15;   // leaning back on its rim
      g.add(w);
      return g;
    },
  };
  for (const o of DEBRIS) {
    const g = make[o.kind]();
    g.position.set(o.x, heightAt(o.x, o.z) - 0.03, o.z);
    g.rotation.y = o.yaw;
    g.traverse((c) => { if (c.isMesh) c.castShadow = c.receiveShadow = true; });
    root.add(g);
  }
}

export function createView(scene) {
  const root = new Group();
  root.name = 'wreck-view';
  scene.add(root);
  buildHull(root);
  buildDebris(root);
  return { sync() {} };
}

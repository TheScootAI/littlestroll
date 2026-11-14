// The Ring on screen: eight blank standing stones (a touched stone glows, right or wrong; all
// flash dull red for a moment when four are judged wrong), a marked entrance, a floor disc that
// glows while both walkers are inside, two seeing stones whose faces are drawn only while
// seesFace says this walker may read them, and stone steps that rise from K toward L with
// s.steps (built like the bells' steps). Never writes to S.
//
// Face 0 (the order): four signs left to right with 1-4 pips under them. Face 1 (the ring):
// the eight signs laid out as the stones stand seen from above, north up, the entrance at the
// bottom, drawn as a little doorway (two posts and a threshold) with an arrow pointing to it.
import {
  Group, Mesh, MeshLambertMaterial, MeshBasicMaterial, BoxGeometry, CylinderGeometry, PlaneGeometry,
  RingGeometry, CircleGeometry, ShapeGeometry, Shape, DoubleSide, Color,
} from 'three';
import { SITES, RAMPS, heightAt } from '../../world/layout.js';
import { clamp } from '../../core/math.js';
import { STONES, LEN, facePos, bothInside, seesFace } from '../ring.js';
import { signTexture, SIGN_COUNT } from './signs.js';

const mat = (hex, extra = {}) => new MeshLambertMaterial({ color: hex, flatShading: true, ...extra });
const STONE = 0x9a948c, STONE_DARK = 0x7d776f, SLAB = 0xb9b0a4, GLOW = 0xffe3a0, TREAD = 0xb9b0bf, TREAD_DARK = 0x9d93a8;
const SEA_FLOOR = -4, STONE_H = 3.4, SEEN_H = 5.1, FACE_LIFT = 1.2, SEEN_W = 3.6, SEEN_T = 0.5;
const FLASH_S = 0.6;
const smooth = (t) => t * t * (3 - 2 * t);

export function createView(scene) {
  const root = new Group();
  root.name = 'ring-view';
  scene.add(root);
  const R = SITES.ring;
  const glowCol = new Color(GLOW), redCol = new Color(0x8a2a22), none = new Color(0x000000);
  const shadowed = (g) => g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  const tex = Array.from({ length: SIGN_COUNT }, (_, i) => signTexture(i));
  const [cx, cz] = R.centre;
  const gy = heightAt(cx, cz);

  // ---- floor disc: glows while both are inside
  const floorM = new MeshBasicMaterial({ color: GLOW, transparent: true, opacity: 0, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
  const floor = new Mesh(new CircleGeometry(R.r, 48), floorM);
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(cx, gy + 0.06, cz);
  root.add(floor);

  // ---- eight standing stones (blank)
  const stones = R.stones.map(([x, z]) => {
    const m = mat(STONE, { emissive: none.clone() });
    const body = new Mesh(new CylinderGeometry(0.5, 0.6, STONE_H, 7), m);
    body.position.set(x, heightAt(x, z) + STONE_H / 2, z);
    const cap = new Mesh(new CylinderGeometry(0.4, 0.5, 0.3, 7), mat(STONE_DARK));
    cap.position.set(x, heightAt(x, z) + STONE_H + 0.1, z);
    const g = new Group(); g.add(body, cap); shadowed(g); root.add(g);
    return m;
  });

  // ---- entrance: two short posts and a flat threshold slab
  {
    const [ex, ez] = R.entrance, y = heightAt(ex, ez);
    const slab = new Mesh(new BoxGeometry(2.2, 0.14, 1.6), mat(SLAB));
    slab.position.set(ex, y + 0.07, ez);
    root.add(slab);
    for (const s of [-1, 1]) {
      const post = new Mesh(new BoxGeometry(0.4, 1.3, 0.4), mat(STONE_DARK));
      post.position.set(ex + s * 1.3, y + 0.65, ez);
      const top = new Mesh(new BoxGeometry(0.5, 0.15, 0.5), mat(SLAB));
      top.position.set(ex + s * 1.3, y + 1.38, ez);
      const g = new Group(); g.add(post, top); shadowed(g); root.add(g);
    }
    shadowed(slab);
  }

  // ---- seeing stones
  const dark = () => new MeshBasicMaterial({ color: 0x1d1a18 });
  const bright = () => new MeshBasicMaterial({ color: GLOW });
  const plane = (w, h, m, x, y, z) => { const p = new Mesh(new PlaneGeometry(w, h), m); p.position.set(x, y, z); return p; };
  const sign = (i, size, x, y, z) => {
    const m = new MeshBasicMaterial({ map: tex[i], color: GLOW, transparent: true, side: DoubleSide, depthWrite: false });
    return { mesh: plane(size, size, m, x, y, z), m };
  };
  const tile = (size, x, y, z) => {          // a bright frame, a dark inset, ready for a sign on top
    const g = new Group();
    g.add(plane(size, size, bright(), x, y, z), plane(size - 0.07, size - 0.07, dark(), x, y, z + 0.01));
    return g;
  };
  const FZ = SEEN_T / 2 + 0.02;

  const seen = R.seeing.map((sd, face) => {
    const [x, z] = sd.stone;
    const g = new Group();
    g.position.set(x, heightAt(x, z), z);
    g.rotation.y = sd.yaw + Math.PI;     // local +Z toward the walker, local +X the walker's right
    const slab = new Mesh(new BoxGeometry(SEEN_W, SEEN_H, SEEN_T), mat(STONE_DARK));
    slab.position.y = SEEN_H / 2;
    const capM = new Mesh(new BoxGeometry(SEEN_W + 0.3, 0.3, SEEN_T + 0.3), mat(STONE));
    capM.position.y = SEEN_H + 0.1;
    g.add(slab, capM);
    const face_ = new Group();
    face_.visible = false;
    face_.position.y = FACE_LIFT;     // up out of the walker's own avatar's way
    g.add(face_);
    const signMats = [];
    if (face === 0) {
      // the order: four signs left to right, 1-4 pips beneath
      face_.add(plane(3.4, 1.7, dark(), 0, 2.0, FZ));
      for (let k = 0; k < LEN; k++) {
        const px = (k - (LEN - 1) / 2) * 0.9;
        face_.add(tile(0.7, px, 2.2, FZ + 0.01));
        const sg = sign(0, 0.56, px, 2.2, FZ + 0.03);
        face_.add(sg.mesh); signMats.push(sg.m);
        for (let q = 0; q <= k; q++) {
          const pip = new Mesh(new CircleGeometry(0.06, 12), bright());
          pip.position.set(px + (q - k / 2) * 0.16, 1.7, FZ + 0.02);
          face_.add(pip);
        }
      }
    } else {
      // the ring from above: north up, entrance at the bottom
      const cy = 2.25, RR = 1.1;
      face_.add(plane(3.4, 3.4, dark(), 0, 2.0, FZ));
      const guide = new Mesh(new RingGeometry(RR - 0.025, RR + 0.025, 48, 1, -Math.PI / 2 + 0.5, Math.PI * 2 - 1.0), new MeshBasicMaterial({ color: 0x6a6258 }));
      guide.position.set(0, cy, FZ + 0.005);
      face_.add(guide);
      for (let i = 0; i < STONES; i++) {
        const [ux, uy] = facePos(i);
        const px = ux * RR, py = cy + uy * RR;
        face_.add(tile(0.66, px, py, FZ + 0.01));
        const sg = sign(0, 0.52, px, py, FZ + 0.03);
        face_.add(sg.mesh); signMats.push(sg.m);
      }
      // the entrance: a little doorway under the ring, and an arrow inside pointing down to it
      face_.add(plane(0.9, 0.08, bright(), 0, 0.55, FZ + 0.01));
      for (const s of [-1, 1]) face_.add(plane(0.08, 0.3, bright(), s * 0.45, 0.7, FZ + 0.01));
      const arrow = new Shape();
      arrow.moveTo(0, -0.72); arrow.lineTo(0.3, -0.28); arrow.lineTo(0.11, -0.28); arrow.lineTo(0.11, 0.1);
      arrow.lineTo(-0.11, 0.1); arrow.lineTo(-0.11, -0.28); arrow.lineTo(-0.3, -0.28); arrow.closePath();
      const am = new Mesh(new ShapeGeometry(arrow), bright());
      am.position.set(0, cy, FZ + 0.02);
      face_.add(am);
    }
    shadowed(g);
    root.add(g);
    // the worn slab where the walker stands
    const sp = sd.spot;
    const pad = new Mesh(new CylinderGeometry(1.3, 1.4, 0.1, 14), mat(SLAB));
    pad.position.set(sp.x, heightAt(sp.x, sp.z) + 0.03, sp.z);
    pad.receiveShadow = true;
    root.add(pad);
    return { face: face_, signMats, shown: null };
  });

  // ---- steps (as the bells')
  const rp = RAMPS.find((r) => r.flag === 'ring');
  const len = Math.hypot(rp.bx - rp.ax, rp.bz - rp.az), ux = (rp.bx - rp.ax) / len, uz = (rp.bz - rp.az) / len;
  const dyn = { ring: true };
  const N = 8, run = len / N;
  const treads = [];
  for (let i = 0; i < N; i++) {
    const sm = (i + 0.5) * run, x = rp.ax + ux * sm, z = rp.az + uz * sm;
    const top = heightAt(x, z, dyn);
    const g = new Group();
    g.position.set(x, 0, z);
    g.rotation.y = Math.atan2(-uz, ux);
    const hgt = top - SEA_FLOOR;
    const m = new Mesh(new BoxGeometry(run + 0.02, hgt, 2 * rp.hw), mat(i % 2 ? TREAD : TREAD_DARK));
    m.position.y = SEA_FLOOR + hgt / 2;
    g.add(m);
    shadowed(g);
    root.add(g);
    treads.push({ g, drop: hgt + 0.8, delay: (i / (N - 1)) * 0.45 });
  }

  return {
    sync(s, ctx) {
      const players = ctx?.players ?? [];
      floorM.opacity = bothInside(players) ? 0.16 : 0;
      const flash = s.miss < FLASH_S ? 1 - s.miss / FLASH_S : 0;
      stones.forEach((m, i) => {
        if (s.touched.includes(i)) m.emissive.copy(glowCol).multiplyScalar(0.7);
        else m.emissive.copy(redCol).multiplyScalar(flash);
      });
      seen.forEach((sd, face) => {
        const on = seesFace(s, face, players, ctx?.localIdx ?? 0);
        sd.face.visible = on;
        if (!on) return;
        const key = face ? s.signs.join() : s.order.map((k) => s.signs[k]).join();
        if (sd.shown === key) return;
        sd.shown = key;
        const list = face ? s.signs : s.order.map((k) => s.signs[k]);
        sd.signMats.forEach((m, k) => { m.map = tex[list[k]]; m.needsUpdate = true; });
      });
      for (const q of treads) {
        const k = smooth(clamp((s.steps - q.delay) / (1 - 0.45), 0, 1));
        q.g.visible = k > 0;
        q.g.position.y = -(1 - k) * q.drop;
      }
    },
  };
}

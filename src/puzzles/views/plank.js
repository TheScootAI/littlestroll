// The four timbers on screen, each at its own length and plainly its own shape (a wide plank, a
// round iron-banded spar, a short split board, a small battened hatch). One at rest leans on the
// rock; one carried by two rides at hip height between them; one carried by one hangs from that
// end; one laid lies across the gap; one that tipped in makes a short splash. Also the tall
// standing stones, and a pale outline on the ground where the piece is meant to go. Never writes to S.
import {
  Group, Mesh, MeshLambertMaterial, MeshBasicMaterial, BoxGeometry, CylinderGeometry, DodecahedronGeometry,
  PlaneGeometry, Color,
} from 'three';
import { SITES, heightAt } from '../../world/layout.js';
import { LEN, board as rigid, lengthOf, atRest } from '../plank.js';
import { leanEnds, TIP_RISE, fallPose, hitTime } from '../../world/wreck.js';
import { WATER_Y } from '../../config.js';

const mat = (hex, extra = {}) => new MeshLambertMaterial({ color: hex, flatShading: true, ...extra });
const HIP = 0.75;          // carried ends ride this far above the ground under them
const WIDTH = 0.9, THICK = 0.14;
const GLOW = 0.4;          // the end caps' steady emissive strength
const HALF = { plank: 0.07, spar: 0.16, board: 0.07, hatch: 0.05 };   // half a piece's thickness: laid flush on the ramp
const REST = { plank: 0.12, spar: 0.17, board: 0.1, hatch: 0.1 };   // an end resting on the ground: half the piece's thickness, a little more

export function createView(scene) {
  const root = new Group();
  root.name = 'plank-view';
  scene.add(root);
  const WOOD = 0xa9774c, WOOD_DARK = 0x7d5638, ACCENT = 0xf08a3c, ROCK = 0x8a847c, ROCK_DARK = 0x6f6a63;
  const SPAR = 0x5b4636, IRON = 0x3d3f46, PALE = 0xd8b98a, HATCH = 0xb48a58, HATCH_DARK = 0x5f4430;

  // ---- standing stones: rough menhirs whose footprint is the collision circle
  SITES.plank.stones.forEach((st, i) => {
    const g = new Group();
    g.position.set(st.x, heightAt(st.x, st.z), st.z);
    g.rotation.y = i * 1.7;
    const h = 3.4 + (i % 3) * 0.5;
    const body = new Mesh(new CylinderGeometry(st.r * 0.62, st.r * 0.98, h, 7, 2), mat(i % 2 ? ROCK : ROCK_DARK));
    body.position.y = h / 2;
    const top = new Mesh(new DodecahedronGeometry(st.r * 0.6, 0), mat(ROCK));
    top.position.y = h;
    top.scale.set(1, 0.8, 0.9);
    g.add(body, top);
    g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    root.add(g);
  });

  // ---- the slot: a pale outline of a plank-sized rectangle on the ground (long axis along Z)
  {
    const [x, z] = SITES.plank.slot;
    const y = heightAt(x, z) + 0.03;
    const outline = new Group();
    outline.position.set(x, y, z);
    const lineMat = new MeshBasicMaterial({ color: 0xfff1d0, transparent: true, opacity: 0.8 });
    const t = 0.1, w = WIDTH + 0.3;
    for (const [sx, sz, bw, bd] of [[-w / 2, 0, t, LEN], [w / 2, 0, t, LEN], [0, -LEN / 2, w, t], [0, LEN / 2, w, t]]) {
      const bar = new Mesh(new PlaneGeometry(bw, bd), lineMat);
      bar.rotation.x = -Math.PI / 2;
      bar.position.set(sx, 0, sz);
      outline.add(bar);
    }
    root.add(outline);
  }

  // ---- the four timbers: each built at its own length along Z, end A at -Z and end B at +Z.
  // The end caps are a steady orange, free or held.
  const glow = new Color(ACCENT);
  const box = (w, h, d, m, x = 0, y = 0, z = 0) => { const o = new Mesh(new BoxGeometry(w, h, d), m); o.position.set(x, y, z); return o; };
  const timber = (len, kind) => {
    const g = new Group();
    const capMats = [0, 1].map(() => mat(ACCENT, { emissive: glow.clone().multiplyScalar(GLOW) }));
    const wood = mat(WOOD), dark = mat(WOOD_DARK);
    if (kind === 'spar') {
      const r = 0.16;
      const pole = new Mesh(new CylinderGeometry(r * 0.85, r, len, 10).rotateX(Math.PI / 2), mat(SPAR));
      g.add(pole);
      const iron = mat(IRON);
      for (const z of [-len * 0.22, len * 0.12, len * 0.3]) {
        const band = new Mesh(new CylinderGeometry(r * 1.2, r * 1.2, 0.14, 10).rotateX(Math.PI / 2), iron);
        band.position.z = z;
        g.add(band);
      }
      capMats.forEach((m, i) => { const c = new Mesh(new CylinderGeometry(r * 1.25, r * 1.25, 0.3, 10).rotateX(Math.PI / 2), m); c.position.z = (i ? 1 : -1) * (len / 2 - 0.15); g.add(c); });
    } else if (kind === 'board') {
      const body = len - 0.3;   // the last 0.3 m is splintered
      g.add(box(0.7, THICK, body, mat(0x9c7249), 0, 0, -0.15));
      const crack = box(0.05, THICK + 0.02, 0.8, dark, 0.12, 0, 0.1);   // a long crack
      crack.rotation.y = 0.3;
      g.add(crack);
      const pale = mat(PALE);
      [[-0.25, 0.5, 0.1], [0.02, 0.32, -0.12], [0.26, 0.42, 0.18]].forEach(([x, l, ry]) => {
        const sh = box(0.16, THICK * 0.8, l, pale, x, 0, len / 2 - 0.3 + l / 2 - 0.05);
        sh.rotation.y = ry;
        g.add(sh);
      });
      capMats.forEach((m, i) => g.add(box(0.76, THICK + 0.06, 0.26, m, 0, 0, i ? len / 2 - 0.43 : -len / 2 + 0.13)));
    } else if (kind === 'hatch') {
      const w = 1.2;
      [-0.45, -0.15, 0.15, 0.45].forEach((x, i) => g.add(box(w / 4 - 0.02, 0.1, len, mat(i % 2 ? HATCH : 0xa27c4d), x, 0, 0)));
      const bat = mat(HATCH_DARK);
      for (const z of [-0.4, 0.4]) g.add(box(w, 0.07, 0.16, bat, 0, 0.07, z));
      capMats.forEach((m, i) => g.add(box(w + 0.04, 0.14, 0.2, m, 0, 0, (i ? 1 : -1) * (len / 2 - 0.1))));
    } else {
      g.add(box(WIDTH, THICK, len, wood));
      for (const sx of [-0.2, 0.2]) g.add(box(0.06, THICK + 0.02, len, dark, sx));
      capMats.forEach((m, i) => g.add(box(WIDTH + 0.06, THICK + 0.06, 0.28, m, 0, 0, (i ? 1 : -1) * (len / 2 - 0.14))));
    }
    g.traverse((o) => { if (o.isMesh) o.castShadow = o.receiveShadow = true; });
    root.add(g);
    return { g, capMats, rest: REST[kind] ?? 0.12 };
  };
  const pieces = SITES.wreck.pieces.map((p, i) => timber(lengthOf(i), p.kind));

  // Lay timber p with its ends at (ax,ay,az) and (bx,by,bz).
  const place = (p, ax, ay, az, bx, by, bz) => {
    p.g.position.set((ax + bx) / 2, (ay + by) / 2, (az + bz) / 2);
    if (Math.hypot(bx - ax, by - ay, bz - az) > 1e-6) p.g.lookAt(bx, by, bz);
  };

  // ---- a short splash where a piece that was too short tipped in: a ring of droplets that rise and fall
  const DROPS = 14;
  const dropMat = new MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9 });
  const splash = new Group();
  const drops = [];
  for (let k = 0; k < DROPS; k++) { const d = new Mesh(new BoxGeometry(0.1, 0.14, 0.1), dropMat); splash.add(d); drops.push(d); }
  splash.visible = false;
  root.add(splash);
  const SPLASH_X = 6, SPLASH_Z = -10.8, SPLASH_Y = WATER_Y + 0.05;   // in the gap, where the piece hits the water
  const SPLASH_T = 1.0;

  const sp = SITES.plank.span;
  const spanLen = Math.hypot(sp.bx - sp.ax, sp.bz - sp.az);
  const ay0 = heightAt(sp.ax, sp.az), by0 = heightAt(sp.bx, sp.bz, { plank: true });
  const [rkx, rkz] = SITES.wreck.rock;

  return {
    sync(s, ctx) {
      s.boards.forEach((b, i) => {
        const p = pieces[i], len = lengthOf(i), rest = p.rest, hf = HALF[SITES.wreck.pieces[i].kind];
        if (s.placed === i) {
          // laid across the gap at its own length, centred on it
          const dx = (sp.bx - sp.ax) / spanLen, dz = (sp.bz - sp.az) / spanLen, ext = (len - spanLen) / 2, dy = (by0 - ay0) / spanLen;
          place(p, sp.ax - dx * ext, ay0 - dy * ext + hf, sp.az - dz * ext, sp.bx + dx * ext, by0 + dy * ext + hf, sp.bz + dz * ext);
          return;
        }
        // a carried end rides on its holder's (smoothed) position; a free one stays where S says
        const end = (hold, x, z) => {
          const q = hold !== null ? ctx.players[hold] : null;
          if (q && q.present) { x = q.x; z = q.z; }
          return [x, z, q && q.present && Number.isFinite(q.y) ? q.y : null];   // a carried end rides at its carrier's height
        };
        // once something is laid nobody carries anything: draw the others where S says they lie
        const ha = s.placed === null && b.holdA !== null, hb = s.placed === null && b.holdB !== null;
        let [ax, az, ca] = end(ha ? b.holdA : null, b.ax, b.az), [bx, bz, cb] = end(hb ? b.holdB : null, b.bx, b.bz);
        const ground = (x, z) => heightAt(x, z, ctx.dyn);
        let ya, yb;
        if (ha && hb) {
          // carried by two it is rigid: its full length, centred between the carriers
          [ax, az, bx, bz] = rigid(len, ax, az, bx, bz, [1, 0]);
          ya = (ca ?? ground(ax, az)) + HIP; yb = (cb ?? ground(bx, bz)) + HIP;
        } else if (ha || hb) {
          // carried by one: that end at their hip, the piece's full length pointing at its other end
          const [hx, hz, ox, oz] = ha ? [ax, az, bx, bz] : [bx, bz, ax, az];
          const hy = ((ha ? ca : cb) ?? ground(hx, hz)) + HIP, oy = ground(ox, oz) + rest;
          const l = Math.hypot(ox - hx, oy - hy, oz - hz) || 1, k = len / l;
          const ex = hx + (ox - hx) * k, ez = hz + (oz - hz) * k, ey = hy + (oy - hy) * k;
          if (ha) { bx = ex; bz = ez; ya = hy; yb = ey; } else { ax = ex; az = ez; yb = hy; ya = ey; }
        } else if (s.fell === i && fallPose(len, s.splash)) {
          // too short for the gap: laid out from the near bank, then it falls in (not drawn at the wreck meanwhile)
          const f = fallPose(len, s.splash);
          place(p, f.a[0], f.a[1] + hf, f.a[2], f.b[0], f.b[1] + hf, f.b[2]);
          return;
        } else if (atRest(s, i)) {
          // leaning on the rock: end A on the sand, end B up on the rock
          const e = leanEnds([b.ax, b.az], [b.bx, b.bz], [rkx, rkz], len);
          [ax, az] = e.a; [bx, bz] = e.b;
          ya = ground(ax, az) + rest; yb = ya + TIP_RISE;
        } else {
          ya = ground(ax, az) + rest; yb = ground(bx, bz) + rest;
        }
        place(p, ax, ya, az, bx, yb, bz);
      });
      // the splash
      const t = s.fell !== null ? s.splash - hitTime(lengthOf(s.fell)) : -1;   // from the moment it reaches the water
      splash.visible = t >= 0 && t < SPLASH_T;
      if (splash.visible) {
        drops.forEach((d, k) => {
          const a = (k / DROPS) * Math.PI * 2, r = (0.5 + (k % 3) * 0.35) * (0.4 + t), y = (2.4 + (k % 2) * 0.9) * t - 4.9 * t * t;
          d.visible = y >= 0;
          d.position.set(SPLASH_X + Math.cos(a) * r, SPLASH_Y + Math.max(0, y), SPLASH_Z + Math.sin(a) * r);
        });
        dropMat.opacity = Math.min(0.9, (SPLASH_T - t) * 2);
      }
    },
  };
}

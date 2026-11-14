// The Plank on screen: a 4 m board that lies at its rest, rides at hip height between its
// carriers, or lies across the gap once placed; the tall standing stones; and a pale outline
// on the ground where it is meant to go. Never writes to S.
import {
  Group, Mesh, MeshLambertMaterial, MeshBasicMaterial, BoxGeometry, CylinderGeometry, DodecahedronGeometry,
  PlaneGeometry, Color, Vector3,
} from 'three';
import { SITES, heightAt } from '../../world/layout.js';
import { LEN } from '../plank.js';

const mat = (hex, extra = {}) => new MeshLambertMaterial({ color: hex, flatShading: true, ...extra });
const HIP = 0.75;          // carried ends ride this far above the ground under them
const REST = 0.12;         // an end resting on the ground
const WIDTH = 0.9, THICK = 0.14;

export function createView(scene) {
  const root = new Group();
  root.name = 'plank-view';
  scene.add(root);
  const WOOD = 0xa9774c, WOOD_DARK = 0x7d5638, ACCENT = 0xf08a3c, ROCK = 0x8a847c, ROCK_DARK = 0x6f6a63;

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

  // ---- the board: unit-length along Z, positioned and stretched between two end points
  const board = new Group();
  const deck = new Mesh(new BoxGeometry(WIDTH, THICK, 1), mat(WOOD));
  deck.castShadow = deck.receiveShadow = true;
  const stripeMat = mat(WOOD_DARK);
  for (const sx of [-0.2, 0.2]) {
    const stripe = new Mesh(new BoxGeometry(0.06, THICK + 0.02, 1), stripeMat);
    stripe.position.x = sx;
    board.add(stripe);
  }
  const glow = new Color(ACCENT);
  const capMats = [0, 1].map(() => mat(ACCENT, { emissive: glow.clone().multiplyScalar(0.35) }));
  const CAP = 0.28;
  const caps = capMats.map((m) => {
    const c = new Mesh(new BoxGeometry(WIDTH + 0.06, THICK + 0.06, CAP), m);
    c.castShadow = true;
    board.add(c);
    return c;
  });
  board.add(deck);
  root.add(board);

  // Position the unit-length board between two points; caps are counter-scaled to stay CAP long.
  const a = new Vector3(), b = new Vector3();
  const place = (ax, ay, az, bx, by, bz, len) => {
    a.set(ax, ay, az); b.set(bx, by, bz);
    board.position.addVectors(a, b).multiplyScalar(0.5);
    board.lookAt(b);
    board.scale.set(1, 1, len);
    caps.forEach((c, i) => {
      c.scale.z = 1 / len;
      c.position.z = (i ? 0.5 : -0.5) + (i ? -0.5 : 0.5) * CAP / len;
    });
  };

  const sp = SITES.plank.span;
  const spanLen = Math.hypot(sp.bx - sp.ax, sp.bz - sp.az);
  const ay0 = heightAt(sp.ax, sp.az), by0 = heightAt(sp.bx, sp.bz, { plank: true });
  let pulse = 0;

  return {
    sync(s, ctx, dt = 0) {
      pulse += dt;
      if (s.placed) {
        const dx = (sp.bx - sp.ax) / spanLen, dz = (sp.bz - sp.az) / spanLen, ext = 0.2;
        place(sp.ax - dx * ext, ay0 + THICK / 2, sp.az - dz * ext, sp.bx + dx * ext, by0 + THICK / 2, sp.bz + dz * ext, spanLen + 2 * ext);
        for (const m of capMats) m.emissive.copy(glow).multiplyScalar(0.1);
        return;
      }
      // a carried end rides on its holder's (smoothed) position; a free one stays where S says
      const end = (hold, x, z) => {
        const p = hold !== null ? ctx.players[hold] : null;
        if (p && p.present) { x = p.x; z = p.z; }
        return [x, z, hold !== null];
      };
      const [ax, az, ha] = end(s.holdA, s.ax, s.az), [bx, bz, hb] = end(s.holdB, s.bx, s.bz);
      const ya = heightAt(ax, az) + (ha ? HIP : REST), yb = heightAt(bx, bz) + (hb ? HIP : REST);
      place(ax, ya, az, bx, yb, bz, Math.max(Math.hypot(bx - ax, bz - az, yb - ya), 0.5));
      const free = (h) => (h === null ? 0.35 + 0.25 * Math.sin(pulse * 3) : 0.15);
      capMats[0].emissive.copy(glow).multiplyScalar(free(s.holdA));
      capMats[1].emissive.copy(glow).multiplyScalar(free(s.holdB));
    },
  };
}

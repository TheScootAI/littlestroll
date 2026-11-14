// The Lift on screen: a timber frame with a pulley over the platform, the platform deck on
// four ropes, a crank on a post that turns while cranked, a post with a rolled rope ladder
// that unrolls down the ladder ramp once kicked. Never writes to S.
import {
  Group, Mesh, MeshLambertMaterial, BoxGeometry, CylinderGeometry, Color, Vector3,
} from 'three';
import { SITES, RAMPS, heightAt } from '../../world/layout.js';
import { clamp } from '../../core/math.js';

const mat = (hex, extra = {}) => new MeshLambertMaterial({ color: hex, flatShading: true, ...extra });
const WOOD = 0xa9774c, WOOD_DARK = 0x7d5638, ROPE = 0xd8c48f, ACCENT = 0xf08a3c;
const UP = new Vector3(0, 1, 0), dir = new Vector3();
const DECK_T = 0.3;
const FRAME_TOP = 5;          // frame height above the summit deck level

export function createView(scene) {
  const root = new Group();
  root.name = 'lift-view';
  scene.add(root);
  const { crank, platform: P, low, high, post } = SITES.lift;
  const glow = new Color(ACCENT);
  const accent = () => mat(ACCENT, { emissive: glow.clone().multiplyScalar(0.35) });
  const shadowed = (g) => g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  const box = (w, h, d, m, x, y, z, parent) => {
    const b = new Mesh(new BoxGeometry(w, h, d), m); b.position.set(x, y, z); parent.add(b); return b;
  };

  // ---- the frame: two uprights either side of the platform, a cross beam and a pulley
  const frameTop = high + FRAME_TOP;
  const woodM = mat(WOOD), darkM = mat(WOOD_DARK);
  for (const sx of [-1, 1]) {
    const x = P.x + sx * (P.hw + 0.6), base = low - 0.2;
    box(0.4, frameTop - base, 0.4, woodM, x, (base + frameTop) / 2, P.z, root);
    box(0.25, 0.25, 2.2, darkM, x, frameTop - 1.2, P.z - 0.6, root).rotation.x = 0.5;   // brace
  }
  box(2 * P.hw + 1.6, 0.4, 0.4, woodM, P.x, frameTop, P.z, root);
  const pulleyY = frameTop - 0.55;
  const pulley = new Mesh(new CylinderGeometry(0.4, 0.4, 0.25, 12), darkM);
  pulley.rotation.z = Math.PI / 2; pulley.position.set(P.x, pulleyY, P.z);
  root.add(pulley);
  shadowed(root);

  // ---- the platform: deck + four ropes from the pulley to the corners
  const deckG = new Group(); root.add(deckG);
  box(2 * P.hw, DECK_T, 2 * P.hd, mat(WOOD), 0, -DECK_T / 2, 0, deckG);
  for (const px of [-P.hw + 0.05, P.hw - 0.05]) box(0.1, DECK_T + 0.1, 2 * P.hd, darkM, px, -DECK_T / 2, 0, deckG);
  shadowed(deckG);
  const ropeM = mat(ROPE);
  const ropes = [[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([cx, cz]) => {
    const r = new Mesh(new CylinderGeometry(0.04, 0.04, 1, 5), ropeM);
    root.add(r);
    return { r, cx: cx * (P.hw - 0.25), cz: cz * (P.hd - 0.25) };
  });
  const ropeFrom = [P.x, pulleyY - 0.2, P.z];

  // ---- the crank: a drum on a post with a handle that swings round
  const crankG = new Group();
  const cy = heightAt(crank[0], crank[1]);
  crankG.position.set(crank[0], cy, crank[1]);
  box(0.3, 1.1, 0.3, woodM, 0, 0.55, 0, crankG);
  const wheel = new Group(); wheel.position.y = 1.1; crankG.add(wheel);
  const drum = new Mesh(new CylinderGeometry(0.22, 0.22, 0.7, 10), darkM);
  drum.rotation.z = Math.PI / 2; wheel.add(drum);
  const arm = new Mesh(new BoxGeometry(0.1, 0.8, 0.1), woodM); arm.position.set(0.4, 0.4, 0); wheel.add(arm);
  const handle = new Mesh(new CylinderGeometry(0.1, 0.1, 0.35, 8), accent());
  handle.rotation.z = Math.PI / 2; handle.position.set(0.5, 0.8, 0); wheel.add(handle);
  const handleM = handle.material;
  root.add(crankG); shadowed(crankG);

  // ---- the post with a rolled ladder, and the ladder lying on its ramp
  const postG = new Group();
  postG.position.set(post[0], heightAt(post[0], post[1]), post[1]);
  box(0.3, 1.3, 0.3, woodM, 0, 0.65, 0, postG);
  const rolled = new Mesh(new CylinderGeometry(0.2, 0.2, 0.7, 10), mat(ROPE));
  rolled.rotation.z = Math.PI / 2; rolled.position.set(0, 1.2, 0); postG.add(rolled);
  const postCap = new Mesh(new BoxGeometry(0.4, 0.15, 0.4), accent()); postCap.position.y = 1.38; postG.add(postCap);
  root.add(postG); shadowed(postG);
  const postM = postCap.material;

  const rp = RAMPS.find((r) => r.flag === 'ladder');
  const rlen = Math.hypot(rp.bx - rp.ax, rp.bz - rp.az);
  const dyn = { ladder: true };
  const pt = (s) => {                               // point on the ramp, s metres from the E end
    const t = s / rlen, x = rp.ax + (rp.bx - rp.ax) * t, z = rp.az + (rp.bz - rp.az) * t;
    return [x, heightAt(x, z, dyn), z];
  };
  const ladder = new Group(); root.add(ladder); ladder.visible = false;
  const RUNGS = 14, start = rp.pa, span = rlen - rp.pb - rp.pa + 0.4;
  const railMs = [-1, 1].map(() => mat(ROPE));
  const rails = [-1, 1].map((sd) => {
    const r = new Mesh(new BoxGeometry(0.07, 0.05, 1), railMs[0]); r.userData.sd = sd; ladder.add(r); return r;
  });
  const rungs = Array.from({ length: RUNGS }, (_, i) => {
    const r = new Mesh(new BoxGeometry(2 * rp.hw - 0.1, 0.06, 0.1), woodM);
    r.userData.s = start + (span * (i + 0.5)) / RUNGS; ladder.add(r); return r;
  });
  const a = pt(0), b = pt(rlen);
  const dx = b[0] - a[0], dz = b[2] - a[2];
  const perp = [-dz / rlen, dx / rlen];             // horizontal unit perpendicular to the ramp
  let unroll = 0, turn = 0, pulse = 0;
  const setLadder = (u) => {
    // u in 0..1: how much has unrolled, from the top (F) end downwards
    ladder.visible = u > 0.001;
    const sTop = rlen - rp.pb + 0.4, sBot = sTop - u * (sTop - start);
    for (const r of rails) {
      const p0 = pt(sBot), p1 = pt(sTop), o = r.userData.sd * (rp.hw - 0.12);
      r.position.set((p0[0] + p1[0]) / 2 + perp[0] * o, (p0[1] + p1[1]) / 2 + 0.05, (p0[2] + p1[2]) / 2 + perp[1] * o);
      r.scale.z = Math.hypot(p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]);
      r.lookAt(p1[0] + perp[0] * o, p1[1] + 0.05, p1[2] + perp[1] * o);
    }
    for (const r of rungs) {
      const s = r.userData.s;
      r.visible = s >= sBot;
      const p = pt(s), q = pt(s + 0.1);
      r.position.set(p[0], p[1] + 0.06, p[2]);
      r.lookAt(q[0], q[1] + 0.06, q[2]);
    }
    rolled.visible = u < 0.999;
    rolled.scale.setScalar(1 - 0.8 * u);
  };

  return {
    sync(s, ctx, dt = 0) {
      pulse += dt;
      const y = clamp(s.y, 0, 1), deckY = low + y * (high - low);
      deckG.position.set(P.x, deckY, P.z);
      for (const { r, cx, cz } of ropes) {
        const tx = P.x + cx, ty = deckY, tz = P.z + cz;
        const dxr = tx - ropeFrom[0], dyr = ty - ropeFrom[1], dzr = tz - ropeFrom[2];
        const len = Math.hypot(dxr, dyr, dzr);
        r.position.set(ropeFrom[0] + dxr / 2, ropeFrom[1] + dyr / 2, ropeFrom[2] + dzr / 2);
        r.scale.y = len;
        r.quaternion.setFromUnitVectors(UP, dir.set(dxr / len, dyr / len, dzr / len));
      }
      if (s.cranking) turn += dt * 5;
      wheel.rotation.x = turn;
      handleM.emissive.copy(glow).multiplyScalar(s.cranking ? 0.8 : 0.3 + 0.15 * Math.sin(pulse * 3));
      postM.emissive.copy(glow).multiplyScalar(s.ladder ? 0.1 : 0.3 + 0.2 * Math.sin(pulse * 3));
      const target = s.ladder ? 1 : 0;
      unroll += clamp(target - unroll, -dt * 1.2, dt * 1.2);
      setLadder(unroll);
    },
  };
}

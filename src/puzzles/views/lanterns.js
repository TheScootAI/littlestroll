// The Lanterns on screen: six lantern posts round the tor (a post, a small cage, a flame that
// shrinks with the time left, and an additive halo so a lit one reads from 60 m); a tally stone
// by the head of the steps, a low slab with a straight row of six niches in index order, niche i
// glowing while lantern i burns; and the great lamp on the tor: a stone bowl, dark until the
// lanterns are all alight, then a large steady flame (no point lights: emissive meshes and
// halos only), the brightest thing in the ending shot. Never writes to S.
import {
  Group, Mesh, MeshLambertMaterial, MeshBasicMaterial, CylinderGeometry, BoxGeometry, ConeGeometry, TorusGeometry,
  Sprite, SpriteMaterial, CanvasTexture, SRGBColorSpace, AdditiveBlending, DoubleSide, Color,
} from 'three';
import { SITES, heightAt } from '../../world/layout.js';
import { clamp, rng } from '../../core/math.js';
import { BURN, POSTS, LAMP_H, tallyYaw } from '../lanterns.js';

const mat = (hex, extra = {}) => new MeshLambertMaterial({ color: hex, flatShading: true, ...extra });
const STONE = 0xb9b0bf, STONE_DARK = 0x9d93a8, IRON = 0x4a4350, ACCENT = 0xf08a3c, NICHE_OFF = 0x2c2733;
const FLAME = 0xff8a2a, FLAME_MID = 0xffb23c, FLAME_CORE = 0xffe9a8, NICHE_ON = 0xffd070;
const POST_H = 2.3, CAGE = 0.5, LAMP_S = 2.1, MIN_K = 0.3;   // a flame is never smaller than this fraction while it burns

function glowTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.2, 'rgba(255,235,190,0.8)');
  grad.addColorStop(0.5, 'rgba(255,180,100,0.25)');
  grad.addColorStop(1, 'rgba(255,150,70,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  return t;
}

export function createView(scene) {
  const root = new Group();
  root.name = 'lanterns-view';
  scene.add(root);
  const tex = glowTexture();
  const sprite = (parent, hex, size, opacity) => {
    const s = new Sprite(new SpriteMaterial({ map: tex, color: hex, transparent: true, opacity, blending: AdditiveBlending, depthWrite: false, fog: false, toneMapped: false }));
    s.scale.setScalar(size);
    parent.add(s);
    return s;
  };
  const tongue = (parent, hex, r, h, opacity, x = 0, z = 0, solid = false) => {
    const geo = new ConeGeometry(r, h, 7, 1, true);
    geo.translate(0, h / 2, 0);
    const m = new Mesh(geo, new MeshBasicMaterial({ color: hex, transparent: !solid, opacity, depthWrite: solid, fog: false, toneMapped: false, side: DoubleSide }));
    m.position.set(x, 0, z);
    parent.add(m);
    return m;
  };
  const shadowed = (g) => g.traverse((o) => { if (o.isMesh && o.material.blending !== AdditiveBlending && o.material.transparent !== true) { o.castShadow = true; o.receiveShadow = true; } });
  const ironM = mat(IRON), stoneM = mat(STONE), darkM = mat(STONE_DARK);

  // ---- six lanterns
  const lamps = SITES.lanterns.posts.map(([x, z]) => {
    const g = new Group();
    g.position.set(x, heightAt(x, z), z);
    const post = new Mesh(new CylinderGeometry(0.1, 0.16, POST_H, 6), ironM);
    post.position.y = POST_H / 2;
    const foot = new Mesh(new CylinderGeometry(0.3, 0.3, 0.2, 7), darkM);
    foot.position.y = 0.1;
    const cage = new Group();
    cage.position.y = POST_H;
    const floor = new Mesh(new CylinderGeometry(0.3, 0.22, 0.1, 6), ironM);
    const roof = new Mesh(new ConeGeometry(0.36, 0.28, 6), ironM);
    roof.position.y = CAGE + 0.2;
    cage.add(floor, roof);
    for (let i = 0; i < 4; i++) {                              // four bars, an open cage
      const a = i * Math.PI / 2 + Math.PI / 4;
      const bar = new Mesh(new BoxGeometry(0.05, CAGE, 0.05), ironM);
      bar.position.set(Math.cos(a) * 0.27, CAGE / 2 + 0.05, Math.sin(a) * 0.27);
      cage.add(bar);
    }
    const flame = new Group();
    flame.position.y = 0.12;
    cage.add(flame);
    const outer = tongue(flame, FLAME, 0.2, 0.55, 0.9), core = tongue(flame, FLAME_CORE, 0.1, 0.38, 0.95);
    const halo = sprite(flame, FLAME, 6, 0.8);
    halo.position.y = 0.25;
    g.add(post, foot, cage);
    shadowed(g);
    root.add(g);
    return { flame, outer, core, halo };
  });

  // ---- the tally stone: faces the head of the steps; a straight row of six niches, index order
  const [tx, tz] = SITES.lanterns.tally, ty = heightAt(tx, tz);
    const tally = new Group();
  tally.position.set(tx, ty, tz);
  tally.rotation.y = tallyYaw() + Math.PI;                    // its local +z faces the head of the steps (checkpoint 10)
  const slab = new Mesh(new BoxGeometry(1.5, 0.95, 0.5), stoneM);
  slab.position.y = 0.475;
  const capS = new Mesh(new BoxGeometry(1.62, 0.12, 0.62), darkM);
  capS.position.y = 1.01;
  tally.add(slab, capS);
  const niches = Array.from({ length: POSTS }, (_, i) => {
    const m = new MeshBasicMaterial({ color: NICHE_OFF, fog: false, toneMapped: false });
    const n = new Mesh(new BoxGeometry(0.17, 0.3, 0.06), m);
    n.position.set((i - (POSTS - 1) / 2) * 0.24, 0.62, 0.25);
    tally.add(n);
    return m;
  });
  shadowed(tally);
  root.add(tally);
  const offCol = new Color(NICHE_OFF), onCol = new Color(NICHE_ON), tmp = new Color();

  // ---- the great lamp on the tor
  const [gx, gz] = SITES.lanterns.lamp, gy = heightAt(gx, gz);
  const bowl = new Group();
  bowl.position.set(gx, gy, gz);
  const part = (geo, m, py) => { const o = new Mesh(geo, m); o.position.y = py; bowl.add(o); return o; };
  part(new CylinderGeometry(0.9 * LAMP_S, 1.1 * LAMP_S, 0.3 * LAMP_S, 8), darkM, 0.15 * LAMP_S);
  part(new CylinderGeometry(0.45 * LAMP_S, 0.65 * LAMP_S, 0.95 * LAMP_S, 8), stoneM, 0.75 * LAMP_S);
  part(new CylinderGeometry(0.95 * LAMP_S, 0.5 * LAMP_S, 0.5 * LAMP_S, 10), darkM, 1.45 * LAMP_S);
  const rim = part(new TorusGeometry(0.95 * LAMP_S, 0.07 * LAMP_S, 6, 16), mat(ACCENT, { emissive: new Color(ACCENT).multiplyScalar(0.35) }), 1.7 * LAMP_S);
  rim.rotation.x = Math.PI / 2;
  const coalM = mat(0x3a312e, { emissive: new Color(0xff5a1c).multiplyScalar(0) });
  part(new CylinderGeometry(0.85 * LAMP_S, 0.85 * LAMP_S, 0.1 * LAMP_S, 10), coalM, 1.62 * LAMP_S);
  shadowed(bowl);
  root.add(bowl);
  const fire = new Group();
  fire.position.y = 1.7 * LAMP_S;
  fire.scale.setScalar(2.1);
  bowl.add(fire);
  const r = rng(1117), N = 9, tongues = [];
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2, d = i ? 0.5 + 0.35 * r() : 0;
    const h = i ? 2.8 + 2.2 * r() : 5.0;
    tongues.push({ t: tongue(fire, i % 2 ? FLAME : FLAME_MID, i ? 0.7 : 1.05, h, i ? 0.6 : 0.6, Math.cos(a) * d, Math.sin(a) * d), ph: r() * 6.28, sp: 2 + r() * 2, base: 0.6 });
  }
  // a solid, saturated orange core inside the softer outer flame, and a hot yellow heart
  const gCore = tongue(fire, 0xff6a0a, 0.8, 4.4, 1, 0, 0, true), gHeart = tongue(fire, 0xffb020, 0.42, 3.2, 1, 0, 0, true);
  const halo = sprite(fire, FLAME, 34, 0), halo2 = sprite(fire, 0xffc060, 11, 0);
  halo.position.y = 2.2; halo2.position.y = 1.6;
  const colGeo = new CylinderGeometry(0.5, 1.8, 90, 14, 1, true);
  colGeo.translate(0, 45, 0);
  const colM = new MeshBasicMaterial({ color: 0xffd890, transparent: true, opacity: 0, blending: AdditiveBlending, depthWrite: false, fog: false, toneMapped: false, side: DoubleSide });
  const column = new Mesh(colGeo, colM);
  fire.add(column);

  let clock = 0, lit = 0;
  return {
    sync(s, ctx, dt = 0) {
      clock += dt;
      // the lanterns and their niches
      for (let i = 0; i < POSTS; i++) {
        const t = s.t[i], on = t > 0, k = clamp(t / BURN, 0, 1), q = on ? MIN_K + (1 - MIN_K) * k : 0;
        const L = lamps[i], fl = 1 + 0.1 * Math.sin(clock * 13 + i * 2) + 0.06 * Math.sin(clock * 23 + i);
        L.outer.visible = L.core.visible = L.halo.visible = on;
        if (on) {
          L.outer.scale.set(q * fl, q * (1 + 0.12 * Math.sin(clock * 9 + i)), q * fl);
          L.core.scale.set(q * fl, q * (1 + 0.1 * Math.sin(clock * 11 + i)), q * fl);
          L.halo.scale.setScalar(2.5 + 4 * q);
          L.halo.material.opacity = 0.35 + 0.55 * q;
        }
        niches[i].color.copy(on ? tmp.copy(offCol).lerp(onCol, 0.55 + 0.45 * k) : offCol);
      }
      // the great lamp: dark until solved, then a large steady flame
      lit += ((s.solved ? 1 : 0) - lit) * (1 - Math.exp(-1.6 * dt));
      if (s.solved && lit > 0.995) lit = 1;
      const flick = 1 + 0.06 * Math.sin(clock * 11) + 0.04 * Math.sin(clock * 19.3);
      coalM.emissive.setRGB(1, 0.32, 0.08).multiplyScalar(s.solved ? 0.7 : 0);
      fire.children.forEach((o) => { if (o.isMesh && o !== column) o.visible = lit > 0.01; });
      for (const q of tongues) {
        const sw = Math.sin(clock * q.sp + q.ph);
        q.t.scale.set((1 + 0.12 * sw) * lit, lit * (0.9 + 0.2 * Math.sin(clock * q.sp * 1.3 + q.ph * 2)), (1 - 0.08 * sw) * lit);
        q.t.rotation.z = 0.1 * Math.sin(clock * 1.7 + q.ph);
        q.t.rotation.x = 0.1 * Math.cos(clock * 1.3 + q.ph);
        q.t.material.opacity = q.base * Math.min(1, lit * 1.5);
      }
      gCore.scale.set(lit * flick, lit * (0.92 + 0.16 * Math.sin(clock * 9)), lit * flick);
      gHeart.scale.set(lit * flick, lit * (0.9 + 0.2 * Math.sin(clock * 12 + 1)), lit * flick);
      halo.material.opacity = 0.9 * lit; halo.scale.setScalar(14 + 8 * lit);
      halo2.material.opacity = 1 * lit; halo2.scale.setScalar(6 + 2 * lit + 0.4 * Math.sin(clock * 6));
      column.visible = lit > 0.01;
      colM.opacity = 0.08 * lit * (0.9 + 0.1 * Math.sin(clock * 4));
    },
  };
}

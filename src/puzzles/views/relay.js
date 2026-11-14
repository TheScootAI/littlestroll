// The Relay on screen: a small stone brazier on the near shore with a steady little flame
// while the flame is home (dark coals while someone carries it); the carried flame, a bright
// tongue above the carrier's raised hand with its own light, and a ring on the ground round
// the carrier that shrinks to nothing as the six seconds run out (warm yellow, then red in the
// last two); and the great brazier on the summit, a big stone bowl that, once lit, roars into a
// tall flame, throws a strong warm light, a column of glow and a stream of embers: the payoff
// of the whole walk. Never writes to S.
import {
  Group, Mesh, MeshLambertMaterial, MeshBasicMaterial, CylinderGeometry, ConeGeometry, TorusGeometry,
  RingGeometry, CircleGeometry, Sprite, SpriteMaterial, CanvasTexture, SRGBColorSpace, AdditiveBlending,
  DoubleSide, Color, PointLight, BufferGeometry, BufferAttribute, Points, PointsMaterial, Vector3,
} from 'three';
import { SITES, heightAt } from '../../world/layout.js';
import { clamp, lerp, rng } from '../../core/math.js';
import { BURN } from '../relay.js';

const mat = (hex, extra = {}) => new MeshLambertMaterial({ color: hex, flatShading: true, ...extra });
const glowMat = (hex, opacity = 1) => new MeshBasicMaterial({
  color: hex, transparent: true, opacity, blending: AdditiveBlending, depthWrite: false, fog: false, toneMapped: false, side: DoubleSide,
});
const STONE = 0xb9b0bf, STONE_DARK = 0x9d93a8, ACCENT = 0xf08a3c, COAL = 0x3a312e;
const FLAME = 0xff8a2a, FLAME_MID = 0xffb23c, FLAME_CORE = 0xffe9a8, YELLOW = 0xffd24a, RED = 0xff4a30;
const RING_R = 1.5;                 // the carrier's ring at full burn
const HAND = new Vector3(0.46, 1.22, -0.1);   // above the raised right hand, in the avatar's local frame

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
  root.name = 'relay-view';
  scene.add(root);
  const tex = glowTexture();
  const sprite = (parent, hex, size, opacity = 1) => {
    const s = new Sprite(new SpriteMaterial({ map: tex, color: hex, transparent: true, opacity, blending: AdditiveBlending, depthWrite: false, fog: false, toneMapped: false }));
    s.scale.setScalar(size);
    parent.add(s);
    return s;
  };
  const shadowed = (g) => g.traverse((o) => { if (o.isMesh && o.material.blending !== AdditiveBlending) { o.castShadow = true; o.receiveShadow = true; } });
  const stoneM = mat(STONE), darkM = mat(STONE_DARK);

  // a tongue of flame: a cone with its base at y = 0
  const tongue = (parent, hex, r, h, opacity, x = 0, z = 0) => {
    const geo = new ConeGeometry(r, h, 7, 1, true);
    geo.translate(0, h / 2, 0);
    // ordinary blending, not additive: a glow added to the pale sky or sand would vanish
    const m = new Mesh(geo, new MeshBasicMaterial({ color: hex, transparent: true, opacity, depthWrite: false, fog: false, toneMapped: false, side: DoubleSide }));
    m.position.set(x, 0, z);
    parent.add(m);
    return m;
  };

  // a stone bowl on a plinth: `s` scales the whole thing
  const brazier = (x, z, s) => {
    const g = new Group();
    const y = heightAt(x, z);
    g.position.set(x, y, z);
    const part = (geo, m, py) => { const o = new Mesh(geo, m); o.position.y = py; g.add(o); return o; };
    part(new CylinderGeometry(0.9 * s, 1.1 * s, 0.3 * s, 8), darkM, 0.15 * s);
    part(new CylinderGeometry(0.45 * s, 0.65 * s, 0.95 * s, 8), stoneM, 0.75 * s);
    part(new CylinderGeometry(0.95 * s, 0.5 * s, 0.5 * s, 10), darkM, 1.45 * s);
    const rim = part(new TorusGeometry(0.95 * s, 0.07 * s, 6, 16), mat(ACCENT, { emissive: new Color(ACCENT).multiplyScalar(0.35) }), 1.7 * s);
    rim.rotation.x = Math.PI / 2;
    const coalM = mat(COAL, { emissive: new Color(0xff5a1c).multiplyScalar(0) });
    const coals = part(new CylinderGeometry(0.85 * s, 0.85 * s, 0.1 * s, 10), coalM, 1.62 * s);
    shadowed(g);
    root.add(g);
    return { g, coalM, top: 1.7 * s };
  };

  // ---- the small brazier: home of the flame
  const small = brazier(SITES.relay.small[0], SITES.relay.small[1], 1);
  const smallFlame = new Group();
  smallFlame.position.y = small.top;
  small.g.add(smallFlame);
  const sOuter = tongue(smallFlame, FLAME, 0.38, 1.0, 0.85), sCore = tongue(smallFlame, FLAME_CORE, 0.2, 0.7, 0.95);
  const sGlow = sprite(smallFlame, FLAME, 2.4, 0.6);
  sGlow.position.y = 0.5;
  const sLight = new PointLight(0xffb060, 0, 16, 1.6);
  sLight.position.y = 0.8;
  smallFlame.add(sLight);

  // ---- the carried flame (one flame in the world: whoever holds it) and its ring
  const carried = new Group();
  carried.visible = false;
  root.add(carried);
  const cOuter = tongue(carried, FLAME, 0.26, 0.85, 0.92), cCore = tongue(carried, FLAME_CORE, 0.14, 0.55, 0.97);
  const cGlow = sprite(carried, FLAME, 2.2, 0.75);
  cGlow.position.y = 0.3;
  const cLight = new PointLight(0xffb060, 0, 22, 1.5);
  cLight.position.y = 0.3;
  carried.add(cLight);
  const ringM = new MeshBasicMaterial({ color: YELLOW, transparent: true, opacity: 0.85, side: DoubleSide, depthWrite: false, fog: false, toneMapped: false });
  const ring = new Mesh(new RingGeometry(0.9, 1, 48), ringM);
  ring.rotation.x = -Math.PI / 2;
  ring.renderOrder = 5;
  const discM = new MeshBasicMaterial({ color: YELLOW, transparent: true, opacity: 0.14, side: DoubleSide, depthWrite: false, fog: false, toneMapped: false });
  const disc = new Mesh(new CircleGeometry(1, 48), discM);
  disc.rotation.x = -Math.PI / 2;
  disc.renderOrder = 4;
  ring.visible = disc.visible = false;
  root.add(ring, disc);

  // ---- the great brazier on the summit
  const [gx, gz] = SITES.relay.great;
  const great = brazier(gx, gz, 2.1);
  const gFire = new Group();
  gFire.position.y = great.top;
  gFire.scale.setScalar(1.45);
  great.g.add(gFire);
  const tongues = [];
  const r = rng(2024);
  const N = 9;
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2, d = i ? 0.5 + 0.35 * r() : 0;
    const h = i ? 2.8 + 2.2 * r() : 5.0;
    const t = tongue(gFire, i % 2 ? FLAME : FLAME_MID, i ? 0.7 : 1.05, h, i ? 0.8 : 0.85, Math.cos(a) * d, Math.sin(a) * d);
    tongues.push({ t, ph: r() * 6.28, sp: 2.2 + r() * 2, h, base: i ? 0.8 : 0.85 });
  }
  const gCore = tongue(gFire, FLAME_CORE, 0.45, 3.6, 0.95);
  const gHalo = sprite(gFire, FLAME, 20, 0);
  gHalo.position.y = 2.6;
  const gHalo2 = sprite(gFire, 0xffe2a0, 7, 0);
  gHalo2.position.y = 1.6;
  const gLight = new PointLight(0xffb060, 0, 110, 1.2);
  gLight.position.y = 3.2;
  gFire.add(gLight);
  const emberLight = new PointLight(0xff8a3c, 0, 30, 1.6);
  emberLight.position.y = 0.4;
  gFire.add(emberLight);
  // a column of warm glow straight up, like the beacon's
  const colGeo = new CylinderGeometry(0.5, 1.8, 90, 14, 1, true);
  colGeo.translate(0, 45, 0);
  const colM = glowMat(0xffd890, 0);
  const column = new Mesh(colGeo, colM);
  column.visible = false;
  gFire.add(column);
  // embers rising
  const EMBERS = 90;
  const ePos = new Float32Array(EMBERS * 3), eSeed = [];
  for (let i = 0; i < EMBERS; i++) eSeed.push({ ph: r(), x: (r() - 0.5) * 2, z: (r() - 0.5) * 2, sp: 0.18 + r() * 0.2, dr: (r() - 0.5) * 2 });
  const eGeo = new BufferGeometry();
  eGeo.setAttribute('position', new BufferAttribute(ePos, 3));
  const eMat = new PointsMaterial({ color: 0xffb860, size: 0.3, transparent: true, opacity: 0, blending: AdditiveBlending, depthWrite: false, fog: false, toneMapped: false, sizeAttenuation: true });
  const embers = new Points(eGeo, eMat);
  embers.frustumCulled = false;
  gFire.add(embers);

  let clock = 0, lit = 0, roarK = 0;
  const v = new Vector3();
  return {
    sync(s, ctx, dt = 0) {
      clock += dt;
      const flick = 1 + 0.08 * Math.sin(clock * 13) + 0.05 * Math.sin(clock * 21.7);

      // the small brazier: steady flame at home, dark coals while the flame is out
      const home = s.holder === null && !s.solved ? 1 : 0;
      smallFlame.visible = home > 0;
      small.coalM.emissive.setRGB(0.25, 0.05, 0).multiplyScalar(home ? 0.2 : 0);
      if (home) {
        sOuter.scale.set(flick, 1 + 0.12 * Math.sin(clock * 9), flick);
        sCore.scale.set(flick, 1 + 0.1 * Math.sin(clock * 11 + 1), flick);
        sLight.intensity = 5 * flick;
      }

      // the carried flame and its ring
      const h = s.holder, pv = h === null || s.solved ? null : ctx.players[h];
      const show = !!(pv && pv.present);
      carried.visible = show;
      ring.visible = disc.visible = show;
      if (!show) cLight.intensity = 0;
      else {
        const y = pv.yaw ?? 0, c = Math.cos(y), sn = Math.sin(y);
        carried.position.set(pv.x + HAND.x * c + HAND.z * sn, pv.y + HAND.y, pv.z - HAND.x * sn + HAND.z * c);
        const k = clamp(s.t / BURN, 0, 1);
        const low = s.t < 2;
        const fl = 1 + 0.18 * Math.sin(clock * 17) + 0.1 * Math.sin(clock * 29);
        const shrink = lerp(0.55, 1, Math.min(1, k * 2));      // the flame itself dwindles a little at the end
        cOuter.scale.set(fl * shrink, (1 + 0.2 * Math.sin(clock * 12)) * shrink, fl * shrink);
        cCore.scale.set(fl * shrink, (1 + 0.15 * Math.sin(clock * 15 + 1)) * shrink, fl * shrink);
        cLight.intensity = 9 * (0.5 + 0.5 * k) * (low ? 0.8 + 0.2 * Math.sin(clock * 30) : 1);
        // the ring: full radius at 6 s, nothing at 0; yellow, then red in the last two seconds
        const rr = Math.max(0.001, RING_R * k);
        ring.position.set(pv.x, pv.y + 0.09, pv.z); ring.scale.setScalar(rr);
        disc.position.set(pv.x, pv.y + 0.08, pv.z); disc.scale.setScalar(rr);
        const col = low ? new Color(YELLOW).lerp(new Color(RED), clamp(1 - s.t / 2, 0, 1)) : null;
        if (col) { ringM.color.copy(col); discM.color.copy(col); } else { ringM.color.setHex(YELLOW); discM.color.setHex(YELLOW); }
        ringM.opacity = low ? 0.7 + 0.3 * Math.sin(clock * 24) : 0.85;
      }

      // the great brazier: embers until lit, then it roars
      lit += ((s.solved ? 1 : 0) - lit) * (1 - Math.exp(-1.6 * dt));
      roarK = s.solved ? Math.min(1, roarK + dt / 2.2) : 0;     // the first rush of the flame
      const burst = s.solved ? 1 + 0.9 * Math.max(0, 1 - roarK) * Math.exp(-roarK * 1.5) : 0;
      const L = lit * (0.4 + 0.6 * roarK);
      great.coalM.emissive.setRGB(1, 0.32, 0.08).multiplyScalar(s.solved ? 0.7 : 0.04);
      gFire.children.forEach((o) => { if (o.isMesh && o !== column) o.visible = L > 0.01; });
          for (const q of tongues) {
        const sw = Math.sin(clock * q.sp + q.ph);
        q.t.scale.set((1 + 0.15 * sw) * L, L * (0.85 + 0.25 * Math.sin(clock * q.sp * 1.3 + q.ph * 2)) * burst, (1 - 0.1 * sw) * L);
        q.t.rotation.z = 0.12 * Math.sin(clock * 1.7 + q.ph);
        q.t.rotation.x = 0.12 * Math.cos(clock * 1.3 + q.ph);
        q.t.material.opacity = q.base * Math.min(1, L * 1.5);
      }
      gCore.scale.set(L * flick, L * (0.9 + 0.2 * Math.sin(clock * 9)) * burst, L * flick);
      gHalo.material.opacity = 0.55 * L; gHalo.scale.setScalar(16 + 10 * lit + 8 * (burst - 1));
      gHalo2.material.opacity = 0.9 * L; gHalo2.scale.setScalar(6 + 2 * Math.sin(clock * 6));
      gLight.intensity = (6 + 62 * L) * flick * (s.solved ? 1 : 0);
      emberLight.intensity = s.solved ? 10 * L : 0.6 * (0.6 + 0.4 * Math.sin(clock * 3)) ;
      column.visible = L > 0.01;
      colM.opacity = 0.07 * L * (0.9 + 0.1 * Math.sin(clock * 4));
      // embers: a few drift from the coals before the lighting, a stream after
      const active = s.solved ? EMBERS : 6;
      eMat.opacity = s.solved ? 0.9 * Math.min(1, lit * 2) : 0.4;
      for (let i = 0; i < EMBERS; i++) {
        const e = eSeed[i];
        const t = (clock * e.sp + e.ph) % 1;
        const hgt = (s.solved ? 1 : 0.35) * 9 * t;
        v.set(e.x * (0.6 + t * 1.8) + e.dr * t, 0.3 + hgt, e.z * (0.6 + t * 1.8) + Math.sin(clock + i) * 0.3 * t);
        if (i >= active) v.set(0, -50, 0);
        ePos[i * 3] = v.x; ePos[i * 3 + 1] = v.y; ePos[i * 3 + 2] = v.z;
      }
      eGeo.attributes.position.needsUpdate = true;
    },
  };
}

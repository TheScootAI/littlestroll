// The Beam on screen: the lamp on its post, the rock outcrop, two mirror stands, the two
// mirrors (on a stand, on the ground, or in a walker's hands facing where they look), the
// beacon tower with its glass lens, and the beam itself drawn from S.beam.segs as bright
// additive tubes. The beacon glows with the charge and blazes once lit. Never writes to S.
import {
  Group, Mesh, MeshLambertMaterial, MeshBasicMaterial, CylinderGeometry, BoxGeometry,
  SphereGeometry, ConeGeometry, TorusGeometry, IcosahedronGeometry, Sprite, SpriteMaterial,
  CanvasTexture, SRGBColorSpace, AdditiveBlending, DoubleSide, Color, Vector3, PointLight,
} from 'three';
import { SITES, heightAt } from '../../world/layout.js';
import { clamp, lerp } from '../../core/math.js';
import { CHARGE, CHEST } from '../beam.js';

const mat = (hex, extra = {}) => new MeshLambertMaterial({ color: hex, flatShading: true, ...extra });
const glowMat = (hex, opacity = 1) => new MeshBasicMaterial({
  color: hex, transparent: true, opacity, blending: AdditiveBlending, depthWrite: false, fog: false, toneMapped: false,
});
const WOOD = 0xa9774c, WOOD_DARK = 0x7d5638, ACCENT = 0xf08a3c, BRASS = 0xd9a441;
const ROCK = 0x9d93a8, ROCK_DARK = 0x857b91, TOWER = 0xc9bfae, TOWER_DARK = 0xa69b8a;
const LIGHT = 0xffe2a0, CORE = 0xfff6dc, GLASS = 0xbfe6f0;
const UP = new Vector3(0, 1, 0);
const v1 = new Vector3(), v2 = new Vector3();
const MIRROR_R = 0.36;
const SEG_MAX = 3;

// A soft round glow drawn once into a canvas (no asset files).
function glowTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.18, 'rgba(255,240,200,0.85)');
  grad.addColorStop(0.45, 'rgba(255,200,120,0.28)');
  grad.addColorStop(1, 'rgba(255,180,90,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  return t;
}

export function createView(scene) {
  const root = new Group();
  root.name = 'beam-view';
  scene.add(root);
  const { lamp, lens, rocks, mirrors: stands } = SITES.beam;
  const ground = (x, z, dyn) => heightAt(x, z, dyn);
  const shadowed = (g) => g.traverse((o) => { if (o.isMesh && o.material.blending !== AdditiveBlending) { o.castShadow = true; o.receiveShadow = true; } });
  const tex = glowTexture();
  const sprite = (hex, size, opacity = 1) => {
    const s = new Sprite(new SpriteMaterial({
      map: tex, color: hex, transparent: true, opacity, blending: AdditiveBlending, depthWrite: false, fog: false, toneMapped: false,
    }));
    s.scale.setScalar(size);
    root.add(s);
    return s;
  };
  let clock = 0;

  // ---- the rock outcrop: tall faceted pillars, drawn just outside the occlusion cylinder
  const rockMs = [mat(ROCK), mat(ROCK_DARK)];
  const SIDES = 8, out = 1 / Math.cos(Math.PI / SIDES);   // flat faces sit on the circle
  rocks.forEach((k, i) => {
    const base = ground(k.x, k.z) - 1, h = k.h - base;
    const g = new CylinderGeometry(k.r * out * 0.98, k.r * out * 1.12, h, SIDES, 3);
    const pos = g.attributes.position;
    for (let j = 0; j < pos.count; j++) {         // rough it up a little, outward only
      const x = pos.getX(j), z = pos.getZ(j), y = pos.getY(j);
      const n = 1 + 0.06 * Math.abs(Math.sin(j * 12.9898 + i * 78.233) * 43758.5453 % 1);
      pos.setXYZ(j, x * n, y + (y > h / 2 - 0.01 ? 0.5 * Math.sin(j * 3.1 + i) : 0), z * n);
    }
    g.computeVertexNormals();
    const m = new Mesh(g, rockMs[i % 2]);
    m.position.set(k.x, base + h / 2, k.z);
    m.rotation.y = i * 0.7;
    root.add(m);
    for (let b = 0; b < 3; b++) {                 // a few boulders round the foot
      const a = i * 2.1 + b * 2.3, rr = 0.4 + 0.25 * ((i + b) % 3);
      const boulder = new Mesh(new IcosahedronGeometry(rr, 0), rockMs[(i + b + 1) % 2]);
      const bx = k.x + Math.cos(a) * (k.r + rr * 0.6), bz = k.z + Math.sin(a) * (k.r + rr * 0.6);
      boulder.position.set(bx, ground(bx, bz) + rr * 0.4, bz);
      boulder.rotation.set(a, b, i);
      root.add(boulder);
    }
  });

  // ---- the lamp: a stone post with a brass lantern pointing along the ray
  const lampG = new Group();
  const lampGround = ground(lamp.o[0], lamp.o[2]);
  const post = new Mesh(new CylinderGeometry(0.28, 0.4, lamp.o[1] - lampGround, 7), mat(TOWER_DARK));
  post.position.set(lamp.o[0], (lamp.o[1] + lampGround) / 2 - 0.2, lamp.o[2]);
  lampG.add(post);
  const head = new Group();
  head.position.fromArray(lamp.o);
  head.lookAt(v1.fromArray(lamp.o).add(v2.fromArray(lamp.d)));   // +Z along the ray
  const hood = new Mesh(new CylinderGeometry(0.42, 0.3, 0.9, 10, 1, true), mat(BRASS, { side: DoubleSide, emissive: new Color(BRASS).multiplyScalar(0.2) }));
  hood.rotation.x = Math.PI / 2; hood.position.z = -0.1;
  head.add(hood);
  const backCap = new Mesh(new SphereGeometry(0.3, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), mat(BRASS));
  backCap.rotation.x = -Math.PI / 2; backCap.position.z = -0.55;
  head.add(backCap);
  const bulb = new Mesh(new SphereGeometry(0.3, 12, 8), new MeshBasicMaterial({ color: CORE, toneMapped: false }));
  bulb.position.z = 0.25; bulb.scale.z = 0.4;
  head.add(bulb);
  lampG.add(head);
  root.add(lampG);
  shadowed(lampG);
  const lampGlow = sprite(LIGHT, 2.6, 0.9);
  lampGlow.position.fromArray(lamp.o).addScaledVector(v2.fromArray(lamp.d), 0.35);

  // ---- mirror stands where the mirrors start
  const woodM = mat(WOOD), darkM = mat(WOOD_DARK);
  const STAND_Y = 1.15;
  for (const [x, z] of stands) {
    const g = new Group();
    g.position.set(x, ground(x, z), z);
    const leg = new Mesh(new CylinderGeometry(0.07, 0.1, STAND_Y - 0.25, 6), woodM);
    leg.position.y = (STAND_Y - 0.25) / 2; g.add(leg);
    const foot = new Mesh(new CylinderGeometry(0.35, 0.42, 0.12, 8), darkM);
    foot.position.y = 0.06; g.add(foot);
    const fork = new Mesh(new TorusGeometry(0.3, 0.05, 5, 10, Math.PI), darkM);
    fork.rotation.z = Math.PI; fork.position.y = STAND_Y - 0.05; g.add(fork);
    root.add(g); shadowed(g);
  }

  // ---- the mirrors: brass rim, bright face, wooden back; the face (+Z) points along aim
  const mirrors = [0, 1].map(() => {
    const g = new Group();
    const rimM = mat(ACCENT, { emissive: new Color(ACCENT).multiplyScalar(0.35) });
    const rim = new Mesh(new TorusGeometry(MIRROR_R, 0.06, 6, 16), rimM);
    g.add(rim);
    const faceM = new MeshLambertMaterial({ color: GLASS, emissive: new Color(GLASS).multiplyScalar(0.35), flatShading: true });
    const face = new Mesh(new CylinderGeometry(MIRROR_R, MIRROR_R, 0.04, 16), faceM);
    face.rotation.x = Math.PI / 2; face.position.z = 0.01; g.add(face);
    const back = new Mesh(new CylinderGeometry(MIRROR_R * 0.95, MIRROR_R * 0.95, 0.05, 16), darkM);
    back.rotation.x = Math.PI / 2; back.position.z = -0.04; g.add(back);
    const grip = new Mesh(new BoxGeometry(0.08, 0.3, 0.06), woodM);
    grip.position.set(0, -MIRROR_R - 0.12, -0.03); g.add(grip);
    root.add(g); shadowed(g);
    const glint = sprite(LIGHT, 1.4, 0);
    return { g, rimM, faceM, glint, lit: 0 };
  });

  // ---- the beacon: a tapered stone tower, a brazier crown and the glass lens
  const beacon = new Group();
  const [bx, bz] = SITES.beacon;
  const bGround = ground(bx, bz);
  const towerTop = lens[1] - 1.05;
  const towerH = towerTop - (bGround - 0.5);
  const towerM = mat(TOWER), bandM = mat(TOWER_DARK, { emissive: new Color(0) });
  const tower = new Mesh(new CylinderGeometry(0.95, 1.25, towerH, 9, 4), towerM);
  tower.position.set(bx, bGround - 0.5 + towerH / 2, bz);
  beacon.add(tower);
  const bands = [0.25, 0.55, 0.85].map((f) => {
    const r = lerp(1.25, 0.95, f) + 0.06;
    const band = new Mesh(new CylinderGeometry(r, r, 0.22, 9), bandM);
    band.position.set(bx, bGround - 0.5 + towerH * f, bz);
    beacon.add(band);
    return band;
  });
  const crown = new Mesh(new CylinderGeometry(1.25, 0.9, 0.5, 9, 1, true), mat(TOWER_DARK, { side: DoubleSide }));
  crown.position.set(bx, towerTop + 0.2, bz);
  beacon.add(crown);
  for (let i = 0; i < 4; i++) {                    // four little pillars holding the lens up
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    const p = new Mesh(new BoxGeometry(0.16, 1.3, 0.16), mat(TOWER_DARK));
    p.position.set(bx + Math.cos(a) * 1.0, towerTop + 0.65, bz + Math.sin(a) * 1.0);
    beacon.add(p);
  }
  const cap = new Mesh(new ConeGeometry(1.35, 0.8, 9), mat(TOWER_DARK));
  cap.position.set(bx, lens[1] + 1.25, bz);
  beacon.add(cap);
  // a tall spire so the beacon tops the rock outcrop
  const spireTop = Math.max(...rocks.map((k) => k.h)) + 2.5;
  const spire = new Mesh(new ConeGeometry(0.45, spireTop - (lens[1] + 1.6), 7), mat(TOWER));
  spire.position.set(bx, (spireTop + lens[1] + 1.6) / 2, bz);
  beacon.add(spire);
  const finial = new Mesh(new IcosahedronGeometry(0.3, 0), mat(BRASS, { emissive: new Color(BRASS).multiplyScalar(0.3) }));
  finial.position.set(bx, spireTop + 0.1, bz);
  beacon.add(finial);
  root.add(beacon);
  shadowed(beacon);
  const lensGlass = new Mesh(new SphereGeometry(0.75, 16, 12), new MeshLambertMaterial({
    color: GLASS, transparent: true, opacity: 0.55, emissive: new Color(GLASS).multiplyScalar(0.25),
  }));
  lensGlass.position.fromArray(lens);
  root.add(lensGlass);
  const coreM = new MeshBasicMaterial({ color: new Color(0x6c6250), toneMapped: false });
  const lensCore = new Mesh(new IcosahedronGeometry(0.42, 1), coreM);
  lensCore.position.fromArray(lens);
  root.add(lensCore);
  const halo = sprite(LIGHT, 1, 0);
  halo.position.fromArray(lens);
  const bigHalo = sprite(0xffc070, 1, 0);
  bigHalo.position.fromArray(lens);
  const light = new PointLight(0xffd08a, 0, 60, 1.4);
  light.position.fromArray(lens);
  root.add(light);
  // the sweep: two long soft cones turning slowly, like a lighthouse
  const sweep = new Group();
  sweep.position.fromArray(lens);
  const sweepGeo = new ConeGeometry(2.4, 55, 20, 1, true);
  sweepGeo.translate(0, -27.5, 0);                     // apex at the lens
  const sweepM = glowMat(0xffd690, 0);
  sweepM.side = DoubleSide;
  for (const s of [-1, 1]) {
    const c = new Mesh(sweepGeo, sweepM);
    c.rotation.z = s * Math.PI / 2 * 1.03;           // nearly level, a touch upward
    sweep.add(c);
  }
  sweep.visible = false;
  root.add(sweep);
  // a column of light straight up once lit
  const columnGeo = new CylinderGeometry(0.35, 1.1, 80, 14, 1, true);
  columnGeo.translate(0, 40, 0);
  const columnM = glowMat(0xffe0a0, 0);
  const column = new Mesh(columnGeo, columnM);
  column.position.set(lens[0], lens[1] + 0.5, lens[2]);
  column.visible = false;
  root.add(column);

  // ---- the beam: up to three legs, each a hot core inside a soft sheath
  const tubeCore = new CylinderGeometry(0.075, 0.075, 1, 8, 1, true);
  const tubeSheath = new CylinderGeometry(0.24, 0.24, 1, 10, 1, true);
  const legs = Array.from({ length: SEG_MAX }, () => {
    const g = new Group();
    const core = new Mesh(tubeCore, glowMat(CORE, 1));
    const sheath = new Mesh(tubeSheath, glowMat(LIGHT, 0.32));
    g.add(core, sheath);
    g.visible = false;
    root.add(g);
    return { g, sheath, end: sprite(LIGHT, 1.3, 0.85) };
  });
  const landing = sprite(LIGHT, 2.2, 0.9);

  const setLeg = (leg, a, b) => {
    v1.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    const len = v1.length();
    if (len < 1e-3) { leg.g.visible = false; leg.end.visible = false; return; }
    leg.g.visible = true;
    leg.g.position.set((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2);
    leg.g.scale.set(1, len, 1);
    leg.g.quaternion.setFromUnitVectors(UP, v1.divideScalar(len));
  };

  // Where a free leg first dips under the ground (view only: the rules ignore terrain).
  const clipToGround = (a, b, dyn) => {
    const len = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    const n = Math.ceil(len / 0.4);
    for (let i = 1; i <= n; i++) {
      const t = i / n, x = lerp(a[0], b[0], t), y = lerp(a[1], b[1], t), z = lerp(a[2], b[2], t);
      if (y < ground(x, z, dyn)) {
        const tp = (i - 1) / n;
        return [lerp(a[0], b[0], tp), lerp(a[1], b[1], tp), lerp(a[2], b[2], tp)];
      }
    }
    return b;
  };

  let glowAmt = 0, blaze = 0, sweepA = 0;

  return {
    sync(s, ctx, dt = 0) {
      clock += dt;
      const flick = 1 + 0.08 * Math.sin(clock * 23) + 0.05 * Math.sin(clock * 37);

      // the beam legs
      const segs = s.segs || [];
      for (let i = 0; i < SEG_MAX; i++) {
        const leg = legs[i], g = segs[i];
        if (!g) { leg.g.visible = false; leg.end.visible = false; continue; }
        const a = g.slice(0, 3);
        let b = g.slice(3);
        const last = i === segs.length - 1;
        if (last && !s.onLens) b = clipToGround(a, b, ctx.dyn);
        setLeg(leg, a, b);
        leg.sheath.scale.set(flick, 1, flick);
        leg.end.visible = !last;                     // a flare at every bounce
        leg.end.position.set(b[0], b[1], b[2]);
        leg.end.scale.setScalar(1.3 * flick);
        if (last) {
          landing.visible = true;
          landing.position.set(b[0], b[1], b[2]);
          landing.scale.setScalar((s.onLens ? 3.2 : 2.0) * flick);
        }
      }
      if (!segs.length) landing.visible = false;
      lampGlow.scale.setScalar(2.6 * flick);

      // mirrors: in hands, on a stand, or lying where they were set down
      s.mirrors.forEach((m, i) => {
        const mv = mirrors[i], g = mv.g;
        let lit = false;
        if (m.by !== null) {
          const p = ctx.players[m.by];
          if (!p?.present || !p.aim) { g.visible = false; mv.glint.visible = false; return; }
          g.visible = true;
          const cy = p.y + (p.lift || 0) + CHEST;   // it hops with its carrier
          g.position.set(p.x + p.aim[0] * 0.5, cy + p.aim[1] * 0.5, p.z + p.aim[2] * 0.5);
          g.lookAt(v1.copy(g.position).add(v2.fromArray(p.aim)));
          // lit when some leg (other than the last) ends at this carrier's chest
          for (let k = 0; k < segs.length - 1; k++) {
            const e = segs[k];
            if (Math.hypot(e[3] - p.x, e[4] - cy, e[5] - p.z) < 1.2) lit = true;
          }
        } else {
          g.visible = true;
          const onStand = stands.some(([x, z]) => Math.hypot(m.x - x, m.z - z) < 0.3);
          const gy = ground(m.x, m.z, ctx.dyn);
          g.position.set(m.x, gy + (onStand ? STAND_Y + MIRROR_R * 0.6 : MIRROR_R + 0.18), m.z);
          g.rotation.set(onStand ? 0 : -0.35, i ? 0.6 : -0.6, 0);
        }
        mv.lit += ((lit ? 1 : 0) - mv.lit) * (1 - Math.exp(-10 * dt));
        const pulse = m.by === null ? 0.3 + 0.2 * Math.sin(clock * 3 + i) : 0.35;
        mv.rimM.emissive.setHex(ACCENT).multiplyScalar(pulse + mv.lit * 0.6);
        mv.faceM.emissive.setHex(GLASS).multiplyScalar(0.35 + mv.lit * 0.9);
        mv.glint.visible = mv.lit > 0.02;
        mv.glint.position.copy(g.position);
        mv.glint.material.opacity = mv.lit;
        mv.glint.scale.setScalar(1.6 * flick);
      });

      // the beacon: glows with the charge, blazes once lit
      const want = s.solved ? 1 : clamp(s.charge / CHARGE, 0, 1);
      glowAmt += (want - glowAmt) * (1 - Math.exp(-8 * dt));
      blaze += ((s.solved ? 1 : 0) - blaze) * (1 - Math.exp(-1.5 * dt));
      const breathe = 1 + 0.06 * Math.sin(clock * 2.2);
      coreM.color.setRGB(lerp(0.42, 1.6, glowAmt) + blaze * 1.2, lerp(0.38, 1.35, glowAmt) + blaze, lerp(0.31, 0.85, glowAmt) + blaze * 0.5);
      lensGlass.material.emissive.setHex(GLASS).multiplyScalar(0.25 + glowAmt * 0.6 + blaze);
      halo.material.opacity = Math.min(1, glowAmt * 1.2);
      halo.scale.setScalar((2 + glowAmt * 4 + blaze * 4) * (s.charge > 0 && !s.solved ? flick : breathe));
      bigHalo.material.opacity = blaze * 0.85;
      bigHalo.scale.setScalar((6 + blaze * 16) * breathe);
      light.intensity = glowAmt * 25 + blaze * 110;
      bandM.emissive.setRGB(0.9, 0.55, 0.2).multiplyScalar(blaze * 0.7 + glowAmt * 0.1);
      sweep.visible = blaze > 0.01;
      sweepM.opacity = 0.13 * blaze;
      sweepA += dt * 0.45;
      sweep.rotation.y = sweepA;
      column.visible = blaze > 0.01;
      columnM.opacity = 0.18 * blaze * breathe;
    },
  };
}

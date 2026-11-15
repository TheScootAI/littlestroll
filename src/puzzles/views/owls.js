// The owls on screen: small stone owls (about 0.6 m) sitting at SITES.owls, rock-coloured
// so they are easy to walk past: a round body, two big eyes, ear tufts and a beak. Each faces the
// nearest point of the trail. A found owl's eyes glow warm, for good. slice = the found mask.
import { Group, Mesh, MeshLambertMaterial, MeshBasicMaterial, IcosahedronGeometry, SphereGeometry, ConeGeometry } from 'three';
import { SITES, TRAIL, heightAt } from '../../world/layout.js';

const ROCK = 0x8a8478, ROCK_DARK = 0x6f6a60, EYE_OFF = 0xd9d4c4, EYE_ON = 0xffb347, BEAK = 0x4a4033;

function nearestTrail(x, z) {
  let best = null, bd = Infinity;
  for (let i = 0; i + 1 < TRAIL.length; i++) {
    const [ax, az] = TRAIL[i], [bx, bz] = TRAIL[i + 1];
    const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz;
    const t = l2 > 0 ? Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l2)) : 0;
    const px = ax + dx * t, pz = az + dz * t, d = Math.hypot(px - x, pz - z);
    if (d < bd) { bd = d; best = [px, pz]; }
  }
  return best;
}

export function createView(scene) {
  const root = new Group();
  root.name = 'owls-view';
  scene.add(root);
  const bodyM = new MeshLambertMaterial({ color: ROCK, flatShading: true });
  const darkM = new MeshLambertMaterial({ color: ROCK_DARK, flatShading: true });
  const beakM = new MeshLambertMaterial({ color: BEAK, flatShading: true });
  const bodyG = new IcosahedronGeometry(0.26, 1);
  const eyeG = new SphereGeometry(0.075, 8, 6);
  const tuftG = new ConeGeometry(0.06, 0.16, 5);
  const beakG = new ConeGeometry(0.05, 0.11, 5);

  const owls = SITES.owls.map(([x, z], i) => {
    const g = new Group();
    g.position.set(x, heightAt(x, z), z);
    const to = nearestTrail(x, z);
    g.rotation.y = to ? Math.atan2(to[0] - x, to[1] - z) : 0;   // local +z is the front
    const body = new Mesh(bodyG, bodyM);
    body.position.y = 0.28;
    body.scale.set(1, 1.1, 0.95);
    const eyeM = new MeshBasicMaterial({ color: EYE_OFF, toneMapped: false });
    const eyes = [-1, 1].map((s) => {
      const e = new Mesh(eyeG, eyeM);
      e.position.set(s * 0.1, 0.4, 0.2);
      return e;
    });
    const tufts = [-1, 1].map((s) => {
      const t = new Mesh(tuftG, darkM);
      t.position.set(s * 0.14, 0.62, 0.02);
      t.rotation.z = -s * 0.25;
      return t;
    });
    const beak = new Mesh(beakG, beakM);
    beak.position.set(0, 0.33, 0.25);
    beak.rotation.x = Math.PI / 2;
    g.add(body, ...eyes, ...tufts, beak);
    g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    root.add(g);
    return { eyeM, on: false };
  });

  return {
    sync(mask) {
      const m = Number.isInteger(mask) ? mask : 0;
      owls.forEach((o, i) => {
        const on = !!(m & (1 << i));
        if (on !== o.on) { o.on = on; o.eyeM.color.setHex(on ? EYE_ON : EYE_OFF); }
      });
    },
  };
}

// The Bells on screen: two bronze bells hung in timber frames on the two outcrops of the
// landing, each swinging for about 1.5 s after it is rung (driven by the seconds-since-rung
// timers in S, so both browsers see the same swing), and the stone steps that rise from the
// landing toward the next island as `steps` goes 0 -> 1. Never writes to S.
import {
  Group, Mesh, MeshLambertMaterial, BoxGeometry, CylinderGeometry, LatheGeometry, SphereGeometry, Color, Vector2,
} from 'three';
import { SITES, RAMPS, heightAt } from '../../world/layout.js';
import { clamp } from '../../core/math.js';

const mat = (hex, extra = {}) => new MeshLambertMaterial({ color: hex, flatShading: true, ...extra });
const WOOD = 0xa9774c, WOOD_DARK = 0x7d5638, BRONZE = 0xb5874a, ACCENT = 0xf08a3c, STONE = 0xb9b0bf, STONE_DARK = 0x9d93a8;
const SWING_SECS = 1.5;
const FRAME_H = 3.4;          // frame height above the ground
const SEA_FLOOR = -4;
const smooth = (t) => t * t * (3 - 2 * t);

// A bell's outline (radius, height) from the crown down to the lip.
const BELL = [[0.0, 0.0], [0.18, 0.02], [0.3, 0.16], [0.4, 0.45], [0.55, 0.85], [0.72, 1.2], [0.78, 1.3]];

export function createView(scene) {
  const root = new Group();
  root.name = 'bells-view';
  scene.add(root);
  const glow = new Color(ACCENT);
  const woodM = mat(WOOD), darkM = mat(WOOD_DARK);
  const shadowed = (g) => g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  const box = (w, h, d, m, x, y, z, parent) => {
    const b = new Mesh(new BoxGeometry(w, h, d), m); b.position.set(x, y, z); parent.add(b); return b;
  };

  // one bell in its frame: swinging in the x-y plane, about a beam running along z
  const makeBell = ([x, z]) => {
    const g = new Group();
    g.position.set(x, heightAt(x, z), z);
    for (const sz of [-1.1, 1.1]) {
      box(0.3, FRAME_H, 0.3, woodM, 0, FRAME_H / 2, sz, g);
      for (const sx of [-1, 1]) {
        const brace = box(0.18, 1.6, 0.18, darkM, sx * 0.55, 0.7, sz, g);
        brace.rotation.z = -sx * 0.6;
      }
    }
    box(0.3, 0.3, 2.9, woodM, 0, FRAME_H, 0, g);
    const swing = new Group();
    swing.position.y = FRAME_H - 0.15;
    g.add(swing);
    const bronze = mat(BRONZE, { emissive: glow.clone().multiplyScalar(0.08) });
    const body = new Mesh(new LatheGeometry(BELL.map(([r, h]) => new Vector2(r, -h)), 10), bronze);
    body.position.y = -0.15;
    swing.add(body);
    box(0.08, 0.15, 0.08, darkM, 0, -0.07, 0, swing);
    const clapper = new Mesh(new SphereGeometry(0.14, 8, 6), darkM);
    clapper.position.y = -1.35;
    swing.add(clapper);
    // a short rope with an accent grip, so it reads as something to use
    const rope = new Mesh(new CylinderGeometry(0.03, 0.03, 0.7, 5), mat(0xd8c48f));
    rope.position.y = -1.75;
    swing.add(rope);
    const grip = new Mesh(new SphereGeometry(0.1, 8, 6), mat(ACCENT, { emissive: glow.clone().multiplyScalar(0.4) }));
    grip.position.y = -2.15;
    swing.add(grip);
    shadowed(g);
    root.add(g);
    return { swing, bronze, gripM: grip.material };
  };
  const bells = [makeBell(SITES.bells.a), makeBell(SITES.bells.b)];

  // ---- the steps: thin treads along the bells ramp, each rising from the sea in turn
  const rp = RAMPS.find((r) => r.flag === 'bells');
  const len = Math.hypot(rp.bx - rp.ax, rp.bz - rp.az), ux = (rp.bx - rp.ax) / len, uz = (rp.bz - rp.az) / len;
  const dyn = { bells: true };
  const N = 14, run = len / N;
  const treads = [];
  for (let i = 0; i < N; i++) {
    const sm = (i + 0.5) * run, x = rp.ax + ux * sm, z = rp.az + uz * sm;
    const top = heightAt(x, z, dyn);
    const g = new Group();
    g.position.set(x, 0, z);
    g.rotation.y = Math.atan2(-uz, ux);
    const hgt = top - SEA_FLOOR;
    const m = new Mesh(new BoxGeometry(run + 0.02, hgt, 2 * rp.hw), mat(i % 2 ? STONE : STONE_DARK));
    m.position.y = SEA_FLOOR + hgt / 2;
    g.add(m);
    shadowed(g);
    root.add(g);
    treads.push({ g, drop: hgt + 0.8, delay: (i / (N - 1)) * 0.45 });
  }

  let pulse = 0;
  return {
    sync(s, ctx, dt = 0) {
      pulse += dt;
      [s.a, s.b].forEach((since, i) => {
        const b = bells[i];
        const t = clamp(since, 0, SWING_SECS) / SWING_SECS;
        const amp = since >= SWING_SECS ? 0 : 0.55 * (1 - t) * (1 - t);
        b.swing.rotation.z = amp * Math.sin(since * 11);
        const fresh = since >= SWING_SECS ? 0 : 1 - t;
        b.bronze.emissive.copy(glow).multiplyScalar(0.08 + 0.5 * fresh);
        b.gripM.emissive.copy(glow).multiplyScalar(s.solved ? 0.1 : 0.3 + 0.2 * Math.sin(pulse * 3) + 0.4 * fresh);
      });
      for (const q of treads) {
        const k = smooth(clamp((s.steps - q.delay) / (1 - 0.45), 0, 1));
        q.g.visible = k > 0;
        q.g.position.y = -(1 - k) * q.drop;
      }
    },
  };
}

// The causeway on screen: a row of stone slabs on pillars that rise out of the sea, one
// after another from the beacon's end, once the beam puzzle is solved (~3 s). They follow
// the ramp's own heights, so a walker's feet meet the slabs' tops. Never writes to S.
import { Group, Mesh, MeshLambertMaterial, BoxGeometry } from 'three';
import { SITES, RAMPS, heightAt } from '../../world/layout.js';
import { clamp } from '../../core/math.js';

const mat = (hex) => new MeshLambertMaterial({ color: hex, flatShading: true });
const STONE = 0xb9b0bf, STONE_DARK = 0x9d93a8;
const SLAB = 2.0, THICK = 0.5;
const RISE_SECS = 2.2, STAGGER = 0.8;   // each slab takes RISE_SECS; the last starts STAGGER after the first
const SEA_FLOOR = -4;
const smooth = (t) => t * t * (3 - 2 * t);

export function createView(scene) {
  const root = new Group();
  root.name = 'causeway-view';
  scene.add(root);
  const rp = RAMPS.find((r) => r.flag === 'causeway');
  const { ax, az, bx, bz, hw } = rp;
  const len = Math.hypot(bx - ax, bz - az), ux = (bx - ax) / len, uz = (bz - az) / len;
  const dyn = { causeway: true };
  const n = Math.ceil(len / SLAB);
  const slabM = [mat(STONE), mat(STONE_DARK)];
  const pillarM = mat(STONE_DARK);

  const slabs = [];
  for (let i = 0; i < n; i++) {
    const s0 = (i * len) / n, s1 = ((i + 1) * len) / n, sm = (s0 + s1) / 2;
    const h0 = heightAt(ax + ux * s0, az + uz * s0, dyn), h1 = heightAt(ax + ux * s1, az + uz * s1, dyn);
    const top = (h0 + h1) / 2, run = s1 - s0;
    const g = new Group();
    g.position.set(ax + ux * sm, 0, az + uz * sm);
    g.rotation.y = Math.atan2(-uz, ux) * 1 + 0;         // slab length along the ramp
    const deck = new Group();
    deck.position.y = top;
    deck.rotation.z = Math.atan2(h1 - h0, run);          // follow the slope
    const slab = new Mesh(new BoxGeometry(run + 0.04, THICK, 2 * hw), slabM[i % 2]);
    slab.position.y = -THICK / 2;
    deck.add(slab);
    g.add(deck);
    // a pillar every third slab, from the sea floor up to the slab's underside
    if (i % 3 === 1) {
      const ph = top - THICK - SEA_FLOOR;
      const pil = new Mesh(new BoxGeometry(1.2, ph, 1.2), pillarM);
      pil.position.y = SEA_FLOOR + ph / 2;
      g.add(pil);
    }
    g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    root.add(g);
    // sunk by `drop` metres when fully down: its top is then below the sea floor
    slabs.push({ g, drop: top - SEA_FLOOR + 0.8, delay: (i / Math.max(1, n - 1)) * STAGGER });
  }

  let t = 0;   // seconds since the causeway began to rise
  return {
    sync(s, ctx, dt = 0) {
      if (s.solved) t += dt;
      for (const q of slabs) {
        const k = smooth(clamp((t - q.delay) / RISE_SECS, 0, 1));
        q.g.visible = k > 0;
        q.g.position.y = -(1 - k) * q.drop;
      }
    },
  };
}

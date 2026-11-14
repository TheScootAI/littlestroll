// The Gate on screen: two stone plates that sink when stood on, stout posts either
// side of the ramp, and a wooden gate that swings with s.amt. Never writes to S.
import { Group, Mesh, MeshLambertMaterial, CylinderGeometry, BoxGeometry, Color } from 'three';
import { SITES, heightAt } from '../../world/layout.js';
import { clamp } from '../../core/math.js';

const SINK = 0.06;          // metres a plate drops when stood on
const PLATE_R = 1.0;        // matches the rules (gate.js)
const POST_X = 2.0;         // posts stand just outside the ramp edge
const LEAF_LEN = POST_X - 0.1;
const OPEN_ANGLE = Math.PI * 0.47;

const mat = (hex, extra = {}) => new MeshLambertMaterial({ color: hex, flatShading: true, ...extra });

export function createView(scene) {
  const root = new Group();
  root.name = 'gate-view';
  scene.add(root);

  const STONE = 0xb5ada4, ACCENT = 0xf08a3c, WOOD = 0xa9774c, WOOD_DARK = 0x7d5638;

  // plates: a stone disc with a warm glowing inlay so they read as "stand here"
  const plates = ['plateA', 'plateB'].map((key) => {
    const [x, z] = SITES.gate[key];
    const g = new Group();
    const base = heightAt(x, z);
    g.position.set(x, base, z);
    const disc = new Mesh(new CylinderGeometry(0.9, 1.0, 0.14, 10), mat(STONE));
    disc.position.y = 0.04;
    const ring = new Mesh(new CylinderGeometry(0.55, 0.55, 0.16, 10),
      mat(ACCENT, { emissive: new Color(ACCENT).multiplyScalar(0.35) }));
    ring.position.y = 0.045;
    g.add(disc, ring);
    root.add(g);
    return { g, base, x, z, sink: 0 };
  });

  // posts and leaves on the ramp at the door line
  const { door } = SITES.gate;
  const dz = (door.az + door.bz) / 2;
  const hingeY = heightAt(0, dz);
  const leaves = [-1, 1].map((side) => {
    const post = new Mesh(new BoxGeometry(0.5, 3.4, 0.5), mat(WOOD_DARK));
    post.position.set(side * POST_X, hingeY + 0.5, dz);
    const cap = new Mesh(new BoxGeometry(0.62, 0.18, 0.62), mat(STONE));
    cap.position.set(side * POST_X, hingeY + 2.28, dz);
    root.add(post, cap);

    const hinge = new Group();
    hinge.position.set(side * (POST_X - 0.25), hingeY + 0.15, dz);
    const leaf = new Group();
    leaf.position.x = -side * LEAF_LEN / 2;
    const frame = new Mesh(new BoxGeometry(LEAF_LEN, 1.5, 0.1), mat(WOOD));
    frame.position.y = 0.75;
    const brace = new Mesh(new BoxGeometry(LEAF_LEN, 0.14, 0.14), mat(WOOD_DARK));
    brace.position.y = 0.75;
    leaf.add(frame, brace);
    hinge.add(leaf);
    root.add(hinge);
    return { hinge, side };
  });

  return {
    sync(s, ctx, dt = 0) {
      const players = ctx?.players ?? [];
      const k = 1 - Math.exp(-dt / 0.06);
      for (const p of plates) {
        const on = players.some((q) => q && q.present && Math.hypot(q.x - p.x, q.z - p.z) <= PLATE_R);
        p.sink += ((on ? SINK : 0) - p.sink) * (dt > 0 ? k : 1);
        p.g.position.y = p.base - p.sink;
      }
      const ang = clamp(s.amt, 0, 1) * OPEN_ANGLE;
      // leaves swing away from the walker, up the ramp (towards -Z)
      for (const l of leaves) l.hinge.rotation.y = -l.side * ang;
    },
  };
}

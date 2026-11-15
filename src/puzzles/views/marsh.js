// The Marsh on screen: a murky green pond between the two shores holding 30 identical weathered
// stone slabs, reeds, the watch-stone with its plate, and the lever on the far shore. The safe
// slabs glow warm ONLY for a walker standing on the plate (or for everyone once it is solved);
// that decision is seesPath() in the rules. A slab that is not solid sinks while someone is over
// it. Never writes to S.
import {
  Group, Mesh, MeshLambertMaterial, MeshBasicMaterial, BoxGeometry, CylinderGeometry, ConeGeometry,
  PlaneGeometry, InstancedMesh, Object3D, Color, AdditiveBlending, DoubleSide,
} from 'three';
import { SITES, MARSH_SURFACE, WATCH_STONE, heightAt, marshTileAt, marshTileCentre } from '../../world/layout.js';
import { seesPath, sinksUnder } from '../marsh.js';
import { clamp, rng } from '../../core/math.js';

const mat = (hex, extra = {}) => new MeshLambertMaterial({ color: hex, flatShading: true, ...extra });
const STONE = 0xb5ada4, STONE_DARK = 0x9d93a8, MOSS = 0x8a9a6a, ACCENT = 0xf08a3c, WOOD = 0xa9774c, WOOD_DARK = 0x7d5638;
const WATER = 0x5d7a4c, MUD = 0x6f6a52, REED = 0x8c9b55, REED_TIP = 0xb1a85e;
const SEA_FLOOR = -4;
const WATER_Y = MARSH_SURFACE - 0.3;       // the pond's surface, just under the slab tops
const SLAB = 2.2, THICK = 0.55;
const SINK = 0.55;                          // metres a non-solid slab drops under a walker
const PLATE_SINK = 0.06;
const BAR_H = 1.15, BAR_DEEP = 1.2, BAR_S = 0.5;   // the watch-stone's barrier: height, depth sunk below the ground, seconds to rise
const smooth = (t) => t * t * (3 - 2 * t);

export function createView(scene) {
  const root = new Group();
  root.name = 'marsh-view';
  scene.add(root);
  const { origin, cols, rows, tile } = SITES.marsh;     // fwd = +x, right = +z (see layout.js)
  const W = cols * tile, L = rows * tile;
  const glow = new Color(ACCENT);
  const shadowed = (g) => g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  const box = (w, h, d, m, x, y, z, parent) => {
    const b = new Mesh(new BoxGeometry(w, h, d), m); b.position.set(x, y, z); parent.add(b); return b;
  };

  // ---- the pond: a mud-walled basin from the sea floor up, murky water at WATER_Y
  const cx = origin[0] + L / 2, cz = origin[1] + W / 2;
  const mudM = mat(MUD);
  const basin = new Group();
  basin.position.set(cx, 0, cz);
  const bh = WATER_Y - SEA_FLOOR;
  box(L + 0.8, bh, W + 0.8, mudM, 0, SEA_FLOOR + bh / 2, 0, basin);
  const water = new Mesh(new PlaneGeometry(L, W, 1, 1),
    new MeshLambertMaterial({ color: WATER, flatShading: true, transparent: true, opacity: 0.88 }));
  water.rotation.x = -Math.PI / 2;
  water.position.y = WATER_Y + 0.001;
  water.receiveShadow = true;
  basin.add(water);
  // a low muddy rim on the two long banks, so the pond reads as held between the shores
  for (const sz of [-1, 1]) box(L + 0.8, 0.22, 0.4, mudM, 0, MARSH_SURFACE + 0.04, sz * (W / 2 + 0.2), basin);
  root.add(basin);

  // ---- the 30 slabs: identical stone, each a little uneven in height and tilt
  const r = rng(1618);
  const rimGeo = [[SLAB, 0.12, 0.12, 0, SLAB / 2], [SLAB, 0.12, 0.12, 0, -SLAB / 2], [0.12, 0.12, SLAB, SLAB / 2, 0], [0.12, 0.12, SLAB, -SLAB / 2, 0]];
  const slabM = [mat(STONE), mat(STONE_DARK)];
  const tiles = [];
  for (let i = 0; i < cols * rows; i++) {
    const [x, z] = marshTileCentre(i);
    const g = new Group();
    g.position.set(x, 0, z);
    const deck = new Group();                     // the part that tilts, sinks
    deck.rotation.set((r() - 0.5) * 0.04, r() * Math.PI * 0.5 * 0, (r() - 0.5) * 0.04);
    const slab = new Mesh(new BoxGeometry(SLAB, THICK, SLAB), slabM[(i + Math.floor(i / cols)) % 2]);
    slab.position.y = -THICK / 2;
    deck.add(slab);
    const moss = new Mesh(new BoxGeometry(0.5 + r() * 0.6, 0.04, 0.4 + r() * 0.5), mat(MOSS));
    moss.position.set((r() - 0.5) * 1.2, 0.012, (r() - 0.5) * 1.2);
    deck.add(moss);
    // the glow: a warm rim and a soft additive wash on the top, shown only to a watcher
    const gm = new MeshBasicMaterial({ color: ACCENT, transparent: true, opacity: 0, blending: AdditiveBlending, depthWrite: false, side: DoubleSide });
    const wash = new Mesh(new PlaneGeometry(SLAB - 0.1, SLAB - 0.1), gm);
    wash.rotation.x = -Math.PI / 2; wash.position.y = 0.03;
    const rimM = mat(ACCENT, { emissive: glow.clone() });
    const rim = new Group();
    for (const [w, h, d, ox, oz] of rimGeo) box(w, h, d, rimM, ox, 0.02, oz, rim);
    rim.visible = false;
    deck.add(wash, rim);
    g.add(deck);
    const baseY = MARSH_SURFACE + (r() - 0.5) * 0.06;
    g.position.y = baseY;
    shadowed(g); wash.castShadow = false; wash.receiveShadow = false;
    root.add(g);
    tiles.push({ g, baseY, sink: 0, glowAmt: 0, rim, rimM, gm });
  }

  // ---- reeds: thin cones round the banks and at the gaps between slabs
  const reedPos = [];
  for (let c = 1; c < cols; c++) for (let rw = 1; rw < rows; rw++) {
    const [x, z] = [origin[0] + rw * tile, origin[1] + c * tile];
    for (let k = 0; k < 2; k++) reedPos.push([x + (r() - 0.5) * 0.3, z + (r() - 0.5) * 0.3]);
  }
  for (const zz of [origin[1] - 0.1, origin[1] + W + 0.1]) {
    for (let x = origin[0] - 0.2; x < origin[0] + L; x += 0.35) reedPos.push([x + r() * 0.2, zz + (r() - 0.5) * 0.2]);
  }
  const reeds = new InstancedMesh(new ConeGeometry(0.045, 1, 4), mat(REED), reedPos.length);
  const tips = new InstancedMesh(new ConeGeometry(0.07, 0.18, 4), mat(REED_TIP), reedPos.length);
  const o = new Object3D();
  reedPos.forEach(([x, z], k) => {
    const h = 0.55 + r() * 0.7;
    o.position.set(x, WATER_Y + h / 2 - 0.05, z); o.scale.set(1, h, 1);
    o.rotation.set((r() - 0.5) * 0.25, 0, (r() - 0.5) * 0.25); o.updateMatrix(); reeds.setMatrixAt(k, o.matrix);
    o.position.y = WATER_Y + h - 0.05; o.scale.set(1, 1, 1); o.updateMatrix(); tips.setMatrixAt(k, o.matrix);
  });
  root.add(reeds, tips);

  // ---- the watch-stone: a rough cairn column with the plate on top and a carved standing stone
  const ws = new Group();
  let barG, barBody, barCap, barT = 0;
  const baseH = MARSH_SURFACE - 0.15;           // H, the ground the stone stands on (heightAt here would say the stone's own top)
  // the column stops just short of the top: its own top face must not share the cap's plane
  const colTop = WATCH_STONE.h - 0.08;
  const ph = colTop - (baseH - 0.5);
  const stoneM = mat(STONE_DARK);
  const col = new Mesh(new CylinderGeometry(WATCH_STONE.r, WATCH_STONE.r + 0.08, ph, 9), stoneM);
  col.position.set(WATCH_STONE.x, colTop - ph / 2, WATCH_STONE.z);
  ws.add(col);
  // courses of stacked stone, so it reads as a cairn rather than a drum
  for (let k = 1; k < 3; k++) {
    const ring = new Mesh(new CylinderGeometry(WATCH_STONE.r + 0.1, WATCH_STONE.r + 0.1, 0.1, 9), mat(STONE));
    ring.position.set(WATCH_STONE.x, WATCH_STONE.h - k * (WATCH_STONE.h - baseH) / 3, WATCH_STONE.z);
    ws.add(ring);
  }
  // nine flat sides: wide enough that even the flats overhang the walkable top (r), so the
  // ground mesh sunk beneath it (terrain.js, meshHeightAt) never shows past the rim
  const capR = (WATCH_STONE.r + 0.06) / Math.cos(Math.PI / 9);
  const cap = new Mesh(new CylinderGeometry(capR, capR, 0.12, 9), mat(STONE));
  cap.position.set(WATCH_STONE.x, WATCH_STONE.h - 0.06, WATCH_STONE.z);
  ws.add(cap);
  const plateG = new Group();
  const disc = new Mesh(new CylinderGeometry(0.9, 1.0, 0.14, 10), mat(STONE));
  disc.position.y = 0.04;
  const ring = new Mesh(new CylinderGeometry(0.55, 0.55, 0.16, 10), mat(ACCENT, { emissive: glow.clone().multiplyScalar(0.35) }));
  ring.position.y = 0.045;
  plateG.add(disc, ring);
  plateG.position.set(WATCH_STONE.x, WATCH_STONE.h, WATCH_STONE.z);
  ws.add(plateG);
  // the carved standing stone on the stone's north edge, with a glowing eye facing the plate
  const mono = new Group();
  mono.position.set(WATCH_STONE.x, WATCH_STONE.h, WATCH_STONE.z - 2.0);
  box(0.9, 1.7, 0.5, mat(STONE), 0, 0.85, 0, mono);
  box(1.02, 0.14, 0.62, mat(STONE_DARK), 0, 1.77, 0, mono);
  const eyeM = mat(ACCENT, { emissive: glow.clone().multiplyScalar(0.5) });
  box(0.3, 0.3, 0.06, eyeM, 0, 1.1, 0.26, mono);
  ws.add(mono);

  // ---- the railing round the top: a post at each of the ring's vertices, a top rail and a mid rail
  // between them; the ring is open where the ramp comes up, and the barrier closes that gap
  {
    const { rail, barrier } = SITES.marsh;
    const woodM = mat(WOOD), darkM = mat(WOOD_DARK);
    const POST_H = 1.15, POST_W = 0.16, RAIL_W = 0.1;
    const pts = [[rail[0].ax, rail[0].az], ...rail.map((s) => [s.bx, s.bz])];
    for (const [x, z] of pts) box(POST_W, POST_H, POST_W, darkM, x, WATCH_STONE.h + POST_H / 2, z, ws);
    for (const s of rail) {
      const len = Math.hypot(s.bx - s.ax, s.bz - s.az);
      const yaw = Math.atan2(-(s.bz - s.az), s.bx - s.ax);     // local +X along the segment
      for (const y of [POST_H - 0.07, POST_H * 0.5]) {
        const b = box(len, RAIL_W, RAIL_W, woodM, (s.ax + s.bx) / 2, WATCH_STONE.h + y, (s.az + s.bz) / 2, ws);
        b.rotation.y = yaw;
      }
    }
    // the barrier: a boarded gate that rises out of the ground across the opening and sinks back
    const blen = Math.hypot(barrier.bx - barrier.ax, barrier.bz - barrier.az);
    barG = new Group();
    barG.position.set((barrier.ax + barrier.bx) / 2, WATCH_STONE.h, (barrier.az + barrier.bz) / 2);
    barG.rotation.y = Math.atan2(-(barrier.bz - barrier.az), barrier.bx - barrier.ax);
    barBody = new Mesh(new BoxGeometry(blen, BAR_H + BAR_DEEP, 0.14), woodM);
    barCap = new Mesh(new BoxGeometry(blen + 0.1, 0.12, 0.2), darkM);
    barG.add(barBody, barCap);
    barG.visible = false;
    ws.add(barG);
  }
  shadowed(ws);
  root.add(ws);

  // ---- the lever, on a stone base on the far shore; it throws over when solved
  const [lx, lz] = SITES.marsh.lever;
  const lev = new Group();
  lev.position.set(lx, heightAt(lx, lz), lz);
  box(0.9, 0.5, 0.9, mat(STONE), 0, 0.25, 0, lev);
  box(0.5, 0.12, 0.5, mat(STONE_DARK), 0, 0.56, 0, lev);
  const arm = new Group();
  arm.position.y = 0.62;
  box(0.1, 1.3, 0.1, mat(WOOD), 0, 0.6, 0, arm);
  const knob = new Mesh(new CylinderGeometry(0.11, 0.11, 0.22, 8), mat(ACCENT, { emissive: glow.clone().multiplyScalar(0.4) }));
  knob.rotation.x = Math.PI / 2; knob.position.y = 1.3;
  arm.add(knob);
  lev.add(arm);
  box(0.12, 0.3, 0.7, mat(WOOD_DARK), 0, 0.64, 0, lev);
  shadowed(lev);
  root.add(lev);

  let leverAmt = 0, plateSink = 0, pulse = 0;
  return {
    sync(s, ctx, dt = 0) {
      pulse += dt;
      const players = ctx?.players ?? [];
      const me = players[ctx?.localIdx ?? 0];
      const dynMask = ctx?.dyn?.marsh | 0;
      const k = dt > 0 ? 1 - Math.exp(-dt / 0.18) : 1;
      const see = seesPath(s, me);
      const onPath = new Set(s.path);
      const real = { ...ctx?.dyn, marsh: dynMask };
      const over = new Set();
      for (const p of players) if (p && p.present) { const i = marshTileAt(p.x, p.z); if (i >= 0 && sinksUnder(p, i, real)) over.add(i); }
      tiles.forEach((t, i) => {
        // sink while a walker is over a slab that is not solid; it comes back up after
        const give = over.has(i);
        t.sink += ((give ? SINK : 0) - t.sink) * (give ? k * 1.6 : k * 0.5);
        t.g.position.y = t.baseY - t.sink;
        const want = see && onPath.has(i) ? 1 : 0;
        t.glowAmt += (want - t.glowAmt) * (dt > 0 ? 1 - Math.exp(-dt / 0.25) : 1);
        const a = t.glowAmt * (0.85 + 0.15 * Math.sin(pulse * 2.2 + i));
        t.rim.visible = t.glowAmt > 0.02;
        t.gm.opacity = 0.32 * a;
        t.rimM.emissive.copy(glow).multiplyScalar(0.25 + 0.6 * a);
      });
      // the plate sinks a little under whoever stands on it
      const on = players.some((p) => p && p.present && Math.hypot(p.x - WATCH_STONE.x, p.z - WATCH_STONE.z) <= SITES.marsh.plate.r);
      plateSink += ((on ? PLATE_SINK : 0) - plateSink) * (dt > 0 ? 1 - Math.exp(-dt / 0.06) : 1);
      plateG.position.y = WATCH_STONE.h - plateSink;
      // the barrier rises and sinks over BAR_S, as the Signal's does
      barT = dt > 0 ? clamp(barT + (s.up ? dt : -dt) / BAR_S, 0, 1) : (s.up ? 1 : 0);
      barG.visible = barT > 0.001;
      const top = -0.05 + barT * (BAR_H + 0.05);
      barBody.position.y = top - (BAR_H + BAR_DEEP) / 2;
      barCap.position.y = top + 0.06;
      // the lever throws from leaning back to leaning forward (towards the marsh) when solved
      leverAmt += ((s.solved ? 1 : 0) - leverAmt) * (dt > 0 ? 1 - Math.exp(-dt / 0.15) : 1);
      arm.rotation.z = clamp(0.7 - 1.4 * smooth(clamp(leverAmt, 0, 1)), -0.7, 0.7);
    },
  };
}

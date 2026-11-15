// The Signal on screen: a standing wall whose BACK shows four big glowing symbols
// (only while someone stands on the lookout's plate), four dial posts, the plate and a
// barrier across the spur, and a bridge that slides out with s.bridge. Never writes to S.
import {
  Group, Mesh, MeshLambertMaterial, MeshBasicMaterial, BoxGeometry, CylinderGeometry, SphereGeometry,
  PlaneGeometry, DoubleSide, Color, Vector3,
} from 'three';
import { SITES, heightAt } from '../../world/layout.js';
import { clamp } from '../../core/math.js';
import { SYMBOLS, onBackSide } from '../signal.js';
import { signTexture } from './signs.js';

const mat = (hex, extra = {}) => new MeshLambertMaterial({ color: hex, flatShading: true, ...extra });

export function createView(scene) {
  const root = new Group();
  root.name = 'signal-view';
  scene.add(root);
  const { wall, dials, bridge } = SITES.signal;
  const STONE = 0x8f8880, DARK = 0x4a4540, ACCENT = 0xf08a3c, GLOW = 0xffe3a0, WOOD = 0xa9774c;
  const glowCol = new Color(GLOW), dimCol = new Color(0x3a3632);
  const tex = Array.from({ length: SYMBOLS }, (_, i) => signTexture(i));

  // ---- the wall: faces `wall.yaw` (front toward the dials); its back is local +Z
  const base = heightAt(wall.x + 0.5, wall.z);
  const W = 5.4, H = 5.8, T = 0.6;
  const wg = new Group();
  wg.position.set(wall.x, base, wall.z);
  wg.rotation.y = wall.yaw;
  const slab = new Mesh(new BoxGeometry(W, H, T), mat(DARK));
  slab.position.y = H / 2;
  const cap = new Mesh(new BoxGeometry(W + 0.3, 0.3, T + 0.3), mat(STONE));
  cap.position.y = H + 0.1;
  wg.add(slab, cap);
  root.add(wg);

  // slot i: col = i % 2, row = i < 2 ? top : bottom. Seen from behind, local +X is the viewer's right.
  // Each slot is its own bright-framed tile with a gap to the next; its i+1 pips sit inside the
  // tile along the top-left edge, the same place in every tile, so the count belongs to the glyph.
  const TILE = 2.4, FRAME = 0.08, PIP_R = 0.1, PIP_GAP = 0.3;
  const slotPos = (i) => [(i % 2 ? 1 : -1) * 1.35, i < 2 ? 4.3 : 1.65];
  const Z = T / 2;
  const tileMats = [], symMats = [], pips = [];
  for (let i = 0; i < 4; i++) {
    const [x, y] = slotPos(i);
    const tile = new Group();
    tile.position.set(x, y, Z);
    tile.visible = false;
    const frame = new Mesh(new PlaneGeometry(TILE, TILE), new MeshBasicMaterial({ color: GLOW }));
    frame.position.z = 0.02;
    const inset = new Mesh(new PlaneGeometry(TILE - 2 * FRAME, TILE - 2 * FRAME), new MeshBasicMaterial({ color: 0x1d1a18 }));
    inset.position.z = 0.04;
    const m = new MeshBasicMaterial({ map: tex[0], color: GLOW, transparent: true, side: DoubleSide, depthWrite: false });
    symMats.push(m);
    const glyph = new Mesh(new PlaneGeometry(1.6, 1.6), m);
    glyph.position.set(0, -0.2, 0.06);
    tile.add(frame, inset, glyph);
    wg.add(tile);
    tileMats.push(tile);
    // i+1 pips, top-left inside the tile: carved dim, glowing with the symbols
    const row = [];
    for (let k = 0; k <= i; k++) {
      const pm = new MeshBasicMaterial({ color: dimCol });
      const pip = new Mesh(new CylinderGeometry(PIP_R, PIP_R, 0.04, 12), pm);
      pip.rotation.x = Math.PI / 2;
      pip.position.set(x - TILE / 2 + 0.3 + k * PIP_GAP, y + TILE / 2 - 0.3, Z + 0.09);
      wg.add(pip);
      row.push(pm);
    }
    pips.push(row);
  }

  // ---- dial posts
  const posts = dials.map(([x, z], i) => {
    const g = new Group();
    const y0 = heightAt(x, z);
    g.position.set(x, y0, z);
    const foot = new Mesh(new CylinderGeometry(0.7, 0.8, 0.18, 10), mat(STONE));
    foot.position.y = 0.09;
    const post = new Mesh(new CylinderGeometry(0.22, 0.3, 0.9, 8), mat(WOOD));
    post.position.y = 0.6;
    const head = new Group();
    head.position.y = 1.15;
    head.rotation.x = 0;
    const disc = new Mesh(new CylinderGeometry(0.46, 0.46, 0.12, 12),
      mat(ACCENT, { emissive: new Color(ACCENT).multiplyScalar(0.3) }));
    const fm = new MeshBasicMaterial({ map: tex[0], color: 0x2a1c10, transparent: true });
    const face = new Mesh(new PlaneGeometry(0.72, 0.72), fm);
    face.rotation.x = -Math.PI / 2;
    face.position.y = 0.065;
    head.add(disc, face);
    g.add(foot, post, head);
    // i+1 pips on the foot, in a row
    for (let k = 0; k <= i; k++) {
      const pip = new Mesh(new SphereGeometry(0.09, 8, 6), mat(ACCENT, { emissive: new Color(ACCENT).multiplyScalar(0.5) }));
      pip.position.set(0.0 + (k - i / 2) * 0.24, 0.2, 0.55);
      g.add(pip);
    }
    root.add(g);
    return { head, fm, shown: -1, spin: 0 };
  });

  // ---- lookout: the plate (stand here and the symbols show) and a little cairn beside it
  const { plate, barrier } = SITES.signal;
  const plateBase = heightAt(plate.x, plate.z);
  const plateG = new Group();
  plateG.position.set(plate.x, plateBase, plate.z);
  const slabMat = mat(STONE);
  const discP = new Mesh(new CylinderGeometry(plate.r - 0.1, plate.r, 0.16, 14), slabMat);
  discP.position.y = 0.05;
  const inlayMat = mat(ACCENT, { emissive: new Color(ACCENT).multiplyScalar(0.15) });
  const inlay = new Mesh(new CylinderGeometry(plate.r * 0.62, plate.r * 0.62, 0.18, 14), inlayMat);
  inlay.position.y = 0.055;
  plateG.add(discP, inlay);
  root.add(plateG);
  {
    const y = plateBase;
    [[0.5, 0.45], [0.35, 0.4], [0.22, 0.34]].reduce((h, [r, ht]) => {
      const st = new Mesh(new CylinderGeometry(r * 0.8, r, ht, 7), mat(STONE));
      st.position.set(plate.x - 1.4, y + h + ht / 2, plate.z + 2.3);
      root.add(st);
      return h + ht;
    }, 0);
  }

  // ---- the barrier across the spur: a stone slab that rises out of the ramp (matches the blocker segment)
  const BAR_H = 2.2, BAR_T = 0.5, BAR_DEEP = 1.6, BAR_S = 0.5;
  const bmx = (barrier.ax + barrier.bx) / 2, bmz = (barrier.az + barrier.bz) / 2;
  const blen = Math.hypot(barrier.bx - barrier.ax, barrier.bz - barrier.az);
  let barBase = -Infinity;                       // the ramp's surface, the highest ground along the segment
  for (let k = 0; k <= 8; k++) barBase = Math.max(barBase, heightAt(barrier.ax + (barrier.bx - barrier.ax) * k / 8, barrier.az + (barrier.bz - barrier.az) * k / 8));
  const barG = new Group();
  barG.position.set(bmx, barBase, bmz);
  barG.rotation.y = Math.atan2(-(barrier.bz - barrier.az), barrier.bx - barrier.ax);   // local +X along the segment
  const barBody = new Mesh(new BoxGeometry(blen, BAR_H + BAR_DEEP, BAR_T), mat(DARK));
  const barCap = new Mesh(new BoxGeometry(blen + 0.1, 0.2, BAR_T + 0.1), mat(STONE));
  barG.add(barBody, barCap);
  barG.visible = false;
  root.add(barG);
  let barT = 0, plateSink = 0;
  const accentCol = new Color(ACCENT);

  // ---- bridge: slides out from the B end; the slab is a unit-length box scaled along +Z
  const a = new Vector3(bridge.ax, heightAt(bridge.ax, bridge.az), bridge.az);
  const b = new Vector3(bridge.bx, heightAt(bridge.bx, bridge.bz, { bridge: true }), bridge.bz);
  const len = a.distanceTo(b);
  const bg = new Group();
  bg.position.copy(a);
  bg.lookAt(b);
  const deck = new Mesh(new BoxGeometry(3, 0.3, 1), mat(WOOD));
  deck.position.set(0, -0.15, 0.5);
  bg.add(deck);
  for (const s of [-1, 1]) {
    const rail = new Mesh(new BoxGeometry(0.12, 0.14, 1), mat(0x7d5638));
    rail.position.set(s * 1.44, 0.45, 0.5);
    bg.add(rail);
  }
  bg.visible = false;
  root.add(bg);

  return {
    sync(s, ctx, dt = 0) {
      // drawn only for a local walker standing behind the wall, so a dialler whose camera
      // swings round behind it never sees the answer
      const me = ctx?.players?.[ctx.localIdx];
      const lit = !!s.lit && !!me?.present && onBackSide(wall, me.x, me.z);
      for (let i = 0; i < 4; i++) {
        const m = symMats[i];
        tileMats[i].visible = lit;
        if (m.map !== tex[s.answer[i]]) { m.map = tex[s.answer[i]]; m.needsUpdate = true; }
        for (const pm of pips[i]) pm.color.copy(lit ? glowCol : dimCol);
      }
      for (let i = 0; i < 4; i++) {
        const p = posts[i];
        if (p.shown !== s.dials[i]) {
          if (p.shown !== -1) p.spin = 0.35;
          p.shown = s.dials[i];
          p.fm.map = tex[p.shown]; p.fm.needsUpdate = true;
        }
        p.spin = Math.max(0, p.spin - dt);
        p.head.rotation.y = (p.spin / 0.35) * Math.PI * 2;
      }
      // the plate sinks a little and glows while held; the barrier rises and sinks over BAR_S
      const kk = dt > 0 ? 1 - Math.exp(-dt / 0.06) : 1;
      plateSink += ((s.held ? 0.05 : 0) - plateSink) * kk;
      plateG.position.y = plateBase - plateSink;
      inlayMat.emissive.copy(accentCol).multiplyScalar(s.held ? 0.8 : 0.15);
      barT = dt > 0 ? clamp(barT + (s.up ? dt : -dt) / BAR_S, 0, 1) : (s.up ? 1 : 0);
      barG.visible = barT > 0.001;
      const top = -0.05 + barT * (BAR_H + 0.05);                 // top face above the ramp
      barBody.position.y = top - (BAR_H + BAR_DEEP) / 2;
      barCap.position.y = top + 0.1;
      barG.position.y = barBase;
      const t = clamp(s.bridge, 0, 1);
      bg.visible = t > 0.001;
      bg.scale.set(1, 1, Math.max(t, 0.001) * len);
    },
  };
}

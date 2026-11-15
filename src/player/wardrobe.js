// The ten pieces of clothing the walkers can find: how each looks worn on an avatar (wornParts) and
// lying on the ground at its spot (lyingProp). Small low-poly meshes in the avatar's own flat-shaded
// style; boxes, cylinders of 6 to 10 sides and spheres of a few segments only, since there are two
// avatars and ten props on screen.
//
// Avatar facts these are measured against (see avatar.js): the body is a pebble of radius 0.42 centred
// at y 0.66 and scaled (1, 1.08, 0.88), front is -Z; the eyes are at y 0.97, z -0.27, x +-0.11; the
// scarf ring is at y 0.84 and its tail hangs at the back; leg pivots are at (+-0.17, 0.3, 0) with the
// leg hanging 0.15 below; arm pivots at (+-0.42, 0.78, 0) with the hand end about 0.3 below.
// Nothing here covers an eye or the scarf, so the scarf colour still tells the walkers apart.
import {
  Group, Mesh, MeshLambertMaterial, BoxGeometry, CylinderGeometry, SphereGeometry, DoubleSide,
} from 'three';

const mat = (hex, extra = {}) => new MeshLambertMaterial({ color: hex, flatShading: true, ...extra });

const C = {
  black: 0x1c1c20, white: 0xf2f2ee, bootBrown: 0x4a2f1c, red: 0xc23a30, beltBrown: 0x7a4a25, gold: 0xd9b13a,
  blue: 0x2f5fb0, rim: 0x2a2a30, green: 0x4a7d3a, tan: 0xc9a66b, moustache: 0x3a2414, petal: 0xf5f5f0, yellow: 0xf0c830,
};

// ---- small builders: each returns a Mesh already placed (and optionally turned) in its parent's coordinates
const box = (w, h, d, color, x = 0, y = 0, z = 0, rot = [0, 0, 0]) => {
  const m = new Mesh(new BoxGeometry(w, h, d), mat(color));
  m.position.set(x, y, z);
  m.rotation.set(...rot);
  return m;
};
const cyl = (rt, rb, h, seg, color, x = 0, y = 0, z = 0, rot = [0, 0, 0], extra = {}, open = false) => {
  const m = new Mesh(new CylinderGeometry(rt, rb, h, seg, 1, open), mat(color, extra));
  m.position.set(x, y, z);
  m.rotation.set(...rot);
  return m;
};
const ball = (r, color, x = 0, y = 0, z = 0, sy = 1, w = 8, h = 6) => {
  const m = new Mesh(new SphereGeometry(r, w, h), mat(color));
  m.position.set(x, y, z);
  m.scale.y = sy;
  return m;
};
const put = (g, ...ms) => { for (const m of ms) g.add(m); return g; };

// ---- the pieces, each as a function of a group (or part) to fill, at scale k and offset (ox, oy, oz)

// a hexagonal rim of six thin boxes round (cx, cy) at depth z: a ring made of separate pieces, so no
// single box's outline spans the middle of it (the eye behind shows, and nothing "covers" it)
function rim(cx, cy, z, k = 1) {
  const R = 0.07 * k, seg = 0.075 * k, t = 0.016 * k, out = [];
  for (let n = 0; n < 6; n++) {
    const a = n * Math.PI / 3 + Math.PI / 6;
    out.push(box(seg, t, t, C.rim, cx + Math.cos(a) * R * 0.87, cy + Math.sin(a) * R * 0.87, z, [0, 0, a + Math.PI / 2]));
  }
  return out;
}
const glassesMeshes = (k = 1, y = 0.97, z = -0.31) => [
  ...rim(-0.11 * k, y, z, k), ...rim(0.11 * k, y, z, k),
  box(0.06 * k, 0.016 * k, 0.016 * k, C.rim, 0, y + 0.02 * k, z),
];

// one boot: a shin tube and a toe, standing with its sole at local y `sole`
const boot = (k = 1, x = 0, sole = -0.3, z = 0) => [
  cyl(0.122 * k, 0.126 * k, 0.2 * k, 8, C.bootBrown, x, sole + 0.1 * k, z),
  box(0.19 * k, 0.07 * k, 0.12 * k, C.bootBrown, x, sole + 0.035 * k, z - 0.075 * k),
  cyl(0.13 * k, 0.13 * k, 0.025 * k, 8, 0x2e1c10, x, sole + 0.205 * k, z),   // the darker cuff
];

const glove = (k = 1, x = 0, y = -0.3, z = 0) => [
  ball(0.1 * k, C.red, x, y, z, 1.1),
  cyl(0.088 * k, 0.088 * k, 0.07 * k, 8, C.red, x, y + 0.1 * k, z),
];

const beltMeshes = (y = 0.5) => {
  const band = cyl(0.43, 0.43, 0.07, 10, C.beltBrown, 0, y, 0, [0, 0, 0], { side: DoubleSide }, true);
  band.scale.z = 0.87;   // the body is flatter front to back than side to side
  return [band, box(0.1, 0.09, 0.03, C.gold, 0, y, -0.388)];
};

const jacketMesh = () => {
  // a pebble-shaped shell round the body's back and sides, the front left open (the open part is the
  // front, -Z); a little larger than the body (wider at the sides so the arms hang inside it)
  const gap = 0.55 * Math.PI;
  const m = new Mesh(
    new SphereGeometry(0.45, 10, 4, 1.5 * Math.PI + gap / 2, 2 * Math.PI - gap, 1.405, 1.0),
    mat(C.blue, { side: DoubleSide }),
  );
  m.scale.set(1.17, 1.08, 0.96);
  m.position.y = 0.66;
  return m;
};

const backpackMeshes = (y = 0.43, z = 0.52) => [
  box(0.3, 0.3, 0.16, C.green, 0, y, z),
  box(0.32, 0.07, 0.18, C.green, 0, y + 0.15, z),   // the flap
];

const moustacheMeshes = (k = 1, y = 0.928, z = -0.3) => [
  box(0.1 * k, 0.032 * k, 0.05 * k, C.moustache, -0.06 * k, y, z, [0, 0, 0.22]),
  box(0.1 * k, 0.032 * k, 0.05 * k, C.moustache, 0.06 * k, y, z, [0, 0, -0.22]),
];

const medalMeshes = (k = 1, y = 0.62, z = -0.38) => [
  cyl(0.06 * k, 0.06 * k, 0.02 * k, 8, C.gold, 0, y, z, [Math.PI / 2, 0, 0]),
  box(0.04 * k, 0.13 * k, 0.02 * k, C.red, 0, y + 0.1 * k, z + 0.008 * k),
];

// five petals round a yellow middle, facing +Z in its own group
function flowerGroup(k = 1) {
  const g = new Group();
  for (let n = 0; n < 5; n++) {
    const a = n * 2 * Math.PI / 5;
    g.add(ball(0.035 * k, C.petal, Math.cos(a) * 0.05 * k, Math.sin(a) * 0.05 * k, 0, 1, 6, 4));
  }
  g.add(ball(0.03 * k, C.yellow, 0, 0, 0.012 * k, 1, 6, 4));
  return g;
}

function hatMeshes(k = 1, y = 1.1) {
  return [
    cyl(0.3 * k, 0.3 * k, 0.04 * k, 8, C.black, 0, y - 0.03 * k, 0),                       // the wide brim
    cyl(0.17 * k, 0.19 * k, 0.12 * k, 8, C.black, 0, y + 0.05 * k, 0),                     // the crown
    cyl(0.192 * k, 0.192 * k, 0.035 * k, 8, C.white, 0, y + 0.035 * k, 0),                 // the white band
    box(0.12 * k, 0.05 * k, 0.1 * k, C.black, 0, y - 0.01 * k, -0.27 * k, [0.25, 0, 0]),   // the brim's front point
  ];
}

// The pieces of find i as they sit on an avatar: [{ on: 'body' | 'legL' | 'legR' | 'armL' | 'armR', mesh }]
// (mesh already positioned in that part's own coordinates). Built fresh on every call.
export function wornParts(i) {
  const on = (part, ...ms) => ms.map((mesh) => ({ on: part, mesh }));
  switch (i) {
    case 0: return on('body', ...glassesMeshes());
    case 1: return [...on('legL', ...boot(1, 0, -0.3)), ...on('legR', ...boot(1, 0, -0.3))];
    case 2: return on('body', ...beltMeshes());
    case 3: return on('body', jacketMesh());
    case 4: {
      // the pack's straps hang from the shoulders down the front of the body, clear of the scarf
      return on('body', ...backpackMeshes(),
        box(0.05, 0.28, 0.03, C.tan, -0.2, 0.6, -0.335), box(0.05, 0.28, 0.03, C.tan, 0.2, 0.6, -0.335));
    }
    case 5: return on('body', ...moustacheMeshes());
    case 6: return on('body', ...medalMeshes());
    case 7: {
      const f = flowerGroup();
      f.position.set(-0.29, 0.98, -0.1);
      f.rotation.y = -Math.PI / 2;   // face outward (-X), the left side of the head
      return on('body', f);
    }
    case 8: return [...on('armL', ...glove(1, 0, -0.3)), ...on('armR', ...glove(1, 0, -0.3))];
    case 9: return on('body', ...hatMeshes());
    default: return [];
  }
}

// Find i lying at its spot: one Group resting on y = 0, about 0.5 m across, easy to recognise
// (a pair for boots and gloves, the glasses folded flat, the hat upright).
export function lyingProp(i) {
  const g = new Group();
  g.name = `find-${i}`;
  switch (i) {
    case 0: {   // glasses folded flat: two rims, the bridge, and the two arms laid in
      const ms = glassesMeshes(1.5, 0, 0);
      // stand the front (XY) pieces down onto the ground (XZ)
      const flat = new Group();
      put(flat, ...ms, box(0.02, 0.28, 0.02, C.rim, -0.2, 0.16, 0), box(0.02, 0.28, 0.02, C.rim, 0.2, 0.16, 0));
      flat.rotation.x = Math.PI / 2;
      flat.position.y = 0.03;
      g.add(flat);
      break;
    }
    case 1: put(g, ...boot(1.5, -0.14, 0, 0), ...boot(1.5, 0.14, 0, 0)); break;
    case 2: {   // the belt coiled on the ground, the buckle on top
      g.add(cyl(0.2, 0.2, 0.07, 10, C.beltBrown, 0, 0.035, 0, [0, 0, 0], { side: DoubleSide }, true));
      g.add(cyl(0.14, 0.14, 0.05, 10, C.beltBrown, 0, 0.025, 0, [0, 0, 0], { side: DoubleSide }, true));
      g.add(box(0.1, 0.03, 0.08, C.gold, 0, 0.075, -0.18));
      break;
    }
    case 3: {   // the jacket laid out flat: body and two sleeves
      put(g, box(0.3, 0.06, 0.4, C.blue, 0, 0.03, 0), box(0.16, 0.06, 0.1, C.blue, -0.22, 0.03, 0.05, [0, 0.4, 0]),
        box(0.16, 0.06, 0.1, C.blue, 0.22, 0.03, 0.05, [0, -0.4, 0]), box(0.12, 0.07, 0.1, 0x244a8c, 0, 0.035, -0.2));
      break;
    }
    case 4: {   // the pack standing on its end, straps hanging
      put(g, box(0.3, 0.36, 0.16, C.green, 0, 0.18, 0), box(0.32, 0.07, 0.18, C.green, 0, 0.36, 0),
        box(0.05, 0.3, 0.02, C.tan, -0.09, 0.2, -0.09), box(0.05, 0.3, 0.02, C.tan, 0.09, 0.2, -0.09));
      break;
    }
    case 5: put(g, ...moustacheMeshes(3.2, 0.088, 0)); break;
    case 6: {   // the medal on its ribbon, laid out
      put(g, cyl(0.12, 0.12, 0.03, 8, C.gold, 0, 0.015, 0.14), box(0.08, 0.015, 0.3, C.red, 0, 0.0075, -0.08));
      break;
    }
    case 7: {   // a flower, lying face up
      const f = flowerGroup(2.6);
      f.rotation.x = -Math.PI / 2;
      f.position.y = 0.09;
      g.add(f);
      break;
    }
    case 8: put(g, ...glove(1.6, -0.14, 0.18, 0), ...glove(1.6, 0.14, 0.18, 0)); break;
    case 9: {   // the hat standing upright on its brim
      const h = new Group();
      put(h, ...hatMeshes(1.0, 0.055));
      g.add(h);
      break;
    }
    default: break;
  }
  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return g;
}

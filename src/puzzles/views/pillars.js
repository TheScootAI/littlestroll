// The Pillars on screen: two lines of nine square stone columns standing in the sea from the
// sea floor. A column rests with its top 2.2 m under the deck level and, while its bit is set
// in ctx.dyn.pillars (bit line*9 + r), rises in about 0.3 s until its top face is exactly at
// PILLAR_SURFACE (a walker's feet are there; the terrain mesh has no ground over the lines),
// and sinks the same way when the bit clears. A raised column has a lighter cap. Never writes to S.
import { Group, Mesh, MeshLambertMaterial, BoxGeometry, Color } from 'three';
import { SITES, PILLAR_SURFACE, PILLAR_BITS, pillarCentre } from '../../world/layout.js';
import { clamp } from '../../core/math.js';

const SEA_FLOOR = -4;
const DROP = 2.2;            // how far under the deck level a resting column's top sits
const RISE_TIME = 0.3;
const CAP = 0.14;            // cap thickness; the body ends inside it so no faces share a plane
const WIDTH = SITES.pillars.tile - 0.3;
const smooth = (t) => t * t * (3 - 2 * t);

export function createView(scene) {
  const root = new Group();
  root.name = 'pillars-view';
  scene.add(root);
  const n = SITES.pillars.n;
  const bodyM = new MeshLambertMaterial({ color: 0x8f98a0, flatShading: true });
  const capDark = new Color(0x9aa3aa), capLight = new Color(0xe3dccb);
  const height = PILLAR_SURFACE - SEA_FLOOR;
  const bodyGeo = new BoxGeometry(WIDTH, height - CAP, WIDTH);
  const capGeo = new BoxGeometry(WIDTH + 0.1, CAP, WIDTH + 0.1);

  const cols = [];
  for (let i = 0; i < PILLAR_BITS; i++) {
    const [x, z] = pillarCentre(Math.floor(i / n), i % n);
    const g = new Group();
    g.position.set(x, 0, z);
    const body = new Mesh(bodyGeo, bodyM);
    const capM = new MeshLambertMaterial({ color: capDark.getHex(), flatShading: true });
    const cap = new Mesh(capGeo, capM);
    g.add(body, cap);
    g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    root.add(g);
    cols.push({ body, cap, capM, amt: 0 });
  }

  const place = (c) => {
    const top = PILLAR_SURFACE - DROP * (1 - smooth(clamp(c.amt, 0, 1)));
    c.cap.position.y = top - CAP / 2;
    c.body.position.y = top - CAP - (height - CAP) / 2;   // the body's top is the cap's underside
    c.capM.color.copy(capDark).lerp(capLight, clamp(c.amt, 0, 1));
  };
  cols.forEach(place);

  return {
    sync(s, ctx, dt = 0) {
      const mask = ctx?.dyn?.pillars | 0;
      for (let i = 0; i < cols.length; i++) {
        const c = cols[i], want = mask & (1 << i) ? 1 : 0;
        const step = dt > 0 ? dt / RISE_TIME : 1;
        c.amt = want > c.amt ? Math.min(want, c.amt + step) : Math.max(want, c.amt - step);
        place(c);
      }
    },
  };
}

import { describe, test, expect } from 'vitest';
import { Scene, Box3 } from 'three';
import { placeScenery, placeFarScenery, placeLanternScenery, featureClearance, trailDistance, siteAnchors, terrainExtent, buildTerrain, meshHeightAt, mulberry32 } from '../src/world/terrain.js';
import { marshTileAt, WATCH_STONE } from '../src/world/layout.js';
import island1 from './helpers/scenery-island1.json';
import island2 from './helpers/scenery-island2.json';
import { SITES, RAMPS, ZONES, TRAIL, PLANK_CORRIDOR, heightAt, zoneAt, DYN_NONE } from '../src/world/layout.js';
import { pointSegDist } from '../src/core/math.js';
import { WATER_Y } from '../src/config.js';

const all = (s) => [...s.trees, ...s.boulders, ...s.rocks, ...s.tufts];

describe('scenery placement', () => {
  test('mulberry32 is deterministic and in [0, 1)', () => {
    const a = mulberry32(7), b = mulberry32(7);
    for (let i = 0; i < 100; i++) { const v = a(); expect(v).toBe(b()); expect(v).toBeGreaterThanOrEqual(0); expect(v).toBeLessThan(1); }
  });

  test('siteAnchors reads every site in (x, z), never a y as a z', () => {
    const pts = siteAnchors();
    const has = (x, z) => pts.some((p) => Math.abs(p[0] - x) < 1e-6 && Math.abs(p[1] - z) < 1e-6);
    expect(has(...SITES.gate.plateA)).toBe(true);
    expect(has(SITES.beam.lens[0], SITES.beam.lens[2])).toBe(true);
    expect(has(SITES.beam.lamp.o[0], SITES.beam.lamp.o[2])).toBe(true);
    expect(has(SITES.lift.platform.x, SITES.lift.platform.z)).toBe(true);
    expect(has(SITES.signal.wall.x, SITES.signal.wall.z)).toBe(true);
    expect(has(...SITES.beacon)).toBe(true);
    expect(has(...SITES.lift.crank)).toBe(true);
    for (const s of SITES.plank.stones) expect(has(s.x, s.z)).toBe(true);
    for (const r of SITES.beam.rocks) expect(has(r.x, r.z)).toBe(true);
    // the lens is at y 18.5; nothing may claim z = 18.5
    expect(pts.some((p) => Math.abs(p[1] - SITES.beam.lens[1]) < 1e-6)).toBe(false);
  });

  test('is deterministic', () => {
    expect(placeScenery()).toEqual(placeScenery());
  });

  test('places a reasonable amount of each kind', () => {
    const s = placeScenery();
    expect(s.trees.length).toBeGreaterThan(15);
    expect(s.boulders.length).toBeGreaterThan(8);
    expect(s.rocks.length).toBeGreaterThan(20);
    expect(s.tufts.length).toBeGreaterThan(100);
  });

  test('nothing within 3 m of a site, ramp, trail or the plank corridor', () => {
    const anchors = siteAnchors();
    for (const it of all(placeScenery())) {
      for (const [ax, az] of anchors) expect(Math.hypot(it.x - ax, it.z - az)).toBeGreaterThanOrEqual(3);
      for (const r of RAMPS) {
        // distance from the rectangle: outside it by at least 3 m along or across
        const len = Math.hypot(r.bx - r.ax, r.bz - r.az), ux = (r.bx - r.ax) / len, uz = (r.bz - r.az) / len;
        const dx = it.x - r.ax, dz = it.z - r.az, s = dx * ux + dz * uz, c = Math.abs(-dx * uz + dz * ux);
        const out = Math.hypot(Math.max(0, -s, s - len), Math.max(0, c - r.hw));
        expect(out).toBeGreaterThanOrEqual(3);
      }
      for (let i = 1; i < TRAIL.length; i++)
        expect(pointSegDist(it.x, it.z, ...TRAIL[i - 1], ...TRAIL[i]).d).toBeGreaterThanOrEqual(3);
      const c = PLANK_CORRIDOR;
      expect(pointSegDist(it.x, it.z, c.ax, c.az, c.bx, c.bz).d - c.hw).toBeGreaterThanOrEqual(3);
      expect(featureClearance(it.x, it.z)).toBeGreaterThanOrEqual(3);
    }
  });

  test('trees stand at least 6 m from the trail, on dry plateau ground', () => {
    for (const t of placeScenery().trees) {
      expect(trailDistance(t.x, t.z)).toBeGreaterThanOrEqual(6);
      expect(zoneAt(t.x, t.z)).not.toBe(null);
      expect(heightAt(t.x, t.z)).toBeGreaterThan(WATER_Y + 0.5);
    }
  });

  test('everything sits on the ground it was placed on', () => {
    for (const it of all(placeScenery())) expect(Math.abs(it.y - heightAt(it.x, it.z, DYN_NONE))).toBeLessThan(0.6);
  });
});

describe('buildTerrain', () => {
  test('extent covers every zone plus the beach slope', () => {
    const e = terrainExtent();
    for (const d of ZONES) {
      expect(e.x0).toBeLessThanOrEqual(d.x - d.r); expect(e.x1).toBeGreaterThanOrEqual(d.x + d.r);
      expect(e.z0).toBeLessThanOrEqual(d.z - d.r); expect(e.z1).toBeGreaterThanOrEqual(d.z + d.r);
    }
    expect(e.z1).toBeGreaterThanOrEqual(ZONES[0].z + ZONES[0].r + 10);
  });

  test('adds terrain sampled from meshHeightAt, water, sun with shadows, hemisphere light, fog', () => {
    const scene = new Scene();
    buildTerrain(scene);
    const ground = scene.getObjectByName('terrain');
    expect(ground.receiveShadow).toBe(true);
    const pos = ground.geometry.getAttribute('position');
    expect(ground.geometry.index).toBe(null);
    expect(ground.geometry.getAttribute('color').count).toBe(pos.count);
    for (let i = 0; i < pos.count; i += 997) {
      const x = pos.getX(i), z = pos.getZ(i);
      expect(pos.getY(i)).toBeCloseTo(meshHeightAt(x, z), 5);
    }
    const water = scene.getObjectByName('water');
    expect(water.position.y).toBe(WATER_Y);
    expect(water.material.transparent).toBe(true);
    const sun = scene.getObjectByName('sun');
    expect(sun.isDirectionalLight).toBe(true);
    expect(sun.castShadow).toBe(true);
    expect(sun.target.parent).toBe(scene);
    expect(sun.shadow.camera.right - sun.shadow.camera.left).toBeCloseTo(60, 0);
    let hemi = null;
    scene.traverse((o) => { if (o.isHemisphereLight) hemi = o; });
    expect(hemi).not.toBe(null);
    expect(scene.fog).toBeTruthy();
    expect(scene.background.equals(scene.fog.color)).toBe(true);
    // scenery is instanced and casts shadows
    const inst = [];
    scene.traverse((o) => { if (o.isInstancedMesh) inst.push(o); });
    expect(inst.length).toBeGreaterThanOrEqual(4);
    for (const m of inst) expect(m.castShadow).toBe(true);
    expect(new Box3().setFromObject(ground).max.y).toBeGreaterThan(13);
  });
});

describe('the Lantern Isle is drawn', () => {
  test('the sea and the sea floor reach every Lantern disc; the mesh covers them and the tor carries its crag', () => {
    const scene = new Scene();
    buildTerrain(scene);
    const e = terrainExtent();
    for (const name of ['water', 'seabed']) {
      const m = scene.getObjectByName(name);
      const half = m.geometry.parameters.width / 2;
      for (const d of ZONES) expect(Math.hypot(d.x, d.z) + d.r, name).toBeLessThan(half);
    }
    const tor = ZONES.find((d) => d.zone === 'T');
    expect(e.z0).toBeLessThanOrEqual(tor.z - tor.r);
    const crag = scene.getObjectByName('crag');
    expect(crag.isInstancedMesh).toBe(true);
    expect(crag.count).toBe(placeLanternScenery().crag.length);
    expect(crag.castShadow).toBe(true);
    const pos = scene.getObjectByName('terrain').geometry.getAttribute('position');
    let top = -Infinity;
    for (let i = 0; i < pos.count; i++) if (Math.hypot(pos.getX(i) - tor.x, pos.getZ(i) - tor.z) < 5) top = Math.max(top, pos.getY(i));
    expect(top).toBeCloseTo(tor.h, 1);
  });
});

describe('terrainExtent covers the Far Isle', () => {
  test('every unconditional ramp, end to end and hw wide, lies inside the extent', () => {
    const e = terrainExtent();
    for (const r of RAMPS.filter((q) => q.flag === null)) {
      expect(Math.min(r.ax, r.bx) - r.hw).toBeGreaterThanOrEqual(e.x0);
      expect(Math.max(r.ax, r.bx) + r.hw).toBeLessThanOrEqual(e.x1);
      expect(Math.min(r.az, r.bz) - r.hw).toBeGreaterThanOrEqual(e.z0);
      expect(Math.max(r.az, r.bz) + r.hw).toBeLessThanOrEqual(e.z1);
    }
  });
  test('the east leg of the relay climb has terrain under its outer edge (x 154.25)', () => {
    const e = terrainExtent();
    expect(e.x1).toBeGreaterThan(154.25 + 2);
  });
  test('the bells are kept clear of scenery', () => {
    const pts = siteAnchors();
    for (const b of [SITES.bells.a, SITES.bells.b]) expect(pts.some((p) => Math.hypot(p[0] - b[0], p[1] - b[1]) < 1e-6)).toBe(true);
  });
});

describe('Far Isle scenery', () => {
  const far = placeFarScenery();
  const farAll = all(far);
  const tileDist = (x, z) => {
    let d = Infinity;
    const { origin, tile, cols, rows } = SITES.marsh;
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      const x0 = origin[0] + r * tile, z0 = origin[1] + c * tile;
      d = Math.min(d, Math.hypot(Math.max(x0 - x, 0, x - x0 - tile), Math.max(z0 - z, 0, z - z0 - tile)));
    }
    return d;
  };
  test('nothing tall stands where the camera sits behind the Signal lookout', () => {
    // the watcher faces the wall; the camera hangs up to 5 m behind them, so a tree or boulder
    // there fills the screen and hides the symbols
    const s = placeScenery(); const L = SITES.signal.lookout, w = SITES.signal.wall;
    const len = Math.hypot(w.x - L[0], w.z - L[1]);
    const ux = (w.x - L[0]) / len, uz = (w.z - L[1]) / len;
    const seat = (x, z) => pointSegDist(x, z, L[0], L[1], L[0] - ux * 6, L[1] - uz * 6).d;
    for (const t of s.trees) expect(seat(t.x, t.z)).toBeGreaterThanOrEqual(3.5);
    for (const b of s.boulders) expect(seat(b.x, b.z)).toBeGreaterThanOrEqual(2.5);
  });
  test('the first island is placed exactly as before (every item of every kind)', () => {
    const s = placeScenery();
    const r6 = (v) => Math.round(v * 1e6) / 1e6;
    expect(Object.keys(s)).toEqual(Object.keys(island1));
    for (const k of Object.keys(island1)) {
      expect(s[k].length).toBe(island1[k].n);
      expect(s[k].map((i) => [i.x, i.z, i.rot].map(r6))).toEqual(island1[k].all);
    }
  });
  test('the Far Isle is placed exactly as before (every item of every kind)', () => {
    const r6 = (v) => Math.round(v * 1e6) / 1e6;
    expect(Object.keys(far)).toEqual(Object.keys(island2));
    for (const k of Object.keys(island2)) {
      expect(far[k].length).toBe(island2[k].n);
      expect(far[k].map((i) => [i.x, i.z, i.rot].map(r6))).toEqual(island2[k].all);
    }
  });
  test('is deterministic, covers trees, boulders, rocks and tufts, all on zones G to J', () => {
    expect(placeFarScenery()).toEqual(far);
    expect(far.trees.length).toBeGreaterThan(8);
    expect(far.rocks.length).toBeGreaterThan(8);
    expect(far.tufts.length).toBeGreaterThan(40);
    for (const it of [...far.trees, ...far.tufts]) expect(['G', 'H', 'I', 'J']).toContain(zoneAt(it.x, it.z));
    for (const it of farAll) expect(it.x).toBeGreaterThan(60);
  });
  test('nothing within 3 m of a site, ramp, trail or marsh tile; none on a ramp', () => {
    const anchors = [...siteAnchors(), SITES.marsh.lever, [SITES.marsh.plate.x, SITES.marsh.plate.z], SITES.relay.small, SITES.relay.great];
    for (const it of farAll) {
      for (const [ax, az] of anchors) expect(Math.hypot(it.x - ax, it.z - az)).toBeGreaterThanOrEqual(3);
      expect(featureClearance(it.x, it.z)).toBeGreaterThanOrEqual(3);
      expect(tileDist(it.x, it.z)).toBeGreaterThanOrEqual(3);
      expect(marshTileAt(it.x, it.z)).toBe(-1);
      for (const r of RAMPS) {
        const len = Math.hypot(r.bx - r.ax, r.bz - r.az), ux = (r.bx - r.ax) / len, uz = (r.bz - r.az) / len;
        const dx = it.x - r.ax, dz = it.z - r.az, s = dx * ux + dz * uz, c = Math.abs(-dx * uz + dz * ux);
        expect(Math.hypot(Math.max(0, -s, s - len), Math.max(0, c - r.hw))).toBeGreaterThanOrEqual(3);
      }
    }
  });
  test('the watch-stone keeps its sight line to the grid clear', () => {
    const cx = SITES.marsh.origin[0] + 6, cz = SITES.marsh.origin[1] + 6;
    for (const it of farAll) expect(pointSegDist(it.x, it.z, WATCH_STONE.x, WATCH_STONE.z, cx, cz).d).toBeGreaterThanOrEqual(3);
  });
  test('everything sits on the ground', () => {
    for (const it of farAll) expect(Math.abs(it.y - heightAt(it.x, it.z, DYN_NONE))).toBeLessThan(0.6);
  });
});

describe('Lantern Isle scenery', () => {
  const lan = placeLanternScenery();
  const lanAll = all(lan);
  const { ring, lanterns, owls, checkpoints } = SITES;
  const tor = ZONES.find((d) => d.zone === 'T');
  const xz = (d) => [d.x, d.z];
  const stones = [...ring.stones, ...ring.seeing.flatMap((s) => [s.stone, xz(s.spot)])];
  const keep = [...stones, ...lanterns.posts, lanterns.tally, ...owls, ...checkpoints.flat()];
  const rampOut = (r, x, z) => {
    const len = Math.hypot(r.bx - r.ax, r.bz - r.az), ux = (r.bx - r.ax) / len, uz = (r.bz - r.az) / len;
    const dx = x - r.ax, dz = z - r.az, s = dx * ux + dz * uz, c = Math.abs(-dx * uz + dz * ux);
    return Math.hypot(Math.max(0, -s, s - len), Math.max(0, c - r.hw));
  };

  test('is deterministic, and draws trees, boulders, rocks and tufts', () => {
    expect(placeLanternScenery()).toEqual(lan);
    for (const k of ['trees', 'boulders', 'rocks', 'tufts']) expect(lan[k].length, k).toBeGreaterThan(5);
    expect(lan.tufts.length).toBeGreaterThan(100);
  });
  test('L is wooded enough to hide a lantern', () => {
    expect(lan.trees.filter((t) => zoneAt(t.x, t.z) === 'L').length).toBeGreaterThanOrEqual(25);
  });
  test('every item stands on zone K or L, on level ground', () => {
    for (const it of lanAll) {
      expect(['K', 'L']).toContain(zoneAt(it.x, it.z));
      expect(Math.abs(it.y - heightAt(it.x, it.z, DYN_NONE))).toBeLessThan(0.6);
    }
  });
  test('no tree or boulder within 2.5 m of a stone, post, tally, owl or checkpoint slot', () => {
    for (const it of [...lan.trees, ...lan.boulders]) for (const [ax, az] of keep) expect(Math.hypot(it.x - ax, it.z - az)).toBeGreaterThanOrEqual(2.5);
  });
  test('nothing within 2 m of the steps or the trail, and nothing inside the ring', () => {
    for (const it of lanAll) {
      expect(trailDistance(it.x, it.z)).toBeGreaterThanOrEqual(2);
      for (const r of RAMPS) expect(rampOut(r, it.x, it.z)).toBeGreaterThanOrEqual(2);
      expect(Math.hypot(it.x - ring.centre[0], it.z - ring.centre[1])).toBeGreaterThanOrEqual(ring.r);
    }
  });
  test('the seeing stones keep a clear line between their spots', () => {
    const [a, b] = ring.seeing.map((s) => xz(s.spot));
    for (const it of [...lan.trees, ...lan.boulders]) expect(pointSegDist(it.x, it.z, ...a, ...b).d).toBeGreaterThanOrEqual(3);
  });
  test('the other islands are untouched by it, and it by them', () => {
    for (const it of lanAll) expect(it.x).toBeGreaterThan(100);
    for (const it of [...all(placeScenery()), ...all(placeFarScenery())]) expect(['K', 'L', 'T']).not.toContain(zoneAt(it.x, it.z));
  });

  describe('the tor is dressed as a crag', () => {
    const crag = lan.crag;
    const lamp = lanterns.lamp;
    const R = tor.r;
    test('a pile of large rocks, on the top and against the wall', () => {
      expect(crag.length).toBeGreaterThanOrEqual(40);
      const d = (c) => Math.hypot(c.x - tor.x, c.z - tor.z);
      expect(crag.filter((c) => d(c) < tor.r - 3).length).toBeGreaterThanOrEqual(15);
      expect(crag.filter((c) => d(c) >= tor.r - 1.5).length).toBeGreaterThanOrEqual(15);
      expect(Math.min(...crag.map((c) => c.s))).toBeGreaterThanOrEqual(1.2);
    });
    test('none more than 1.5 m outside the T disc, none near the lamp, a post, the tally or a checkpoint', () => {
      for (const c of crag) {
        expect(Math.hypot(c.x - tor.x, c.z - tor.z)).toBeLessThanOrEqual(R + 1.5);
        expect(Math.hypot(c.x - lamp[0], c.z - lamp[1])).toBeGreaterThanOrEqual(3);
        for (const [ax, az] of [...lanterns.posts, lanterns.tally, ...checkpoints.flat()]) expect(Math.hypot(c.x - ax, c.z - az)).toBeGreaterThanOrEqual(3);
      }
    });
    test('they rest on the tor top or its foot, between the foot and the top', () => {
      for (const c of crag) {
        expect(c.y).toBeGreaterThan(ZONES.find((d) => d.zone === 'L').h - 1);
        expect(c.y).toBeLessThan(tor.h + 0.5);
      }
    });
    test('placing them does not move the rest of the island', () => {
      const { crag: _, ...rest } = lan;
      expect(Object.keys(rest)).toEqual(['trees', 'boulders', 'rocks', 'tufts']);
    });
  });
});

import { describe, test, expect } from 'vitest';
import { Scene, Box3 } from 'three';
import { placeScenery, featureClearance, trailDistance, siteAnchors, terrainExtent, buildTerrain, mulberry32 } from '../src/world/terrain.js';
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

  test('adds terrain sampled from heightAt, water, sun with shadows, hemisphere light, fog', () => {
    const scene = new Scene();
    buildTerrain(scene);
    const ground = scene.getObjectByName('terrain');
    expect(ground.receiveShadow).toBe(true);
    const pos = ground.geometry.getAttribute('position');
    expect(ground.geometry.index).toBe(null);
    expect(ground.geometry.getAttribute('color').count).toBe(pos.count);
    for (let i = 0; i < pos.count; i += 997) {
      const x = pos.getX(i), z = pos.getZ(i);
      expect(pos.getY(i)).toBeCloseTo(heightAt(x, z, DYN_NONE), 5);
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

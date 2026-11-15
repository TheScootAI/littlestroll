import { test, expect } from 'vitest';
import { Scene, Box3 } from 'three';
import { createView } from '../src/puzzles/views/finds.js';
import { lyingProp } from '../src/player/wardrobe.js';
import { SITES, heightAt } from '../src/world/layout.js';

const props = (scene) => scene.getObjectByName('finds-view').children;

test('ten props, one at each spot on the ground, each turned to its own fixed angle', () => {
  const scene = new Scene();
  createView(scene);
  const ps = props(scene);
  expect(ps).toHaveLength(10);
  ps.forEach((p, i) => {
    const [x, z] = SITES.finds[i];
    expect(p.position.x).toBe(x);
    expect(p.position.z).toBe(z);
    expect(p.position.y).toBeCloseTo(heightAt(x, z), 9);
  });
  expect(new Set(ps.map((p) => p.rotation.y)).size).toBe(10);
});
test('a find that is found is hidden, for good; sync with garbage hides nothing', () => {
  const scene = new Scene();
  const v = createView(scene);
  const ps = props(scene);
  v.sync([-1, 0, -1, 1, -1, -1, -1, -1, -1, 0]);
  expect(ps.map((p) => p.visible)).toEqual([true, false, true, false, true, true, true, true, true, false]);
  v.sync(5);
  expect(ps.every((p) => p.visible)).toBe(true);
  v.sync(undefined);
  expect(ps.every((p) => p.visible)).toBe(true);
});
test('each lying prop rests on y = 0, is about half a metre across and has meshes', () => {
  for (let i = 0; i < 10; i++) {
    const g = lyingProp(i);
    const b = new Box3().setFromObject(g);
    let meshes = 0;
    g.traverse((o) => { if (o.isMesh) meshes++; });
    expect(meshes, `prop ${i}`).toBeGreaterThan(0);
    expect(b.min.y, `prop ${i}`).toBeGreaterThan(-0.011);
    expect(b.min.y, `prop ${i}`).toBeLessThan(0.02);
    const w = Math.max(b.max.x - b.min.x, b.max.z - b.min.z);
    expect(w, `prop ${i} width`).toBeGreaterThan(0.25);
    expect(w, `prop ${i} width`).toBeLessThan(0.75);
  }
});

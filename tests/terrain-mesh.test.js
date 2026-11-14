import { test, expect } from 'vitest';
import { meshHeightAt } from '../src/world/terrain.js';
import { heightAt, SITES, WATCH_STONE, DYN_NONE } from '../src/world/layout.js';

// A built top (the lift's deck, the watch-stone's cap) is drawn at the height a walker stands
// on it. If the ground mesh is drawn at that same height the two flicker through each other.

test('the ground mesh is sunk below the lift deck everywhere inside its edge', () => {
  const P = SITES.lift.platform;
  for (let x = P.x - P.hw + 0.5; x <= P.x + P.hw - 0.5; x += 0.5) {
    for (let z = P.z - P.hd + 0.5; z <= P.z + P.hd - 0.5; z += 0.5) {
      expect(meshHeightAt(x, z)).toBeLessThanOrEqual(SITES.lift.low - 0.3);
    }
  }
});

test('the ground mesh meets the surrounding ground at the lift deck edge', () => {
  const P = SITES.lift.platform;
  expect(meshHeightAt(P.x - P.hw, P.z)).toBe(heightAt(P.x - P.hw, P.z, DYN_NONE));
  expect(meshHeightAt(P.x - P.hw - 0.5, P.z)).toBe(heightAt(P.x - P.hw - 0.5, P.z, DYN_NONE));
});

test('the ground mesh is sunk below the watch-stone cap across its whole top', () => {
  const W = WATCH_STONE;
  for (let x = W.x - W.r; x <= W.x + W.r; x += 0.5) {
    for (let z = W.z - W.r; z <= W.z + W.r; z += 0.5) {
      if (Math.hypot(x - W.x, z - W.z) > W.r) continue;
      expect(meshHeightAt(x, z)).toBeLessThanOrEqual(W.h - 0.2);
    }
  }
});

test('everywhere else the ground mesh is the ground', () => {
  for (const [x, z] of [[0, 124], [0, 76], [6, -50], [80, -56], [96, -56], [107, -56], [130, -60]]) {
    expect(meshHeightAt(x, z)).toBe(heightAt(x, z, DYN_NONE));
  }
});

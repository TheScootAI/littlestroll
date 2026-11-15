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

// Issue 12: at the deck's edge the ground undulates up to 8 cm above the deck's top, and showed
// through it at the corners where the ropes come down. The ground is drawn just under the deck's
// top along the edge and for half a metre out; a metre out it is the real ground again.
test('round the lift deck the ground is drawn below the deck\'s top, and is itself again a metre out', () => {
  const P = SITES.lift.platform, low = SITES.lift.low;
  let ring = 0;
  for (let x = P.x - P.hw - 0.5; x <= P.x + P.hw + 0.5 + 1e-9; x += 0.5) {
    for (let z = P.z - P.hd - 0.5; z <= P.z + P.hd + 0.5 + 1e-9; z += 0.5) {
      if (Math.abs(x - P.x) < P.hw - 1e-6 && Math.abs(z - P.z) < P.hd - 1e-6) continue;   // inside: the test above
      const h = heightAt(x, z, DYN_NONE);
      if (Math.abs(h - low) > 0.3) { expect(meshHeightAt(x, z)).toBe(h); continue; }      // the cliff behind, the sea: untouched
      ring++;
      expect(meshHeightAt(x, z), `(${x}, ${z})`).toBeLessThanOrEqual(low - 0.04);
      expect(meshHeightAt(x, z)).toBeGreaterThan(low - 0.2);                             // a dip, not a trench
    }
  }
  expect(ring).toBeGreaterThan(20);
  expect(meshHeightAt(P.x - P.hw - 1, P.z)).toBe(heightAt(P.x - P.hw - 1, P.z, DYN_NONE));
  expect(meshHeightAt(P.x, P.z + P.hd + 1)).toBe(heightAt(P.x, P.z + P.hd + 1, DYN_NONE));
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

import { describe, test, expect } from 'vitest';
import { aimPoint, edgeArrow } from '../src/world/sight.js';
import { heightAt, SITES } from '../src/world/layout.js';

describe('aimPoint', () => {
  test('aiming down at flat ground lands on it at the expected distance', () => {
    const [x, z] = SITES.spawn[0];
    const h = heightAt(x, z);
    const o = [x, h + 3, z];
    const dir = [0, -1, 0];
    const p = aimPoint(o, dir, {});
    expect(p[0]).toBeCloseTo(x, 6);
    expect(p[2]).toBeCloseTo(z, 6);
    // first 0.5 m step at or below the ground: within one step of the surface
    expect(p[1]).toBeLessThanOrEqual(heightAt(p[0], p[2]) + 1e-9);
    expect(p[1]).toBeGreaterThan(h - 0.5 - 1e-9);
    expect(o[1] - p[1]).toBeGreaterThanOrEqual(3 - 0.1);
    expect(o[1] - p[1]).toBeLessThanOrEqual(3.5 + 0.1);
  });

  test('aiming at the sky returns the 40 m point', () => {
    const p = aimPoint([0, 2, 124], [0, 1, 0], {});
    expect(p[0]).toBeCloseTo(0, 6);
    expect(p[1]).toBeCloseTo(42, 6);
    expect(p[2]).toBeCloseTo(124, 6);
  });

  test('a level ray over open ground stops at maxDist', () => {
    const p = aimPoint([0, 30, 124], [0, 0, -1], {}, 10);
    expect(p).toEqual([0, 30, 114]);
  });
});

describe('edgeArrow', () => {
  const from = [0, 0];
  test('straight ahead is 0 (yaw 0 faces -Z)', () => {
    expect(edgeArrow(0, from, [0, -10])).toBeCloseTo(0, 6);
  });
  test('to the right is +pi/2', () => {
    expect(edgeArrow(0, from, [10, 0])).toBeCloseTo(Math.PI / 2, 6);
  });
  test('behind is +-pi', () => {
    expect(Math.abs(edgeArrow(0, from, [0, 10]))).toBeCloseTo(Math.PI, 6);
  });
  test('to the left is -pi/2', () => {
    expect(edgeArrow(0, from, [-10, 0])).toBeCloseTo(-Math.PI / 2, 6);
  });
  test('turning the camera right (yaw down) makes a point on the old right ahead', () => {
    expect(edgeArrow(-Math.PI / 2, from, [10, 0])).toBeCloseTo(0, 6);
  });
});

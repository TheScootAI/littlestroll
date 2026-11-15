import { test, expect } from 'vitest';
import { DYN_NONE, SITES, RAMPS, blockers, zoneAt, heightAt } from '../src/world/layout.js';
import { reachable } from './helpers/reach.js';
import { pointSegDist } from '../src/core/math.js';

const D = (o) => ({ ...DYN_NONE, ...o });
const spur = RAMPS.find((r) => r.from === 'B' && r.to === 'C');
const { plate, barrier, lookout } = SITES.signal;
const B = [0, 76];

test('DYN_NONE has the spur barrier down', () => { expect(DYN_NONE.spur).toBe(false); });
test('the lookout is reachable from B with the barrier down, and neither way with it up', () => {
  const open = D({ gateOpen: true });
  expect(reachable(B, open)(...lookout)).toBe(true);
  const up = D({ gateOpen: true, spur: true });
  expect(reachable(B, up)(...lookout)).toBe(false);
  const fromLookout = reachable(lookout, up);
  expect(fromLookout(...B)).toBe(false);
  expect(fromLookout(-9, 66)).toBe(false);
  expect(fromLookout(...SITES.signal.dials[0])).toBe(false);
});
test('the plate is on the lookout terrace, level, and well clear of the barrier', () => {
  expect(plate).toEqual({ x: lookout[0], z: lookout[1], r: 1.5 });
  expect(zoneAt(plate.x, plate.z)).toBe('C');
  for (let a = 0; a < Math.PI * 2; a += Math.PI / 4)
    expect(zoneAt(plate.x + Math.cos(a) * plate.r, plate.z + Math.sin(a) * plate.r)).toBe('C');
  const hs = [0, 1, 2, 3].map((k) => heightAt(plate.x + Math.cos(k * 1.57) * plate.r, plate.z + Math.sin(k * 1.57) * plate.r));
  expect(Math.max(...hs) - Math.min(...hs)).toBeLessThan(0.2);
  expect(pointSegDist(plate.x, plate.z, barrier.ax, barrier.az, barrier.bx, barrier.bz).d).toBeGreaterThanOrEqual(6);
});
test('the barrier crosses the spur at right angles, full width plus 0.3 m a side, 3 m up from B', () => {
  const ux = (spur.bx - spur.ax), uz = (spur.bz - spur.az), len = Math.hypot(ux, uz);
  const dir = [ux / len, uz / len];
  const dx = barrier.bx - barrier.ax, dz = barrier.bz - barrier.az, bl = Math.hypot(dx, dz);
  expect(Math.abs(dx * dir[0] + dz * dir[1])).toBeLessThan(1e-9);
  expect(bl).toBeCloseTo(2 * (spur.hw + 0.3));
  const mx = (barrier.ax + barrier.bx) / 2, mz = (barrier.az + barrier.bz) / 2;
  const s = (mx - spur.ax) * dir[0] + (mz - spur.az) * dir[1];
  expect(Math.abs((mx - spur.ax) * -dir[1] + (mz - spur.az) * dir[0])).toBeLessThan(1e-9);
  expect(s).toBeGreaterThanOrEqual(3); expect(s).toBeLessThanOrEqual(len);
  // ground off both ends of the barrier is too low to walk
  for (const [x, z] of [[barrier.ax, barrier.az], [barrier.bx, barrier.bz]]) expect(heightAt(x, z)).toBeLessThan(0);
});
test('blockers carries the barrier only while it is up', () => {
  const has = (b) => b.segments.some((s) => s.ax === barrier.ax && s.az === barrier.az && s.bx === barrier.bx && s.bz === barrier.bz);
  expect(has(blockers(D({ spur: true })))).toBe(true);
  expect(has(blockers(DYN_NONE))).toBe(false);
});

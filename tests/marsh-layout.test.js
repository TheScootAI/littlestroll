import { test, expect } from 'vitest';
import { DYN_NONE, SITES, WATCH_STONE, blockers } from '../src/world/layout.js';
import { reachable } from './helpers/reach.js';
import { pointSegDist } from '../src/core/math.js';
import { createPlayer, stepPlayer } from '../src/player/controller.js';
import { obstacles } from '../src/world/solids.js';

const D = (o) => ({ ...DYN_NONE, ...o });
const { plate, rail, barrier } = SITES.marsh;
const ctr = [WATCH_STONE.x, WATCH_STONE.z];
const H_SPOT = [96, -56];                // on H, below the ramp's foot
const same = (a, b) => a.ax === b.ax && a.az === b.az && a.bx === b.bx && a.bz === b.bz;

test('DYN_NONE has the watch-stone barrier down', () => { expect(DYN_NONE.watch).toBe(false); });
test('the railing: 13 segments of a 14-sided ring of radius 2.3, open on the ramp side; the barrier closes it', () => {
  expect(rail).toHaveLength(13);
  const dz = 1.5, dx = Math.sqrt(2.3 ** 2 - dz ** 2);
  expect(barrier.ax).toBeCloseTo(ctr[0] - dx, 9); expect(barrier.bx).toBeCloseTo(ctr[0] - dx, 9);
  expect(barrier.az).toBeCloseTo(-57.5, 9); expect(barrier.bz).toBeCloseTo(-54.5, 9);
  expect(rail[0].ax).toBeCloseTo(barrier.bx, 9); expect(rail[0].az).toBeCloseTo(barrier.bz, 9);
  expect(rail[12].bx).toBeCloseTo(barrier.ax, 9); expect(rail[12].bz).toBeCloseTo(barrier.az, 9);
  const lens = [];
  for (let i = 0; i < 13; i++) {
    const s = rail[i];
    expect(Math.hypot(s.ax - ctr[0], s.az - ctr[1])).toBeCloseTo(2.3, 9);
    expect(Math.hypot(s.bx - ctr[0], s.bz - ctr[1])).toBeCloseTo(2.3, 9);
    if (i) { expect(s.ax).toBeCloseTo(rail[i - 1].bx, 9); expect(s.az).toBeCloseTo(rail[i - 1].bz, 9); }
    lens.push(Math.hypot(s.bx - s.ax, s.bz - s.az));
  }
  for (const l of lens) expect(l).toBeCloseTo(lens[0], 9);
});
test('blockers: the railing always, the barrier only with watch', () => {
  for (const b of [blockers(DYN_NONE), blockers(D({ watch: false }))]) {
    for (const s of rail) expect(b.segments.some((q) => same(q, s))).toBe(true);
    expect(b.segments.some((q) => same(q, barrier))).toBe(false);
  }
  const up = blockers(D({ watch: true }));
  for (const s of rail) expect(up.segments.some((q) => same(q, s))).toBe(true);
  expect(up.segments.some((q) => same(q, barrier))).toBe(true);
});
test('with the barrier up nothing off the stone is reachable from the plate, nor the plate from H; down, both are, only through the opening', () => {
  const up = D({ watch: true });
  const fromPlate = reachable([plate.x, plate.z], up);
  expect(fromPlate(...H_SPOT)).toBe(false);
  expect(fromPlate(97, -56)).toBe(false);
  expect(reachable(H_SPOT, up)(plate.x, plate.z)).toBe(false);
  const down = D({ watch: false });
  expect(reachable([plate.x, plate.z], down)(...H_SPOT)).toBe(true);
  expect(reachable(H_SPOT, down)(plate.x, plate.z)).toBe(true);
  // the barrier is the opening shut: the railing alone leaves exactly that gap
  expect(fromPlate(plate.x, plate.z)).toBe(true);
});
test('at least half the plate is at least 0.9 m from the barrier', () => {
  let ok = 0, all = 0;
  for (let x = plate.x - plate.r; x <= plate.x + plate.r; x += 0.05) for (let z = plate.z - plate.r; z <= plate.z + plate.r; z += 0.05) {
    if (Math.hypot(x - plate.x, z - plate.z) > plate.r) continue;
    all++;
    if (pointSegDist(x, z, barrier.ax, barrier.az, barrier.bx, barrier.bz).d >= 0.9) ok++;
  }
  expect(ok / all).toBeGreaterThanOrEqual(0.5);
});
test('pushed in 16 directions for 5 s, running and hopping, a walker never leaves the stone with the barrier up', () => {
  const dyn = D({ watch: true });
  const world = obstacles(dyn);
  for (let k = 0; k < 16; k++) {
    const a = (k / 16) * Math.PI * 2;
    const p = createPlayer(plate.x, plate.z);
    p.y = WATCH_STONE.h;
    let jump = 0;
    for (let n = 0; n < 150; n++) {
      if (n % 15 === 0) jump++;
      stepPlayer(p, { camYaw: 0, mx: Math.cos(a), mz: -Math.sin(a), run: true, jumpN: jump }, 1 / 30, dyn, null, world);
      expect(Math.hypot(p.x - ctr[0], p.z - ctr[1]), `dir ${k} step ${n}`).toBeLessThanOrEqual(2.3);
      expect(p.y).toBeGreaterThanOrEqual(WATCH_STONE.h - 0.01);
    }
  }
});

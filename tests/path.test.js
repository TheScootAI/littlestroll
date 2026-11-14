import { describe, it, expect } from 'vitest';
import { findPath, clearanceAt, steer } from '../src/debug/path.js';
import { SITES, DYN_NONE, RAMPS, heightAt, blockers } from '../src/world/layout.js';
import { createPlayer, stepPlayer, needsRespawn } from '../src/player/controller.js';
import { DROWN_Y, STEP_UP, PLAYER_R } from '../src/config.js';
import { pointSegDist } from '../src/core/math.js';

const spawn = SITES.spawn[0];
const open = { ...DYN_NONE, gateOpen: true };

const clearOf = (bl, x, z) =>
  bl.circles.every((c) => Math.hypot(x - c.x, z - c.z) >= c.r + PLAYER_R - 1e-6) &&
  bl.segments.every((s) => pointSegDist(x, z, s.ax, s.az, s.bx, s.bz).d >= PLAYER_R - 1e-6);

// every 0.25 m along a→b obeys the walker's rule
function walkable(a, b, dyn) {
  const bl = blockers(dyn);
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const n = Math.max(1, Math.ceil(len / 0.25));
  let prev = heightAt(a[0], a[1], dyn);
  for (let i = 1; i <= n; i++) {
    const x = a[0] + ((b[0] - a[0]) * i) / n, z = a[1] + ((b[1] - a[1]) * i) / n;
    const h = heightAt(x, z, dyn);
    if (!(h > DROWN_Y) || h - prev > STEP_UP + 1e-9 || !clearOf(bl, x, z)) return false;
    prev = h;
  }
  return true;
}

describe('findPath', () => {
  it('spawn to plate A', () => {
    const p = findPath(spawn, SITES.gate.plateA, DYN_NONE);
    expect(p).not.toBeNull();
    expect(p[0]).toEqual(spawn);
    expect(p.at(-1)).toEqual(SITES.gate.plateA);
    expect(p.length).toBeLessThan(80);
  });

  it('plate B is behind the shut gate, reachable once open', () => {
    expect(findPath(spawn, SITES.gate.plateB, DYN_NONE)).toBeNull();
    const p = findPath(spawn, SITES.gate.plateB, open);
    expect(p).not.toBeNull();
    expect(p.at(-1)).toEqual(SITES.gate.plateB);
  });

  it('every leg is walkable and the path ends on the target', () => {
    for (const [from, to, dyn] of [
      [spawn, SITES.gate.plateA, DYN_NONE],
      [spawn, SITES.gate.plateB, open],
      [[0, 76], SITES.signal.lookout, open],
      [[0, 76], SITES.signal.dials[0], open],
    ]) {
      const p = findPath(from, to, dyn);
      expect(p).not.toBeNull();
      expect(p.at(-1)).toEqual(to);
      for (let i = 1; i < p.length; i++) expect(walkable(p[i - 1], p[i], dyn)).toBe(true);
    }
  });

  it('the crank to the post needs the ladder', () => {
    expect(findPath(SITES.lift.crank, SITES.lift.post, DYN_NONE)).toBeNull();
    const dyn = { ...DYN_NONE, ladder: true };
    const p = findPath(SITES.lift.crank, SITES.lift.post, dyn);
    expect(p).not.toBeNull();
    expect(p.at(-1)).toEqual(SITES.lift.post);
    for (let i = 1; i < p.length; i++) expect(walkable(p[i - 1], p[i], dyn)).toBe(true);
  });

  it('with the plank laid the path crosses the span', () => {
    const from = SITES.plank.slot, to = [6, -20];
    expect(findPath(from, to, DYN_NONE)).toBeNull();
    const dyn = { ...DYN_NONE, plank: true };
    const p = findPath(from, to, dyn);
    expect(p).not.toBeNull();
    expect(p.at(-1)).toEqual(to);
    const { ax, az, bx, bz } = SITES.plank.span;
    let crossed = false;
    for (let i = 1; i < p.length; i++) {
      expect(walkable(p[i - 1], p[i], dyn)).toBe(true);
      const mid = [(p[i - 1][0] + p[i][0]) / 2, (p[i - 1][1] + p[i][1]) / 2];
      if (pointSegDist(mid[0], mid[1], ax, az, bx, bz).d < 1) crossed = true;
    }
    expect(crossed).toBe(true);
  });

  it('threads the stones the whole way from the bridge to the slot', () => {
    const dyn = { ...DYN_NONE, bridge: true, gateOpen: true };
    const p = findPath(SITES.plank.restA, SITES.plank.slot, dyn);
    expect(p).not.toBeNull();
    for (let i = 1; i < p.length; i++) expect(walkable(p[i - 1], p[i], dyn)).toBe(true);
  });

  it('is quick', () => {
    const t = performance.now();
    findPath(spawn, [0, -64], { ...open, bridge: true, plank: true, ladder: true });
    findPath(spawn, SITES.gate.plateB, DYN_NONE);
    expect(performance.now() - t).toBeLessThan(200);
  });
});

// ------------------------------------------------------------------ clearance from drop-offs

const spur = RAMPS.find((r) => r.from === 'B' && r.to === 'C');   // centre z = 66, x -9 .. -27.5

// every point every 0.1 m along the route
function samples(p) {
  const out = [];
  for (let i = 1; i < p.length; i++) {
    const [ax, az] = p[i - 1], [bx, bz] = p[i];
    const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / 0.1));
    for (let k = 0; k <= n; k++) out.push([ax + ((bx - ax) * k) / n, az + ((bz - az) * k) / n]);
  }
  return out;
}

describe('clearance', () => {
  it('clearanceAt is wide on the spur ramp centre line and thin at its edge', () => {
    const dyn = { ...open };
    const midX = (spur.ax + spur.bx) / 2;
    expect(clearanceAt(midX, spur.az, dyn)).toBeGreaterThanOrEqual(1.2);
    expect(clearanceAt(midX, 67.2, dyn)).toBeLessThan(0.5);
  });

  it('the route up the spur ramp keeps to its centre line (the reported cliff fall)', () => {
    const dyn = { gateOpen: true, bridge: false, plank: false, lift: 0, ladder: false };
    const p = findPath([0.5, 83.35], SITES.signal.lookout, dyn);
    expect(p).not.toBeNull();
    expect(p.at(-1)).toEqual(SITES.signal.lookout);
    const off = samples(p).filter(([x]) => x <= -11 && x >= -25).map(([, z]) => Math.abs(z - spur.az));
    expect(off.length).toBeGreaterThan(50);
    expect(Math.max(...off)).toBeLessThanOrEqual(0.4);
  });
});

// ------------------------------------------------------------------ the pilot, simulated

// Drive a real walker along findPath with steer, exactly as pilot.js does each update:
// steer first, then stepPlayer with the same dt.
function drive(from, to, dyn, dt) {
  const path = findPath(from, to, dyn);
  if (!path) return { error: 'no-path' };
  const p = createPlayer(from[0], from[1]);
  p.y = heightAt(from[0], from[1], dyn);
  let i = 1;
  const steps = Math.ceil(90 / dt);
  for (let k = 0; k < steps; k++) {
    const s = steer({ x: p.x, z: p.z }, path, i, { dyn, run: true, within: 0.4 });
    i = s.i;
    if (s.done) return { arrived: Math.hypot(p.x - to[0], p.z - to[1]) <= 0.4, at: [p.x, p.z], k };
    const g0 = heightAt(p.x, p.z, dyn);
    const before = [p.x, p.z];
    stepPlayer(p, { mx: 0, mz: s.mz, run: s.run, camYaw: s.camYaw }, dt, dyn);
    const g1 = heightAt(p.x, p.z, dyn);
    if (needsRespawn(p, dyn)) return { error: 'fell', from: before, at: [p.x, p.z], k, path };
    if (g0 - g1 > 0.6) return { error: 'dropped', drop: g0 - g1, from: before, at: [p.x, p.z], k, path };
  }
  return { error: 'timeout', at: [p.x, p.z], i, path };
}

const D0 = DYN_NONE;
const D1 = { ...DYN_NONE, gateOpen: true };
const D2 = { ...D1, bridge: true };
const D3 = { ...D2, plank: true };
const D4 = { ...D3, ladder: true };
const dialC = [SITES.signal.dialZone.x, SITES.signal.dialZone.z];
const platC = [SITES.lift.platform.x, SITES.lift.platform.z];
const LEGS = [
  ['spawn -> plateA', SITES.spawn[0], SITES.gate.plateA, D0],
  ['plateA -> plateB', SITES.gate.plateA, SITES.gate.plateB, D1],
  ['checkpoint 1 -> lookout', SITES.checkpoints[1][1], SITES.signal.lookout, D1],
  ['lookout -> dial zone', SITES.signal.lookout, dialC, D1],
  ['dial zone -> rest A', dialC, SITES.plank.restA, D2],
  ['rest A -> slot', SITES.plank.restA, SITES.plank.slot, D2],
  ['slot -> crank', SITES.plank.slot, SITES.lift.crank, D3],
  ['crank -> platform', SITES.lift.crank, platC, D3],
  ['crank -> post', SITES.lift.crank, SITES.lift.post, D4],
  ['post -> mirror 0', SITES.lift.post, SITES.beam.mirrors[0], D4],
  ['mirror 0 -> hint p1', SITES.beam.mirrors[0], SITES.beam.hint.p1, D4],
  ['hint p2 -> mirror 1', SITES.beam.hint.p2, SITES.beam.mirrors[1], D4],
  // reverses
  ['lookout -> checkpoint 1', SITES.signal.lookout, SITES.checkpoints[1][1], D1],
  ['crank -> slot', SITES.lift.crank, SITES.plank.slot, D3],
  ['post -> crank', SITES.lift.post, SITES.lift.crank, D4],
];

describe('simulated pilot never falls', () => {
  for (const dt of [1 / 60, 1 / 30, 0.1]) {
    for (const [name, from, to, dyn] of LEGS) {
      it(`${name} at dt ${dt.toFixed(3)}`, () => {
        const r = drive(from, to, dyn, dt);
        expect(r.error, JSON.stringify({ ...r, path: r.path && r.path.map((q) => q.map((v) => +v.toFixed(2))) })).toBeUndefined();
        expect(r.arrived).toBe(true);
      });
    }
  }
});

describe('steer', () => {
  it('walks, not runs, where clearance is thin and near sharp turns', () => {
    const dyn = { ...open };
    const path = [[-10, 66], [-20, 66], [-20, 70]];
    // on the ramp centre, far from the turn: may run
    expect(steer({ x: -16, z: 66 }, path, 1, { dyn, run: true }).run).toBe(true);
    // near the ramp edge: walk
    expect(steer({ x: -16, z: 67.1 }, path, 1, { dyn, run: true }).run).toBe(false);
    // within 1.5 m of a 90° turn: walk
    expect(steer({ x: -19, z: 66 }, path, 1, { dyn, run: true }).run).toBe(false);
  });
});

import { describe, test, expect } from 'vitest';
import { createPlayer, stepPlayer, needsRespawn, respawn } from '../src/player/controller.js';
import { SITES, DYN_NONE, RAMPS, zoneAt, heightAt } from '../src/world/layout.js';
import { WALK, RUN, STEP_UP, PLAYER_R } from '../src/config.js';
import { SOLIDS } from '../src/world/solids.js';

const fwd = { mx: 0, mz: 1, run: false, camYaw: 0 };
const run = (p, input, secs, dyn = DYN_NONE, veto) => { for (let i = 0; i < Math.round(secs * 60); i++) stepPlayer(p, input, 1 / 60, dyn, veto); };

describe('controller', () => {
  test('walks at WALK and runs at RUN', () => {
    const [x, z] = SITES.spawn[0];
    const a = createPlayer(x, z); run(a, { ...fwd, camYaw: Math.PI }, 1);
    expect(a.dist).toBeCloseTo(3.2, 1);
    const b = createPlayer(x, z); run(b, { ...fwd, camYaw: Math.PI, run: true }, 1);
    expect(b.dist).toBeCloseTo(5.5, 1);
  });

  test('diagonal input moves at full WALK speed, partial stick at proportional speed', () => {
    const [x, z] = SITES.spawn[0];
    const d = createPlayer(x, z); run(d, { mx: 1, mz: 1, run: false, camYaw: Math.PI }, 1);
    expect(d.dist).toBeCloseTo(3.2, 1);
    expect(Math.hypot(d.x - x, d.z - z)).toBeCloseTo(3.2, 1);
    const h = createPlayer(x, z); run(h, { mx: 0.5, mz: 0, run: false, camYaw: Math.PI }, 1);
    expect(h.dist).toBeCloseTo(1.6, 1);
  });

  test('a closed gate stops a walker and an open one does not', () => {
    const { door, plateA, plateB } = SITES.gate;
    const head = Math.atan2(-(plateB[0] - plateA[0]), -(plateB[1] - plateA[1]));
    const secs = Math.hypot(plateB[0] - plateA[0], plateB[1] - plateA[1]) / WALK + 0.5;
    const shut = createPlayer(...plateA); run(shut, { ...fwd, camYaw: head }, secs);
    expect(zoneAt(shut.x, shut.z)).not.toBe('B');
    expect(shut.z).toBeGreaterThan(door.az);          // still on plateA's side of the door
    const open = createPlayer(...plateA); run(open, { ...fwd, camYaw: head }, secs, { ...DYN_NONE, gateOpen: true });
    expect(zoneAt(open.x, open.z)).toBe('B');
  });

  test('walking diagonally into the closed gate slides along it', () => {
    const p = createPlayer(0, 100);
    run(p, { ...fwd, camYaw: -Math.PI / 4 }, 1);
    expect(p.x).toBeGreaterThan(1);
    expect(p.z).toBeGreaterThan(SITES.gate.door.az);
  });

  test('a walker inside a closed gate can walk out', () => {
    const a = createPlayer(0, 97); run(a, fwd, 1);                       // north
    expect(a.z).toBeLessThan(96);
    const b = createPlayer(0, 97); run(b, { ...fwd, camYaw: Math.PI }, 1); // south
    expect(b.z).toBeGreaterThan(98);
  });

  test('dist does not grow when a move is refused', () => {
    const p = createPlayer(0, 100);
    run(p, fwd, 3);
    const d = p.dist;
    run(p, fwd, 1);
    expect(p.dist).toBeCloseTo(d, 6);
    const q = createPlayer(...SITES.spawn[0]); run(q, fwd, 1, DYN_NONE, () => true);
    expect(q.dist).toBe(0);
  });

  test('veto blocks a move', () => {
    const p = createPlayer(...SITES.spawn[0]); const x0 = p.x, z0 = p.z;
    run(p, fwd, 1, DYN_NONE, () => true);
    expect([p.x, p.z]).toEqual([x0, z0]);
  });

  test('walking into the sea asks for a respawn, and respawn lands on the checkpoint', () => {
    const p = createPlayer(...SITES.spawn[0]);
    run(p, { ...fwd, camYaw: Math.PI, run: true }, 60);
    expect(needsRespawn(p, DYN_NONE)).toBe(true);
    respawn(p, 0, 1);
    expect([p.x, p.z]).toEqual(SITES.checkpoints[0][1]);
    expect(needsRespawn(p, DYN_NONE)).toBe(false);
  });

  test('a rider follows the lift up and back down without falling through', () => {
    const { platform, low, high } = SITES.lift;
    const p = createPlayer(platform.x, platform.z);
    const idle = { mx: 0, mz: 0, run: false, camYaw: 0 };
    for (let i = 0; i <= 50; i++) { const f = i / 50; stepPlayer(p, idle, 1 / 30, { ...DYN_NONE, lift: f }); }
    expect(p.y).toBeCloseTo(high, 1);
    for (let i = 50; i >= 0; i--) { const f = i / 50; for (let k = 0; k < 4; k++) stepPlayer(p, idle, 1 / 30, { ...DYN_NONE, lift: f }); }
    expect(p.y).toBeCloseTo(low, 1);
  });

  test('a long frame on the ladder still climbs', () => {
    const r = RAMPS.find((q) => q.flag === 'ladder');
    const dyn = { ...DYN_NONE, ladder: true };
    const p = createPlayer(r.ax, r.az - 1.2);     // 1.2 m along the ramp: past the flat pad
    p.y = heightAt(p.x, p.z, dyn);
    const z0 = p.z, y0 = p.y;
    stepPlayer(p, { mx: 0, mz: 1, run: true, camYaw: 0 }, 0.1, dyn);
    expect(z0 - p.z).toBeGreaterThan(0.5);
    expect(p.y - y0).toBeGreaterThan(0.3);
  });

  test('a rise above STEP_UP is refused, a drop is not', () => {
    const north = { mx: 0, mz: 1, run: true, camYaw: 0 };
    const up = createPlayer(11, -28.5);                       // on E, the ladder is down
    run(up, north, 2);
    expect(up.y).toBeLessThan(8.5 + STEP_UP);
    const down = createPlayer(11, -36);                       // on F, just above the cliff
    run(down, { ...north, camYaw: Math.PI }, 2);
    expect(down.y).toBeLessThan(9);
    expect(down.z).toBeGreaterThan(-30);
  });
});

// ---- trees and boulders are solid
// A solid of `kind` with open, level ground all round it (so only it decides what a walker does).
const lone = (kind) => SOLIDS.find((s) => {
  if (s.kind !== kind) return false;
  if (SOLIDS.some((o) => o !== s && Math.hypot(o.x - s.x, o.z - s.z) < 5)) return false;
  const h = heightAt(s.x, s.z, DYN_NONE);
  for (let k = 0; k < 24; k++) for (const d of [1, 2, 3, 4, 5]) {
    const x = s.x + d * Math.cos(k * Math.PI / 12), z = s.z + d * Math.sin(k * Math.PI / 12);
    if (Math.abs(heightAt(x, z, DYN_NONE) - h) > 0.3) return false;
  }
  return true;
});
// camYaw = PI makes (mx, mz) read as world (-x, +z)
const toward = (ux, uz) => ({ mx: -ux, mz: uz, run: false, camYaw: Math.PI });

describe.each(['boulder', 'pine', 'round'])('a %s is solid', (kind) => {
  const s = lone(kind);
  const lim = s?.r + PLAYER_R;
  test('there is one with clear level ground round it to test on', () => { expect(s).toBeTruthy(); });
  test('walking straight at it stops at r + PLAYER_R from its centre', () => {
    const p = createPlayer(s.x, s.z - 5);
    run(p, toward(0, 1), 4);
    expect(Math.hypot(p.x - s.x, p.z - s.z)).toBeGreaterThan(lim - 0.05);
    expect(Math.hypot(p.x - s.x, p.z - s.z)).toBeLessThan(lim + 0.05);
    expect(p.z).toBeLessThan(s.z);
  });
  const aslant = toward(0.06 * lim, 1);   // would pass the centre line 0.5 lim off it: straight into the solid
  test('walking at it off-centre slides round and ends up past it', () => {
    const p = createPlayer(s.x + 0.2 * lim, s.z - 5);
    run(p, aslant, 12);
    expect(p.z).toBeGreaterThan(s.z + lim);
    let min = Infinity;
    const q = createPlayer(s.x + 0.2 * lim, s.z - 5);
    for (let i = 0; i < 720; i++) { stepPlayer(q, aslant, 1 / 60, DYN_NONE); min = Math.min(min, Math.hypot(q.x - s.x, q.z - s.z)); }
    expect(min).toBeGreaterThan(lim - 1e-6);
  });
  test('a walker put at its centre can walk out any of eight ways, and standing still moves nobody', () => {
    const idle = createPlayer(s.x, s.z);
    run(idle, { mx: 0, mz: 0, run: false, camYaw: 0 }, 2);
    expect([idle.x, idle.z]).toEqual([s.x, s.z]);
    for (let k = 0; k < 8; k++) {
      const a = k * Math.PI / 4, p = createPlayer(s.x, s.z);
      run(p, toward(Math.cos(a), Math.sin(a)), 4);
      expect(Math.hypot(p.x - s.x, p.z - s.z), `direction ${k}`).toBeGreaterThanOrEqual(lim - 1e-6);
    }
  });
});

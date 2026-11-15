import { describe, test, expect } from 'vitest';
import { createPlayer, stepPlayer, needsRespawn, respawn } from '../src/player/controller.js';
import { SITES, DYN_NONE, RAMPS, zoneAt, heightAt } from '../src/world/layout.js';
import { WALK, RUN, STEP_UP, PLAYER_R } from '../src/config.js';
import { SOLIDS, obstacles } from '../src/world/solids.js';
import { PERCHES } from '../src/world/perches.js';
import { HOP_SECS } from '../src/player/hop.js';

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
  test('walking dead straight at it a little off-centre glances round it, never sticks', () => {
    const p = createPlayer(s.x + 0.25 * lim, s.z - 5);
    let min = Infinity;
    for (let i = 0; i < 900; i++) { stepPlayer(p, toward(0, 1), 1 / 60, DYN_NONE); min = Math.min(min, Math.hypot(p.x - s.x, p.z - s.z)); }
    expect(p.z).toBeGreaterThan(s.z + lim);      // past it
    expect(min).toBeGreaterThan(lim - 1e-6);     // without ever cutting into it
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

// ---- the hop is real: perches (barrels, crates, the rope coil, boulders) can be landed on
const steps = (p, input, n, dyn = DYN_NONE, world = null) => { for (let i = 0; i < n; i++) stepPlayer(p, input, 1 / 60, dyn, null, world); };
// A stage with only the given perches (plus layout's own walls, the trees and the like), by hand.
const stage = (...perches) => ({ ...obstacles(DYN_NONE), perches });
const BARREL = { kind: 'barrel', x: 0, z: 130, r: 0.6, top: 0.95 };
const CRATE = { kind: 'crate', x: 0, z: 130, r: 0.7, top: 0.84 };
const ROPE = { kind: 'rope', x: 0, z: 130, r: 0.6, top: 0.5 };
const G = (x, z) => heightAt(x, z, DYN_NONE);
const south = toward(0, 1);   // world +z
const frames = (d) => Math.round(d / (WALK / 60));   // how many frames of walking cover d metres
const tryHop = (p, input, n, world, press = 1) => {   // a baseline, then `press` hops' worth of presses
  stepPlayer(p, { ...input, jumpN: 0 }, 1 / 60, DYN_NONE, null, world);
  for (let i = 0; i < n; i++) stepPlayer(p, { ...input, jumpN: press }, 1 / 60, DYN_NONE, null, world);
};

describe('perches', () => {
  test('the test stage is level and open', () => {
    for (let a = 0; a < 8; a++) for (const d of [0, 2, 4, 6]) expect(Math.abs(G(Math.cos(a) * d, 130 + Math.sin(a) * d) - G(0, 130))).toBeLessThan(0.1);
  });

  test('walking at a barrel without a hop stops at its circle, slides round it, and never rises', () => {
    const w = stage(BARREL), lim = BARREL.r + PLAYER_R;
    const p = createPlayer(0, 125), g = G(0, 125);
    let maxY = 0;
    for (let i = 0; i < 240; i++) { stepPlayer(p, south, 1 / 60, DYN_NONE, null, w); maxY = Math.max(maxY, p.y - G(p.x, p.z)); }
    expect(Math.hypot(p.x, p.z - 130)).toBeGreaterThan(lim - 0.05);
    expect(Math.hypot(p.x, p.z - 130)).toBeLessThan(lim + 0.05);
    expect(maxY).toBeLessThan(0.15);   // the sand slopes a little: nothing like the 0.95 of the top
    const q = createPlayer(0.25 * lim, 125);
    let min = Infinity, top = 0;
    for (let i = 0; i < 900; i++) { stepPlayer(q, south, 1 / 60, DYN_NONE, null, w); min = Math.min(min, Math.hypot(q.x, q.z - 130)); top = Math.max(top, q.y - G(q.x, q.z)); }
    expect(q.z).toBeGreaterThan(130 + lim);
    expect(min).toBeGreaterThan(lim - 1e-6);
    expect(top).toBeLessThan(0.15);
  });

  test('a hop about 0.6 m before a barrel lands on top of it; walking on drops to the ground beyond', () => {
    const w = stage(BARREL), lim = BARREL.r + PLAYER_R;
    const p = createPlayer(0, 130 - lim - 0.6);
    tryHop(p, south, frames(lim + 0.6), w);
    expect(Math.hypot(p.x, p.z - 130)).toBeLessThan(BARREL.r);
    expect(p.y).toBeCloseTo(G(0, 130) + BARREL.top, 2);
    expect(p.hopN).toBe(1);
    steps(p, south, 90, DYN_NONE, w);
    expect(p.z).toBeGreaterThan(130 + BARREL.r);
    expect(p.y).toBeCloseTo(G(p.x, p.z), 3);
  });

  test('the wreck\'s own barrel can be landed on from the beach', () => {
    const b = PERCHES.find((q) => q.kind === 'barrel' && q.x === 9.9);
    const p = createPlayer(b.x - b.r - PLAYER_R - 0.6, b.z);
    tryHop(p, toward(1, 0), frames(b.r + PLAYER_R + 0.6), null);
    expect(Math.hypot(p.x - b.x, p.z - b.z)).toBeLessThan(b.r);
    expect(p.y).toBeCloseTo(G(b.x, b.z) + b.top, 2);
  });

  test('the rope coil (0.5 m) cannot be walked onto, but any hop gets on', () => {
    const w = stage(ROPE), lim = ROPE.r + PLAYER_R;
    const walk = createPlayer(0, 125);
    steps(walk, south, 240, DYN_NONE, w);
    expect(walk.y - G(walk.x, walk.z)).toBeLessThan(0.05);
    expect(Math.hypot(walk.x, walk.z - 130)).toBeGreaterThan(lim - 0.05);
    const p = createPlayer(0, 130 - lim - 0.6);
    tryHop(p, south, frames(lim + 0.6), w);
    expect(p.y).toBeCloseTo(G(0, 130) + ROPE.top, 2);
  });

  test('a perch 0.45 m or lower is stepped onto without a hop', () => {
    const low = { kind: 'rope', x: 0, z: 130, r: 0.6, top: 0.4 };   // a little under STEP_UP: the sand rises a few cm to it
    const p = createPlayer(0, 125);
    steps(p, south, frames(5), DYN_NONE, stage(low));
    expect(p.y).toBeCloseTo(G(0, 130) + 0.4, 2);
  });

  test('from the top of a crate a hop gets onto a barrel beside it', () => {
    const barrel = { ...BARREL, x: 1.5 };
    const w = stage(CRATE, barrel);
    const p = createPlayer(0, 130); p.y = G(0, 130) + CRATE.top;
    tryHop(p, toward(1, 0), frames(1.5), w);
    expect(Math.hypot(p.x - 1.5, p.z - 130)).toBeLessThan(barrel.r);
    expect(p.y).toBeCloseTo(G(1.5, 130) + barrel.top, 2);
    // and a perch standing 0.66 m above the crate needs the hop
    const tall = { ...BARREL, x: 1.5, top: CRATE.top + 0.66 };
    const a = createPlayer(0, 130); a.y = G(0, 130) + CRATE.top;
    steps(a, toward(1, 0), 120, DYN_NONE, stage(CRATE, tall));
    expect(a.y).toBeLessThan(G(0, 130) + CRATE.top + 0.05);
    const b = createPlayer(0, 130); b.y = G(0, 130) + CRATE.top;
    tryHop(b, toward(1, 0), frames(1.5), stage(CRATE, tall));
    expect(b.y).toBeCloseTo(G(1.5, 130) + tall.top, 2);
  });

  test('a hop beside a ledge higher than STEP_UP does not climb it', () => {
    const north = { mx: 0, mz: 1, run: true, camYaw: 0 };
    const still = createPlayer(11, -28.5); tryHop(still, north, 120, null, 0);
    const hop = createPlayer(11, -28.5); tryHop(hop, north, 120, null);
    expect(hop.y).toBeLessThan(8.5 + STEP_UP);
    expect([hop.x, hop.z, hop.y]).toEqual([still.x, still.z, still.y]);
  });

  test('a hop at a gap\'s edge carries the walker no further than walking', () => {
    const north = { mx: 0, mz: 1, run: false, camYaw: 0 };
    const still = createPlayer(6, -4); tryHop(still, north, 90, null, 0);
    const hop = createPlayer(6, -4); tryHop(hop, north, 90, null);
    expect(hop.z).toBeCloseTo(still.z, 6);
    expect(hop.y).toBeCloseTo(still.y, 6);
  });

  test('noHop ignores the press; hopN does not rise', () => {
    const p = createPlayer(0, 125);
    stepPlayer(p, { ...south, jumpN: 0, noHop: true }, 1 / 60, DYN_NONE);
    steps(p, { ...south, jumpN: 1, noHop: true }, 10);
    expect(p.hopN).toBe(0);
    expect(p.hopT).toBeLessThan(0);
    // and the press is not remembered once the hands are free
    steps(p, { ...south, jumpN: 1, noHop: false }, 10);
    expect(p.hopN).toBe(0);
  });

  test('the first jumpN a walker sees is a baseline, not a hop', () => {
    const p = createPlayer(0, 125);
    steps(p, { ...south, jumpN: 7 }, 10);
    expect(p.hopN).toBe(0);
    steps(p, { ...south, jumpN: 8 }, 1);
    expect(p.hopN).toBe(1);
    expect(p.hopT).toBeGreaterThanOrEqual(0);
  });

  test('a press during a hop is ignored, and a press while falling is ignored', () => {
    const p = createPlayer(0, 125);
    stepPlayer(p, { ...south, jumpN: 0 }, 1 / 60, DYN_NONE);
    steps(p, { ...south, jumpN: 1 }, 10);
    steps(p, { ...south, jumpN: 2 }, 10);
    expect(p.hopN).toBe(1);
    steps(p, { ...south, jumpN: 2 }, Math.round(HOP_SECS * 60));   // the hop is over
    expect(p.hopT).toBeLessThan(0);
    steps(p, { ...south, jumpN: 2 }, 30);
    expect(p.hopN).toBe(1);                                         // and a press during it was not queued
    const f = createPlayer(0, 125); f.y = G(0, 125) + 3;            // in the air, falling
    stepPlayer(f, { ...south, jumpN: 0 }, 1 / 60, DYN_NONE);
    stepPlayer(f, { ...south, jumpN: 1 }, 1 / 60, DYN_NONE);
    expect(f.hopN).toBe(0);
  });

  test('a respawn ends a hop in progress', () => {
    const p = createPlayer(0, 125);
    stepPlayer(p, { ...south, jumpN: 0 }, 1 / 60, DYN_NONE);
    stepPlayer(p, { ...south, jumpN: 1 }, 1 / 60, DYN_NONE);
    expect(p.hopT).toBeGreaterThanOrEqual(0);
    respawn(p, 0, 0);
    expect(p.hopT).toBeLessThan(0);
  });

  test('a walker put inside a barrel at ground level can walk out any of eight ways', () => {
    const w = stage(BARREL);
    for (let k = 0; k < 8; k++) {
      const a = k * Math.PI / 4, p = createPlayer(BARREL.x, BARREL.z);
      steps(p, toward(Math.cos(a), Math.sin(a)), 240, DYN_NONE, w);
      expect(Math.hypot(p.x - BARREL.x, p.z - BARREL.z), `direction ${k}`).toBeGreaterThanOrEqual(BARREL.r + PLAYER_R - 1e-6);
      expect(p.y - G(p.x, p.z)).toBeLessThan(0.1);
    }
  });

  test('a boulder: blocked without a hop, landed on with one; a tree trunk blocks either way', () => {
    const b = lone('boulder'), tr = lone('pine');
    const perch = PERCHES.find((q) => q.x === b.x && q.z === b.z);
    const lim = b.r + PLAYER_R;
    expect(perch.top).toBeGreaterThan(STEP_UP);   // every boulder is 0.58 * s, s from 0.8: none is a step
    const walk = createPlayer(b.x, b.z - 5); steps(walk, south, 300);
    const hopper = createPlayer(b.x, b.z - lim - 0.6); tryHop(hopper, south, frames(lim + 0.6), null);
    expect(Math.hypot(walk.x - b.x, walk.z - b.z)).toBeGreaterThan(lim - 0.05);
    expect(walk.y - G(walk.x, walk.z)).toBeLessThan(0.01);
    expect(Math.hypot(hopper.x - b.x, hopper.z - b.z)).toBeLessThan(b.r);
    expect(hopper.y).toBeCloseTo(G(b.x, b.z) + perch.top, 2);
    const t = createPlayer(tr.x, tr.z - tr.r - PLAYER_R - 0.6); tryHop(t, south, 60, null);
    expect(Math.hypot(t.x - tr.x, t.z - tr.z)).toBeGreaterThan(tr.r + PLAYER_R - 0.05);
    expect(t.y - G(t.x, t.z)).toBeLessThan(0.01);
  });
});

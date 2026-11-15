import { test, expect, describe } from 'vitest';
import {
  DYN_NONE, heightAt, blockers, zoneAt, SITES, ZONES, RAMPS, TRAIL, PLANK_ROUTE, PLANK_CORRIDOR,
  marshTileAt, marshTileCentre, MARSH_SURFACE, WATCH_STONE,
} from '../src/world/layout.js';
import { occluded } from '../src/world/sight.js';
import { reachable, walkDistance } from './helpers/reach.js';
import { carrySearch } from './helpers/carry.js';
import { DROWN_Y, STEP_UP, PLAYER_R } from '../src/config.js';
import { pointSegDist, segCircle, rayPointDist } from '../src/core/math.js';

const D = (o) => ({ ...DYN_NONE, ...o });
const ALL5 = { gateOpen: true, bridge: true, plank: true, lift: 0, ladder: true };
const mask = (tiles) => tiles.reduce((m, i) => m | (1 << i), 0);
const column = (c) => [0, 1, 2, 3, 4, 5].map((r) => r * 5 + c);       // a straight path up column c
const at = (p) => [p[0], p[1]];
const ALL = D({ gateOpen: true, bridge: true, plank: true, ladder: true });

// ---------------------------------------------------------------- the brief

test('nothing solved: the gate is the end of the road', () => {
  const r = reachable(SITES.spawn[0], DYN_NONE);
  expect(r(...SITES.gate.plateA)).toBe(true);
  expect(r(...SITES.gate.plateB)).toBe(false);
});
test('gate open: both halves of the signal, nothing past it', () => {
  const r = reachable(SITES.spawn[0], D({ gateOpen: true }));
  expect(r(...SITES.gate.plateB)).toBe(true);
  expect(r(...SITES.signal.lookout)).toBe(true);
  expect(r(SITES.signal.dialZone.x, SITES.signal.dialZone.z)).toBe(true);
  expect(r(...SITES.plank.restA)).toBe(false);
});
test('bridge out: the plank and its slot, not the lift', () => {
  const r = reachable(SITES.spawn[0], D({ gateOpen: true, bridge: true }));
  expect(r(...SITES.plank.restA)).toBe(true);
  expect(r(...SITES.plank.slot)).toBe(true);
  expect(r(...SITES.lift.crank)).toBe(false);
});
test('plank laid: the lift foot, not the ledge', () => {
  const r = reachable(SITES.spawn[0], D({ gateOpen: true, bridge: true, plank: true }));
  expect(r(...SITES.lift.crank)).toBe(true);
  expect(r(SITES.lift.platform.x, SITES.lift.platform.z)).toBe(true);
  expect(r(...SITES.lift.post)).toBe(false);
});
test('a raised lift carries its rider to the ledge and nobody else', () => {
  const up = D({ gateOpen: true, bridge: true, plank: true, lift: 1 });
  expect(reachable([SITES.lift.platform.x, SITES.lift.platform.z], up)(...SITES.lift.post)).toBe(true);
  expect(reachable(SITES.lift.crank, up)(...SITES.lift.post)).toBe(false);
});
test('ladder down: the summit and both mirrors', () => {
  const r = reachable(SITES.lift.crank, D({ gateOpen: true, bridge: true, plank: true, ladder: true }));
  expect(r(...SITES.lift.post)).toBe(true);
  for (const m of SITES.beam.mirrors) expect(r(...m)).toBe(true);
});
test('every checkpoint is dry land', () => {
  for (const pair of SITES.checkpoints) for (const [x, z] of pair)
    expect(heightAt(x, z, DYN_NONE)).toBeGreaterThan(0.2);
  expect(SITES.checkpoints).toHaveLength(12);
});
test('the lookout faces the back of the wall, close enough to read', () => {
  const { wall, lookout } = SITES.signal;
  const back = [Math.sin(wall.yaw), Math.cos(wall.yaw)];           // opposite of the wall's facing
  const to = [lookout[0] - wall.x, lookout[1] - wall.z];
  const len = Math.hypot(...to);
  expect(len).toBeLessThan(30);
  expect((to[0] * back[0] + to[1] * back[1]) / len).toBeGreaterThan(0.7);
});
test('the plank zigzag cannot be walked around', () => {
  expect(SITES.plank.stones.length).toBeGreaterThanOrEqual(6);
  const r = reachable(SITES.plank.restA, D({ gateOpen: true, bridge: true }));
  expect(r(...SITES.plank.slot)).toBe(true);
});

// ---------------------------------------------------------------- helpers

const clearOf = (x, z, dyn, margin = PLAYER_R) => {
  const { circles, segments } = blockers(dyn);
  for (const c of circles) if (Math.hypot(x - c.x, z - c.z) < c.r + margin) return false;
  for (const s of segments) if (pointSegDist(x, z, s.ax, s.az, s.bx, s.bz).d < margin) return false;
  return true;
};
const midOf = (s) => [(s.ax + s.bx) / 2, (s.az + s.bz) / 2];
const sameSeg = (s, t) => s.ax === t.ax && s.az === t.az && s.bx === t.bx && s.bz === t.bz;
const rampFor = (flag) => RAMPS.find((r) => r.flag === flag);
const zoneH = (letter) => ZONES.find((z) => z.zone === letter).h;
// Walk the straight line a→b in 0.1 m samples; first failure, or null if walkable.
function walkLine(a, b, dyn) {
  const n = Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 0.1);
  const hs = [];
  for (let i = 0; i <= n; i++) {
    const x = a[0] + (b[0] - a[0]) * i / n, z = a[1] + (b[1] - a[1]) * i / n;
    const h = heightAt(x, z, dyn);
    hs.push(h);
    if (!(h > DROWN_Y)) return { x, z, why: 'water' };
    if (i >= 5 && h - hs[i - 5] > STEP_UP) return { x, z, why: 'steep' };
    if (!clearOf(x, z, dyn)) return { x, z, why: 'blocked' };
  }
  return null;
}
// Distance from a point to an axis-aligned rectangle {x,z,hw,hd} (0 inside).
const rectDist = (p, r) => Math.hypot(
  Math.max(0, Math.abs(p[0] - r.x) - r.hw), Math.max(0, Math.abs(p[1] - r.z) - r.hd));
// Point at arc length s along a polyline.
function along(pts, s) {
  for (let i = 1; i < pts.length; i++) {
    const [ax, az] = pts[i - 1], [bx, bz] = pts[i];
    const l = Math.hypot(bx - ax, bz - az);
    if (s <= l || i === pts.length - 1) {
      const t = Math.min(1, Math.max(0, s / l));
      return [ax + (bx - ax) * t, az + (bz - az) * t];
    }
    s -= l;
  }
  return pts[pts.length - 1];
}
const polyLen = (pts) => pts.slice(1).reduce((s, p, i) => s + Math.hypot(p[0] - pts[i][0], p[1] - pts[i][1]), 0);

// ---------------------------------------------------------------- A. zones

describe('A. zones', () => {
  test('null on ramps, the lift platform and water', () => {
    for (const r of RAMPS) expect(zoneAt(...midOf(r))).toBeNull();
    expect(zoneAt(SITES.lift.platform.x, SITES.lift.platform.z)).toBeNull();
    expect(zoneAt(9999, 9999)).toBeNull();
    expect(zoneAt(SITES.spawn[0][0], SITES.spawn[0][1] + 14)).toBeNull(); // the beach slope
  });
  test('ramps join the zones in trail order', () => {
    const want = [['A', 'B', null], ['B', 'C', null], ['B', 'D', 'bridge'], ['D', 'E', 'plank'], ['E', 'F', 'ladder']];
    for (const [from, to, flag] of want) {
      const r = RAMPS.find((q) => q.from === from && q.to === to);
      expect(r, `${from}->${to}`).toBeTruthy();
      expect(r.flag).toBe(flag);
      const len = Math.hypot(r.bx - r.ax, r.bz - r.az), ux = (r.bx - r.ax) / len, uz = (r.bz - r.az) / len;
      expect(zoneAt(r.ax - ux * 1.5, r.az - uz * 1.5)).toBe(from);
      expect(zoneAt(r.bx + ux * 1.5, r.bz + uz * 1.5)).toBe(to);
    }
    expect(RAMPS.filter((q) => 'ABCDEF'.includes(q.to))).toHaveLength(5);   // the first island's five
  });
  test('heights rise along the trail; C is a spur above B', () => {
    expect(zoneH('A')).toBeLessThan(zoneH('B'));
    expect(zoneH('B')).toBeLessThan(zoneH('D'));
    expect(zoneH('D')).toBeLessThan(zoneH('E'));
    expect(zoneH('E')).toBeLessThan(zoneH('F'));
    expect(zoneH('C')).toBeGreaterThan(zoneH('B'));
  });
  test('C is a dead-end spur: one unconditional ramp, to B and nowhere else', () => {
    const touching = RAMPS.filter((q) => q.from === 'C' || q.to === 'C');
    expect(touching).toHaveLength(1);
    expect(touching[0].from).toBe('B');
    expect(touching[0].flag).toBeNull();
    expect(reachable(SITES.signal.lookout, D({ gateOpen: true }))(...SITES.gate.plateB)).toBe(true);
  });
});

// ---------------------------------------------------------------- B. spawn

test('B. spawn: 8 m of open sand toward +Z, then the sea', () => {
  for (const [x, z] of SITES.spawn) {
    expect(zoneAt(x, z)).toBe('A');
    for (let d = 0; d <= 8; d += 0.25) {
      expect(heightAt(x, z + d, DYN_NONE)).toBeGreaterThan(0);
      expect(clearOf(x, z + d, DYN_NONE)).toBe(true);
    }
    let wet = false;
    for (let d = 8; d <= 60 && !wet; d += 0.25) wet = heightAt(x, z + d, DYN_NONE) < DROWN_Y;
    expect(wet).toBe(true);
  }
  expect(Math.hypot(SITES.spawn[0][0] - SITES.spawn[1][0], SITES.spawn[0][1] - SITES.spawn[1][1])).toBeGreaterThanOrEqual(1.5);
  expect(SITES.checkpoints[0]).toEqual(SITES.spawn);
});

// ---------------------------------------------------------------- C. gate

describe('C. gate', () => {
  const { plateA, plateB, door } = SITES.gate;
  const doorDist = (p) => pointSegDist(p[0], p[1], door.ax, door.az, door.bx, door.bz).d;
  test('plate A to plate B is walkable when open, blocked at the door when closed', () => {
    expect(walkLine(plateA, plateB, D({ gateOpen: true }))).toBeNull();
    const fail = walkLine(plateA, plateB, DYN_NONE);
    expect(fail).not.toBeNull();
    expect(fail.why).toBe('blocked');
    expect(pointSegDist(fail.x, fail.z, door.ax, door.az, door.bx, door.bz).d).toBeLessThanOrEqual(PLAYER_R + 1e-9);
  });
  test('plate placement', () => {
    expect(zoneAt(...plateA)).toBe('A');
    expect(doorDist(plateA)).toBeGreaterThanOrEqual(8);
    expect(doorDist(plateB)).toBeGreaterThanOrEqual(8);
    expect(zoneAt(plateB[0] + 1, plateB[1])).toBe('B');
    for (let k = 0; k < 16; k++) {
      const a = k * Math.PI / 8;
      expect(zoneAt(plateB[0] + 2 * Math.cos(a), plateB[1] + 2 * Math.sin(a))).toBe('B');
    }
  });
  test('the closed gate is the door segment, present only while closed', () => {
    expect(blockers(DYN_NONE).segments.some((s) => sameSeg(s, door))).toBe(true);
    expect(blockers(D({ gateOpen: true })).segments.some((s) => sameSeg(s, door))).toBe(false);
  });
});

// ---------------------------------------------------------------- D. signal

describe('D. signal', () => {
  const { dials, dialZone, lookout, bridge } = SITES.signal;
  test('dials spread out inside the dial zone; the lookout is on C', () => {
    expect(dials).toHaveLength(4);
    for (let i = 0; i < 4; i++) {
      expect(Math.hypot(dials[i][0] - dialZone.x, dials[i][1] - dialZone.z)).toBeLessThanOrEqual(dialZone.r);
      expect(zoneAt(...dials[i])).toBe('B');
      for (let j = i + 1; j < 4; j++)
        expect(Math.hypot(dials[i][0] - dials[j][0], dials[i][1] - dials[j][1])).toBeGreaterThanOrEqual(2);
    }
    expect(Math.hypot(lookout[0] - dialZone.x, lookout[1] - dialZone.z)).toBeGreaterThan(dialZone.r);
    expect(zoneAt(...lookout)).toBe('C');
  });
  test('the bridge is the conditional ramp', () => {
    expect(sameSeg(rampFor('bridge'), bridge)).toBe(true);
    const m = midOf(bridge);
    expect(heightAt(...m, DYN_NONE)).toBeLessThan(DROWN_Y);
    expect(heightAt(...m, D({ bridge: true }))).toBeGreaterThan(0.2);
  });
});

// ---------------------------------------------------------------- E. plank

describe('E. plank', () => {
  const { restA, restB, stones, slot, span } = SITES.plank;
  test('rests, stones, slot, span', () => {
    expect(restB).toEqual([restA[0] + 4, restA[1]]);
    expect(zoneAt(...restA)).toBe('D');
    expect(zoneAt(...restB)).toBe('D');
    for (const dyn of [DYN_NONE, ALL]) {
      const cs = blockers(dyn).circles;
      for (const s of stones) {
        expect(s.r).toBeLessThanOrEqual(1.0);
        expect(cs.some((c) => c.x === s.x && c.z === s.z && c.r === s.r)).toBe(true);
      }
    }
    expect(zoneAt(...slot)).toBe('D');
    expect(sameSeg(rampFor('plank'), span)).toBe(true);
    const m = midOf(span);
    expect(heightAt(...m, DYN_NONE)).toBeLessThan(DROWN_Y);
    expect(heightAt(...m, D({ plank: true }))).toBeGreaterThan(0.2);
  });
  test('every gap around the stones is closed or at least 1.8 m; no straight channel', () => {
    // Reading of the rule: a stone either overlaps a corridor edge (no gap at all)
    // or leaves >= 1.8 m; stone-to-stone gaps are >= 1.8 m.
    const c = PLANK_CORRIDOR;
    const len = Math.hypot(c.bx - c.ax, c.bz - c.az), ux = (c.bx - c.ax) / len, uz = (c.bz - c.az) / len;
    const lat = (s) => (s.x - c.ax) * -uz + (s.z - c.az) * ux;      // signed offset from the axis
    for (const s of stones) {
      const o = Math.abs(lat(s));
      const near = c.hw - o - s.r, far = c.hw + o - s.r;
      expect(near <= 0 || near >= 1.8).toBe(true);
      expect(far).toBeGreaterThanOrEqual(1.8);
      expect(near).toBeLessThanOrEqual(0);  // every stone closes its own side: a true zigzag
    }
    for (let i = 0; i < stones.length; i++) for (let j = i + 1; j < stones.length; j++) {
      const a = stones[i], b = stones[j];
      expect(Math.hypot(a.x - b.x, a.z - b.z) - a.r - b.r).toBeGreaterThanOrEqual(1.8);
    }
    for (let i = 1; i < stones.length; i++) {          // consecutive stones overlap laterally
      const a = stones[i - 1], b = stones[i];
      expect(Math.sign(lat(a))).toBe(-Math.sign(lat(b)));
      expect(Math.abs(lat(a)) - a.r + Math.abs(lat(b)) - b.r).toBeLessThan(0);
    }
    // The corridor is land of zone D its full width, and water just beyond it.
    for (let s = 0; s <= len; s += 0.5) {
      const x = c.ax + ux * s, z = c.az + uz * s;
      for (const side of [-1, 1]) {
        expect(zoneAt(x - uz * side * (c.hw - 0.05), z + ux * side * (c.hw - 0.05))).toBe('D');
        if (s > 3 && s < len - 3) expect(heightAt(x - uz * side * (c.hw + 0.3), z + ux * side * (c.hw + 0.3), DYN_NONE)).toBeLessThan(DROWN_Y);
      }
    }
  });
  test('two walkers can carry a rigid 4 m board from its rests through the zigzag to the slot', () => {
    expect(PLANK_ROUTE[PLANK_ROUTE.length - 1]).toEqual(slot);
    // a search over where the two carriers stand: the board never shorter or longer than 4 m,
    // kept 0.3 m off every stone, the carriers within 0.4 m of its length apart
    expect(carrySearch({ len: 4, slack: 0.4, margin: 0.3 }).done).toBe(true);
  }, 120000);
});

// ---------------------------------------------------------------- F. lift

describe('F. lift', () => {
  const { crank, platform, low, high, post } = SITES.lift;
  test('post on F, crank on E and well clear of the platform', () => {
    expect(zoneAt(...post)).toBe('F');
    expect(zoneAt(...crank)).toBe('E');
    expect(rectDist(crank, platform)).toBeGreaterThan(3);
  });
  test('platform height follows the clamped lift', () => {
    const p = [platform.x, platform.z];
    expect(high - low).toBeGreaterThanOrEqual(4);
    expect(high - low).toBeLessThanOrEqual(6);
    expect(heightAt(...p, D({ lift: 0 }))).toBeCloseTo(low);
    expect(heightAt(...p, D({ lift: 0.5 }))).toBeCloseTo(low + 0.5 * (high - low));
    expect(heightAt(...p, D({ lift: 1 }))).toBeCloseTo(high);
    expect(heightAt(...p, D({ lift: 3 }))).toBeCloseTo(high);
    expect(heightAt(...p, D({ lift: -2 }))).toBeCloseTo(low);
    expect(low).toBeCloseTo(zoneH('E'));
    expect(high).toBeCloseTo(zoneH('F'));
    for (const lift of [0, 0.5, 1])
      for (let i = -0.95; i <= 0.95; i += 0.19) for (let j = -0.95; j <= 0.95; j += 0.19)
        expect(heightAt(platform.x + i * platform.hw, platform.z + j * platform.hd, D({ lift })))
          .toBeCloseTo(low + lift * (high - low), 9);
  });
  test('the ladder: conditional, steep, from E to F near the post, climbable', () => {
    const r = rampFor('ladder');
    expect(r.from).toBe('E');
    expect(r.to).toBe('F');
    const m = midOf(r);
    expect(heightAt(...m, D({ ladder: true }))).toBeGreaterThan(heightAt(...m, DYN_NONE) + 1);
    expect(Math.hypot(r.bx - post[0], r.bz - post[1])).toBeLessThan(5);
    const len = Math.hypot(r.bx - r.ax, r.bz - r.az), n = Math.ceil(len / 0.1);
    let prev = heightAt(r.ax, r.az, D({ ladder: true })), steepest = 0;
    for (let i = 1; i <= n; i++) {
      const h = heightAt(r.ax + (r.bx - r.ax) * i / n, r.az + (r.bz - r.az) * i / n, D({ ladder: true }));
      steepest = Math.max(steepest, h - prev);
      expect(h - prev).toBeLessThanOrEqual(0.45);
      prev = h;
    }
    expect(steepest * (n / len)).toBeGreaterThan(0.5);    // steep: more than 1 in 2
  });
});

// ---------------------------------------------------------------- ramp seams

test('every ramp, with its flag on, is walkable along its centre and both edges', () => {
  const dyn = D({ ...ALL, lift: 0, causeway: true, bells: true, pillars: (1 << 18) - 1, ring: true });
  for (const r of RAMPS) {
    const len = Math.hypot(r.bx - r.ax, r.bz - r.az), ux = (r.bx - r.ax) / len, uz = (r.bz - r.az) / len;
    // An end inside another ramp is a corner of the relay climb: walk up to it, not past
    // it (past it is open sea beside the corner). Every other end runs onto a plateau.
    const inside = (q, x, z) => {
      const l = Math.hypot(q.bx - q.ax, q.bz - q.az), qx = (q.bx - q.ax) / l, qz = (q.bz - q.az) / l;
      const dx = x - q.ax, dz = z - q.az, s = dx * qx + dz * qz;
      return s >= 0 && s <= l && Math.abs(-dx * qz + dz * qx) <= q.hw;
    };
    const joint = (s) => RAMPS.some((q) => q !== r && inside(q, r.ax + ux * s, r.az + uz * s));
    const s0 = joint(0.1) ? 0 : -0.5, s1 = joint(len - 0.1) ? len - 0.01 : len + 0.5;
    for (const off of [0, r.hw - 0.05, -(r.hw - 0.05)]) {
      const hs = [];
      for (let s = s0; s <= s1; s += 0.1) {
        const h = heightAt(r.ax + ux * s - uz * off, r.az + uz * s + ux * off, dyn);
        expect(h, `${r.from}->${r.to} at ${s.toFixed(1)}/${off}`).toBeGreaterThan(DROWN_Y);
        hs.push(h);
        if (hs.length > 5) expect(Math.abs(h - hs[hs.length - 6])).toBeLessThanOrEqual(STEP_UP);
      }
    }
  }
});

test('every puzzle span crosses at least 3.5 m of deep water', () => {
  for (const flag of ['bridge', 'plank']) {
    const r = rampFor(flag);
    const len = Math.hypot(r.bx - r.ax, r.bz - r.az);
    let run = 0, best = 0;
    for (let s = 0; s <= len; s += 0.05) {
      const t = s / len;
      run = heightAt(r.ax + (r.bx - r.ax) * t, r.az + (r.bz - r.az) * t, DYN_NONE) < DROWN_Y ? run + 0.05 : 0;
      best = Math.max(best, run);
    }
    expect(best, flag).toBeGreaterThanOrEqual(3.5);
  }
});

// ---------------------------------------------------------------- G. beam

describe('G. beam', () => {
  const { lamp, mirrors, lens, rocks, hint } = SITES.beam;
  const chest = (p) => [p[0], heightAt(p[0], p[1], DYN_NONE) + 0.9, p[1]];
  const rayAt = (t) => [lamp.o[0] + lamp.d[0] * t, lamp.o[1] + lamp.d[1] * t, lamp.o[2] + lamp.d[2] * t];
  test('lamp', () => {
    expect(Math.hypot(...lamp.d)).toBeCloseTo(1, 9);
    expect(zoneAt(lamp.o[0], lamp.o[2])).toBe('F');
    expect(Math.abs(lamp.o[1] - heightAt(lamp.o[0], lamp.o[2], DYN_NONE) - 1.5)).toBeLessThan(0.2);
    for (const r of rocks) expect(typeof r.h).toBe('number');
  });
  test('no single bounce off the lamp ray can reach the lens; the ray ends on a rock', () => {
    let t = 0;
    for (; t <= 40; t += 0.5) {
      const p = rayAt(t);
      if (occluded(lamp.o, p)) break;
      expect(occluded(p, lens), `t=${t}`).toBe(true);
    }
    expect(t).toBeLessThanOrEqual(40);
  });
  test('the hint path: lamp → p1 → p2 → lens', () => {
    const c1 = chest(hint.p1), c2 = chest(hint.p2);
    expect(rayPointDist(lamp.o, lamp.d, c1).d).toBeLessThan(0.5);
    expect(occluded(lamp.o, c1)).toBe(false);
    expect(rayPointDist(lamp.o, lamp.d, c2).d).toBeGreaterThan(2);
    expect(occluded(c1, c2)).toBe(false);
    expect(occluded(c2, lens)).toBe(false);
    const d = Math.hypot(c2[0] - lens[0], c2[1] - lens[1], c2[2] - lens[2]);
    expect(d).toBeGreaterThanOrEqual(8);
    expect(d).toBeLessThanOrEqual(30);
  });
  test('the lamp ray on its own never nears the lens', () => {
    expect(rayPointDist(lamp.o, lamp.d, lens).d).toBeGreaterThan(3);
  });
  test('hint points and mirrors are on F and mutually reachable', () => {
    const pts = [hint.p1, hint.p2, ...mirrors];
    for (const p of pts) expect(zoneAt(...p)).toBe('F');
    const r = reachable(hint.p1, ALL);
    for (const p of pts) expect(r(...p)).toBe(true);
  });
  test('the lens is high on the beacon', () => {
    expect(Math.hypot(lens[0] - SITES.beacon[0], lens[2] - SITES.beacon[1])).toBeLessThan(1.5);
    expect(lens[1] - heightAt(...SITES.beacon, DYN_NONE)).toBeGreaterThan(3);
    expect(zoneAt(...SITES.beacon)).toBe('F');
  });
  test('occluded: rock tops, start inside a rock, vertical segments', () => {
    const r = rocks[0];
    const g = heightAt(r.x + r.r + 3, r.z, DYN_NONE);
    expect(occluded([r.x - r.r - 2, g + 1, r.z], [r.x + r.r + 2, g + 1, r.z])).toBe(true);
    expect(occluded([r.x - r.r - 2, r.h + 1, r.z], [r.x + r.r + 2, r.h + 1, r.z])).toBe(false);
    expect(occluded([r.x, g + 1, r.z], [r.x + 9, g + 1, r.z + 9])).toBe(true);
    expect(occluded([r.x, g + 1, r.z], [r.x, g + 2, r.z])).toBe(true);
    expect(occluded([r.x, g + 1, r.z + r.r + 5], [r.x, g + 3, r.z + r.r + 5])).toBe(false);
  });
});

// ---------------------------------------------------------------- H. checkpoints

test('H. checkpoints sit in the right zones', () => {
  const want = ['A', 'B', 'D', 'E', 'F', 'F', 'H', 'I', 'J', 'K', 'L', 'L'];
  SITES.checkpoints.forEach((pair, i) => {
    expect(pair).toHaveLength(2);
    expect(Math.hypot(pair[0][0] - pair[1][0], pair[0][1] - pair[1][1])).toBeGreaterThanOrEqual(1.5);
    for (const p of pair) {
      expect(zoneAt(...p), `checkpoint ${i}`).toBe(want[i]);
      expect(clearOf(...p, ALL)).toBe(true);
    }
  });
  const near = (p, q, d) => Math.hypot(p[0] - q[0], p[1] - q[1]) < d;
  expect(near(SITES.checkpoints[1][0], SITES.gate.plateB, 6)).toBe(true);
  expect(near(SITES.checkpoints[2][0], [SITES.signal.bridge.bx, SITES.signal.bridge.bz], 6)).toBe(true);
  expect(near(SITES.checkpoints[3][0], [SITES.plank.span.bx, SITES.plank.span.bz], 6)).toBe(true);
  expect(near(SITES.checkpoints[4][0], SITES.lift.post, 6)).toBe(true);
  expect(near(SITES.checkpoints[5][0], SITES.beacon, 6)).toBe(true);
});

// ---------------------------------------------------------------- I. sea

test('I. far out to sea is deep water', () => {
  for (const [x, z] of [[9999, 9999], [-9999, 0], [0, -9999], [200, 30]]) {
    const h = heightAt(x, z, DYN_NONE);
    expect(h).toBeLessThan(0.2);
    expect(h).toBeLessThan(DROWN_Y);
  }
});

// ---------------------------------------------------------------- J. heights

describe('J. heights', () => {
  test('cliffs between zones are real, plateaus are nearly flat', () => {
    const S = 0.25;
    const nominal = Object.fromEntries(ZONES.map((z) => [z.zone, z.h]));
    let prevRow = null;
    for (let z = -90; z <= 150; z += S) {
      const row = [];
      for (let x = -50; x <= 40; x += S) {
        const zone = zoneAt(x, z), h = heightAt(x, z, DYN_NONE);
        row.push([zone, h]);
        if (zone) expect(Math.abs(h - nominal[zone])).toBeLessThan(0.12);
        const left = row.length > 1 ? row[row.length - 2] : null, up = prevRow ? prevRow[row.length - 1] : null;
        for (const n of [left, up]) {
          if (n && n[0] && zone && n[0] !== zone && Math.abs(n[1] - h) < 1.2)
            throw new Error(`soft border ${n[0]}/${zone} at ${x},${z}`);
        }
      }
      prevRow = row;
    }
  });
  test('cheap and deterministic', () => {
    const t0 = performance.now();
    let sum = 0;
    for (let i = 0; i < 300; i++) for (let j = 0; j < 300; j++) sum += heightAt(-50 + i * 0.3, -90 + j * 0.8, DYN_NONE);
    expect(performance.now() - t0).toBeLessThan(2500);
    let again = 0;
    for (let i = 0; i < 300; i++) for (let j = 0; j < 300; j++) again += heightAt(-50 + i * 0.3, -90 + j * 0.8, DYN_NONE);
    expect(again).toBe(sum);
  });
});

// ---------------------------------------------------------------- K. exports

describe('K. renderer data', () => {
  test('ZONES are plain discs', () => {
    for (const z of ZONES) {
      expect(Object.keys(z).sort()).toEqual(['h', 'r', 'x', 'z', 'zone']);
      expect(ZONES.filter((q) => q.zone === z.zone).every((q) => q.h === z.h)).toBe(true);
    }
    for (const L of 'ABCDEF') expect(ZONES.some((z) => z.zone === L)).toBe(true);
  });
  test('RAMPS carry their geometry and flag', () => {
    for (const r of RAMPS) {
      for (const k of ['ax', 'az', 'bx', 'bz', 'hw', 'ha', 'hb']) expect(typeof r[k]).toBe('number');
      expect([null, 'bridge', 'plank', 'ladder', 'causeway', 'bells', 'ring']).toContain(r.flag);
    }
    expect(JSON.parse(JSON.stringify(RAMPS))).toEqual(RAMPS);
    expect(JSON.parse(JSON.stringify(SITES))).toEqual(SITES);
  });
  test('TRAIL runs from spawn past the beacon to the great brazier over walkable ground', () => {
    expect(Math.hypot(TRAIL[0][0] - SITES.spawn[0][0], TRAIL[0][1] - SITES.spawn[0][1])).toBeLessThan(3);
    expect(TRAIL).toContainEqual(SITES.beacon);
    // on past the great brazier to the Lantern Isle: see layout-lantern.test.js
    const upTo = TRAIL.slice(0, TRAIL.findIndex((p) => p[0] === SITES.relay.great[0] && p[1] === SITES.relay.great[1]) + 1);
    expect(TRAIL).toContainEqual(SITES.relay.great);   // a vertex of the trail, not merely a point on it
    const all8 = D({ ...ALL, causeway: true, bells: true, marsh: mask(column(2)) });
    const L = polyLen(upTo);
    for (let s = 0; s <= L; s += 0.25) {
      const p = along(upTo, s);
      expect(heightAt(...p, all8), `${p}`).toBeGreaterThan(DROWN_Y);
      if (Math.hypot(p[0] - SITES.beacon[0], p[1] - SITES.beacon[1]) > 2.5) expect(clearOf(...p, all8), `${p}`).toBe(true);
    }
  });
});

// ---------------------------------------------------------------- L. the Far Isle

describe('L. the Far Isle', () => {
  const { bells = {}, marsh = { plate: {} }, relay = {} } = SITES;
  const plate = [marsh.plate.x, marsh.plate.z];
  const ALL_TILES = (1 << 30) - 1;
  const full = (marshBits) => D({ ...ALL5, causeway: true, bells: true, marsh: marshBits });
  const farSites = () => [bells.a, bells.b, plate, relay.small, relay.great];
  const hiSites = () => [plate, marsh.lever, relay.small, relay.great, ...SITES.checkpoints.slice(6).flat()];
  const summit = SITES.checkpoints[5][0];                 // "from the beacon": its checkpoint
  const cp6 = (SITES.checkpoints[6] ?? [[NaN, NaN]])[0];
  const isFar = (d) => 'GHIJ'.includes(d.zone);
  const local = (x, z) => {                               // marsh coordinates: [across, along]
    const dx = x - marsh.origin[0], dz = z - marsh.origin[1];
    return [dx * marsh.right[0] + dz * marsh.right[1], dx * marsh.fwd[0] + dz * marsh.fwd[1]];
  };
  const world = (u, v) => [
    marsh.origin[0] + marsh.right[0] * u + marsh.fwd[0] * v,
    marsh.origin[1] + marsh.right[1] * u + marsh.fwd[1] * v,
  ];
  const W = marsh.cols * marsh.tile, Lm = marsh.rows * marsh.tile;

  test('zones G H I J exist, rise in trail order, below the summit they hang off', () => {
    for (const L of 'GHIJ') expect(ZONES.some((z) => z.zone === L)).toBe(true);
    expect(zoneH('G')).toBeLessThan(zoneH('H'));
    expect(zoneH('H')).toBeLessThan(zoneH('I'));
    expect(zoneH('I')).toBeLessThan(zoneH('J'));
    expect(zoneH('G')).toBeLessThan(zoneH('F'));
    expect(zoneAt(...bells.a)).toBe('G');
    expect(zoneAt(...bells.b)).toBe('G');
    expect(zoneAt(...plate)).toBe('H');
    expect(zoneAt(...marsh.lever)).toBe('I');
    expect(zoneAt(...relay.small)).toBe('I');
    expect(zoneAt(...relay.great)).toBe('J');
  });

  test('without the causeway no Far Isle site; with it the bells and the foot of the steps, not the plate', () => {
    const r0 = reachable(summit, D(ALL5));
    for (const p of farSites()) expect(r0(...p), `${p}`).toBe(false);
    const r1 = reachable(summit, D({ ...ALL5, causeway: true }));
    expect(r1(...bells.a)).toBe(true);
    expect(r1(...bells.b)).toBe(true);
    expect(r1(bells.steps.ax, bells.steps.az)).toBe(true);
    expect(r1(...plate)).toBe(false);
  });

  test('steps up: the plate and checkpoint 6, not the lever or the small brazier', () => {
    const r = reachable(summit, D({ ...ALL5, causeway: true, bells: true }));
    expect(r(...plate)).toBe(true);
    for (const p of SITES.checkpoints[6]) expect(r(...p)).toBe(true);
    expect(r(...marsh.lever)).toBe(false);
    expect(r(...relay.small)).toBe(false);
  });

  test('any straight column of solid tiles carries a walker from H to the lever', () => {
    for (let c = 0; c < 5; c++) {
      const r = reachable(cp6, full(mask(column(c))));
      expect(r(...marsh.lever), `column ${c}`).toBe(true);
      for (const i of column(c)) expect(r(...marshTileCentre(i)), `tile ${i}`).toBe(true);
    }
  });

  test('with no tile solid nothing past H is reachable, whatever else is set', () => {
    for (const from of [cp6, plate, summit]) {
      const r = reachable(from, full(0));
      for (const p of [marsh.lever, relay.small, relay.great, ...SITES.checkpoints[7], ...SITES.checkpoints[8]])
        expect(r(...p), `${p}`).toBe(false);
    }
  });

  test('a zig-zag path reaches the lever; the same path with a middle tile missing does not', () => {
    const zig = [0, 1, 6, 11, 12, 13, 18, 23, 28];    // r0c0 r0c1 r1c1 r2c1 r2c2 r2c3 r3c3 r4c3 r5c3
    expect(reachable(cp6, full(mask(zig)))(...marsh.lever)).toBe(true);
    const broken = zig.filter((i) => i !== 12);       // r2c2 out: r2c1 and r2c3 are a whole tile apart
    expect(reachable(cp6, full(mask(broken)))(...marsh.lever)).toBe(false);
  });

  test('tile model: indices, solid surface, forgiving edges', () => {
    expect(marsh.cols).toBe(5);
    expect(marsh.rows).toBe(6);
    expect(Math.hypot(...marsh.right)).toBeCloseTo(1, 9);
    expect(Math.hypot(...marsh.fwd)).toBeCloseTo(1, 9);
    expect(marsh.right[0] * marsh.fwd[0] + marsh.right[1] * marsh.fwd[1]).toBeCloseTo(0, 9);
    for (let i = 0; i < 30; i++) {
      expect(marshTileAt(...marshTileCentre(i))).toBe(i);
      expect(heightAt(...marshTileCentre(i), full(1 << i))).toBe(MARSH_SURFACE);
      expect(heightAt(...marshTileCentre(i), full(ALL_TILES & ~(1 << i)))).toBeLessThan(DROWN_Y);
    }
    expect(marshTileAt(...world(-0.2, 1))).toBe(-1);
    expect(marshTileAt(...world(1, Lm + 0.2))).toBe(-1);
    expect(marshTileAt(9999, 9999)).toBe(-1);
    // tile 12 (row 2, col 2) alone: 0.2 m past its edge still holds, 0.5 m past it is marsh
    const one = full(1 << 12), [cu, cv] = local(...marshTileCentre(12)), half = marsh.tile / 2;
    for (const [du, dv] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      expect(heightAt(...world(cu + du * (half + 0.2), cv + dv * (half + 0.2)), one)).toBe(MARSH_SURFACE);
      expect(heightAt(...world(cu + du * (half + 0.5), cv + dv * (half + 0.5)), one)).toBeLessThan(DROWN_Y);
    }
    // the whole marsh is deep without tiles, and with a dyn that has no marsh key at all
    for (let i = 0; i < 30; i++) {
      expect(heightAt(...marshTileCentre(i), D({}))).toBeLessThan(DROWN_Y);
      expect(heightAt(...marshTileCentre(i), { gateOpen: true })).toBeLessThan(DROWN_Y);
    }
  });

  test('H meets row 0 and I meets row 5 along their whole width; deep water down both sides', () => {
    for (let u = 0.05; u < W; u += 0.1) {
      const near = world(u, -0.05), far = world(u, Lm + 0.05);
      expect(zoneAt(...near), `near ${u}`).toBe('H');
      expect(zoneAt(...far), `far ${u}`).toBe('I');
      expect(Math.abs(heightAt(...near, DYN_NONE) - MARSH_SURFACE)).toBeLessThanOrEqual(0.3);
      expect(Math.abs(heightAt(...far, DYN_NONE) - MARSH_SURFACE)).toBeLessThanOrEqual(0.3);
    }
    for (let v = 0; v <= Lm; v += 0.1)
      for (const u of [-0.3, W + 0.3]) expect(heightAt(...world(u, v), full(ALL_TILES)), `${u},${v}`).toBeLessThan(DROWN_Y);
    expect(zoneAt(...marshTileCentre(12))).toBeNull();
  });

  test('bells: far apart in a straight line and on foot; the steps start between them', () => {
    expect(Math.hypot(bells.a[0] - bells.b[0], bells.a[1] - bells.b[1])).toBeGreaterThanOrEqual(25);
    const d = walkDistance(bells.a, D({ ...ALL5, causeway: true }))(...bells.b);
    expect(d).toBeGreaterThanOrEqual(25);
    expect(d).toBeLessThan(Infinity);
    const r = rampFor('bells');
    expect(sameSeg(r, bells.steps)).toBe(true);
    expect(r.from).toBe('G');
    expect(r.to).toBe('H');
    const foot = [r.ax, r.az];
    const da = Math.hypot(foot[0] - bells.a[0], foot[1] - bells.a[1]), db = Math.hypot(foot[0] - bells.b[0], foot[1] - bells.b[1]);
    expect(Math.abs(da - db)).toBeLessThan(5);
    expect(Math.min(da, db)).toBeGreaterThan(10);
    const m = midOf(r);
    expect(heightAt(...m, D({ causeway: true }))).toBeLessThan(DROWN_Y);
    expect(heightAt(...m, D({ causeway: true, bells: true }))).toBeGreaterThan(0.2);
  });

  test('the watch-stone: high over the marsh, set back, centred, a long walk from any tile', () => {
    expect(marsh.plate.r).toBe(1.5);
    expect(heightAt(...plate, DYN_NONE) - MARSH_SURFACE).toBeGreaterThanOrEqual(2.5);
    for (let k = 0; k < 16; k++) {                      // the whole plate is on the flat top
      const a = k * Math.PI / 8, p = [plate[0] + 1.5 * Math.cos(a), plate[1] + 1.5 * Math.sin(a)];
      expect(heightAt(...p, DYN_NONE)).toBe(heightAt(...plate, DYN_NONE));
      expect(zoneAt(...p)).toBe('H');
    }
    const [u, v] = local(...plate);
    expect(-v).toBeGreaterThanOrEqual(4);
    expect(-v).toBeLessThanOrEqual(10);
    expect(Math.abs(u - W / 2)).toBeLessThanOrEqual(1.5);
    expect(Math.hypot(WATCH_STONE.x - plate[0], WATCH_STONE.z - plate[1])).toBeLessThanOrEqual(WATCH_STONE.r - marsh.plate.r);
    const wd = walkDistance(plate, full(ALL_TILES));
    let nearest = Infinity;
    for (let i = 0; i < 30; i++) nearest = Math.min(nearest, wd(...marshTileCentre(i)));
    expect(nearest).toBeGreaterThan(6);
    expect(nearest).toBeLessThan(Infinity);
  });

  test('relay: 55-70 m on foot from the small brazier to the great one, on wide ramps', () => {
    const d = walkDistance(relay.small, full(mask(column(2))))(...relay.great);
    expect(d).toBeGreaterThanOrEqual(55);
    expect(d).toBeLessThanOrEqual(70);
    for (const r of RAMPS.filter((q) => q.from === 'I' || q.to === 'J')) expect(r.hw).toBeGreaterThanOrEqual(1.5);
    expect(RAMPS.some((q) => q.from === 'I' && q.to === 'J')).toBe(true);
  });

  test('checkpoints 6-8: H by the marsh, I by the small brazier, J', () => {
    const toMarsh = (p) => { const [u, v] = local(...p); return Math.hypot(Math.max(0, -u, u - W), Math.max(0, -v, v - Lm)); };
    for (const p of SITES.checkpoints[6]) {
      expect(toMarsh(p)).toBeGreaterThanOrEqual(3);
      expect(toMarsh(p)).toBeLessThanOrEqual(6);
      expect(local(...p)[1]).toBeLessThan(0);           // on the near side
    }
    for (const p of SITES.checkpoints[7]) expect(Math.hypot(p[0] - relay.small[0], p[1] - relay.small[1])).toBeLessThan(6);
    for (const p of SITES.checkpoints[8]) expect(zoneAt(...p)).toBe('J');
    expect(SITES.checkpoints[5]).toEqual([[3, -64], [9, -64]]);
  });

  test('isolation: no Far Isle site without the causeway; nothing in H/I/J without the steps', () => {
    const noCause = D({ ...ALL5, bells: true, marsh: ALL_TILES, lift: 1 });
    for (const from of [SITES.spawn[0], summit]) {
      const r = reachable(from, noCause);
      for (const p of [...farSites(), ...hiSites()]) expect(r(...p), `${p}`).toBe(false);
    }
    const r = reachable(summit, D({ ...ALL5, causeway: true, marsh: ALL_TILES }));
    for (const p of hiSites()) expect(r(...p), `${p}`).toBe(false);
  });

  test('stepping off the first island never lands on the Far Isle: 30 m of sea between their discs', () => {
    for (const f of ZONES.filter(isFar))
      for (const d of ZONES.filter((q) => 'ABCDEF'.includes(q.zone)))
        expect(Math.hypot(f.x - d.x, f.z - d.z) - f.r - d.r, `${f.zone}@${f.x},${f.z} / ${d.zone}@${d.x},${d.z}`).toBeGreaterThanOrEqual(30);
  });

  test('the causeway: F to G, conditional, wide, gentle, over at least 30 m of open sea', () => {
    const r = rampFor('causeway');
    expect(r.from).toBe('F');
    expect(r.to).toBe('G');
    expect(r.hw).toBeGreaterThanOrEqual(1.5);
    expect(Math.hypot(r.ax - SITES.beacon[0], r.az - SITES.beacon[1])).toBeLessThan(25);
    const len = Math.hypot(r.bx - r.ax, r.bz - r.az), ux = (r.bx - r.ax) / len, uz = (r.bz - r.az) / len;
    expect(zoneAt(r.ax - ux * 1.5, r.az - uz * 1.5)).toBe('F');
    expect(zoneAt(r.bx + ux * 1.5, r.bz + uz * 1.5)).toBe('G');
    let run = 0, best = 0;
    for (let s = 0; s <= len; s += 0.05) {
      run = heightAt(r.ax + ux * s, r.az + uz * s, DYN_NONE) < DROWN_Y ? run + 0.05 : 0;
      best = Math.max(best, run);
    }
    expect(best).toBeGreaterThanOrEqual(30);
    // gentle: walk it both ways at run speed's 30 Hz substeps (0.18 m) and never rise > STEP_UP
    const dyn = D({ causeway: true });
    for (const off of [0, r.hw - 0.05, -(r.hw - 0.05)]) {
      let prev = null;
      for (let s = -0.5; s <= len + 0.5; s += 0.05) {
        const h = heightAt(r.ax + ux * s - uz * off, r.az + uz * s + ux * off, dyn);
        expect(h).toBeGreaterThan(DROWN_Y);
        if (prev !== null) expect(Math.abs(h - prev)).toBeLessThan(0.1);
        prev = h;
      }
    }
  });

  test('cliffs or water between Far Isle zones; plateaus nearly flat (the watch-stone aside)', () => {
    const S = 0.25;
    const nominal = Object.fromEntries(ZONES.map((z) => [z.zone, z.h]));
    const onStone = (x, z) => Math.hypot(x - WATCH_STONE.x, z - WATCH_STONE.z) <= WATCH_STONE.r + 0.3;
    const xs = ZONES.filter(isFar).flatMap((d) => [d.x - d.r, d.x + d.r]);
    const zs = ZONES.filter(isFar).flatMap((d) => [d.z - d.r, d.z + d.r]);
    const x0 = Math.floor(Math.min(...xs)) - 2, x1 = Math.ceil(Math.max(...xs)) + 2;
    const z0 = Math.floor(Math.min(...zs)) - 2, z1 = Math.ceil(Math.max(...zs)) + 2;
    let prevRow = null;
    for (let z = z0; z <= z1; z += S) {
      const row = [];
      for (let x = x0; x <= x1; x += S) {
        const zone = zoneAt(x, z), h = heightAt(x, z, DYN_NONE);
        row.push([zone, h]);
        if (zone && !onStone(x, z)) expect(Math.abs(h - nominal[zone]), `${zone} at ${x},${z}`).toBeLessThan(0.12);
        const left = row.length > 1 ? row[row.length - 2] : null, up = prevRow ? prevRow[row.length - 1] : null;
        for (const n of [left, up]) {
          if (n && n[0] && zone && n[0] !== zone && Math.abs(n[1] - h) < 1.2)
            throw new Error(`soft border ${n[0]}/${zone} at ${x},${z}`);
        }
      }
      prevRow = row;
    }
  });

  test('a dyn without the new keys reads exactly like one with their defaults', () => {
    const olds = [DYN_NONE, ALL5, { gateOpen: true }, { gateOpen: true, bridge: true, plank: true, lift: 0.5, ladder: false }];
    const strip = (o) => { const { causeway, bells: b, marsh: m, ...rest } = o; return rest; };
    let k = 0;
    for (let i = 0; i < 200; i++) {
      // a deterministic scatter over the first island
      const x = -50 + ((i * 37) % 200) * 0.4, z = -80 + ((i * 53) % 200) * 1.1;
      for (const o of olds) {
        const old = strip(o), neu = { ...old, causeway: false, bells: false, marsh: 0 };
        expect(heightAt(x, z, old)).toBe(heightAt(x, z, neu));
        expect(blockers(old)).toEqual(blockers(neu));
        k++;
      }
      expect(zoneAt(x, z)).toBe(zoneAt(x, z));
    }
    expect(k).toBe(800);
    expect(Object.keys(DYN_NONE).sort()).toEqual(['bells', 'causeway', 'gateOpen', 'ladder', 'lift', 'marsh', 'plank', 'bridge', 'pillars', 'ring'].sort());
    expect(DYN_NONE.causeway).toBe(false);
    expect(DYN_NONE.bells).toBe(false);
    expect(DYN_NONE.marsh).toBe(0);
  });

  test('renderer data: the new ramps carry their flags; heightAt stays cheap over the Far Isle', () => {
    expect(RAMPS.filter((r) => r.flag === 'causeway')).toHaveLength(1);
    expect(RAMPS.filter((r) => r.flag === 'bells')).toHaveLength(1);
    for (const r of RAMPS) expect(r.hw).toBeGreaterThan(0);
    const t0 = performance.now();
    let sum = 0;
    for (let i = 0; i < 300; i++) for (let j = 0; j < 300; j++) sum += heightAt(40 + i * 0.4, -90 + j * 0.25, full(mask(column(2))));
    expect(performance.now() - t0).toBeLessThan(2500);
    expect(Number.isFinite(sum)).toBe(true);
  });
});

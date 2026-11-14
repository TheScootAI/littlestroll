import { test, expect, describe } from 'vitest';
import {
  DYN_NONE, heightAt, blockers, zoneAt, SITES, ZONES, RAMPS, TRAIL, PLANK_ROUTE, PLANK_CORRIDOR,
} from '../src/world/layout.js';
import { occluded } from '../src/world/sight.js';
import { reachable } from './helpers/reach.js';
import { DROWN_Y, STEP_UP, PLAYER_R } from '../src/config.js';
import { pointSegDist, segCircle, rayPointDist } from '../src/core/math.js';

const D = (o) => ({ ...DYN_NONE, ...o });
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
  expect(SITES.checkpoints).toHaveLength(6);
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
    expect(RAMPS).toHaveLength(5);
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
  test('two walkers can carry the plank from its rests through the zigzag to the slot', () => {
    const route = [restA, restB, ...PLANK_ROUTE];
    expect(PLANK_ROUTE[PLANK_ROUTE.length - 1]).toEqual(slot);
    const L = polyLen(route);
    const dyn = D({ gateOpen: true, bridge: true });
    for (let sL = 4; sL <= L + 1e-9; sL += 0.05) {
      const gap = Math.max(1.2, 4 - (sL - 4));            // close up from 4 m to 1.2 m after pickup
      const lead = along(route, sL), tail = along(route, Math.max(0, sL - gap));
      for (const w of [lead, tail]) {
        expect(zoneAt(...w)).toBe('D');
        expect(clearOf(...w, dyn)).toBe(true);
      }
      expect(Math.hypot(lead[0] - tail[0], lead[1] - tail[1])).toBeLessThanOrEqual(5.5);
      for (const s of stones) expect(segCircle(lead[0], lead[1], tail[0], tail[1], s.x, s.z, s.r)).toBe(false);
    }
  });
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
  const dyn = D({ ...ALL, lift: 0 });
  for (const r of RAMPS) {
    const len = Math.hypot(r.bx - r.ax, r.bz - r.az), ux = (r.bx - r.ax) / len, uz = (r.bz - r.az) / len;
    for (const off of [0, r.hw - 0.05, -(r.hw - 0.05)]) {
      const hs = [];
      for (let s = -0.5; s <= len + 0.5; s += 0.1) {
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
  const want = ['A', 'B', 'D', 'E', 'F', 'F'];
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
      expect([null, 'bridge', 'plank', 'ladder']).toContain(r.flag);
    }
    expect(JSON.parse(JSON.stringify(RAMPS))).toEqual(RAMPS);
    expect(JSON.parse(JSON.stringify(SITES))).toEqual(SITES);
  });
  test('TRAIL runs from spawn to the beacon over walkable ground', () => {
    expect(Math.hypot(TRAIL[0][0] - SITES.spawn[0][0], TRAIL[0][1] - SITES.spawn[0][1])).toBeLessThan(3);
    expect(TRAIL[TRAIL.length - 1]).toEqual(SITES.beacon);
    const L = polyLen(TRAIL);
    for (let s = 0; s <= L; s += 0.25) {
      const p = along(TRAIL, s);
      expect(heightAt(...p, ALL)).toBeGreaterThan(DROWN_Y);
      if (Math.hypot(p[0] - SITES.beacon[0], p[1] - SITES.beacon[1]) > 2.5) expect(clearOf(...p, ALL), `${p}`).toBe(true);
    }
  });
});

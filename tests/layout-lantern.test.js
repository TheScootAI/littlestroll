import { test, expect } from 'vitest';
import {
  DYN_NONE, heightAt, zoneAt, blockers, SITES, ZONES, TRAIL, RAMPS,
  PILLAR_SURFACE, PILLAR_BITS, pillarAt, pillarCentre,
} from '../src/world/layout.js';
import { siteAnchors } from '../src/world/terrain.js';
import { reachable, walkDistance, GRID } from './helpers/reach.js';
import { GRID as PATH_GRID } from '../src/debug/path.js';
import { DROWN_Y, STEP_UP, PLAYER_R, RUN } from '../src/config.js';
import { pointSegDist } from '../src/core/math.js';
import { BURN } from '../src/puzzles/lanterns.js';

const D = (o) => ({ ...DYN_NONE, ...o });
const FAR = D({ gateOpen: true, bridge: true, plank: true, ladder: true, causeway: true, bells: true, marsh: (1 << 30) - 1 });
const full = (1 << PILLAR_BITS) - 1;
const CROSSED = { ...FAR, pillars: full };
const ALL = { ...CROSSED, ring: true };
const { pillars: P, ring, lanterns, owls, checkpoints } = SITES;
const cp8 = checkpoints[8][0];
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const xz = (d) => [d.x, d.z];
const ringCentre = ring.centre;

const clearOf = (x, z, dyn, margin = PLAYER_R) => {
  const { circles, segments } = blockers(dyn);
  for (const c of circles) if (Math.hypot(x - c.x, z - c.z) < c.r + margin) return false;
  for (const s of segments) if (pointSegDist(x, z, s.ax, s.az, s.bx, s.bz).d < margin) return false;
  return true;
};
// The eight points 1 m around p are within 0.2 m of p's height.
const level = (p, dyn = ALL) => {
  const h = heightAt(...p, dyn);
  for (let k = 0; k < 8; k++) {
    const a = k * Math.PI / 4;
    if (Math.abs(heightAt(p[0] + Math.cos(a), p[1] + Math.sin(a), dyn) - h) > 0.2) return false;
  }
  return true;
};
// How many of the eight points 1 m around p are within 0.2 m of p's height.
const levelAround = (p, dyn = ALL) => {
  const h = heightAt(...p, dyn);
  let n = 0;
  for (let k = 0; k < 8; k++) {
    const a = k * Math.PI / 4;
    if (Math.abs(heightAt(p[0] + Math.cos(a), p[1] + Math.sin(a), dyn) - h) <= 0.2) n++;
  }
  return n;
};
// Some point within `r` of p that a reach map says is reached.
const near = (reach, p, r) => {
  for (let k = 0; k < 16; k++) {
    const a = k * Math.PI / 8;
    if (reach(p[0] + r * Math.cos(a), p[1] + r * Math.sin(a))) return true;
  }
  return false;
};
// Unit vector from a line's axis toward its outer side (away from the other line).
const across = () => [-P.fwd[1], P.fwd[0]];
const lineU = (l, p) => { const o = P.lines[l].origin, r = across(); return (p[0] - o[0]) * r[0] + (p[1] - o[1]) * r[1]; };
const outward = (l) => { const s = Math.sign(lineU(l, P.lines[1 - l].origin)); const r = across(); return [-s * r[0], -s * r[1]]; };
const along = (l, v) => [P.lines[l].origin[0] + P.fwd[0] * v, P.lines[l].origin[1] + P.fwd[1] * v];
const L = P.n * P.tile;
// Distance from p to pillar (l, r)'s square.
const toSquare = (l, r, p) => {
  const c = pillarCentre(l, r), rt = across();
  const u = (p[0] - c[0]) * rt[0] + (p[1] - c[1]) * rt[1], v = (p[0] - c[0]) * P.fwd[0] + (p[1] - c[1]) * P.fwd[1];
  return Math.hypot(Math.max(0, Math.abs(u) - P.tile / 2), Math.max(0, Math.abs(v) - P.tile / 2));
};
// Distance from a point of one line's rectangle to the other's: rectangles are parallel strips.
const rectGap = () => Math.abs(lineU(0, P.lines[1].origin)) - P.tile;

function perms(a) {
  if (a.length <= 1) return [a];
  return a.flatMap((x, i) => perms([...a.slice(0, i), ...a.slice(i + 1)]).map((p) => [x, ...p]));
}

test('grid: every zone disc lies 5 m inside the flood grid; the pilot uses the same grid', () => {
  const { X0, Z0, N, STEP } = GRID;
  const X1 = X0 + (N - 1) * STEP, Z1 = Z0 + (N - 1) * STEP;
  expect(STEP).toBe(0.5);
  for (const d of ZONES) {
    expect(d.x - d.r - 5, `${d.zone}@${d.x},${d.z}`).toBeGreaterThanOrEqual(X0);
    expect(d.x + d.r + 5).toBeLessThanOrEqual(X1);
    expect(d.z - d.r - 5).toBeGreaterThanOrEqual(Z0);
    expect(d.z + d.r + 5).toBeLessThanOrEqual(Z1);
  }
  expect(PATH_GRID).toEqual(GRID);
});

test('DYN_NONE: no pillar raised, no steps', () => {
  expect(DYN_NONE.pillars).toBe(0);
  expect(DYN_NONE.ring).toBe(false);
});

test('with the first eight solved: the near landing, nothing past it', () => {
  const r = reachable(cp8, FAR);
  expect(r(P.near.x, P.near.z)).toBe(true);
  expect(r(P.far.x, P.far.z)).toBe(false);
  expect(r(...ringCentre)).toBe(false);
  for (const p of lanterns.posts) expect(near(r, p, 1.2)).toBe(false);
});

test('pillars crossed: K, the ring, both seeing spots and checkpoint 9; not L', () => {
  const r = reachable(cp8, CROSSED);
  expect(r(P.far.x, P.far.z)).toBe(true);
  expect(r(...ringCentre)).toBe(true);
  for (const s of ring.stones) {
    const d = dist(s, ringCentre), t = (d - 1) / d;
    expect(r(ringCentre[0] + (s[0] - ringCentre[0]) * t, ringCentre[1] + (s[1] - ringCentre[1]) * t), `${s}`).toBe(true);
  }
  for (const s of ring.seeing) expect(r(s.spot.x, s.spot.z)).toBe(true);
  for (const p of checkpoints[9]) expect(r(...p)).toBe(true);
  for (const p of lanterns.posts) expect(near(r, p, 1.4)).toBe(false);
  expect(near(r, lanterns.tally, 1.4)).toBe(false);
  for (const p of checkpoints[10]) expect(r(...p)).toBe(false);
});

test('steps up: every lantern post, the tally, checkpoints 10 and 11; never the lamp', () => {
  const r = reachable(cp8, ALL);
  for (const p of lanterns.posts) expect(near(r, p, 1.4), `${p}`).toBe(true);
  expect(near(r, lanterns.tally, 1.4)).toBe(true);
  for (const p of [...checkpoints[10], ...checkpoints[11]]) expect(r(...p)).toBe(true);
  expect(r(...lanterns.lamp)).toBe(false);
});

test('one line raised end to end joins the landings; four pillars of each do not', () => {
  for (const bits of [0x1ff, 0x1ff << 9])
    expect(reachable([P.near.x, P.near.z], D({ ...FAR, pillars: bits }))(P.far.x, P.far.z)).toBe(true);
  expect(reachable([P.near.x, P.near.z], D({ ...FAR, pillars: 0xf | (0xf << 9) }))(P.far.x, P.far.z)).toBe(false);
});

test('SITES.pillars.fwd is a copy: changing it moves neither the ground nor pillarAt', () => {
  const c = pillarCentre(0, 3), before = [heightAt(...c, D({ pillars: 1 << 3 })), pillarAt(...c)];
  const saved = [...P.fwd];
  try {
    P.fwd[0] = 1; P.fwd[1] = 0;
    expect(heightAt(...c, D({ pillars: 1 << 3 }))).toBe(before[0]);
    expect(before[0]).toBe(PILLAR_SURFACE);
    expect(pillarAt(...c)).toEqual(before[1]);
    expect(pillarAt(...c)).not.toBeNull();
  } finally { P.fwd[0] = saved[0]; P.fwd[1] = saved[1]; }
  expect(P.fwd).toEqual(saved);
});

test('pillar ground: raised = PILLAR_SURFACE with a small margin, lowered = sea floor', () => {
  for (let l = 0; l < 2; l++) for (let r = 0; r < P.n; r++) {
    const bit = 1 << (l * 9 + r), c = pillarCentre(l, r);
    expect(heightAt(...c, D({ pillars: bit }))).toBe(PILLAR_SURFACE);
    expect(heightAt(...c, D({ pillars: full & ~bit }))).toBeLessThan(DROWN_Y);
    expect(heightAt(...c, DYN_NONE)).toBeLessThan(DROWN_Y);
    const o = outward(l), half = P.tile / 2;
    expect(heightAt(c[0] + o[0] * (half + 0.25), c[1] + o[1] * (half + 0.25), D({ pillars: bit }))).toBe(PILLAR_SURFACE);
    expect(heightAt(c[0] + o[0] * (half + 0.4), c[1] + o[1] * (half + 0.4), D({ pillars: bit }))).toBeLessThan(DROWN_Y);
  }
});

test('pillarAt round-trips; null off the lines; zoneAt null over a pillar', () => {
  for (let l = 0; l < 2; l++) for (let r = 0; r < P.n; r++) {
    expect(pillarAt(...pillarCentre(l, r))).toEqual({ line: l, r });
    expect(zoneAt(...pillarCentre(l, r))).toBeNull();
  }
  const mid = (v) => { const a = along(0, v), b = along(1, v); return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]; };
  expect(pillarAt(P.near.x, P.near.z)).toBeNull();
  expect(pillarAt(P.far.x, P.far.z)).toBeNull();
  for (let v = 0; v <= L; v += 0.5) expect(pillarAt(...mid(v))).toBeNull();
  expect(pillarAt(9999, 9999)).toBeNull();
});

test('near and far landings: take in the ground before and past both lines, touch no pillar', () => {
  for (let l = 0; l < 2; l++) {
    expect(dist(along(l, -0.5), xz(P.near))).toBeLessThanOrEqual(P.near.r);
    expect(dist(along(l, L + 0.8), xz(P.far))).toBeLessThanOrEqual(P.far.r);
    for (let r = 0; r < P.n; r++) {
      expect(toSquare(l, r, xz(P.near))).toBeGreaterThan(P.near.r);
      expect(toSquare(l, r, xz(P.far))).toBeGreaterThan(P.far.r);
    }
  }
  for (const p of checkpoints[8]) expect(dist(p, xz(P.near))).toBeGreaterThan(P.near.r);
  expect(Math.hypot(...P.fwd)).toBeCloseTo(1, 9);
  expect(P.edge).toBe(0.3);
  expect(P.n).toBe(9);
});

test('the two lines are too far apart to step between', () => {
  for (let r = 0; r < P.n; r++) expect(dist(pillarCentre(0, r), pillarCentre(1, r))).toBeGreaterThanOrEqual(4);
  expect(Math.abs(lineU(0, P.lines[1].origin) - 0)).toBeGreaterThan(0);
  expect(Math.abs((P.lines[1].origin[0] - P.lines[0].origin[0]) * P.fwd[0] + (P.lines[1].origin[1] - P.lines[0].origin[1]) * P.fwd[1])).toBeLessThan(1e-9);
  expect(rectGap()).toBeGreaterThanOrEqual(3);
});

test('near → every pillar → far never rises more than STEP_UP', () => {
  const dyn = D({ ...FAR, pillars: full });
  for (let l = 0; l < 2; l++) {
    const a = along(l, -1.5), b = along(l, L + 1.5);
    expect(dist(a, xz(P.near))).toBeLessThanOrEqual(P.near.r + 1.5);
    let prev = heightAt(...a, dyn);
    for (let s = 0.25; s <= L + 3; s += 0.25) {
      const p = along(l, -1.5 + s), h = heightAt(...p, dyn);
      expect(h, `${l} ${s}`).toBeGreaterThan(DROWN_Y);
      expect(h - prev, `${l} ${s}`).toBeLessThanOrEqual(STEP_UP);
      prev = h;
    }
    expect(zoneAt(...b)).toBe('K');
  }
  expect(zoneAt(P.far.x, P.far.z)).toBe('K');
});

test('ring: eight stones evenly round a circle on K, the entrance between the last and the first', () => {
  const { centre, stones, entrance } = ring;
  expect(stones).toHaveLength(8);
  const R = dist(stones[0], centre);
  expect(R).toBeGreaterThanOrEqual(5);
  expect(R).toBeLessThanOrEqual(7);
  expect(ring.r).toBeGreaterThanOrEqual(R + 2);
  // bearing clockwise from north (-Z) seen from above
  const bearing = (p) => Math.atan2(p[0] - centre[0], -(p[1] - centre[1]));
  const norm = (a) => ((a % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
  const b0 = bearing(entrance);
  for (let i = 0; i < 8; i++) {
    expect(dist(stones[i], centre)).toBeCloseTo(R, 6);
    expect(norm(bearing(stones[i]) - b0)).toBeCloseTo((i + 0.5) * Math.PI / 4, 6);  // clockwise from the entrance
  }
  expect(dist(entrance, centre)).toBeCloseTo(R, 6);
  for (const p of [centre, entrance, ...stones]) expect(zoneAt(...p)).toBe('K');
  for (let k = 0; k < 32; k++) {
    const a = k * Math.PI / 16;
    expect(zoneAt(centre[0] + ring.r * Math.cos(a), centre[1] + ring.r * Math.sin(a))).toBe('K');
  }
});

test('seeing stones: far apart on K, each with a level spot it faces', () => {
  const [a, b] = ring.seeing;
  expect(ring.seeing).toHaveLength(2);
  expect(dist(xz(a.spot), xz(b.spot))).toBeGreaterThanOrEqual(30);
  for (const s of ring.seeing) {
    const spot = xz(s.spot);
    expect(s.spot.r).toBe(1.5);
    expect(dist(spot, ring.centre)).toBeGreaterThanOrEqual(15);
    expect(dist(spot, ring.centre)).toBeGreaterThan(ring.r);
    expect(zoneAt(...spot)).toBe('K');
    expect(level(spot)).toBe(true);
    const d = dist(s.stone, spot);
    expect(d).toBeGreaterThanOrEqual(1.5);
    expect(d).toBeLessThanOrEqual(2.5);
    const want = Math.atan2(-(spot[0] - s.stone[0]), -(spot[1] - s.stone[1]));   // yaw 0 faces -Z
    expect(Math.abs(Math.atan2(Math.sin(s.yaw - want), Math.cos(s.yaw - want)))).toBeLessThan(0.1);
  }
});

test('lanterns, one walker: the shortest straight way through all six outlasts a burn at a run', () => {
  const { posts } = lanterns;
  expect(posts).toHaveLength(6);
  let best = Infinity;
  for (const o of perms([0, 1, 2, 3, 4, 5])) {
    let d = 0;
    for (let i = 1; i < 6; i++) d += dist(posts[o[i - 1]], posts[o[i]]);
    best = Math.min(best, d);
  }
  expect(best).toBeGreaterThanOrEqual(1.1 * BURN * RUN);
});

test('lanterns, two walkers: some split lets each run their share in 0.6 of a burn', () => {
  const { posts } = lanterns;
  const W = posts.map((p) => walkDistance(p, ALL));
  const M = posts.map((_, i) => posts.map((q) => W[i](...q)));
  const shareLen = (ids) => Math.min(...perms(ids).map((o) => o.slice(1).reduce((s, j, k) => s + M[o[k]][j], 0)));
  let best = Infinity;
  for (let m = 1; m < 63; m++) {
    const a = [0, 1, 2, 3, 4, 5].filter((i) => m & (1 << i)), b = [0, 1, 2, 3, 4, 5].filter((i) => !(m & (1 << i)));
    best = Math.min(best, Math.max(shareLen(a), shareLen(b)));
  }
  expect(best).toBeLessThanOrEqual(0.6 * BURN * RUN);
});

test('lanterns, hidden: the tor stands between the head of the steps and at least three posts', () => {
  const tor = ZONES.filter((d) => d.zone === 'T');
  expect(tor.length).toBeGreaterThan(0);
  for (const from of checkpoints[10]) {
    const hidden = lanterns.posts.filter((p) => tor.some((d) => pointSegDist(d.x, d.z, ...from, ...p).d < d.r));
    expect(hidden.length).toBeGreaterThanOrEqual(3);
  }
});

test('the tor: far above L, reachable from nowhere, the lamp on top', () => {
  const h = (L) => ZONES.find((d) => d.zone === L).h;
  expect(h('T') - h('L')).toBeGreaterThanOrEqual(6);
  expect(h('L') - h('K')).toBeCloseTo(3, 6);
  expect(h('K')).toBeGreaterThan(PILLAR_SURFACE);
  expect(h('K') - PILLAR_SURFACE).toBeLessThanOrEqual(STEP_UP - 0.08);
  expect(PILLAR_SURFACE - h('J')).toBeLessThanOrEqual(STEP_UP - 0.08);
  expect(Math.abs(PILLAR_SURFACE - h('J'))).toBeLessThanOrEqual(STEP_UP);
  expect(zoneAt(...lanterns.lamp)).toBe('T');
  expect(lanterns.lampH).toBeGreaterThan(0);   // how high the great lamp's flame sits above the tor's top
  expect(Number.isFinite(lanterns.lampH)).toBe(true);
  for (const p of lanterns.posts) expect(zoneAt(...p)).toBe('L');
  expect(zoneAt(...lanterns.tally)).toBe('L');
});

test('around every standing stone, seeing stone, lantern post and the tally: 2 m of level ground', () => {
  const R = (p) => blockers(ALL).circles.find((c) => c.x === p[0] && c.z === p[1]);
  for (const p of [...ring.stones, ...ring.seeing.map((s) => s.stone), ...lanterns.posts, lanterns.tally]) {
    const c = R(p);
    expect(c, `${p} is a blocker`).toBeTruthy();
    const h = heightAt(...p, ALL);
    for (let k = 0; k < 16; k++) {
      const a = k * Math.PI / 8;
      for (const d of [c.r + 0.5, c.r + 2])
        expect(Math.abs(heightAt(p[0] + d * Math.cos(a), p[1] + d * Math.sin(a), ALL) - h), `${p}`).toBeLessThan(0.2);
    }
  }
});

test('owls: eight, off the trail, reachable, room to walk up, clear of every site, apart', () => {
  expect(owls).toHaveLength(8);
  const trailD = (p) => Math.min(...TRAIL.slice(1).map((b, i) => pointSegDist(...p, ...TRAIL[i], ...b).d));
  const r = reachable(SITES.spawn[0], ALL);
  const anchors = [
    ...siteAnchors(), ...ring.stones, ring.centre, ring.entrance, ...ring.seeing.flatMap((s) => [s.stone, xz(s.spot)]),
    ...lanterns.posts, lanterns.tally, lanterns.lamp, xz(P.near), xz(P.far), ...checkpoints.flat(),
    SITES.marsh.lever, xz(SITES.marsh.plate), SITES.relay.small, SITES.relay.great,
  ];
  const { circles, segments } = blockers(DYN_NONE);
  const zones = ['ABCDEF', 'ABCDEF', 'ABCDEF', 'GHIJ', 'GHIJ', 'KL', 'KL', 'KL'];
  owls.forEach((o, i) => {
    expect(trailD(o), `owl ${i}`).toBeGreaterThanOrEqual(6);
    expect(r(...o), `owl ${i}`).toBe(true);
    // room to walk up to it: most of the ground a step away is level with it (an owl may sit on a
    // plateau's rim, like the one behind the rock at the start, but never on a point or a ledge)
    expect(levelAround(o), `owl ${i}`).toBeGreaterThanOrEqual(5);
    for (const a of anchors) expect(dist(o, a), `owl ${i} / ${a}`).toBeGreaterThanOrEqual(3);
    for (const c of circles) expect(Math.hypot(o[0] - c.x, o[1] - c.z) - c.r, `owl ${i}`).toBeGreaterThanOrEqual(3);
    for (const s of segments) expect(pointSegDist(...o, s.ax, s.az, s.bx, s.bz).d).toBeGreaterThanOrEqual(3);
    expect(zones[i]).toContain(zoneAt(...o));
    for (let j = i + 1; j < 8; j++) expect(dist(o, owls[j]), `owls ${i}, ${j}`).toBeGreaterThanOrEqual(10);
  });
});

test('checkpoints 9-11: K, the head of the steps, L; level, apart, reachable once earned', () => {
  expect(checkpoints).toHaveLength(12);
  const want = ['K', 'L', 'L'];
  const rK = reachable(cp8, CROSSED), rL = reachable(cp8, ALL);
  [9, 10, 11].forEach((n, k) => {
    const pair = checkpoints[n];
    expect(pair).toHaveLength(2);
    expect(dist(pair[0], pair[1])).toBeGreaterThanOrEqual(1);
    for (const p of pair) {
      expect(zoneAt(...p), `checkpoint ${n}`).toBe(want[k]);
      expect(level(p)).toBe(true);
      expect(clearOf(...p, ALL)).toBe(true);
      expect((n === 9 ? rK : rL)(...p)).toBe(true);
    }
  });
  const head = [ring.steps.bx, ring.steps.bz];
  for (const p of checkpoints[10]) expect(dist(p, head)).toBeLessThan(6);
});

test('the steps: K to L, flag ring, gone without it', () => {
  const r = RAMPS.find((q) => q.flag === 'ring');
  expect(r.from).toBe('K');
  expect(r.to).toBe('L');
  expect([r.ax, r.az, r.bx, r.bz]).toEqual([ring.steps.ax, ring.steps.az, ring.steps.bx, ring.steps.bz]);
  const m = [(r.ax + r.bx) / 2, (r.az + r.bz) / 2];
  expect(heightAt(...m, CROSSED)).toBeLessThan(DROWN_Y);
  expect(heightAt(...m, ALL)).toBeGreaterThan(DROWN_Y);
});

test('TRAIL: on from J over the pillars, through the ring, up the steps to the tally', () => {
  const j = TRAIL.findIndex((p) => p[0] === SITES.relay.great[0] && p[1] === SITES.relay.great[1]);
  expect(j).toBeGreaterThan(0);
  const rest = TRAIL.slice(j);
  expect(rest.length).toBeGreaterThan(3);
  const walkable = (p) => {
    for (let k = -1; k < 8; k++) {
      const q = k < 0 ? p : [p[0] + 0.5 * Math.cos(k * Math.PI / 4), p[1] + 0.5 * Math.sin(k * Math.PI / 4)];
      if (heightAt(...q, ALL) > DROWN_Y && clearOf(...q, ALL)) return true;
    }
    return false;
  };
  // every 0.25 m along the trail after the great brazier; over the sea between the two pillar
  // lines the trail runs down the middle, where there is nothing to stand on
  let sampled = 0;
  for (let i = 1; i < rest.length; i++) {
    const len = dist(rest[i - 1], rest[i]);
    for (let s = 0; s <= len; s += 0.25) {
      const p = [rest[i - 1][0] + (rest[i][0] - rest[i - 1][0]) * s / len, rest[i - 1][1] + (rest[i][1] - rest[i - 1][1]) * s / len];
      const between = p[1] <= P.near.z && p[1] >= P.far.z;
      if (between && pillarAt(...p) === null && heightAt(...p, ALL) <= DROWN_Y) continue;
      sampled++;
      expect(walkable(p), `${p}`).toBe(true);
    }
  }
  expect(sampled).toBeGreaterThan(200);
  for (let i = 1; i < rest.length; i++) expect(dist(rest[i - 1], rest[i])).toBeLessThanOrEqual(45);
  expect(rest).toContainEqual(ring.centre);
  expect(rest).toContainEqual([ring.steps.ax, ring.steps.az]);
  expect(rest).toContainEqual([ring.steps.bx, ring.steps.bz]);
  expect(dist(rest[rest.length - 1], lanterns.tally)).toBeLessThan(3);
});

test('the Lantern Isle stands in open sea: 30 m from the first island, 15 m from the Far Isle', () => {
  const lantern = ZONES.filter((d) => 'KLT'.includes(d.zone));
  expect(lantern.length).toBeGreaterThan(10);
  const gap = (a, b) => Math.hypot(a.x - b.x, a.z - b.z) - a.r - b.r;
  for (const a of lantern) {
    for (const b of ZONES) {
      if ('ABCDEF'.includes(b.zone)) expect(gap(a, b), `${a.zone}(${a.x},${a.z}) / ${b.zone}(${b.x},${b.z})`).toBeGreaterThanOrEqual(30);
      // J's landing is where the pillars start; the lines of the Lantern Isle's discs may meet it
      else if ('GHIJ'.includes(b.zone) && !(b.zone === 'J' && b.x === 152.5 && b.z === -50)) expect(gap(a, b), `${a.zone}(${a.x},${a.z}) / ${b.zone}(${b.x},${b.z})`).toBeGreaterThanOrEqual(15);
    }
  }
});

test('the first two islands: as reachable as before with the new keys at rest', () => {
  const dyn = { ...FAR, pillars: 0, ring: false };
  const r = reachable(SITES.spawn[0], dyn);
  for (const pair of checkpoints.slice(0, 9)) for (const p of pair) expect(r(...p), `${p}`).toBe(true);
  for (const p of [
    SITES.gate.plateA, SITES.gate.plateB, SITES.signal.lookout, ...SITES.signal.dials, SITES.plank.restA,
    SITES.plank.slot, SITES.lift.crank, SITES.lift.post, ...SITES.beam.mirrors, SITES.beam.hint.p1, SITES.beam.hint.p2,
    SITES.bells.a, SITES.bells.b, xz(SITES.marsh.plate), SITES.marsh.lever, SITES.relay.small, SITES.relay.great,
  ]) expect(r(...p), `${p}`).toBe(true);
  const d = walkDistance(SITES.relay.small, dyn)(...SITES.relay.great);
  expect(d).toBeGreaterThanOrEqual(55);
  expect(d).toBeLessThanOrEqual(70);
  expect(r(P.far.x, P.far.z)).toBe(false);
});

import { test, expect } from 'vitest';
import { LINGER, create, placeOf, step, maskOf, prompt, valid, forceSolve } from '../src/puzzles/pillars.js';
import { SITES, pillarCentre, PILLAR_BITS } from '../src/world/layout.js';

const P = (xz, o = {}) => ({ present: true, x: xz[0], y: 0, z: xz[1], aim: [0, 0, -1], hold: false, pressed: false, ...o });
const gone = { present: false };
const PL = SITES.pillars;
const land = [PL.near.x, PL.near.z];
const on = (line, r) => P(pillarCentre(line, r));
const bit = (line, r) => 1 << (line * PL.n + r);
const bits = (line, rs) => rs.reduce((m, r) => m | bit(line, r), 0);
const run = (s, a, b, secs, open = true) => { for (let t = 0; t < secs; t += 0.05) step(s, [a, b], 0.05, open); };

test('layout facts the rules rely on', () => { expect(PILLAR_BITS).toBe(18); expect(LINGER).toBe(0.4); });

test('placeOf: landing, pillar, elsewhere, absent', () => {
  expect(placeOf(P(land))).toEqual({ line: null, r: -1 });
  expect(placeOf(on(1, 4))).toEqual({ line: 1, r: 4 });
  expect(placeOf(on(0, 0))).toEqual({ line: 0, r: 0 });
  expect(placeOf(P(SITES.spawn[0]))).toBeNull();
  expect(placeOf(gone)).toBeNull();
  expect(placeOf(undefined)).toBeNull();
});

test('placeOf: 0.5 m before pillar 0 is the landing across a line\'s full width; the summit checkpoint is not', () => {
  for (let line = 0; line < 2; line++) {
    const [o0, o1] = PL.lines[line].origin;
    for (const dx of [-1.2, 0, 1.2]) {
      expect(placeOf(P([o0 + dx, o1 - PL.fwd[1] * 0.5]))).toEqual({ line: null, r: -1 });
    }
  }
  for (const c of SITES.checkpoints[8]) expect(placeOf(P(c))).toBeNull();
});

test('one walker raises nothing, anywhere', () => {
  for (const spot of [P(land), on(0, 3), on(1, 0)]) {
    const s = create(); for (let i = 0; i < 20; i++) step(s, [spot, gone], 0.05); expect(maskOf(s)).toBe(0);
    const u = create(); for (let i = 0; i < 20; i++) step(u, [gone, spot], 0.05); expect(maskOf(u)).toBe(0);
  }
});

test('two walkers on the landing raise pillar 0 of both lines and nothing else', () => {
  const s = create(); run(s, P(land), P(land), 0.5);
  expect(maskOf(s)).toBe(bit(0, 0) | bit(1, 0));
});

test('abreast on pillar 3: the other line gets 2-4 each', () => {
  const s = create(); run(s, on(0, 3), on(1, 3), 0.5);
  expect(maskOf(s)).toBe(bits(0, [2, 3, 4]) | bits(1, [2, 3, 4]));
});

test('A on pillar 0, B on the landing: A\'s line has 0 only, B\'s has 0 and 1', () => {
  const s = create(); run(s, on(0, 0), P(land), 0.5);
  expect(maskOf(s)).toBe(bits(0, [0]) | bits(1, [0, 1]));
});

test('present but nowhere friend: the walker on a pillar still raises the other line', () => {
  const s = create(); run(s, on(0, 3), P(SITES.spawn[0]), 0.5);
  expect(maskOf(s)).toBe(bits(1, [2, 3, 4]));
});

test('both on the same line raise the other line, not their own', () => {
  const s = create(); run(s, on(0, 2), on(0, 5), 0.5);
  expect(maskOf(s)).toBe(bits(1, [1, 2, 3, 4, 5, 6]));
});

test('a pillar outlives its cause by LINGER and no longer', () => {
  const s = create(); run(s, P(land), P(land), 0.2);
  expect(maskOf(s)).not.toBe(0);
  run(s, gone, gone, 0.3); expect(maskOf(s) & bit(0, 0)).toBe(bit(0, 0));
  run(s, gone, gone, 0.2); expect(maskOf(s)).toBe(0);
});

test('B leaves: A\'s pillar goes down after LINGER', () => {
  const s = create(); run(s, on(0, 3), on(1, 3), 0.3);
  expect(maskOf(s) & bit(0, 3)).toBe(bit(0, 3));
  run(s, on(0, 3), gone, 0.3); expect(maskOf(s) & bit(0, 3)).toBe(bit(0, 3));
  run(s, on(0, 3), gone, 0.2); expect(maskOf(s)).toBe(0);
});

test('a walker on a pillar two ahead of the other has no pillar under them', () => {
  for (let q1 = 0; q1 < 9; q1++) for (let q2 = 0; q2 < 9; q2++) for (const [m1, m2] of [[0, 1], [1, 0]]) {
    if (q1 - q2 < 2) continue;                      // walker 1 is the leader
    const s = create(); run(s, on(m1, q1), on(m2, q2), 1);
    expect(maskOf(s) & bit(m1, q1)).toBe(0);
  }
});

test('an abreast crossing keeps both walkers\' pillars up at every step', () => {
  const s = create();
  let a = P(land), b = P(land);
  for (let q = -1; q < 9; q++) {
    a = q < 0 ? P(land) : on(0, q); b = q < 0 ? P(land) : on(1, q);
    for (let k = 0; k < 6; k++) {
      step(s, [a, b], 0.05);
      if (q >= 0) { expect(maskOf(s) & bit(0, q)).toBe(bit(0, q)); expect(maskOf(s) & bit(1, q)).toBe(bit(1, q)); }
    }
  }
});

test('open = false: nothing is raised, nothing solves, timers run down', () => {
  const s = create(); run(s, on(0, 3), on(1, 3), 0.3);
  expect(maskOf(s)).not.toBe(0);
  run(s, on(0, 3), on(1, 3), 0.5, false);
  expect(maskOf(s)).toBe(0);
  const u = create(); run(u, P(land), P(land), 1, false); expect(maskOf(u)).toBe(0);
  const v = create(); step(v, [P(SITES.checkpoints[9][0]), gone], 0.05, false); expect(v.solved).toBe(false);
});

test('standing on the island (zone K or L) solves it for good; a walker on pillar 8 does not', () => {
  const s = create(); step(s, [on(0, 8), on(1, 8)], 0.05); expect(s.solved).toBe(false);
  for (let line = 0; line < 2; line++) {
    const [o0, o1] = PL.lines[line].origin;
    for (const dx of [-1.2, 0, 1.2]) {
      const t = create(); step(t, [gone, P([o0 + dx, o1 + PL.fwd[1] * (PL.n * PL.tile + 0.5)])], 0.05);
      expect(t.solved).toBe(true);
    }
  }
  const u = create(); step(u, [P(SITES.checkpoints[9][0]), gone], 0.05);
  expect(u.solved).toBe(true); expect(maskOf(u)).toBe((1 << PILLAR_BITS) - 1);
  step(u, [gone, gone], 1); expect(u.solved).toBe(true); expect(maskOf(u)).toBe((1 << PILLAR_BITS) - 1);
});

test('prompt is always null', () => { expect(prompt(create(), 0, [P(land), P(land)])).toBeNull(); });

test('valid', () => {
  const s = create();
  expect(valid(s)).toBe(true);
  expect(valid(JSON.parse(JSON.stringify(s)))).toBe(true);
  expect(valid({ ...s, t: s.t.slice(1) })).toBe(false);
  expect(valid({ ...s, t: s.t.map((v, i) => (i ? v : -1)) })).toBe(false);
  expect(valid({ ...s, t: s.t.map((v, i) => (i ? v : LINGER + 1)) })).toBe(false);
  expect(valid({ ...s, t: s.t.map((v, i) => (i ? v : NaN)) })).toBe(false);
  expect(valid({ ...s, solved: 1 })).toBe(false);
  expect(valid(null)).toBe(false);
});

test('forceSolve', () => {
  const s = create(); forceSolve(s);
  expect(s.solved).toBe(true); expect(maskOf(s)).toBe((1 << PILLAR_BITS) - 1);
});

test('a huge dt is clamped', () => {
  const s = create(); run(s, P(land), P(land), 0.1);
  step(s, [gone, gone], 3600);
  expect(s.t[0]).toBeCloseTo(LINGER - 0.1);
  const t = create(); step(t, [P(land), P(land)], 3600);
  expect(t.t[0]).toBe(LINGER);
});

test('a walker on a pillar\'s side margin (0.25 m outside the line) is on that pillar; 0.4 m outside is nowhere', () => {
  for (let line = 0; line < 2; line++) for (let r = 0; r < PL.n; r++) for (const side of [-1, 1]) {
    const [cx, cz] = pillarCentre(line, r);
    const half = PL.tile / 2;
    expect(placeOf(P([cx + side * (half + 0.25), cz]))).toEqual({ line, r });
    expect(placeOf(P([cx + side * (half + 0.4), cz]))?.line ?? null).toBeNull();   // pillar 0's flank is still the landing's padding
  }
});

test('two walkers abreast, one on the side margin, keep each other\'s pillars up indefinitely', () => {
  const [cx, cz] = pillarCentre(0, 4);
  const s = create();
  for (let t = 0; t < 10; t += 0.05) {
    step(s, [P([cx - PL.tile / 2 - 0.25, cz]), on(1, 4)], 0.05);
    expect(maskOf(s) & bits(1, [3, 4, 5])).toBe(bits(1, [3, 4, 5]));
    expect(maskOf(s) & bits(0, [3, 4, 5])).toBe(bits(0, [3, 4, 5]));
  }
});

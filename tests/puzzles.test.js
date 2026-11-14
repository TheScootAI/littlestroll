import { test, expect } from 'vitest';
import { createAll, stepAll, solvedCount, dynOf, promptFor, constraintFor, forceSolved, validState } from '../src/puzzles/index.js';
import { SITES, DYN_NONE, pillarCentre } from '../src/world/layout.js';

const P = (xz, o = {}) => ({ present: true, x: xz[0], y: 0, z: xz[1], aim: [0, 0, -1], hold: false, pressed: false, ...o });
const gone = { present: false };
const far = SITES.spawn[0];

test('a huge step is clamped', () => {
  const S = createAll(1); const two = [P(far), P(far)];
  stepAll(S, two, 3600);
  expect(S.time).toBeCloseTo(0.1);
});
test('time only runs while both are here', () => {
  const S = createAll(1); stepAll(S, [P(far), gone], 0.05); expect(S.time).toBe(0);
});
test('dynOf starts as DYN_NONE and S survives JSON', () => {
  const S = createAll(7);
  expect(dynOf(S)).toEqual(DYN_NONE);
  expect(JSON.parse(JSON.stringify(S))).toEqual(S);
});
test('time stops once ended', () => {
  const S = createAll(1); S.ended = { time: 5 }; stepAll(S, [P(far), P(far)], 0.05); expect(S.time).toBe(0);
});
test('gate opens dyn, and solvedCount follows it', () => {
  const S = createAll(1);
  const two = [P(SITES.gate.plateA), P(far)];
  for (let i = 0; i < 30; i++) stepAll(S, two, 1 / 30);
  expect(dynOf(S).gateOpen).toBe(true);
  expect(solvedCount(S)).toBe(0);
  expect(promptFor(S, 0, two)).toBe(null);
  expect(constraintFor(S, 0, two)).toBe(null);
  const b = SITES.gate.plateB;
  const through = [P(b), P([b[0] + 1, b[1]])];
  for (let i = 0; i < 30; i++) stepAll(S, through, 1 / 30);
  expect(solvedCount(S)).toBe(1);
});
test('forceSolved(S, 1) solves the gate and leaves it open', () => {
  const S = createAll(1); forceSolved(S, 1);
  expect(solvedCount(S)).toBe(1);
  expect(dynOf(S).gateOpen).toBe(true);
});

import { validState } from '../src/puzzles/index.js';
import { valid as gateValid } from '../src/puzzles/gate.js';

test('stepAll with a non-finite or negative dt leaves time unchanged', () => {
  const S = createAll(1);
  for (const dt of [NaN, -1, Infinity * 0, undefined]) stepAll(S, [P(far), P(far)], dt);
  expect(S.time).toBe(0);
  expect(Number.isFinite(S.gate.amt)).toBe(true);
});
test('validState accepts a real state and its JSON round-trip', () => {
  const S = createAll(3);
  expect(validState(S)).toBe(true);
  expect(validState(JSON.parse(JSON.stringify(S)))).toBe(true);
  S.ended = { time: 12 };
  expect(validState(S)).toBe(true);
});
test('validState rejects malformed candidates', () => {
  const S = () => createAll(3);
  const bad = [null, undefined, [], 'x', 5];
  let c = S(); delete c.gate; bad.push(c);
  c = S(); c.gate.open = 'yes'; bad.push(c);
  c = S(); c.gate.amt = 2; bad.push(c);
  c = S(); c.gate.amt = NaN; bad.push(c);
  c = S(); c.time = NaN; bad.push(c);
  c = S(); c.time = -1; bad.push(c);
  c = S(); delete c.time; bad.push(c);
  c = S(); c.ended = {}; bad.push(c);
  c = S(); c.ended = { time: 'x' }; bad.push(c);
  c = S(); c.ended = undefined; bad.push(c);
  for (const b of bad) expect(validState(b)).toBe(false);
});
test('gate.valid checks its slice', () => {
  expect(gateValid({ open: false, amt: 0, solved: false })).toBe(true);
  expect(gateValid({ open: false, amt: 0 })).toBe(false);
  expect(gateValid(null)).toBe(false);
});

// ---- Task 10: the Beam and the ending
import { heightAt as hAt } from '../src/world/layout.js';
import { CHARGE } from '../src/puzzles/beam.js';

const beamChest = ([x, z]) => [x, hAt(x, z, DYN_NONE) + 0.9, z];
const beamAim = (from, to) => { const d = to.map((v, i) => v - from[i]); const l = Math.hypot(...d); return d.map((v) => v / l); };
const beamSetUp = () => {
  const { hint, lens } = SITES.beam;
  const S = createAll(1); forceSolved(S, 4);
  S.beam.mirrors[0].by = 0; S.beam.mirrors[1].by = 1;
  const a = beamChest(hint.p1), b = beamChest(hint.p2);
  const players = [P(hint.p1, { y: a[1] - 0.9, aim: beamAim(a, b) }), P(hint.p2, { y: b[1] - 0.9, aim: beamAim(b, lens) })];
  return { S, players };
};
test('beam: one huge step cannot light the beacon (the clamp)', () => {
  const { S, players } = beamSetUp();
  stepAll(S, players, 3600);
  expect(S.beam.solved).toBe(false);
  expect(S.ended).toBe(null);
  expect(S.beam.charge).toBeCloseTo(0.1);   // the beam was stepped, by the clamped 0.1 s
});
test('beam: 2.1 s on the lens lights the beacon and raises the causeway; the walk goes on', () => {
  const { S, players } = beamSetUp();
  for (let i = 0; i < 63; i++) stepAll(S, players, 1 / 30);
  expect(S.beam.solved).toBe(true);
  expect(S.ended).toBe(null);
  expect(dynOf(S).causeway).toBe(true);
  expect(solvedCount(S)).toBe(5);
  expect(validState(JSON.parse(JSON.stringify(S)))).toBe(true);
});
test('with the beam solved and the bells unsolved, S.ended stays null', () => {
  const S = createAll(1); forceSolved(S, 5);
  for (let i = 0; i < 300; i++) stepAll(S, [P(far), P(far)], 1 / 30);
  expect(S.beam.solved).toBe(true); expect(S.bells.solved).toBe(false); expect(S.ended).toBe(null);
});
test('the ending stamps the time once, when the last puzzle (the lanterns) first solves', () => {
  const S = createAll(1); forceSolved(S, 10);
  S.time = 100;
  const at = (i) => [SITES.lanterns.posts[i][0] + 0.5, SITES.lanterns.posts[i][1]];
  for (const i of [0, 1, 2, 3, 4]) stepAll(S, [P(at(i), { pressed: true }), P(far)], 1 / 30);
  expect(S.ended).toBe(null);
  stepAll(S, [P(far), P(at(5), { pressed: true })], 1 / 30);
  expect(S.lanterns.solved).toBe(true);
  expect(S.ended.time).toBeGreaterThan(100);
  const t = S.ended.time;
  for (let i = 0; i < 10; i++) stepAll(S, [P(far), P(far)], 1 / 30);
  expect(S.ended.time).toBe(t);
});
test('with the relay solved and the pillars unsolved, S.ended stays null', () => {
  const S = createAll(1); forceSolved(S, 8);
  for (let i = 0; i < 300; i++) stepAll(S, [P(far), P(far)], 1 / 30);
  expect(S.relay.solved).toBe(true); expect(S.pillars.solved).toBe(false); expect(S.ended).toBe(null);
});
test('solving the ring does not end the walk any more', () => {
  const S = createAll(1); forceSolved(S, 10);
  expect(S.ring.solved).toBe(true); expect(S.ended).toBe(null); expect(solvedCount(S)).toBe(10);
});
test('validState rejects a bad lanterns slice', () => {
  const S = createAll(1); S.lanterns.t[0] = NaN;
  expect(validState(S)).toBe(false);
  const T = createAll(1); delete T.lanterns;
  expect(validState(T)).toBe(false);
  const U = createAll(1); U.lanterns.t.pop();
  expect(validState(U)).toBe(false);
});
test('beam: prompts come through promptFor once the lift is done; dyn is unchanged', () => {
  const S = createAll(1); forceSolved(S, 4);
  const m = SITES.beam.mirrors[0];
  expect(promptFor(S, 0, [P(m), P(far)])).toBe('E — pick up the mirror');
  expect(dynOf(S)).toEqual(dynOf(JSON.parse(JSON.stringify(S))));
  expect(Object.keys(dynOf(S)).sort()).toEqual(Object.keys(DYN_NONE).sort());
});
test('forceSolved(S, 5) lights the beacon without ending the walk; forceSolved(S, 10) does not, forceSolved(S, 11) does', () => {
  const S = createAll(1); forceSolved(S, 5);
  expect(solvedCount(S)).toBe(5);
  expect(S.beam).toMatchObject({ solved: true, charge: CHARGE });
  expect(S.ended).toBe(null);
  const U = createAll(1); forceSolved(U, 10); expect(U.ended).toBe(null); expect(solvedCount(U)).toBe(10);
  forceSolved(U, 11);
  expect(S.ended).toBe(null); expect(U.ended).toEqual({ time: expect.any(Number) });
  expect(solvedCount(U)).toBe(11);
  const T = createAll(1); T.ended = { time: 42 }; forceSolved(T, 11);
  expect(T.ended).toEqual({ time: 42 });
});
test('validState rejects a bad beam slice', () => {
  const S = createAll(1); S.beam.charge = NaN;
  expect(validState(S)).toBe(false);
  const T = createAll(1); delete T.beam;
  expect(validState(T)).toBe(false);
});

const landing = [SITES.pillars.near.x, SITES.pillars.near.z];
test('pillars wiring: dormant until the Relay is solved, then two walkers on the landing raise pillar 0 of both lines', () => {
  const S = createAll(1); forceSolved(S, 7);
  for (let i = 0; i < 5; i++) stepAll(S, [P(landing), P(landing)], 1 / 30);
  expect(dynOf(S).pillars).toBe(0);
  const U = createAll(1); forceSolved(U, 8);
  for (let i = 0; i < 5; i++) stepAll(U, [P(landing), P(landing)], 1 / 30);
  expect(dynOf(U).pillars).toBe(1 | (1 << 9));
  expect(solvedCount(U)).toBe(8);
  const abreast = [pillarCentre(0, 3), pillarCentre(1, 3)];
  const V = createAll(1); forceSolved(V, 8);
  for (let i = 0; i < 5; i++) stepAll(V, abreast.map((c) => P(c)), 1 / 30);
  expect(dynOf(V).pillars).toBe(0b11100 | (0b11100 << 9));
});
test('ring wiring: solved by touching, steps lift dyn.ring, a bad slice is rejected, dyn at rest is DYN_NONE', () => {
  const S = createAll(1); forceSolved(S, 9);
  expect(solvedCount(S)).toBe(9); expect(S.ended).toBe(null);
  expect(dynOf(S).ring).toBe(false);
  forceSolved(S, 10);
  expect(solvedCount(S)).toBe(10); expect(dynOf(S).ring).toBe(true);
  expect(validState(JSON.parse(JSON.stringify(S)))).toBe(true);
  const B = createAll(1); B.ring.signs[0] = B.ring.signs[1]; expect(validState(B)).toBe(false);
  const C = createAll(1); delete C.ring; expect(validState(C)).toBe(false);
  expect(dynOf(createAll(5))).toEqual(DYN_NONE);
});
test('validState rejects a bad pillars slice', () => {
  const S = createAll(1); S.pillars.t[3] = NaN; expect(validState(S)).toBe(false);
  const T = createAll(1); delete T.pillars; expect(validState(T)).toBe(false);
  const U = createAll(1); U.pillars.solved = 'yes'; expect(validState(U)).toBe(false);
  const W = createAll(1); W.pillars.t.pop(); expect(validState(W)).toBe(false);
  expect(validState(JSON.parse(JSON.stringify(createAll(1))))).toBe(true);
});

import { test, expect } from 'vitest';
import { WINDOW, create, step, prompt, valid, forceSolve } from '../src/puzzles/bells.js';
import { createAll, stepAll, solvedCount, dynOf, promptFor, forceSolved, validState, solvedLine } from '../src/puzzles/index.js';
import { SITES } from '../src/world/layout.js';
import { respawn, createPlayer } from '../src/player/controller.js';

const P = (xz, o = {}) => ({ present: true, x: xz[0], y: 0, z: xz[1], aim: [0, 0, -1], hold: false, pressed: false, ...o });
const gone = { present: false };
const far = SITES.spawn[0];
const A = SITES.bells.a, B = SITES.bells.b;
const secs = (s, players, t) => { for (let i = 0; i < Math.round(t * 30); i++) step(s, players, 1 / 30); };
const ringA = (s) => step(s, [P(A, { pressed: true }), P(far)], 1 / 30);
const ringB = (s) => step(s, [P(far), P(B, { pressed: true })], 1 / 30);

test('constants and initial state', () => {
  expect(WINDOW).toBe(1.0);
  expect(create()).toEqual({ a: 999, b: 999, steps: 0, solved: false, hint: false });
});
test('a lone ring does not solve, and starts the hint', () => {
  const s = create(); ringA(s);
  expect(s.a).toBe(0); expect(s.solved).toBe(false); expect(s.hint).toBe(true);
  secs(s, [P(far), P(far)], 5); expect(s.solved).toBe(false);
});
test('a then b 0.9 s later solves', () => {
  const s = create(); ringA(s); secs(s, [P(far), P(far)], 0.9); ringB(s);
  expect(s.solved).toBe(true);
});
test('a then b 1.2 s later does not; the new ring starts a fresh window', () => {
  const s = create(); ringA(s); secs(s, [P(far), P(far)], 1.2); ringB(s);
  expect(s.solved).toBe(false);
  secs(s, [P(far), P(far)], 0.5); ringA(s);
  expect(s.solved).toBe(true);
});
test('both in the same step solve', () => {
  const s = create();
  step(s, [P(A, { pressed: true }), P(B, { pressed: true })], 1 / 30);
  expect(s.solved).toBe(true);
});
test('an absent walker cannot ring', () => {
  const s = create();
  step(s, [{ ...P(A, { pressed: true }), present: false }, P(far)], 1 / 30);
  step(s, [gone, { ...P(B, { pressed: true }), present: false }], 1 / 30);
  expect(s.a).toBe(999); expect(s.b).toBe(999); expect(s.hint).toBe(false);
});
test('hold without pressed does not ring', () => {
  const s = create(); secs(s, [P(A, { hold: true }), P(B, { hold: true })], 2);
  expect(s.a).toBe(999); expect(s.b).toBe(999); expect(s.solved).toBe(false);
});
test('too far from a bell does not ring it', () => {
  const s = create(); step(s, [P([A[0] + 1.6, A[1]], { pressed: true }), P(far)], 1 / 30);
  expect(s.a).toBe(999);
});
test('one walker cannot ring both bells, even standing between them', () => {
  const s = create(); const mid = [(A[0] + B[0]) / 2, (A[1] + B[1]) / 2];
  step(s, [P(mid, { pressed: true }), P(far)], 1 / 30);
  expect(s.solved).toBe(false); expect(s.a).toBe(999); expect(s.b).toBe(999);
});
test('one walker alone cannot do it: the bells are too far apart to run between in a second', () => {
  expect(Math.hypot(A[0] - B[0], A[1] - B[1])).toBeGreaterThanOrEqual(25);
  const s = create(); ringA(s); secs(s, [P(far), P(far)], 4.5); ringB(s);
  expect(s.solved).toBe(false);
});
test('steps ease to 1 over 2.5 s after solving, then stay', () => {
  const s = create(); step(s, [P(A, { pressed: true }), P(B, { pressed: true })], 1 / 30);
  expect(s.steps).toBeLessThan(0.1);
  secs(s, [P(far), P(far)], 1.25); expect(s.steps).toBeGreaterThan(0.4); expect(s.steps).toBeLessThan(0.6);
  secs(s, [P(far), P(far)], 2); expect(s.steps).toBe(1);
  secs(s, [P(far), P(far)], 30); expect(s.steps).toBe(1); expect(s.solved).toBe(true);
});
test('timers cap so S stays small', () => {
  const s = create(); secs(s, [P(far), P(far)], 10); expect(s.a).toBe(999);
  s.a = 998.99; step(s, [P(far), P(far)], 5); expect(s.a).toBe(999);
});
test('prompts', () => {
  const s = create();
  expect(prompt(s, 0, [P(A), P(far)])).toBe('E — ring the bell');
  expect(prompt(s, 1, [P(far), P(B)])).toBe('E — ring the bell');
  expect(prompt(s, 0, [P(far), P(far)])).toBe(null);
  s.hint = true;
  expect(prompt(s, 0, [P(A), P(far)])).toBe('Ring them together — count it down');
  expect(prompt(s, 0, [P(far), P(far)])).toBe(null);
  s.solved = true;
  expect(prompt(s, 0, [P(A), P(far)])).toBe(null);
});
test('valid and forceSolve', () => {
  const s = create(); expect(valid(s)).toBe(true);
  expect(valid({ ...s, a: NaN })).toBe(false);
  expect(valid({ ...s, b: -1 })).toBe(false);
  expect(valid({ ...s, a: 1000 })).toBe(false);
  expect(valid({ ...s, steps: 2 })).toBe(false);
  expect(valid({ ...s, hint: 1 })).toBe(false);
  expect(valid({ a: 999, b: 999, steps: 0, solved: false })).toBe(false);
  expect(valid(null)).toBe(false);
  forceSolve(s); expect(s.solved && s.steps === 1 && valid(s)).toBe(true);
  expect(JSON.parse(JSON.stringify(s))).toEqual(s);
});
test('a 3600 s step solves nothing (the clamp)', () => {
  const S = createAll(1); forceSolved(S, 5);
  stepAll(S, [P(far), P(far)], 3600);
  expect(S.bells.solved).toBe(false); expect(S.bells.steps).toBe(0); expect(S.ended).toBe(null);
  S.bells.a = 0; stepAll(S, [P(far), P(far)], 3600);
  expect(S.bells.a).toBeCloseTo(0.1); expect(S.bells.solved).toBe(false);
});
test('index wiring: dyn, order, prompt, validState, flash, ending, checkpoint 6', () => {
  const S = createAll(1); forceSolved(S, 5);
  expect(validState(S)).toBe(true);
  expect(solvedCount(S)).toBe(5);
  expect(S.ended).toBe(null);
  expect(dynOf(S).bells).toBe(false);
  expect(promptFor(S, 0, [P(A), P(far)])).toBe('E — ring the bell');
  expect(solvedLine(4)).toBe('A causeway rises from the sea');
  expect(solvedLine(5)).toBe('The steps rise');
  stepAll(S, [P(A, { pressed: true }), P(B, { pressed: true })], 1 / 30);
  expect(S.bells.solved).toBe(true);
  expect(solvedCount(S)).toBe(6);
  expect(dynOf(S).bells).toBe(false);          // not until the steps have fully risen
  for (let i = 0; i < 90; i++) stepAll(S, [P(far), P(far)], 1 / 30);
  expect(dynOf(S).bells).toBe(true);
  expect(S.ended).toBe(null);                  // the marsh comes after the bells
  const p = createPlayer(...SITES.spawn[0]);
  respawn(p, solvedCount(S), 0);
  expect([p.x, p.z]).toEqual(SITES.checkpoints[6][0]);
  const bad = createAll(1); bad.bells.a = NaN; expect(validState(bad)).toBe(false);
  const gone2 = createAll(1); delete gone2.bells; expect(validState(gone2)).toBe(false);
});
test('forceSolved(S, 6) solves the bells and settles the steps', () => {
  const S = createAll(1); forceSolved(S, 6);
  expect(solvedCount(S)).toBe(6); expect(dynOf(S).bells).toBe(true); expect(dynOf(S).causeway).toBe(true);
});

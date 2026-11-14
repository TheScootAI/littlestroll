import { test, expect } from 'vitest';
import { SYMBOLS, create, step, prompt, valid, forceSolve } from '../src/puzzles/signal.js';
import { createAll, stepAll, solvedCount, dynOf, promptFor, forceSolved, validState } from '../src/puzzles/index.js';
import { SITES } from '../src/world/layout.js';

const P = (xz, o = {}) => ({ present: true, x: xz[0], y: 0, z: xz[1], aim: [0, 0, -1], hold: false, pressed: false, ...o });
const gone = { present: false };
const far = SITES.spawn[0];

test('the answer comes from the seed and is never all zeros', () => {
  expect(SYMBOLS).toBe(6);
  expect(create(5).answer).toEqual(create(5).answer);
  const seen = new Set();
  for (let seed = 0; seed < 500; seed++) {
    const a = create(seed).answer;
    expect(a).toHaveLength(4); for (const v of a) expect(v >= 0 && v < 6).toBe(true);
    expect(a.join('')).not.toBe('0000'); seen.add(a.join(''));
  }
  expect(seen.size).toBeGreaterThan(200);
});
test('symbols glow only while someone is at the dials', () => {
  const s = create(1); const z = SITES.signal.dialZone;
  step(s, [P(SITES.signal.lookout), P(far)], 0.03); expect(s.lit).toBe(false);
  step(s, [P(SITES.signal.lookout), P([z.x, z.z])], 0.03); expect(s.lit).toBe(true);
  step(s, [P(SITES.signal.lookout), gone], 0.03); expect(s.lit).toBe(false);
});
test('pressing at a dial turns that dial only, and wraps', () => {
  const s = create(1); const d2 = SITES.signal.dials[2];
  for (let i = 0; i < 7; i++) step(s, [P(d2, { pressed: true }), P(far)], 0.03);
  expect(s.dials).toEqual([0, 0, 1, 0]);
  step(s, [P(far, { pressed: true }), P(far)], 0.03);
  expect(s.dials).toEqual([0, 0, 1, 0]);
});
test('the right dials bring the bridge out and it stays', () => {
  const s = create(1);
  s.answer.forEach((v, i) => { for (let k = 0; k < v; k++) step(s, [P(SITES.signal.dials[i], { pressed: true }), P(far)], 0.03); });
  expect(s.solved).toBe(true);
  for (let i = 0; i < 90; i++) step(s, [P(far), P(far)], 1 / 30);
  expect(s.bridge).toBeCloseTo(1);
  step(s, [P(SITES.signal.dials[0], { pressed: true }), P(far)], 0.03);
  expect(s.solved).toBe(true);
  expect(s.dials).toEqual(s.answer);
});
test('prompts', () => {
  const s = create(1); const d = SITES.signal.dials[1]; const lk = SITES.signal.lookout; const z = SITES.signal.dialZone;
  expect(prompt(s, 0, [P(d), P(far)])).toBe('E — turn the dial');
  step(s, [P(lk), P(far)], 0.03);
  expect(prompt(s, 0, [P(lk), P(far)])).toBe('The wall is blank — someone has to stand at the dials');
  step(s, [P(lk), P([z.x, z.z])], 0.03);
  expect(prompt(s, 0, [P(lk), P([z.x, z.z])])).toBe('Tell your friend what you see');
  expect(prompt(s, 0, [P(far), P(far)])).toBe(null);
  expect(prompt(s, 0, [gone, P(far)])).toBe(null);
  forceSolve(s);
  expect(prompt(s, 0, [P(d), P(far)])).toBe(null);
});
test('valid, forceSolve, and wiring into index', () => {
  const s = create(3);
  expect(valid(s)).toBe(true);
  expect(valid({ ...s, answer: [0, 1, 2] })).toBe(false);
  expect(valid({ ...s, dials: [0, 0, 0, 6] })).toBe(false);
  expect(valid({ ...s, bridge: NaN })).toBe(false);
  expect(valid({ ...s, lit: 1 })).toBe(false);
  expect(valid(null)).toBe(false);
  expect(valid({ ...s, answer: [0, 0, 0, 0] })).toBe(false);
  forceSolve(s); expect(s.solved && s.bridge === 1).toBe(true); expect(valid(s)).toBe(true);

  const S = createAll(9);
  expect(validState(S)).toBe(true);
  expect(validState(JSON.parse(JSON.stringify(S)))).toBe(true);
  S.signal.dials = [9, 0, 0, 0]; expect(validState(S)).toBe(false);
  const T = createAll(9); forceSolved(T, 1); expect(dynOf(T).bridge).toBe(false);
  forceSolved(T, 2); expect(solvedCount(T)).toBe(2); expect(dynOf(T).bridge).toBe(true);
  const U = createAll(9); forceSolved(U, 1);
  expect(promptFor(U, 0, [P(SITES.signal.dials[0]), P(far)])).toBe('E — turn the dial');
  U.signal.bridge = 0.5; expect(dynOf(U).bridge).toBe(false);
});

// ---- final review fixes
import { onBackSide } from '../src/puzzles/signal.js';

test('I1: onBackSide — the lookout is behind the wall; the dials and their zone are not', () => {
  const { wall, lookout, dials, dialZone } = SITES.signal;
  expect(onBackSide(wall, ...lookout)).toBe(true);
  for (const d of dials) expect(onBackSide(wall, ...d)).toBe(false);
  expect(onBackSide(wall, dialZone.x, dialZone.z)).toBe(false);
  for (let a = 0; a < Math.PI * 2; a += Math.PI / 8)
    expect(onBackSide(wall, dialZone.x + Math.cos(a) * dialZone.r, dialZone.z + Math.sin(a) * dialZone.r)).toBe(false);
  // right behind the wall, inside the 1 m margin: not yet
  expect(onBackSide(wall, wall.x - 0.6, wall.z)).toBe(false);
  expect(onBackSide(wall, wall.x - 1.5, wall.z)).toBe(true);
});

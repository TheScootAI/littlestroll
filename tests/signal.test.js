import { test, expect } from 'vitest';
import { SYMBOLS, create, step, prompt, valid, forceSolve, draw, onPlate } from '../src/puzzles/signal.js';
import { rng } from '../src/core/math.js';
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

const plate = SITES.signal.plate, pl = [plate.x, plate.z];
const dial = SITES.signal.dials;
const { barrier } = SITES.signal;
const bmid = [(barrier.ax + barrier.bx) / 2, (barrier.az + barrier.bz) / 2];
const T = 1 / 30;

// the old generator, as it was before the plate
function oldDraw(seed) {
  const r = rng(seed);
  const a = [0, 1, 2, 3].map(() => Math.floor(r() * SYMBOLS));
  if (a.every((v) => v === 0)) a[3] = 1 + (a[0] + 3) % (SYMBOLS - 1);
  return a;
}

test('draw(seed, 0) is the old first deal; each deal differs from the last; never all zeros', () => {
  for (let seed = 0; seed <= 20; seed++) {
    expect(draw(seed, 0)).toEqual(oldDraw(seed));
    expect(draw(seed)).toEqual(oldDraw(seed));
    expect(create(seed).answer).toEqual(oldDraw(seed));
    for (let n = 1; n <= 50; n++) {
      const a = draw(seed, n);
      expect(a).toHaveLength(4); for (const v of a) expect(Number.isInteger(v) && v >= 0 && v < SYMBOLS).toBe(true);
      expect(a).not.toEqual(draw(seed, n - 1));
      expect(a.some((v) => v !== 0)).toBe(true);
    }
  }
  expect(draw(7, 3)).toEqual(draw(7, 3));
  expect(draw(1e9 - 1, 1e9)).toHaveLength(4);
});
test('onPlate: a present walker within the radius', () => {
  expect(onPlate(P(pl))).toBe(true);
  expect(onPlate(P([plate.x + plate.r - 0.01, plate.z]))).toBe(true);
  expect(onPlate(P([plate.x + plate.r + 0.1, plate.z]))).toBe(false);
  expect(onPlate({ ...P(pl), present: false })).toBe(false);
});
test('the slice has the new shape', () => {
  const s = create(4);
  expect(Object.keys(s).sort()).toEqual(['answer', 'bridge', 'deal', 'dials', 'held', 'lit', 'seed', 'solved', 'up'].sort());
  expect(s).toMatchObject({ seed: 4, deal: 0, held: false, up: false, lit: false, bridge: 0, solved: false });
});
test('symbols show only while someone is on the plate; the dials alone light nothing', () => {
  const s = create(1); const z = SITES.signal.dialZone;
  step(s, [P(SITES.signal.lookout, { x: plate.x + 3 }), P(far)], T); expect(s.lit).toBe(false);
  step(s, [P(far), P([z.x, z.z])], T); expect(s.lit).toBe(false);
  step(s, [P(pl), P(far)], T); expect(s.lit).toBe(true); expect(s.held).toBe(true);
  step(s, [P(far), gone], T); expect(s.lit).toBe(false); expect(s.held).toBe(false);
  step(s, [{ ...P(pl), present: false }, P(far)], T); expect(s.lit).toBe(false);
});
test('stepping off the plate re-deals; stepping on again does not; standing still never does', () => {
  const s = create(2); const first = [...s.answer];
  for (let i = 0; i < 300; i++) step(s, [P(pl), P(far)], T);
  expect(s.deal).toBe(0); expect(s.answer).toEqual(first);
  step(s, [P(far), P(far)], T);
  expect(s.deal).toBe(1); expect(s.answer).not.toEqual(first); expect(s.answer).toEqual(draw(2, 1));
  step(s, [P(far), P(far)], T); expect(s.deal).toBe(1);
  step(s, [P(pl), P(far)], T); expect(s.deal).toBe(1); expect(s.answer).toEqual(draw(2, 1));
  step(s, [P(far), P(far)], T); expect(s.deal).toBe(2);
});
test('one walker alone cannot read and then set', () => {
  const s = create(3); const read = [...s.answer];
  step(s, [P(pl), P(far)], T);
  step(s, [P(far), P(far)], T);                 // off the plate: re-dealt
  for (let i = 0; i < 4; i++) for (let k = 0; k < read[i]; k++) step(s, [P(dial[i], { pressed: true }), P(far)], T);
  expect(s.dials).toEqual(read);
  expect(s.solved).toBe(false);
  expect(s.answer).not.toEqual(read);
});
test('two walkers: one reads on the plate, the other sets the dials', () => {
  const s = create(3);
  step(s, [P(pl), P(far)], T);
  const want = [...s.answer];
  for (let i = 0; i < 4; i++) for (let k = 0; k < want[i]; k++) step(s, [P(pl), P(dial[i], { pressed: true })], T);
  expect(s.solved).toBe(true);
  for (let i = 0; i < 90; i++) step(s, [P(pl), P(far)], T);
  expect(s.bridge).toBe(1);
  expect(s.up).toBe(false); expect(s.lit).toBe(true);
  step(s, [P(far), P(far)], T);
  expect(s.up).toBe(false); expect(s.lit).toBe(true); expect(s.deal).toBe(0); expect(s.answer).toEqual(want);
});
test('dials already matching with nobody on the plate solve nothing; stepping on solves, with no re-deal', () => {
  const s = create(5); const want = [...s.answer];
  s.dials = [...want];
  step(s, [P(far), P(far)], T); expect(s.solved).toBe(false);
  step(s, [P(dial[0]), P(far)], T); expect(s.solved).toBe(false);
  step(s, [P(pl), P(far)], T);
  expect(s.solved).toBe(true); expect(s.deal).toBe(0); expect(s.answer).toEqual(want);
  expect(s.up).toBe(false);
});
test('the barrier: up while held, down the moment the plate is left', () => {
  const s = create(6);
  step(s, [P(pl), P(far)], T); expect(s.up).toBe(true);
  step(s, [P(pl), P(far)], T); expect(s.up).toBe(true);
  step(s, [P(far), P(far)], T); expect(s.up).toBe(false);
});
test('the barrier never rises onto a walker: it waits until they are 1 m away', () => {
  const s = create(6);
  const on = P(bmid);
  step(s, [P(pl), on], T); expect(s.held).toBe(true); expect(s.up).toBe(false);
  step(s, [P(pl), P([bmid[0], bmid[1] + 0.5])], T); expect(s.up).toBe(false);
  step(s, [P(pl), P([bmid[0] + 0.85, bmid[1]])], T); expect(s.up).toBe(false);
  step(s, [P(pl), P([bmid[0] + 1, bmid[1]])], T); expect(s.up).toBe(true);
  step(s, [P(pl), P(bmid)], T); expect(s.up).toBe(true);          // once up it stays up
  step(s, [P(pl), P([bmid[0] - 0.2, bmid[1]])], T); expect(s.up).toBe(true);
  step(s, [P(far), P(bmid)], T); expect(s.up).toBe(false);        // going down is immediate
});
test('a walker beside the barrier but past its end does not hold it down', () => {
  const s = create(6);
  step(s, [P(pl), P([bmid[0], barrier.bz + 1.2])], T); expect(s.up).toBe(true);
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
  s.answer.forEach((v, i) => { for (let k = 0; k < v; k++) step(s, [P(pl), P(SITES.signal.dials[i], { pressed: true })], 0.03); });
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
  expect(prompt(s, 0, [P(lk), P(far)])).toBe(null);
  step(s, [P(lk), P([z.x, z.z])], 0.03);
  expect(prompt(s, 0, [P(lk), P([z.x, z.z])])).toBe(null);
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
  expect(s.held).toBe(false); expect(s.up).toBe(false); expect(s.lit).toBe(true); expect(s.dials).toEqual(s.answer);

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

test('valid: new slice fields, mid-play states and round-trips', () => {
  const s = create(11);
  expect(valid(s)).toBe(true);
  expect(valid(JSON.parse(JSON.stringify(s)))).toBe(true);
  step(s, [P(pl), P(far)], T); step(s, [P(far), P(far)], T); step(s, [P(pl), P(far)], T);
  expect(s.deal).toBe(1); expect(valid(s)).toBe(true); expect(valid(JSON.parse(JSON.stringify(s)))).toBe(true);
  expect(valid({ ...s, answer: draw(11, 0) })).toBe(false);        // not what the host dealt
  expect(valid({ ...s, answer: draw(11, 2) })).toBe(false);
  expect(valid({ ...s, deal: 1.5 })).toBe(false);
  expect(valid({ ...s, deal: -1 })).toBe(false);
  expect(valid({ ...s, deal: 1e9 + 1 })).toBe(false);
  const { held, ...noHeld } = s; expect(valid(noHeld)).toBe(false);
  const { up, ...noUp } = s; expect(valid(noUp)).toBe(false);
  expect(valid({ ...s, held: 1 })).toBe(false);
  expect(valid({ ...s, up: 'yes' })).toBe(false);
  expect(valid({ ...s, seed: 1.5 })).toBe(false);
  expect(valid({ ...s, seed: 2 ** 53 })).toBe(false);
  expect(valid({ ...s, seed: undefined })).toBe(false);
  expect(valid({ ...create(11), deal: 1e9, answer: draw(11, 1e9) })).toBe(true);
});

import { test, expect } from 'vitest';
import { RISE, SINK, create, step, prompt, valid, forceSolve } from '../src/puzzles/lift.js';
import { createAll, stepAll, solvedCount, dynOf, promptFor, forceSolved, validState, solvedLine } from '../src/puzzles/index.js';
import { SITES, DYN_NONE, zoneAt } from '../src/world/layout.js';
import { createPlayer, stepPlayer, needsRespawn } from '../src/player/controller.js';

const P = (xz, o = {}) => ({ present: true, x: xz[0], y: 0, z: xz[1], aim: [0, 0, -1], hold: false, pressed: false, ...o });
const gone = { present: false };
const far = SITES.spawn[0];

const secs = (s, players, t) => { for (let i = 0; i < t * 30; i++) step(s, players, 1 / 30); };

test('constants and initial state', () => {
  expect([RISE, SINK]).toEqual([0.25, 0.35]);
  expect(create()).toEqual({ y: 0, cranking: false, ladder: false, solved: false });
});
test('rises only while the crank is held, and sinks when let go', () => {
  const s = create(); const c = SITES.lift.crank;
  secs(s, [P(c, { hold: true }), P(far)], 2); expect(s.y).toBeCloseTo(0.5, 1);
  expect(s.cranking).toBe(true);
  secs(s, [P(c, { hold: true }), P(far)], 4); expect(s.y).toBe(1);
  secs(s, [P(c), P(far)], 1); expect(s.y).toBeCloseTo(0.65, 1);
  expect(s.cranking).toBe(false);
  secs(s, [P(c), P(far)], 5); expect(s.y).toBe(0);
});
test('either walker can crank; an absent one cannot', () => {
  const s = create(); const c = SITES.lift.crank;
  secs(s, [gone, P(c, { hold: true })], 1); expect(s.y).toBeGreaterThan(0.2);
  const t = create(); secs(t, [{ ...gone, hold: true }, P(far)], 1); expect(t.y).toBe(0);
});
test('holding E somewhere else does nothing', () => {
  const s = create(); secs(s, [P(far, { hold: true }), P(far)], 2); expect(s.y).toBe(0);
});
test('the ladder is kicked down from the ledge only, and stays down', () => {
  const s = create(); const post = SITES.lift.post;
  step(s, [P(SITES.lift.crank, { pressed: true }), P(far)], 0.03); expect(s.ladder).toBe(false);
  step(s, [P(post, { pressed: true }), P(far)], 0.03); expect(s.ladder).toBe(true);
  secs(s, [P(far), P(far)], 1); expect(s.ladder).toBe(true); expect(s.solved).toBe(true);
});
test('every point within reach of the post is zone F, so the zone rule cannot be tested with a real point', () => {
  const [px, pz] = SITES.lift.post; const notF = [];
  for (let r = 0; r <= 1.5; r += 0.05)
    for (let a = 0; a < 360; a += 3) {
      const x = px + r * Math.cos(a * Math.PI / 180), z = pz + r * Math.sin(a * Math.PI / 180);
      if (zoneAt(x, z) !== 'F') notF.push([x, z]);
    }
  expect(notF).toEqual([]);
});
test('an absent walker pressing at the post does nothing', () => {
  const s = create();
  step(s, [{ ...P(SITES.lift.post, { pressed: true }), present: false }, P(far)], 0.03);
  expect(s.ladder).toBe(false); expect(s.solved).toBe(false);
});
test('holding E at the post without a press does nothing', () => {
  const s = create();
  secs(s, [P(SITES.lift.post, { hold: true }), P(far)], 1);
  expect(s.ladder).toBe(false);
});
test('an absent walker "holding" at the crank does not raise the lift', () => {
  const s = create();
  secs(s, [{ ...P(SITES.lift.crank, { hold: true }), present: false }, P(far)], 2);
  expect(s.y).toBe(0); expect(s.cranking).toBe(false);
});
test('prompts', () => {
  const s = create(); const { crank, post, platform } = SITES.lift;
  expect(prompt(s, 0, [P(crank), P(far)])).toBe('Hold E — turn the crank');
  expect(prompt(s, 0, [P([platform.x, platform.z]), P(far)])).toBe('Someone has to turn the crank');
  s.cranking = true;
  expect(prompt(s, 0, [P([platform.x, platform.z]), P(crank, { hold: true })])).toBe(null);
  s.cranking = false;
  expect(prompt(s, 0, [P(post), P(far)])).toBe('E — kick the ladder down');
  expect(prompt(s, 0, [P(far), P(far)])).toBe(null);
  s.y = 0.5;
  expect(prompt(s, 0, [P([platform.x, platform.z]), P(far)])).toBe(null);
  s.ladder = true; s.solved = true;
  expect(prompt(s, 0, [P(post), P(far)])).toBe(null);
});
test('valid and forceSolve', () => {
  const s = create(); expect(valid(s)).toBe(true);
  expect(valid({ ...s, y: 1.5 })).toBe(false);
  expect(valid({ ...s, y: NaN })).toBe(false);
  expect(valid({ ...s, ladder: 1 })).toBe(false);
  expect(valid({ y: 0, cranking: false, ladder: false })).toBe(false);
  expect(valid(null)).toBe(false);
  forceSolve(s); expect(s.ladder && s.solved && valid(s)).toBe(true);
});
test('index wiring: dyn, order, prompts, validState, force', () => {
  const S = createAll(1);
  expect(valid(S.lift)).toBe(true); expect(validState(S)).toBe(true);
  expect(dynOf(S)).toEqual(DYN_NONE);
  S.lift.y = 0.4; S.lift.ladder = true;
  expect(dynOf(S).lift).toBe(0.4); expect(dynOf(S).ladder).toBe(true);
  S.lift.y = NaN; expect(validState(S)).toBe(false);
  const F = createAll(1); forceSolved(F, 3);
  expect(solvedCount(F)).toBe(3);
  expect(promptFor(F, 0, [P(SITES.lift.crank), P(far)])).toBe('Hold E — turn the crank');
  forceSolved(F, 4); expect(solvedCount(F)).toBe(4);
  expect(solvedLine(3)).toBe('The ladder is down');
  stepAll(F, [P(far), P(far)], 0.03); expect(F.lift.ladder).toBe(true);
  expect(JSON.parse(JSON.stringify(F))).toEqual(F);
});
test('a rider is carried up and set down, never stranded', () => {
  const s = create(); const { platform, crank, low, high } = SITES.lift;
  const rider = createPlayer(platform.x, platform.z);
  const idle = { camYaw: 0, mx: 0, mz: 0, run: false };
  let bad = false;
  const run = (hold, t) => {
    for (let i = 0; i < t * 30; i++) {
      step(s, [P(crank, { hold }), P([rider.x, rider.z])], 1 / 30);
      const dyn = { ...DYN_NONE, plank: true, lift: s.y };
      stepPlayer(rider, idle, 1 / 30, dyn);
      if (needsRespawn(rider, dyn)) bad = true;
    }
  };
  run(true, 6); expect(Math.abs(rider.y - high)).toBeLessThan(0.1);
  run(false, 6); expect(Math.abs(rider.y - low)).toBeLessThan(0.1);
  expect(bad).toBe(false);
});

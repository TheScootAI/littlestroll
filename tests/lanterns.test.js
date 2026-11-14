import { test, expect } from 'vitest';
import { BURN, REACH, POSTS, tallyYaw, create, step, prompt, valid, forceSolve } from '../src/puzzles/lanterns.js';
import { createAll, stepAll, solvedCount, dynOf, promptFor, forceSolved, validState, solvedLine } from '../src/puzzles/index.js';
import { SITES, DYN_NONE, PILLAR_BITS } from '../src/world/layout.js';
import { walkDistance } from './helpers/reach.js';
import { RUN } from '../src/config.js';

const { posts } = SITES.lanterns;
const P = (xz, o = {}) => ({ present: true, x: xz[0], y: 0, z: xz[1], aim: [0, 0, -1], hold: false, pressed: false, ...o });
const gone = { present: false };
const far = [0, 0];
const at = (i, d = 0.5, o = {}) => P([posts[i][0] + d, posts[i][1]], o);
const press = (s, i, who = 0, d = 0.5) => { const pl = [P(far), P(far)]; pl[who] = at(i, d, { pressed: true }); step(s, pl, 0.05); };
const idle = (s, secs, pl = [P(far), P(far)]) => { for (let t = 0; t < secs - 1e-9; t += 0.05) step(s, pl, 0.05); };

test('constants', () => { expect([BURN, REACH, POSTS]).toEqual([25, 1.5, 6]); expect(posts).toHaveLength(POSTS); });

test('create: six dark lanterns, not solved', () => {
  expect(create()).toEqual({ t: [0, 0, 0, 0, 0, 0], solved: false });
});

test('a press lights the nearest post to BURN (less the tick that lit it falling: it is set after the fall)', () => {
  const s = create(); press(s, 2);
  expect(s.t[2]).toBe(BURN);
  expect(s.t.filter((v) => v > 0)).toHaveLength(1);
});

test('a press 1.6 m away does nothing; 1.4 m away lights', () => {
  const s = create(); press(s, 1, 0, 1.6);
  expect(s.t).toEqual([0, 0, 0, 0, 0, 0]);
  press(s, 1, 0, 1.4);
  expect(s.t[1]).toBe(BURN);
});

test('a lit lantern is dark again after BURN seconds and not before', () => {
  const s = create(); press(s, 0);
  idle(s, BURN - 0.5);
  expect(s.t[0]).toBeGreaterThan(0);
  idle(s, 0.6);
  expect(s.t[0]).toBe(0);
  idle(s, 5);
  expect(s.t[0]).toBe(0);
});

test('a press on a burning lantern tops it up to BURN', () => {
  const s = create(); press(s, 4);
  idle(s, 15);
  expect(s.t[4]).toBeLessThan(11);
  press(s, 4);
  expect(s.t[4]).toBe(BURN);
});

test('six lit by two walkers within the burn: solved, and all stay at BURN for a minute more', () => {
  const s = create();
  for (const i of [0, 1, 2]) { press(s, i, 0); idle(s, 2); }
  for (const i of [3, 4]) { press(s, i, 1); idle(s, 2); }
  expect(s.solved).toBe(false);
  press(s, 5, 0);
  expect(s.solved).toBe(true);
  expect(s.t).toEqual([BURN, BURN, BURN, BURN, BURN, BURN]);
  idle(s, 60);
  expect(s.t).toEqual([BURN, BURN, BURN, BURN, BURN, BURN]);
  press(s, 3); expect(s.solved).toBe(true);
});

test('five lit, the first goes out before the sixth is lit: not solved', () => {
  const s = create();
  press(s, 0); idle(s, 6);
  for (const i of [1, 2, 3, 4]) { press(s, i); idle(s, 5); }
  expect(s.t[0]).toBe(0);
  press(s, 5);
  expect(s.solved).toBe(false);
  expect(s.t[0]).toBe(0);
});

test('an absent walker\'s press does nothing; lanterns burn down while a walker is absent', () => {
  const s = create();
  step(s, [{ ...at(0, 0.5, { pressed: true }), present: false }, gone], 0.05);
  expect(s.t[0]).toBe(0);
  step(s, [gone, { ...at(0, 0.5, { pressed: true }), present: false }], 0.05);
  expect(s.t[0]).toBe(0);
  press(s, 0);
  for (let i = 0; i < 100; i++) step(s, [gone, gone], 0.05);
  expect(s.t[0]).toBeCloseTo(BURN - 5, 6);
});

test('a huge dt is clamped (one step cannot burn a lantern out)', () => {
  const s = create(); press(s, 0);
  step(s, [P(far), P(far)], 3600);
  expect(s.t[0]).toBeGreaterThan(BURN - 1);
  const u = create(); step(u, [P(far), P(far)], NaN); expect(u.t[0]).toBe(0);
});

test('prompt: exact string, only near a post, not once solved, not for an absent walker', () => {
  const s = create(), pl = [at(3), P(far)];
  expect(prompt(s, 0, pl)).toBe('E — light the lantern');
  expect(prompt(s, 1, pl)).toBe(null);
  expect(prompt(s, 0, [at(3, 1.6), P(far)])).toBe(null);
  expect(prompt(s, 0, [{ ...at(3), present: false }, P(far)])).toBe(null);
  s.solved = true;
  expect(prompt(s, 0, pl)).toBe(null);
});

test('valid: accepts create() and a JSON round-trip; rejects the malformed', () => {
  const s = create(); press(s, 1);
  expect(valid(create())).toBe(true);
  expect(valid(JSON.parse(JSON.stringify(s)))).toBe(true);
  const bad = (f) => { const t = JSON.parse(JSON.stringify(s)); f(t); return valid(t); };
  expect(bad((t) => { t.t.pop(); })).toBe(false);
  expect(bad((t) => { t.t[2] = BURN + 1; })).toBe(false);
  expect(bad((t) => { t.t[2] = -1; })).toBe(false);
  expect(bad((t) => { t.t[2] = NaN; })).toBe(false);
  expect(bad((t) => { t.t[2] = 'x'; })).toBe(false);
  expect(bad((t) => { t.solved = 1; })).toBe(false);
  expect(bad((t) => { delete t.solved; })).toBe(false);
  expect(valid(null)).toBe(false);
  expect(valid({ ...create(), t: 'abcdef' })).toBe(false);
});

test('forceSolve: all burning for good', () => {
  const s = create(); forceSolve(s);
  expect(s).toEqual({ t: [BURN, BURN, BURN, BURN, BURN, BURN], solved: true });
  expect(valid(s)).toBe(true);
});

// ---- the geometry, against the real posts and this module's BURN
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
function perms(a) {
  if (a.length <= 1) return [a];
  return a.flatMap((x, i) => perms([...a.slice(0, i), ...a.slice(i + 1)]).map((p) => [x, ...p]));
}
const ALL = { ...DYN_NONE, gateOpen: true, bridge: true, plank: true, ladder: true, causeway: true, bells: true, marsh: (1 << 30) - 1, pillars: (1 << PILLAR_BITS) - 1, ring: true };

test('one walker: the shortest straight way through all six outlasts a burn at a run (720 orders, 10% margin)', () => {
  let best = Infinity;
  for (const o of perms([0, 1, 2, 3, 4, 5])) {
    let d = 0;
    for (let i = 1; i < 6; i++) d += dist(posts[o[i - 1]], posts[o[i]]);
    best = Math.min(best, d);
  }
  expect(best).toBeGreaterThanOrEqual(1.1 * BURN * RUN);
});

test('two walkers: some split lets each share be walked, first to last, within 0.6 of a burn', () => {
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

test('wired: a lanterns slice in createAll, stepped by stepAll; the prompt comes through promptFor', () => {
  const S = createAll(1); forceSolved(S, 10);
  expect(S.lanterns).toEqual(create());
  expect(promptFor(S, 0, [at(2), P(far)])).toBe('E — light the lantern');
  stepAll(S, [at(2, 0.5, { pressed: true }), P(far)], 1 / 30);
  expect(S.lanterns.t[2]).toBe(BURN);
  expect(dynOf(S)).toEqual(dynOf(JSON.parse(JSON.stringify(S))));
});

test('solvedLine for the last puzzle', () => { expect(solvedLine(10)).toBe('The Lantern Isle is lit'); });

test('tallyYaw: the tally stone faces the middle of checkpoint 10 (the head of the steps), in the layout yaw convention', () => {
  const y = tallyYaw(), [a, b] = SITES.checkpoints[10], [tx, tz] = SITES.lanterns.tally;
  const face = [-Math.sin(y), -Math.cos(y)];
  const to = [(a[0] + b[0]) / 2 - tx, (a[1] + b[1]) / 2 - tz], l = Math.hypot(...to);
  expect(face[0]).toBeCloseTo(to[0] / l, 6);
  expect(face[1]).toBeCloseTo(to[1] / l, 6);
});

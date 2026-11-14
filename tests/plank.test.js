import { test, expect } from 'vitest';
import { LEN, GRAB_R, DROP_DIST, PLACE_R, create, step, prompt, veto, valid, forceSolve } from '../src/puzzles/plank.js';
import { createAll, stepAll, solvedCount, dynOf, promptFor, constraintFor, forceSolved, validState, solvedLine } from '../src/puzzles/index.js';
import { SITES, PLANK_ROUTE, heightAt } from '../src/world/layout.js';

const P = (xz, o = {}) => ({ present: true, x: xz[0], y: 0, z: xz[1], aim: [0, 0, -1], hold: false, pressed: false, ...o });
const gone = { present: false };
const far = SITES.spawn[0];

const A = SITES.plank.restA, B = SITES.plank.restB;
const press = (xz) => P(xz, { pressed: true });

test('constants', () => {
  expect([LEN, GRAB_R, DROP_DIST, PLACE_R]).toEqual([4, 1.2, 5.5, 2.5]);
  const s = create();
  expect([s.ax, s.az, s.bx, s.bz]).toEqual([...A, ...B]);
  expect([s.holdA, s.holdB, s.placed, s.solved]).toEqual([null, null, false, false]);
});
test('each takes an end; one walker cannot take both', () => {
  const s = create();
  step(s, [press(A), P(far)], 0.03); expect(s.holdA).toBe(0);
  step(s, [P(A), P(far)], 0.03);
  step(s, [press(B), P(far)], 0.03);            // releases A (already holding), does not grab B
  expect([s.holdA, s.holdB]).toEqual([null, null]);
});
test('both press for the same end: the host gets it', () => {
  const s = create(); step(s, [press(A), press(A)], 0.03);
  expect([s.holdA, s.holdB]).toEqual([0, null]);
});
test('carried ends follow their holders; drifting apart drops it at full length', () => {
  const s = create();
  step(s, [press(A), press(B)], 0.03);
  step(s, [P([A[0] + 1, A[1]]), P([B[0] + 1, B[1]])], 0.03);
  expect([s.ax, s.az, s.bx, s.bz]).toEqual([A[0] + 1, A[1], B[0] + 1, B[1]]);
  step(s, [P([A[0] - 3, A[1]]), P([B[0] + 3, B[1]])], 0.03);  // far apart
  expect([s.holdA, s.holdB]).toEqual([null, null]);
  expect(Math.hypot(s.bx - s.ax, s.bz - s.az)).toBeCloseTo(4);
  expect(s.placed).toBe(false);
});
test('letting go at the slot lays it; anywhere else just drops it', () => {
  const s = create(); const [sx, sz] = SITES.plank.slot;
  step(s, [press(A), press(B)], 0.03);
  step(s, [P([sx - 2, sz]), P([sx + 2, sz])], 0.03);
  step(s, [press([sx - 2, sz]), P([sx + 2, sz])], 0.03);
  expect(s.placed).toBe(true); expect(s.solved).toBe(true);
  const t = create(); step(t, [press(A), press(B)], 0.03); step(t, [press(A), P(B)], 0.03);
  expect(t.placed).toBe(false);
});
test('a lone holder at the slot lays nothing', () => {
  const s = create(); const [sx, sz] = SITES.plank.slot;
  s.ax = sx - 2; s.az = sz; s.bx = sx + 2; s.bz = sz;
  step(s, [press([sx - 2, sz]), P(far)], 0.03);
  step(s, [press([sx - 2, sz]), P(far)], 0.03);
  expect(s.placed).toBe(false);
});
test('veto: a lone holder is rooted', () => {
  const s = create(); step(s, [press(A), P(far)], 0.03);
  const lone = veto(s, 0, [P(A), P(far)]);
  expect(lone(A[0] + 0.3, A[1])).toBe(false); expect(lone(A[0] + 2, A[1])).toBe(true);
});
test('veto: a pair cannot swing the plank through a stone', () => {
  const st = SITES.plank.stones[0];
  const t = create(); t.holdA = 0; t.holdB = 1;
  const v = veto(t, 0, [P([st.x - 3, st.z - 3]), P([st.x + 3, st.z])], [st]);
  expect(v(st.x - 3, st.z)).toBe(true);           // line to partner runs through the stone's centre
  expect(v(st.x - 3, st.z - 6)).toBe(false);      // well clear
  expect(veto(create(), 0, [P(A), P(B)], [st])).toBeNull();   // holding nothing: no veto
});
test('dropped in the water, it goes back to its rest', () => {
  const s = create(); step(s, [press(A), press(B)], 0.03);
  step(s, [P([9999, 9999]), P([9999, 10001])], 0.03);
  step(s, [press([9999, 9999]), P([9999, 10001])], 0.03);
  expect([s.ax, s.az, s.bx, s.bz]).toEqual([...A, ...B]);
  expect([s.holdA, s.holdB]).toEqual([null, null]);
});

test('the zigzag can be carried', () => {
  // arclength-parametrised walk along PLANK_ROUTE; the second trails the first by 3.5 m
  const seg = [], cum = [0];
  for (let i = 1; i < PLANK_ROUTE.length; i++) {
    const [x0, z0] = PLANK_ROUTE[i - 1], [x1, z1] = PLANK_ROUTE[i];
    seg.push([x0, z0, x1, z1]); cum.push(cum[i - 1] + Math.hypot(x1 - x0, z1 - z0));
  }
  const total = cum[cum.length - 1];
  const at = (d) => {
    d = Math.min(Math.max(d, 0), total);
    let i = 1; while (i < cum.length - 1 && cum[i] < d) i++;
    const [x0, z0, x1, z1] = seg[i - 1], t = (d - cum[i - 1]) / (cum[i] - cum[i - 1]);
    return [x0 + (x1 - x0) * t, z0 + (z1 - z0) * t];
  };
  const s = create(); s.holdA = 0; s.holdB = 1;
  let maxApart = 0;
  for (let d = 0; d <= total + 3.5; d += 0.1) {
    const lead = at(d), trail = at(d - 3.5);
    const now = [P(at(d - 0.1)), P(at(d - 3.6))];
    expect(veto(s, 0, now)(lead[0], lead[1])).toBe(false);
    expect(veto(s, 1, [P(lead), now[1]])(trail[0], trail[1])).toBe(false);
    maxApart = Math.max(maxApart, Math.hypot(lead[0] - trail[0], lead[1] - trail[1]));
  }
  expect(maxApart).toBeLessThanOrEqual(DROP_DIST);
});

test('prompts', () => {
  const s = create();
  expect(prompt(s, 0, [P(A), P(far)])).toBe('E — pick up this end');
  expect(prompt(s, 0, [P(far), P(far)])).toBeNull();
  step(s, [press(A), P(far)], 0.03);
  expect(prompt(s, 0, [P(A), P(far)])).toBe('Your friend needs to take the other end · E to let go');
  s.holdB = 1;
  expect(prompt(s, 0, [P(A), P(B)])).toBe('Carry it to the gap together');
  const [sx, sz] = SITES.plank.slot;
  s.ax = sx - 2; s.az = sz; s.bx = sx + 2; s.bz = sz;
  expect(prompt(s, 1, [P(A), P(B)])).toBe('E — set it down across the gap');
  s.placed = true;
  expect(prompt(s, 0, [P(A), P(B)])).toBeNull();
});

test('a walker who leaves lets go', () => {
  const s = create(); step(s, [press(A), press(B)], 0.03);
  step(s, [P(A), gone], 0.03);
  expect([s.holdA, s.holdB]).toEqual([null, null]);
  expect(s.placed).toBe(false);
});

test('valid, forceSolve, and wiring into index', () => {
  const s = create();
  expect(valid(s)).toBe(true);
  expect(valid({ ...s, ax: NaN })).toBe(false);
  expect(valid({ ...s, holdA: 2 })).toBe(false);
  expect(valid({ ...s, holdA: 0, holdB: 0 })).toBe(false);
  expect(valid({ ...s, placed: 1 })).toBe(false);
  expect(valid({ ...s, solved: undefined })).toBe(false);
  expect(valid(null)).toBe(false);
  forceSolve(s);
  expect(s.placed && s.solved && valid(s)).toBe(true);

  const S = createAll(3);
  expect(S.plank).toEqual(create());
  expect(validState(JSON.parse(JSON.stringify(S)))).toBe(true);
  expect(dynOf(S).plank).toBe(false);
  forceSolved(S, 3);
  expect(solvedCount(S)).toBe(3);
  expect(dynOf(S).plank).toBe(true);
  expect(solvedLine(2)).toBe('The plank is down');
  expect(validState(S)).toBe(true);
  expect(validState({ ...createAll(1), plank: { ...create(), bx: NaN } })).toBe(false);
});

test('index: plank prompt after signal, and the constraint', () => {
  const S = createAll(1); forceSolved(S, 2);
  expect(promptFor(S, 0, [P(A), P(far)])).toBe('E — pick up this end');
  expect(constraintFor(S, 0, [P(A), P(far)])).toBeNull();
  stepAll(S, [press(A), P(far)], 0.03);
  const v = constraintFor(S, 0, [P(A), P(far)]);
  expect(typeof v).toBe('function');
  expect(v(A[0] + 2, A[1])).toBe(true);
  expect(constraintFor(S, 1, [P(A), P(far)])).toBeNull();
});

test('veto: a lone holder who grabbed from ~1 m can step toward the end, not away', () => {
  const s = create(); const me = [A[0] + 1.0, A[1]];
  step(s, [press(me), P(far)], 0.03); expect(s.holdA).toBe(0);
  const lone = veto(s, 0, [P(me), P(far)]);
  expect(lone(me[0] - 0.1, me[1])).toBe(false);   // toward the end: allowed
  expect(lone(me[0] + 0.1, me[1])).toBe(true);    // away: refused
  expect(lone(A[0] + 0.3, A[1])).toBe(false);     // inside 0.6 m: allowed
});

test('released with an end over water, it returns to rest; fully on land it stays', () => {
  const [mx, mz] = [14, 36];
  const wet = create(); step(wet, [press(A), press(B)], 0.03);
  step(wet, [P([mx - 2, mz]), P([mx + 2, mz])], 0.03);
  step(wet, [press([mx - 2, mz]), P([mx + 2, mz])], 0.03);
  expect(heightAt(mx, mz)).toBeGreaterThanOrEqual(0.2);       // midpoint on land
  expect(heightAt(mx + 2, mz)).toBeLessThan(0.2);             // end over water
  expect([wet.ax, wet.az, wet.bx, wet.bz]).toEqual([...A, ...B]);
  const dry = create(); step(dry, [press(A), press(B)], 0.03);
  step(dry, [P([4, 36]), P([8, 36])], 0.03);
  step(dry, [press([4, 36]), P([8, 36])], 0.03);
  expect([dry.ax, dry.az, dry.bx, dry.bz]).toEqual([4, 36, 8, 36]);
});

// ---- final review fixes

test('C1: released with an end inside a standing stone, it returns to rest', () => {
  const st = SITES.plank.stones[0];
  const s = create(); s.holdA = 0; s.holdB = 1;
  const a = [6.87, 24.85], b = [6.02, 24.0];          // the reviewer's carriers, bunched against stone 0
  step(s, [P(a), P(b)], 0.03);
  step(s, [press(a), P(b)], 0.03);
  expect([s.holdA, s.holdB]).toEqual([null, null]);
  expect([s.ax, s.az, s.bx, s.bz]).toEqual([...A, ...B]);
  // and directly: an end settling on a stone's centre goes home
  const t = create(); t.holdA = 0; t.holdB = 1;
  const c = [st.x, st.z - 2];                          // end B settles 1 m past the stone's centre
  step(t, [P(c), P([st.x, st.z])], 0.03);
  step(t, [press(c), P([st.x, st.z])], 0.03);
  expect([t.ax, t.az, t.bx, t.bz]).toEqual([...A, ...B]);
  for (const k of SITES.plank.stones) expect(Math.hypot(t.ax - k.x, t.az - k.z)).toBeGreaterThan(k.r + 0.3);
});

test('I2: a pair whose line already crosses a stone may move to ease it, not to worsen it', () => {
  const st = SITES.plank.stones[0];
  const t = create(); t.holdA = 0; t.holdB = 1;
  // my line to the partner runs 0.5 m from the stone's centre (inside it)
  const me = [st.x - 3, st.z + 0.5], o = [st.x + 3, st.z + 0.5];
  const v = veto(t, 0, [P(me), P(o)], [st]);
  expect(v(me[0], me[1] + 0.2)).toBe(false);     // line moves away from the centre: allowed
  expect(v(me[0], me[1] - 0.2)).toBe(true);      // line moves toward the centre: refused
  expect(v(me[0] - 0.2, me[1])).toBe(false);     // along the line: no closer, allowed
  // a move that newly crosses a different stone is still refused
  const st2 = { x: st.x - 3, z: st.z + 3, r: 1 };
  const v2 = veto(t, 0, [P(me), P(o)], [st, st2]);
  expect(v2(me[0], me[1] + 2.5)).toBe(true);
});

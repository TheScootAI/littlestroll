import { test, expect } from 'vitest';
import { LEN, SLACK, GRAB_R, DROP_DIST, PLACE_R, create, step, prompt, veto, valid, forceSolve, board, carrying } from '../src/puzzles/plank.js';
import { carrySearch } from './helpers/carry.js';
import { createAll, stepAll, solvedCount, dynOf, promptFor, constraintFor, forceSolved, validState, solvedLine } from '../src/puzzles/index.js';
import { SITES, PLANK_ROUTE, heightAt } from '../src/world/layout.js';

const P = (xz, o = {}) => ({ present: true, x: xz[0], y: 0, z: xz[1], aim: [0, 0, -1], hold: false, pressed: false, ...o });
const gone = { present: false };
const far = SITES.spawn[0];

const A = SITES.plank.restA, B = SITES.plank.restB;
const press = (xz) => P(xz, { pressed: true });

test('constants', () => {
  expect([LEN, SLACK, GRAB_R, DROP_DIST, PLACE_R]).toEqual([4, 0.8, 1.2, 5.5, 2.5]);
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
test('carried by two, the board keeps its length: centred between them, pointing from one to the other', () => {
  for (const gap of [3.3, 4, 4.7]) {
    const s = create(); step(s, [press(A), press(B)], 0.03);
    step(s, [P([5, 36]), P([5 + gap, 36])], 0.03);
    expect(Math.hypot(s.bx - s.ax, s.bz - s.az)).toBeCloseTo(LEN, 9);   // never shorter, never longer
    expect((s.ax + s.bx) / 2).toBeCloseTo(5 + gap / 2, 9);
    expect([s.az, s.bz]).toEqual([36, 36]);
    expect(s.bx).toBeGreaterThan(s.ax);                                  // end A stays on its holder's side
  }
  const t = create(); step(t, [press(A), press(B)], 0.03);
  step(t, [P([6, 38]), P([6, 34])], 0.03);                               // turned a quarter: it turns with them
  expect([t.ax, t.az, t.bx, t.bz].map((v) => +v.toFixed(6))).toEqual([6, 38, 6, 34]);
  expect(board(5, 36, 8.3, 36).map((v) => +v.toFixed(6))).toEqual([4.65, 36, 8.65, 36]);
});
test('drifting far apart drops it, at full length', () => {
  const s = create();
  step(s, [press(A), press(B)], 0.03);
  step(s, [P([A[0] - 3, A[1]]), P([B[0] + 3, B[1]])], 0.03);
  expect([s.holdA, s.holdB]).toEqual([null, null]);
  expect(Math.hypot(s.bx - s.ax, s.bz - s.az)).toBeCloseTo(4);
  expect(s.placed).toBe(false);
});
test('veto: carriers can neither stretch nor squeeze the board', () => {
  const s = create(); s.holdA = 0; s.holdB = 1;
  const v = veto(s, 0, [P([4, 36]), P([8, 36])], []);      // exactly LEN apart
  expect(v(4 - SLACK + 0.05, 36)).toBe(false);              // a little further apart: within the slack
  expect(v(4 - SLACK - 0.05, 36)).toBe(true);               // too far
  expect(v(4 + SLACK - 0.05, 36)).toBe(false);              // a little closer
  expect(v(4 + SLACK + 0.05, 36)).toBe(true);               // too close
  expect(v(4, 37)).toBe(false);                             // sideways: the same distance, near enough
  const w = veto(s, 1, [P([4, 36]), P([8, 36])], []);       // and the same for the other carrier
  expect(w(8 + SLACK + 0.05, 36)).toBe(true);
  expect(w(8 - SLACK - 0.05, 36)).toBe(true);
  expect(w(8.3, 36)).toBe(false);
});
test('veto: a pair the wrong distance apart can only move to mend it', () => {
  const s = create(); s.holdA = 0; s.holdB = 1;
  const near = veto(s, 0, [P([6.5, 36]), P([8, 36])], []);  // 1.5 m apart, as just after a pick-up
  expect(near(6.3, 36)).toBe(false);                         // stepping apart: allowed
  expect(near(6.7, 36)).toBe(true);                          // stepping closer: refused
  const wide = veto(s, 0, [P([1, 36]), P([8, 36])], []);    // 7 m apart, as after a lag
  expect(wide(1.2, 36)).toBe(false);
  expect(wide(0.8, 36)).toBe(true);
});
test('the old trick is gone: carriers bunched together cannot walk the board along', () => {
  const s = create(); s.holdA = 0; s.holdB = 1;
  const lead = [6.98, 24], trail = [6.98, 25.2];             // 1.2 m apart, heading north (−z)
  expect(veto(s, 1, [P(lead), P(trail)], [])(6.98, 25.1)).toBe(true);    // the one behind cannot close up
  expect(veto(s, 0, [P(lead), P(trail)], [])(6.98, 23.9)).toBe(false);   // the one ahead may walk on (it mends the gap)
  // so the pair cannot move as a bunch: the board always ends up its full length between them
});
test('a carrier cannot run', () => {
  const s = create();
  expect([carrying(s, 0), carrying(s, 1)]).toEqual([false, false]);
  step(s, [press(A), press(B)], 0.03);
  expect([carrying(s, 0), carrying(s, 1)]).toEqual([true, true]);
  s.placed = true;
  expect(carrying(s, 0)).toBe(false);
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
test('veto: a pair cannot swing the board through a stone', () => {
  const st = SITES.plank.stones[0];
  const t = create(); t.holdA = 0; t.holdB = 1;
  const me = [st.x - 1.2, st.z + 2.6], o = [st.x + 2, st.z];     // 4.1 m apart, the board clear of the stone
  const v = veto(t, 0, [P(me), P(o)], [st]);
  expect(v(st.x - 2, st.z)).toBe(true);            // would lay the board across the stone's centre
  expect(v(me[0], me[1] + 0.2)).toBe(false);       // swinging away from it
  expect(veto(create(), 0, [P(A), P(B)], [st])).toBeNull();   // holding nothing: no veto
});
test('veto: it is the board that must clear a stone, not the line between the carriers', () => {
  // carriers 3.3 m apart with a stone just past one of them: the board overhangs 0.35 m at
  // each end, so its tip reaches the stone though the carriers' own line does not
  const t = create(); t.holdA = 0; t.holdB = 1;
  const st = { x: 10, z: 36, r: 1 };
  const v = veto(t, 1, [P([5, 36]), P([8.3, 36])], [st]);       // tip at 8.65: clear of the stone (rim at 9)
  expect(v(8.5, 36)).toBe(false);                               // tip at 8.75: still clear
  expect(v(8.8, 36)).toBe(false);                               // carriers 3.8 apart, tip at 8.9: clear
  const u = veto(t, 0, [P([5, 36]), P([8.8, 36])], [st]);       // now the other carrier walks up behind
  expect(u(5.5, 36)).toBe(true);                                // board centre 7.15, tip 9.15: into the stone
});
test('dropped in the water, it goes back to its rest', () => {
  const s = create(); step(s, [press(A), press(B)], 0.03);
  step(s, [P([9999, 9999]), P([9999, 10001])], 0.03);
  step(s, [press([9999, 9999]), P([9999, 10001])], 0.03);
  expect([s.ax, s.az, s.bx, s.bz]).toEqual([...A, ...B]);
  expect([s.holdA, s.holdB]).toEqual([null, null]);
});

test('the zigzag can be carried at full length, and every step of the way obeys the veto', () => {
  // stricter than the game: less slack, and the board kept further off the stones
  const r = carrySearch({ len: LEN, slack: 0.4, margin: 0.3, path: true });
  expect(r.done).toBe(true);
  expect(r.path.length).toBeGreaterThan(100);
  const s = create(); s.holdA = 0; s.holdB = 1;
  for (let i = 1; i < r.path.length; i++) {
    const [a0, b0] = r.path[i - 1], [a1, b1] = r.path[i];
    const moved = a0[0] !== a1[0] || a0[1] !== a1[1] ? 0 : 1;
    const to = moved === 0 ? a1 : b1;
    expect(veto(s, moved, [P(a0), P(b0)])(to[0], to[1]), `step ${i}`).toBe(false);
    const [x0, z0, x1, z1] = board(a1[0], a1[1], b1[0], b1[1]);
    expect(Math.hypot(x1 - x0, z1 - z0)).toBeCloseTo(LEN, 9);
  }
});
test('no stones would be no puzzle, and a board too long for the gaps cannot be carried', () => {
  expect(carrySearch({ len: LEN, slack: 0.4, margin: 0.3, stones: [] }).done).toBe(true);
  expect(carrySearch({ len: 7, slack: 0.4, margin: 0.3, from: [[2.5, 34], [9.5, 34]] }).done).toBe(false);
});

test('prompts', () => {
  const s = create();
  expect(prompt(s, 0, [P(A), P(far)])).toBe('E — pick up this end');
  expect(prompt(s, 0, [P(far), P(far)])).toBeNull();
  step(s, [press(A), P(far)], 0.03);
  expect(prompt(s, 0, [P(A), P(far)])).toBe('E — let go');
  s.holdB = 1;
  expect(prompt(s, 0, [P(A), P(B)])).toBe('E — let go');
  const [sx, sz] = SITES.plank.slot;
  s.ax = sx - 2; s.az = sz; s.bx = sx + 2; s.bz = sz;
  expect(prompt(s, 1, [P(A), P(B)])).toBe('E — let go');
  expect(prompt(s, 0, [P(A), P(B)])).toBe('E — let go');
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

test('I2: a pair whose board already crosses a stone may move to ease it, not to worsen it', () => {
  const st = SITES.plank.stones[0];
  const t = create(); t.holdA = 0; t.holdB = 1;
  // the board between us runs 0.5 m from the stone's centre (inside it)
  const me = [st.x - 2, st.z + 0.5], o = [st.x + 2, st.z + 0.5];
  const v = veto(t, 0, [P(me), P(o)], [st]);
  expect(v(me[0], me[1] + 0.2)).toBe(false);     // the board moves away from the centre: allowed
  expect(v(me[0], me[1] - 0.2)).toBe(true);      // toward the centre: refused
  expect(v(me[0] - 0.2, me[1])).toBe(false);     // along its own line: no closer, allowed
  // a move that newly crosses a different stone is still refused
  const st2 = { x: st.x - 1.2, z: st.z + 3.2, r: 1 };
  const v2 = veto(t, 0, [P(me), P(o)], [st, st2]);
  expect(v2(me[0], me[1] + 2.5)).toBe(true);
});

import { test, expect } from 'vitest';
import { LEN, NEED, SLACK, GRAB_R, DROP_EXTRA, PLACE_R, lengthOf, create, step, prompt, veto, valid, forceSolve, board, carrying, held, atRest, splashed } from '../src/puzzles/plank.js';
import { carrySearch } from './helpers/carry.js';
import { createAll, stepAll, solvedCount, dynOf, promptFor, constraintFor, forceSolved, validState, solvedLine } from '../src/puzzles/index.js';
import { SITES, heightAt } from '../src/world/layout.js';

const P = (xz, o = {}) => ({ present: true, x: xz[0], y: 0, z: xz[1], aim: [0, 0, -1], hold: false, pressed: false, ...o });
const gone = { present: false };
const far = SITES.spawn[0];

const PIECES = SITES.wreck.pieces;
const A = PIECES[0].a, B = PIECES[0].b;   // the plank's rests
const press = (xz) => P(xz, { pressed: true });
const ends = (s, i = 0) => { const b = s.boards[i]; return [b.ax, b.az, b.bx, b.bz]; };
const rest = (i) => [...PIECES[i].a, ...PIECES[i].b];
const setBoard = (s, i, [ax, az, bx, bz], holdA = null, holdB = null) => Object.assign(s.boards[i], { ax, az, bx, bz, holdA, holdB });
const holds = (s) => s.boards.map((b) => [b.holdA, b.holdB]);
const NONE = [[null, null], [null, null], [null, null], [null, null]];
// carriers lift piece i together, walk to `m` (carriers `gap` apart along x), and one lets go
const carryTo = (i, m, gap = PIECES[i].len, s = create()) => {
  step(s, [press(PIECES[i].a), press(PIECES[i].b)], 0.03);
  step(s, [P([m[0] - gap / 2, m[1]]), P([m[0] + gap / 2, m[1]])], 0.03);
  step(s, [press([m[0] - gap / 2, m[1]]), P([m[0] + gap / 2, m[1]])], 0.03);
  return s;
};
// the carry searches look at a million or two stands: seconds, and more on a slow machine
const SEARCH_MS = 120000;
const stands = (len) => [[6 - len / 2, 36], [6 + len / 2, 36]];

test('constants and create: every piece at its rest', () => {
  expect([LEN, NEED, SLACK, GRAB_R, DROP_EXTRA, PLACE_R]).toEqual([4, 3.8, 0.8, 1.2, 1.5, 2.5]);
  expect([0, 1, 2, 3].map(lengthOf)).toEqual([4, 6.5, 2.5, 1.8]);
  const s = create();
  expect(s.boards.length).toBe(4);
  PIECES.forEach((p, i) => {
    expect(ends(s, i)).toEqual([...p.a, ...p.b]);
    expect([s.boards[i].holdA, s.boards[i].holdB]).toEqual([null, null]);
    expect(atRest(s, i)).toBe(true);
  });
  expect([s.placed, s.splash, s.solved]).toEqual([null, 999, false]);
});
test('each takes an end; one walker cannot take both, nor ends of two pieces', () => {
  const s = create();
  step(s, [press(A), P(far)], 0.03); expect(held(s, 0)).toEqual({ i: 0, end: 'A' });
  expect(held(s, 1)).toBeNull();
  expect(atRest(s, 0)).toBe(false);
  step(s, [P(A), P(far)], 0.03);
  step(s, [press(B), P(far)], 0.03);            // releases A (already holding), does not grab B
  expect(holds(s)).toEqual(NONE);
  // walker 0 holding one end: pressing near another piece's end lets go, never takes a second
  step(s, [press(PIECES[1].b), P(far)], 0.03); expect(held(s, 0)).toEqual({ i: 1, end: 'B' });
  step(s, [P(PIECES[1].b), P(far)], 0.03);
  step(s, [press(PIECES[2].a), P(far)], 0.03);
  expect(holds(s)).toEqual(NONE);
});
test('two walkers at the two ends of each piece take it', () => {
  PIECES.forEach((p, i) => {
    const s = create(); step(s, [press(p.a), press(p.b)], 0.03);
    expect(held(s, 0)).toEqual({ i, end: 'A' }); expect(held(s, 1)).toEqual({ i, end: 'B' });
    expect([carrying(s, 0), carrying(s, 1)]).toEqual([true, true]);
  });
});
test('a press near where two ends are close takes the nearer; ties go to the lower piece, A before B', () => {
  const s = create();
  const p = PIECES[0].b, q = PIECES[1].b;                  // the plank's and the spar's rock-end
  const toward = (u, v, t) => [u[0] + (v[0] - u[0]) * t, u[1] + (v[1] - u[1]) * t];
  step(s, [press(toward(p, q, 0.6)), P(far)], 0.03);       // a touch nearer the spar's end
  expect(held(s, 0)).toEqual({ i: 1, end: 'B' });
  const t = create(); setBoard(t, 1, [...PIECES[0].a, ...PIECES[0].b]);   // two pieces with ends on the same spots
  step(t, [press(PIECES[0].b), P(far)], 0.03);               // the lower piece
  expect(held(t, 0)).toEqual({ i: 0, end: 'B' });
  const u = create(); setBoard(u, 0, [5, 100, 5, 100]);    // both ends of piece 0 on one spot
  step(u, [press([5, 100]), P(far)], 0.03);
  expect(held(u, 0)).toEqual({ i: 0, end: 'A' });
});
test('both press for the same end: the host gets it', () => {
  const s = create(); step(s, [press(A), press(A)], 0.03);
  expect(held(s, 0)).toEqual({ i: 0, end: 'A' }); expect(held(s, 1)).toBeNull();
});
test('a piece with one holder does not move', () => {
  const s = create(); step(s, [press(A), P(far)], 0.03);
  step(s, [P([A[0] + 0.5, A[1]]), P(far)], 0.03);
  expect(ends(s)).toEqual([...A, ...B]);
});
test('carried by two, each piece keeps its own length: centred between them, pointing from one to the other', () => {
  PIECES.forEach((p, i) => {
    for (const gap of [p.len - 0.7, p.len, p.len + 0.7]) {
      const s = create(); step(s, [press(p.a), press(p.b)], 0.03);
      step(s, [P([5, 36]), P([5 + gap, 36])], 0.03);
      const [ax, az, bx, bz] = ends(s, i);
      expect(Math.hypot(bx - ax, bz - az)).toBeCloseTo(p.len, 9);
      expect((ax + bx) / 2).toBeCloseTo(5 + gap / 2, 9);
      expect([az, bz]).toEqual([36, 36]);
      expect(bx).toBeGreaterThan(ax);
      // the other pieces have not moved
      s.boards.forEach((_, k) => { if (k !== i) expect(atRest(s, k)).toBe(true); });
    }
  });
  const t = create(); step(t, [press(A), press(B)], 0.03);
  step(t, [P([6, 38]), P([6, 34])], 0.03);                               // turned a quarter: it turns with them
  expect(ends(t).map((v) => +v.toFixed(6))).toEqual([6, 38, 6, 34]);
  expect(board(4, 5, 36, 8.3, 36).map((v) => +v.toFixed(6))).toEqual([4.65, 36, 8.65, 36]);
  expect(board(2.5, 5, 36, 8.3, 36).map((v) => +v.toFixed(6))).toEqual([5.4, 36, 7.9, 36]);
});
test('drifting far apart drops it, at full length; DROP_EXTRA is the limit', () => {
  const s = create();
  step(s, [press(A), press(B)], 0.03);
  step(s, [P([A[0] - 3, A[1]]), P([B[0] + 3, B[1]])], 0.03);
  expect(holds(s)).toEqual(NONE);
  expect(s.placed).toBeNull();
  PIECES.forEach((p, i) => {
    const drop = create(); step(drop, [press(p.a), press(p.b)], 0.03);
    step(drop, [P([5, 36]), P([5 + p.len + 1.6, 36])], 0.03);
    expect(held(drop, 0)).toBeNull(); expect(held(drop, 1)).toBeNull();
    expect(Math.hypot(drop.boards[i].bx - drop.boards[i].ax, drop.boards[i].bz - drop.boards[i].az)).toBeCloseTo(p.len, 9);
    const keep = create(); step(keep, [press(p.a), press(p.b)], 0.03);
    step(keep, [P([5, 36]), P([5 + p.len + 1.4, 36])], 0.03);
    expect(held(keep, 0)?.i).toBe(i); expect(held(keep, 1)?.i).toBe(i);
  });
});
const pair = (s, i = 0) => { s.boards[i].holdA = 0; s.boards[i].holdB = 1; return s; };

test('veto: carriers can neither stretch nor squeeze the board', () => {
  const s = pair(create());
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
test('veto: each piece asks for its own distance (spar 6.5, short board 2.5)', () => {
  const spar = pair(create(), 1), shortB = pair(create(), 2);
  const v = veto(spar, 0, [P([2, 36]), P([8.5, 36])], []);   // 6.5 apart
  expect(v(2 - SLACK + 0.05, 36)).toBe(false);
  expect(v(2 - SLACK - 0.05, 36)).toBe(true);
  expect(v(2 + SLACK - 0.05, 36)).toBe(false);
  expect(v(2 + SLACK + 0.05, 36)).toBe(true);
  const w = veto(shortB, 0, [P([4, 36]), P([6.5, 36])], []);  // 2.5 apart
  expect(w(4 - SLACK + 0.05, 36)).toBe(false);
  expect(w(4 - SLACK - 0.05, 36)).toBe(true);
  expect(w(4 + SLACK - 0.05, 36)).toBe(false);
  expect(w(4 + SLACK + 0.05, 36)).toBe(true);
  const hatch = pair(create(), 3);                           // 1.8: a 4 m stance is far too wide
  expect(veto(hatch, 0, [P([4, 36]), P([5.8, 36])], [])(3, 36)).toBe(true);
});
test('veto: a pair the wrong distance apart can only move to mend it', () => {
  const s = pair(create());
  const near = veto(s, 0, [P([6.5, 36]), P([8, 36])], []);  // 1.5 m apart, as just after a pick-up
  expect(near(6.3, 36)).toBe(false);                         // stepping apart: allowed
  expect(near(6.7, 36)).toBe(true);                          // stepping closer: refused
  const wide = veto(s, 0, [P([1, 36]), P([8, 36])], []);    // 7 m apart, as after a lag
  expect(wide(1.2, 36)).toBe(false);
  expect(wide(0.8, 36)).toBe(true);
});
test('the old trick is gone: carriers bunched together cannot walk the board along', () => {
  const s = pair(create());
  const lead = [6.98, 24], trail = [6.98, 25.2];             // 1.2 m apart, heading north (−z)
  expect(veto(s, 1, [P(lead), P(trail)], [])(6.98, 25.1)).toBe(true);    // the one behind cannot close up
  expect(veto(s, 0, [P(lead), P(trail)], [])(6.98, 23.9)).toBe(false);   // the one ahead may walk on (it mends the gap)
});
test('a carrier cannot run', () => {
  const s = create();
  expect([carrying(s, 0), carrying(s, 1)]).toEqual([false, false]);
  step(s, [press(A), press(B)], 0.03);
  expect([carrying(s, 0), carrying(s, 1)]).toEqual([true, true]);
  s.placed = 0;
  expect(carrying(s, 0)).toBe(false);
});
test('the plank let go at the slot is laid', () => {
  const s = carryTo(0, SITES.plank.slot, 4);
  expect(s.placed).toBe(0); expect(s.solved).toBe(true);
  expect(holds(s)).toEqual(NONE);
  const t = create(); step(t, [press(A), press(B)], 0.03); step(t, [press(A), P(B)], 0.03);
  expect(t.placed).toBeNull();
});
test('the short board and the hatch let go at the slot are not laid: back at the wreck, with a splash', () => {
  for (const i of [2, 3]) {
    const s = carryTo(i, SITES.plank.slot);
    expect(s.placed).toBeNull(); expect(s.solved).toBe(false);
    expect(s.splash).toBe(0);
    expect(holds(s)).toEqual(NONE);
    expect(ends(s, i)).toEqual(rest(i));
    expect(atRest(s, i)).toBe(true);
    step(s, [P(far), P(far)], 0.5);
    expect(s.splash).toBeCloseTo(0.5, 9);
  }
});
test('splashed: no baseline, no splash; a drop splashes; a rise or no change does not', () => {
  expect(splashed(null, 999)).toBe(false);
  expect(splashed(undefined, 0)).toBe(false);
  expect(splashed(999, 0)).toBe(true);
  expect(splashed(3, 0.2)).toBe(true);
  expect(splashed(0, 0.5)).toBe(false);
  expect(splashed(5, 5)).toBe(false);
});
test('the piece laid at the slot is exactly what forceSolve produces', () => {
  const s = carryTo(0, SITES.plank.slot, 4), f = create(); forceSolve(f);
  expect(s.placed).toBe(0);
  expect(s.boards[0]).toEqual(f.boards[0]);
  expect(atRest(s, 0)).toBe(false);
  expect(valid(s)).toBe(true); expect(valid(JSON.parse(JSON.stringify(s)))).toBe(true);
});
test('splash counts up and is capped at 999', () => {
  const s = create(); step(s, [P(far), P(far)], 1000);
  expect(s.splash).toBe(999);
});
test('a lone holder at the slot lays nothing', () => {
  const s = create(); const [sx, sz] = SITES.plank.slot;
  setBoard(s, 0, [sx - 2, sz, sx + 2, sz]);
  step(s, [press([sx - 2, sz]), P(far)], 0.03);
  step(s, [press([sx - 2, sz]), P(far)], 0.03);
  expect(s.placed).toBeNull();
});
test('veto: a lone holder is rooted', () => {
  const s = create(); step(s, [press(A), P(far)], 0.03);
  const lone = veto(s, 0, [P(A), P(far)]);
  expect(lone(A[0] + 0.3, A[1])).toBe(false); expect(lone(A[0] + 2, A[1])).toBe(true);
  expect(veto(s, 1, [P(A), P(far)])).toBeNull();              // holding nothing: no veto
});
test('veto: a pair cannot swing the board through a stone', () => {
  const st = SITES.plank.stones[0];
  const t = pair(create());
  const me = [st.x - 1.2, st.z + 2.6], o = [st.x + 2, st.z];     // 4.1 m apart, the board clear of the stone
  const v = veto(t, 0, [P(me), P(o)], [st]);
  expect(v(st.x - 2, st.z)).toBe(true);            // would lay the board across the stone's centre
  expect(v(me[0], me[1] + 0.2)).toBe(false);       // swinging away from it
  expect(veto(create(), 0, [P(A), P(B)], [st])).toBeNull();   // holding nothing: no veto
});
test('veto: it is the board that must clear a stone, not the line between the carriers', () => {
  const t = pair(create());
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
  expect(ends(s)).toEqual([...A, ...B]);
  expect(holds(s)).toEqual(NONE);
});
test('a piece put down on the signal bridge stays there', () => {
  const sg = SITES.signal.bridge, m = [(sg.ax + sg.bx) / 2, (sg.az + sg.bz) / 2];
  const l = Math.hypot(sg.bx - sg.ax, sg.bz - sg.az), u = [(sg.bx - sg.ax) / l, (sg.bz - sg.az) / l];
  for (const i of [0, 3]) {
    const len = PIECES[i].len, s = create();
    step(s, [press(PIECES[i].a), press(PIECES[i].b)], 0.03);
    const ca = [m[0] - u[0] * len / 2, m[1] - u[1] * len / 2], cb = [m[0] + u[0] * len / 2, m[1] + u[1] * len / 2];
    step(s, [P(ca), P(cb)], 0.03);
    step(s, [press(ca), P(cb)], 0.03);
    expect(ends(s, i).map((v) => +v.toFixed(6))).toEqual([...ca, ...cb].map((v) => +v.toFixed(6)));
  }
});
test('once the plank is placed nothing can be picked up', () => {
  const s = carryTo(0, SITES.plank.slot, 4);
  expect(s.placed).toBe(0);
  const before = JSON.stringify(s.boards);
  step(s, [press(PIECES[1].a), press(PIECES[2].a)], 0.03);
  expect(JSON.stringify(s.boards)).toBe(before);
  expect(holds(s)).toEqual(NONE);
  expect([carrying(s, 0), carrying(s, 1)]).toEqual([false, false]);
  expect([held(s, 0), held(s, 1)]).toEqual([null, null]);
  expect(prompt(s, 0, [P(PIECES[1].a), P(far)])).toBeNull();
  expect(veto(s, 0, [P(A), P(B)])).toBeNull();
  s.splash = 5; const t = s.splash; step(s, [P(far), P(far)], 0.25); expect(s.splash).toBeCloseTo(t + 0.25, 9);
});

test('the plank (4 m) and the short board (2.5 m) can be carried through the zigzag; the spar (6.5 m) cannot', () => {
  const opts = { slack: SLACK, margin: 0 };      // the game's own tolerances
  expect(carrySearch({ ...opts, len: 4, from: stands(4) }).done).toBe(true);
  expect(carrySearch({ ...opts, len: 2.5, from: stands(2.5) }).done).toBe(true);
  // (the search does not cover a board already lying across a stone: only lag can put one there,
  // and the game lets it slide along its own line)
  const spar = carrySearch({ ...opts, len: 6.5, from: stands(6.5) });
  expect(spar.done).toBe(false);
  expect(spar.reason).toBe('blocked');           // it could be lifted at the start: it is the stones that stop it
}, SEARCH_MS);
test('the zigzag can be carried at full length, and every step of the way obeys the veto', () => {
  // stricter than the game: less slack, and the board kept further off the stones
  const r = carrySearch({ len: LEN, slack: 0.4, margin: 0.3, path: true, from: stands(4) });
  expect(r.done).toBe(true);
  expect(r.path.length).toBeGreaterThan(100);
  const s = pair(create());
  for (let i = 1; i < r.path.length; i++) {
    const [a0, b0] = r.path[i - 1], [a1, b1] = r.path[i];
    const moved = a0[0] !== a1[0] || a0[1] !== a1[1] ? 0 : 1;
    const to = moved === 0 ? a1 : b1;
    expect(veto(s, moved, [P(a0), P(b0)])(to[0], to[1]), `step ${i}`).toBe(false);
    const [x0, z0, x1, z1] = board(LEN, a1[0], a1[1], b1[0], b1[1]);
    expect(Math.hypot(x1 - x0, z1 - z0)).toBeCloseTo(LEN, 9);
  }
}, SEARCH_MS);
test('the stones are a real obstacle: a board too long for the gaps cannot be carried through', () => {
  expect(carrySearch({ len: 7, slack: 0.4, margin: 0.3, from: [[2.5, 34], [9.5, 34]] }).done).toBe(false);
}, SEARCH_MS);

test('prompts', () => {
  const s = create();
  expect(prompt(s, 0, [P(A), P(far)])).toBe('E — pick up this end');
  expect(prompt(s, 0, [P(PIECES[1].a), P(far)])).toBe('E — pick up this end');     // any piece's free end
  expect(prompt(s, 0, [P(far), P(far)])).toBeNull();
  step(s, [press(A), P(far)], 0.03);
  expect(prompt(s, 0, [P(A), P(far)])).toBe('E — let go');
  expect(prompt(s, 1, [P(A), P(B)])).toBe('E — pick up this end');                  // the other end of it is free
  s.boards[0].holdB = 1;
  expect(prompt(s, 0, [P(A), P(B)])).toBe('E — let go');
  expect(prompt(s, 1, [P(A), P(B)])).toBe('E — let go');
  s.placed = 0;
  expect(prompt(s, 0, [P(A), P(B)])).toBeNull();
  expect(prompt(create(), 0, [gone, P(far)])).toBeNull();
});

test('a walker who leaves lets go', () => {
  const s = create(); step(s, [press(A), press(B)], 0.03);
  step(s, [P(A), gone], 0.03);
  expect(holds(s)).toEqual(NONE);
  expect(s.placed).toBeNull();
});

test('valid, forceSolve, and wiring into index', () => {
  const s = create();
  expect(valid(s)).toBe(true);
  const mid = create(); step(mid, [press(A), press(B)], 0.03); step(mid, [P([5, 36]), P([9, 36])], 0.03);
  const done = create(); forceSolve(done);
  for (const ok of [s, mid, done]) { expect(valid(ok)).toBe(true); expect(valid(JSON.parse(JSON.stringify(ok)))).toBe(true); }
  const mod = (f) => { const c = JSON.parse(JSON.stringify(s)); f(c); return c; };
  expect(valid(mod((c) => c.boards.pop()))).toBe(false);
  expect(valid(mod((c) => c.boards.push({ ...c.boards[0] })))).toBe(false);
  expect(valid(mod((c) => { c.boards[2].bz = NaN; }))).toBe(false);
  expect(valid(mod((c) => { c.boards[1].holdA = 2; }))).toBe(false);
  expect(valid(mod((c) => { c.boards[0].holdA = 0; c.boards[3].holdB = 0; }))).toBe(false);   // one walker, two ends
  expect(valid(mod((c) => { c.boards[0].holdA = 0; c.boards[0].holdB = 0; }))).toBe(false);
  expect(valid(mod((c) => { c.placed = 2; c.solved = true; }))).toBe(false);                   // too short
  expect(valid(mod((c) => { c.placed = 0; }))).toBe(false);                                    // solved is false
  expect(valid(mod((c) => { c.placed = 7; c.solved = true; }))).toBe(false);
  expect(valid(mod((c) => { c.splash = -1; }))).toBe(false);
  expect(valid(mod((c) => { c.splash = NaN; }))).toBe(false);
  expect(valid(mod((c) => { c.solved = undefined; }))).toBe(false);
  expect(valid(null)).toBe(false);
  expect(valid({ ...s, boards: 'x' })).toBe(false);
  forceSolve(s);
  expect(s.placed).toBe(0); expect(s.solved).toBe(true); expect(holds(s)).toEqual(NONE);
  const [sx, sz] = SITES.plank.slot;
  expect(ends(s)).toEqual([sx, sz - LEN / 2, sx, sz + LEN / 2]);

  const S = createAll(3);
  expect(S.plank).toEqual(create());
  expect(validState(JSON.parse(JSON.stringify(S)))).toBe(true);
  expect(dynOf(S).plank).toBe(false);
  forceSolved(S, 3);
  expect(solvedCount(S)).toBe(3);
  expect(dynOf(S).plank).toBe(true);
  expect(solvedLine(2)).toBe('The plank is down');
  expect(validState(S)).toBe(true);
  expect(validState({ ...createAll(1), plank: { ...create(), boards: [] } })).toBe(false);
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
  step(s, [press(me), P(far)], 0.03); expect(held(s, 0)).toEqual({ i: 0, end: 'A' });
  const lone = veto(s, 0, [P(me), P(far)]);
  expect(lone(me[0] - 0.1, me[1])).toBe(false);   // toward the end: allowed
  expect(lone(me[0] + 0.1, me[1])).toBe(true);    // away: refused
  expect(lone(A[0] + 0.3, A[1])).toBe(false);     // inside 0.6 m: allowed
});

test('released with an end over water, it returns to rest; fully on land it stays', () => {
  const [mx, mz] = [14, 36];
  const wet = carryTo(0, [mx, mz], 4);
  expect(heightAt(mx, mz)).toBeGreaterThanOrEqual(0.2);       // midpoint on land
  expect(heightAt(mx + 2, mz)).toBeLessThan(0.2);             // end over water
  expect(ends(wet)).toEqual([...A, ...B]);
  for (const i of [0, 1, 2, 3]) {
    const dry = carryTo(i, [6, 36]);
    const l = PIECES[i].len;
    expect(ends(dry, i).map((v) => +v.toFixed(6))).toEqual([6 - l / 2, 36, 6 + l / 2, 36]);
    expect(atRest(dry, i)).toBe(false);
  }
});

// ---- final review fixes

test('C1: released with an end inside a standing stone, it returns to rest', () => {
  const st = SITES.plank.stones[0];
  const s = pair(create());
  const a = [6.87, 24.85], b = [6.02, 24.0];          // the reviewer's carriers, bunched against stone 0
  step(s, [P(a), P(b)], 0.03);
  step(s, [press(a), P(b)], 0.03);
  expect(holds(s)).toEqual(NONE);
  expect(ends(s)).toEqual([...A, ...B]);
  // and directly: an end settling on a stone's centre goes home
  const t = pair(create());
  const c = [st.x, st.z - 2];                          // end B settles 1 m past the stone's centre
  step(t, [P(c), P([st.x, st.z])], 0.03);
  step(t, [press(c), P([st.x, st.z])], 0.03);
  expect(ends(t)).toEqual([...A, ...B]);
  for (const k of SITES.plank.stones) expect(Math.hypot(t.boards[0].ax - k.x, t.boards[0].az - k.z)).toBeGreaterThan(k.r + 0.3);
});

test('I2: a pair whose board already crosses a stone may move to ease it, not to worsen it', () => {
  const st = SITES.plank.stones[0];
  const t = pair(create());
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

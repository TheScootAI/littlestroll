import { test, expect } from 'vitest';
import { BURN, TAKE_R, PASS_R, LIGHT_R, create, step, prompt, mustWalk, valid, forceSolve } from '../src/puzzles/relay.js';
import { createAll, stepAll, solvedCount, dynOf, promptFor, forceSolved, validState, solvedLine } from '../src/puzzles/index.js';
import { SITES } from '../src/world/layout.js';
import { createPlayer, stepPlayer } from '../src/player/controller.js';
import { findPath, steer } from '../src/debug/path.js';
import { readInput } from '../src/player/input.js';
import { WALK, RUN, MAX_DT } from '../src/config.js';

const P = (xz, o = {}) => ({ present: true, x: xz[0], y: 0, z: xz[1], aim: [0, 0, -1], hold: false, pressed: false, ...o });
const gone = { present: false };
const far = SITES.spawn[0];
const { small, great } = SITES.relay;
const off = (xz, dx, dz = 0) => [xz[0] + dx, xz[1] + dz];

const held = (idx = 0) => ({ holder: idx, t: BURN, solved: false });

test('constants', () => {
  expect([BURN, TAKE_R, PASS_R, LIGHT_R]).toEqual([6, 1.5, 1.8, 2]);
  expect(create()).toEqual({ holder: null, t: 0, solved: false });
});

test('taking: a press at the small brazier takes the flame; out of range or no press does nothing', () => {
  const s = create();
  step(s, [P(small), P(far)], 0.03);
  expect(s.holder).toBe(null);
  step(s, [P(off(small, TAKE_R + 0.3), { pressed: true }), P(far)], 0.03);
  expect(s.holder).toBe(null);
  step(s, [P(off(small, TAKE_R - 0.2), { pressed: true }), P(far)], 0.03);
  expect(s.holder).toBe(0);
  expect(s.t).toBeCloseTo(BURN - 0.03);
});
test('both pressing for the free flame: the lower index gets it', () => {
  const s = create();
  step(s, [P(small, { pressed: true }), P(small, { pressed: true })], 0.03);
  expect(s.holder).toBe(0);
  const u = create();
  step(u, [P(far), P(small, { pressed: true })], 0.03);
  expect(u.holder).toBe(1);
});
test('passing: a press within PASS_R of the holder takes it and resets the time to BURN', () => {
  const s = held(0); s.t = 2;
  const a = off(far, 0), near = off(far, PASS_R - 0.2), away = off(far, PASS_R + 0.5);
  step(s, [P(a), P(away, { pressed: true })], 0.03);
  expect(s.holder).toBe(0);
  step(s, [P(a), P(near)], 0.03);
  expect(s.holder).toBe(0);
  step(s, [P(a), P(near, { pressed: true })], 0.03);
  expect(s.holder).toBe(1);
  expect(s.t).toBeCloseTo(BURN - 0.03);
  // and back again
  step(s, [P(a, { pressed: true }), P(near)], 0.03);
  expect(s.holder).toBe(0);
});
test('a free flame cannot be taken away from the small brazier', () => {
  const s = create();
  step(s, [P(far, { pressed: true }), P(far, { pressed: true })], 0.03);
  expect(s.holder).toBe(null);
});
test('burning out: 5.9 s still held, 6.1 s gone and the flame is home', () => {
  const s = held(0);
  for (let i = 0; i < 59; i++) step(s, [P(far), P(far)], 0.1);
  expect(s.holder).toBe(0); expect(s.t).toBeCloseTo(0.1);
  for (let i = 0; i < 2; i++) step(s, [P(far), P(far)], 0.1);
  expect(s.holder).toBe(null); expect(s.t).toBe(0); expect(s.solved).toBe(false);
});
test('passing at 5.9 s keeps it alive past 6 s', () => {
  const s = held(0);
  for (let i = 0; i < 59; i++) step(s, [P(far), P(far)], 0.1);
  step(s, [P(far), P(off(far, 1), { pressed: true })], 0.03);
  expect(s.holder).toBe(1);
  for (let i = 0; i < 20; i++) step(s, [P(far), P(far)], 0.1);   // 2 s more: past 6 s since the start
  expect(s.holder).toBe(1);
  expect(s.t).toBeGreaterThan(3);
});
test('lighting needs the holder, a press, and range', () => {
  const at = (r) => off(great, r);
  let s = held(0);
  step(s, [P(at(LIGHT_R - 0.2)), P(far)], 0.03); expect(s.solved).toBe(false);                       // no press
  step(s, [P(at(LIGHT_R + 0.3), { pressed: true }), P(far)], 0.03); expect(s.solved).toBe(false);    // too far
  step(s, [P(at(LIGHT_R - 0.2), { pressed: true }), P(far)], 0.03); expect(s.solved).toBe(true);
  expect(s.holder).toBe(0);
  s = held(1);
  step(s, [P(at(0.5), { pressed: true }), P(far)], 0.03);                                           // a non-holder presses at the great brazier
  expect(s.solved).toBe(false);
  s = create();
  step(s, [P(at(0.5), { pressed: true }), P(far)], 0.03); expect(s.solved).toBe(false);             // no flame at all
});
test('once solved nothing changes', () => {
  const s = held(1); s.solved = true; s.t = 3;
  step(s, [P(small, { pressed: true }), P(off(small, 1), { pressed: true })], 0.1);
  for (let i = 0; i < 100; i++) step(s, [P(far), gone], 0.1);
  expect(s).toEqual({ holder: 1, t: 3, solved: true });
});
test('holder absent: the flame returns', () => {
  const s = held(1);
  step(s, [P(far), gone], 0.03);
  expect(s.holder).toBe(null);
  const u = held(0);
  step(u, [gone, P(small, { pressed: true })], 0.03);   // absent holder returns first, then the free flame can be taken
  expect(u.holder).toBe(1);
});
test('the clamp: one 3600 s step burns at most MAX_DT', () => {
  const s = held(0);
  step(s, [P(far), P(far)], 3600);
  expect(s.holder).toBe(0);
  expect(s.t).toBeCloseTo(BURN - MAX_DT);
  const u = held(0); step(u, [P(far), P(far)], NaN); expect(u.t).toBe(BURN);
  const w = held(0); step(w, [P(far), P(far)], -5); expect(w.t).toBe(BURN);
});
test('mustWalk', () => {
  expect(mustWalk(held(0), 0)).toBe(true);
  expect(mustWalk(held(0), 1)).toBe(false);
  expect(mustWalk(create(), 0)).toBe(false);
  expect(mustWalk({ ...held(1), solved: true }, 1)).toBe(false);
});
test('the merged input never runs while mustWalk says so (keyboard, forced and pilot alike)', () => {
  const state = { mx: 0, mz: 1, run: true, camYaw: 0 };
  let walk = false;
  const input = { state, forced: null, mustWalk: () => walk };
  expect(readInput(input).run).toBe(true);
  walk = true;
  expect(readInput(input).run).toBe(false);
  input.forced = { run: true, mz: 1 };
  expect(readInput(input).run).toBe(false);
  expect(readInput(input).mz).toBe(1);
  expect(readInput({ state, forced: null }).run).toBe(true);   // no hook: untouched
  expect(state.run).toBe(true);                                 // the live state is not rewritten
});
test('prompts', () => {
  const s = create();
  expect(prompt(s, 0, [P(small), P(far)])).toBe('E — take the flame');
  expect(prompt(s, 0, [P(far), P(far)])).toBe(null);
  expect(prompt(s, 0, [gone, P(far)])).toBe(null);
  const h = held(0);
  expect(prompt(h, 0, [P(far), P(far)])).toBe("You can't run with the flame");
  expect(prompt(h, 0, [P(off(great, 1)), P(far)])).toBe('E — light the brazier');
  expect(prompt(h, 1, [P(far), P(off(far, 1))])).toBe('E — take the flame');
  expect(prompt(h, 1, [P(far), P(off(far, 5))])).toBe(null);
  expect(prompt(h, 1, [P(far), P(small)])).toBe(null);          // the flame is carried: the small brazier is dark
  expect(prompt({ ...h, solved: true }, 0, [P(off(great, 1)), P(far)])).toBe(null);
});
test('valid / forceSolve', () => {
  expect(valid(create())).toBe(true);
  expect(valid(held(1))).toBe(true);
  for (const bad of [null, {}, { holder: 2, t: 1, solved: false }, { holder: 0, t: NaN, solved: false }, { holder: 0, t: 7, solved: false },
    { holder: 0, t: -1, solved: false }, { holder: null, t: 0, solved: 1 }, { holder: null, t: 0 }, { holder: undefined, t: 0, solved: false }]) {
    expect(valid(bad)).toBe(false);
  }
  const s = held(0); forceSolve(s);
  expect(s.solved).toBe(true); expect(valid(s)).toBe(true);
});

// ---- index wiring: the relay is the last puzzle and ends the walk
test('index: the relay is last; lighting it ends the walk', () => {
  const S = createAll(1); forceSolved(S, 7);
  expect(solvedCount(S)).toBe(7); expect(S.ended).toBe(null);
  S.time = 50;
  stepAll(S, [P(small, { pressed: true }), P(far)], 1 / 30);
  expect(S.relay.holder).toBe(0);
  expect(promptFor(S, 0, [P(far), P(far)])).toBe("You can't run with the flame");
  stepAll(S, [P(great, { pressed: true }), P(far)], 1 / 30);
  expect(S.relay.solved).toBe(true);
  expect(S.ended).toEqual({ time: expect.any(Number) });
  expect(solvedCount(S)).toBe(8);
  expect(solvedLine(7)).toBe('The Far Isle is lit');
  expect(validState(JSON.parse(JSON.stringify(S)))).toBe(true);
  const U = createAll(1); forceSolved(U, 8); expect(U.relay.solved).toBe(true); expect(U.ended).not.toBe(null);
  const V = JSON.parse(JSON.stringify(S)); V.relay.holder = 5; expect(validState(V)).toBe(false);
  const T = createAll(1); forceSolved(T, 7); expect(T.ended).toBe(null);
  expect(dynOf(T)).toEqual(dynOf(JSON.parse(JSON.stringify(T))));
});

// ---- the real layout
const world = () => { const S = createAll(3); forceSolved(S, 7); return dynOf(S); };
const polyline = (route) => {
  const cum = [0];
  for (let i = 1; i < route.length; i++) cum.push(cum[i - 1] + Math.hypot(route[i][0] - route[i - 1][0], route[i][1] - route[i - 1][1]));
  return cum;
};
// arclength of the point on the polyline nearest (x, z)
const progress = (route, cum, x, z) => {
  let best = Infinity, s = 0;
  for (let i = 1; i < route.length; i++) {
    const [ax, az] = route[i - 1], [bx, bz] = route[i];
    const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz;
    const u = l2 ? Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l2)) : 0;
    const d = Math.hypot(x - (ax + u * dx), z - (az + u * dz));
    if (d < best) { best = d; s = cum[i - 1] + u * Math.sqrt(l2); }
  }
  return s;
};

test('the route from the small brazier to the great one is long enough to need the relay', () => {
  const route = findPath(small, great, world());
  expect(route).not.toBeNull();
  const len = polyline(route).at(-1);
  expect(len).toBeGreaterThan(55); expect(len).toBeLessThan(70);
  expect(len).toBeGreaterThan(BURN * WALK * 2.5);   // alone: 19 m of walking, never enough
});

test('simulation: a lone walker burns out before the great brazier; two who leapfrog light it', () => {
  const dyn = world();
  const route = findPath(small, great, dyn), cum = polyline(route), total = cum.at(-1);
  const DT = 1 / 30;
  const walker = (x, z) => ({ p: createPlayer(x, z), i: 1 });
  const go = (w) => {
    const r = steer(w.p, route, w.i, { dyn, run: false, within: 0.3, camYaw: w.p.yaw });
    w.i = r.i;
    stepPlayer(w.p, { mx: 0, mz: r.mz, camYaw: r.camYaw, run: false }, DT, dyn);
    return r;
  };
  const pin = (w, pressed) => ({ present: true, x: w.p.x, y: w.p.y, z: w.p.z, aim: [0, 0, -1], hold: false, pressed });

  // --- alone
  {
    const s = create(), a = walker(...small);
    let burned = null, t = 0;
    for (; t < 90 && !s.solved; t += DT) {
      const carrying = s.holder === 0;
      const near = Math.hypot(a.p.x - great[0], a.p.z - great[1]) < LIGHT_R - 0.3;
      step(s, [pin(a, s.holder === null ? t === 0 : near), gone], DT);
      if (carrying && s.holder === null && burned === null) burned = progress(route, cum, a.p.x, a.p.z);
      go(a);
    }
    console.log('relay solo: burned out', burned && burned.toFixed(1), 'm along of', total.toFixed(1));
    expect(s.solved).toBe(false);
    expect(burned).not.toBe(null);
    expect(burned).toBeLessThan(BURN * WALK + 2);     // about 19 m along, nowhere near the top
    expect(burned).toBeLessThan(total - 30);
  }

  // --- two walkers, leapfrogging
  {
    const s = create(), w = [walker(...small), walker(...small)];
    const target = [14, 14];            // arclength each free walker waits at
    let passes = 0, t = 0;
    for (; t < 120 && !s.solved; t += DT) {
      const pressed = [false, false];
      const h = s.holder;
      if (h === null) pressed[0] = true;
      else {
        const d = Math.hypot(w[0].p.x - w[1].p.x, w[0].p.z - w[1].p.z);
        const free = 1 - h;
        const waiting = progress(route, cum, w[free].p.x, w[free].p.z) >= target[free] - 0.5;   // it has run ahead and stopped
        if (waiting && d <= PASS_R - 0.3) pressed[free] = true;   // the carrier arrived: take it
        if (Math.hypot(w[h].p.x - great[0], w[h].p.z - great[1]) < LIGHT_R - 0.3) pressed[h] = true;
      }
      const before = s.holder;
      step(s, [pin(w[0], pressed[0]), pin(w[1], pressed[1])], DT);
      if (s.holder !== before && s.holder !== null && before !== null) {
        passes++;
        const free = 1 - s.holder;
        target[free] = Math.min(total, progress(route, cum, w[s.holder].p.x, w[s.holder].p.z) + 14);
      } else if (before === null && s.holder !== null) target[1 - s.holder] = 14;
      for (const k of [0, 1]) {
        const sk = progress(route, cum, w[k].p.x, w[k].p.z);
        if (s.holder === k) go(w[k]);
        else if (sk < target[k] - 0.3) {
          const r = steer(w[k].p, route, w[k].i, { dyn, run: true, within: 0.3, camYaw: w[k].p.yaw });
          w[k].i = r.i;
          stepPlayer(w[k].p, { mx: 0, mz: 1, camYaw: r.camYaw, run: true }, DT, dyn);
        }
      }
    }
    console.log('relay sim: solved at', t.toFixed(1), 's with', passes, 'passes');
    expect(s.solved).toBe(true);
    expect(passes).toBeGreaterThanOrEqual(3);
    expect(t).toBeLessThan(60);
  }
});

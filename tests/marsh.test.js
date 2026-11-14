import { test, expect } from 'vitest';
import { makePath, create, step, prompt, maskOf, seesPath, valid, forceSolve } from '../src/puzzles/marsh.js';
import { createAll, stepAll, solvedCount, dynOf, promptFor, forceSolved, validState, solvedLine } from '../src/puzzles/index.js';
import { SITES, heightAt, zoneAt, marshTileCentre, MARSH_SURFACE } from '../src/world/layout.js';
import { createPlayer, stepPlayer, needsRespawn, respawn } from '../src/player/controller.js';
import { DROWN_Y } from '../src/config.js';

const P = (xz, o = {}) => ({ present: true, x: xz[0], y: 0, z: xz[1], aim: [0, 0, -1], hold: false, pressed: false, ...o });
const gone = { present: false };
const far = SITES.spawn[0];
const M = SITES.marsh;
const plate = [M.plate.x, M.plate.z];
const COLS = M.cols, ROWS = M.rows;
const rc = (i) => [Math.floor(i / COLS), i % COLS];
const sol = (path) => path.reduce((m, i) => m | (1 << i), 0);

test('layout facts the rules rely on', () => {
  expect(COLS).toBe(5); expect(ROWS).toBe(6);
});

test('makePath: shape rules for 300 seeds', () => {
  const seen = new Set();
  for (let seed = 0; seed < 300; seed++) {
    const p = makePath(seed);
    seen.add(p.join(','));
    expect(rc(p[0])[0]).toBe(0);
    expect(rc(p.at(-1))[0]).toBe(ROWS - 1);
    expect(new Set(p).size).toBe(p.length);
    let sideways = 0;
    for (let k = 1; k < p.length; k++) {
      const [r0, c0] = rc(p[k - 1]), [r1, c1] = rc(p[k]);
      const dr = r1 - r0, dc = Math.abs(c1 - c0);
      expect(dr === 1 && dc === 0 || dr === 0 && dc === 1).toBe(true);   // forward or sideways, never back or diagonal
      if (dr === 0) sideways++;
    }
    expect(sideways).toBeGreaterThanOrEqual(2);
    expect(p.every((i) => Number.isInteger(i) && i >= 0 && i < 30)).toBe(true);
  }
  expect(seen.size).toBeGreaterThanOrEqual(150);
});
test('makePath: the same seed gives the same path', () => {
  for (const seed of [0, 1, 7, 12345]) expect(makePath(seed)).toEqual(makePath(seed));
});
test('makePath: no non-consecutive tiles are orthogonally adjacent, and corners only touch round a turn', () => {
  for (let seed = 0; seed < 300; seed++) {
    const p = makePath(seed);
    for (let a = 0; a < p.length; a++) for (let b = a + 2; b < p.length; b++) {
      const [r0, c0] = rc(p[a]), [r1, c1] = rc(p[b]);
      const dr = Math.abs(r0 - r1), dc = Math.abs(c0 - c1);
      expect(dr + dc === 1).toBe(false);
      if (dr === 1 && dc === 1) expect(b - a).toBe(2);
    }
  }
});

test('create: a path, nobody holding, unsolved', () => {
  const s = create(3);
  expect(s.path).toEqual(makePath(3)); expect(s.held).toBe(false); expect(s.solved).toBe(false);
});
test('maskOf: 0 with nobody on the plate, the path while someone is, 0 when they leave, forever once solved', () => {
  const s = create(5), full = sol(s.path);
  step(s, [P(far), P(far)], 1 / 30); expect(maskOf(s)).toBe(0);
  step(s, [P(plate), P(far)], 1 / 30); expect(s.held).toBe(true); expect(maskOf(s)).toBe(full);
  step(s, [P(far), P(far)], 1 / 30); expect(s.held).toBe(false); expect(maskOf(s)).toBe(0);
  step(s, [P(far), P(plate)], 1 / 30); expect(maskOf(s)).toBe(full);
  step(s, [P(plate), P(M.lever, { pressed: true })], 1 / 30); expect(s.solved).toBe(true);
  step(s, [P(far), P(far)], 1 / 30); expect(s.held).toBe(false); expect(maskOf(s)).toBe(full);
});
test('an absent walker on the plate does not hold; one just off it does not either', () => {
  const s = create(5);
  step(s, [{ ...P(plate), present: false }, gone], 1 / 30); expect(s.held).toBe(false);
  step(s, [P([plate[0] + M.plate.r + 0.1, plate[1]]), P(far)], 1 / 30); expect(s.held).toBe(false);
  step(s, [P([plate[0] + M.plate.r - 0.1, plate[1]]), P(far)], 1 / 30); expect(s.held).toBe(true);
});
test('the lever needs pressed and presence within 1.5 m', () => {
  const s = create(5);
  step(s, [P(M.lever), P(far)], 1 / 30); expect(s.solved).toBe(false);
  step(s, [P([M.lever[0] + 1.6, M.lever[1]], { pressed: true }), P(far)], 1 / 30); expect(s.solved).toBe(false);
  step(s, [{ ...P(M.lever, { pressed: true }), present: false }, P(far)], 1 / 30); expect(s.solved).toBe(false);
  step(s, [P(far), P([M.lever[0] + 1.4, M.lever[1]], { pressed: true })], 1 / 30); expect(s.solved).toBe(true);
});

test('prompts', () => {
  const s = create(5);
  expect(prompt(s, 0, [P(plate), P(far)])).toBe('Stay here — the stones hold while you watch. Guide your friend.');
  const edge = [M.origin[0] - 1.5, M.origin[1] + 6];
  expect(prompt(s, 0, [P(edge), P(far)])).toBe('Someone has to watch from the stone');
  const tileCentre = marshTileCentre(0);
  expect(prompt(s, 0, [P(tileCentre), P(far)])).toBe(null);
  expect(prompt(s, 0, [P([M.origin[0] - 3.5, M.origin[1] + 6]), P(far)])).toBe(null);
  s.held = true;
  expect(prompt(s, 0, [P(edge), P(far)])).toBe(null);
  s.held = false;
  expect(prompt(s, 0, [P(M.lever), P(far)])).toBe('E — pull the lever');
  expect(prompt(s, 0, [P(far), P(far)])).toBe(null);
  expect(prompt(s, 0, [gone, P(far)])).toBe(null);
  s.solved = true;
  expect(prompt(s, 0, [P(plate), P(far)])).toBe(null);
  expect(prompt(s, 0, [P(M.lever), P(far)])).toBe(null);
});

test('seesPath: only from the plate, or once solved', () => {
  const s = create(2);
  expect(seesPath(s, P(plate))).toBe(true);
  expect(seesPath(s, P([plate[0] + M.plate.r + 0.2, plate[1]]))).toBe(false);
  expect(seesPath(s, P(far))).toBe(false);
  expect(seesPath(s, { present: false })).toBe(false);
  expect(seesPath(s, undefined)).toBe(false);
  s.solved = true;
  expect(seesPath(s, P(far))).toBe(true);
  expect(seesPath(s, { present: false })).toBe(true);
});

test('real layout: path tiles are solid ground, the rest drown, whatever the seed', () => {
  for (const seed of [0, 1, 2, 9, 42]) {
    const s = create(seed); s.held = true;
    const dyn = { marsh: maskOf(s) };
    for (let i = 0; i < 30; i++) {
      const [x, z] = marshTileCentre(i);
      if (s.path.includes(i)) expect(heightAt(x, z, dyn)).toBe(MARSH_SURFACE);
      else expect(heightAt(x, z, dyn)).toBeLessThan(DROWN_Y);
    }
    expect(heightAt(...marshTileCentre(s.path[0]), { marsh: 0 })).toBeLessThan(DROWN_Y);
  }
});

function walk(p, to, dyn, between) {
  for (let n = 0; n < 2000; n++) {
    const dx = to[0] - p.x, dz = to[1] - p.z, d = Math.hypot(dx, dz);
    if (d < 0.15) return;
    stepPlayer(p, { camYaw: 0, mx: dx / d, mz: -dz / d, run: false }, 1 / 30, dyn);
    if (between) between();
  }
}
test('a walker follows the path tile to tile while held and reaches I; it never sinks', () => {
  for (const seed of [0, 4, 11]) {
    const s = create(seed); s.held = true;
    const dyn = { marsh: maskOf(s) };
    const [sx, sz] = [M.origin[0] - 3, M.origin[1] + (s.path[0] % COLS + 0.5) * M.tile];
    const p = createPlayer(sx, sz);
    expect(zoneAt(sx, sz)).toBe('H');
    let sank = false;
    for (const i of s.path) walk(p, marshTileCentre(i), dyn, () => { if (needsRespawn(p, dyn)) sank = true; });
    walk(p, [M.origin[0] + ROWS * M.tile + 2.5, p.z], dyn, () => { if (needsRespawn(p, dyn)) sank = true; });
    expect(sank).toBe(false);
    expect(zoneAt(p.x, p.z)).toBe('I');
  }
});
test('the same walk with the plate released half-way sinks, and respawn(6) puts them back on H', () => {
  const s = create(4); s.held = true;
  let dyn = { marsh: maskOf(s) };
  const p = createPlayer(M.origin[0] - 3, M.origin[1] + (s.path[0] % COLS + 0.5) * M.tile);
  let sank = false;
  s.path.forEach((i, k) => {
    if (k === Math.floor(s.path.length / 2)) { s.held = false; dyn = { marsh: maskOf(s) }; }
    walk(p, marshTileCentre(i), dyn, () => { if (needsRespawn(p, dyn)) sank = true; });
  });
  expect(sank).toBe(true);
  expect(needsRespawn(p, dyn)).toBe(true);
  respawn(p, 6, 0);
  expect(zoneAt(p.x, p.z)).toBe('H');
  expect(needsRespawn(p, dyn)).toBe(false);
});
test('solo on row 0 with nobody on the plate drowns', () => {
  const s = create(6);
  const dyn = { marsh: maskOf(s) };
  const p = createPlayer(M.origin[0] - 1, M.origin[1] + 6);
  walk(p, marshTileCentre(2), dyn);
  for (let i = 0; i < 90; i++) stepPlayer(p, { camYaw: 0, mx: 0, mz: 0 }, 1 / 30, dyn);
  expect(needsRespawn(p, dyn)).toBe(true);
});

test('forceSolve and valid', () => {
  const s = create(8);
  expect(valid(s)).toBe(true);
  forceSolve(s); expect(s.solved).toBe(true); expect(valid(s)).toBe(true);
  expect(maskOf(s)).toBe(sol(s.path));
  const bad = (f) => { const c = JSON.parse(JSON.stringify(create(8))); f(c); expect(valid(c)).toBe(false); };
  bad((c) => { c.path = []; });
  bad((c) => { c.path = c.path.slice(0, 3); });
  bad((c) => { c.path = [...c.path, 99]; });
  bad((c) => { c.path = [...c.path, 1.5]; });
  bad((c) => { c.path = [...c.path, c.path[0]]; });
  bad((c) => { c.path = 'x'; });
  bad((c) => { c.path = Array(40).fill(0).map((_, i) => i % 30); });
  bad((c) => { c.held = 1; });
  bad((c) => { c.solved = undefined; });
  bad((c) => { delete c.path; });
  expect(valid(null)).toBe(false);
});

test('index: slice, dyn, prompt, flash, forceSolved, validity', () => {
  const S = createAll(9);
  expect(S.marsh.path).toEqual(makePath(9));
  expect(dynOf(S).marsh).toBe(0);
  forceSolved(S, 6);
  expect(solvedCount(S)).toBe(6);
  stepAll(S, [P(plate), P(far)], 1 / 30);
  expect(dynOf(S).marsh).toBe(sol(S.marsh.path));
  expect(promptFor(S, 0, [P(plate), P(far)])).toBe('Stay here — the stones hold while you watch. Guide your friend.');
  stepAll(S, [P(far), P(M.lever, { pressed: true })], 1 / 30);
  expect(S.marsh.solved).toBe(true); expect(solvedCount(S)).toBe(7);
  expect(solvedLine(6)).toBe('The path holds');
  expect(validState(JSON.parse(JSON.stringify(S)))).toBe(true);
  const T = createAll(9); forceSolved(T, 7); expect(T.marsh.solved).toBe(true);
  const U = JSON.parse(JSON.stringify(S)); U.marsh.path = [1, 2]; expect(validState(U)).toBe(false);
});

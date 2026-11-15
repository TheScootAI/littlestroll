import { test, expect } from 'vitest';
import { sinksUnder, makePath, create, step, prompt, maskOf, seesPath, valid, forceSolve, onPlate, pathFor, pathOk, FALLBACK } from '../src/puzzles/marsh.js';
import { rng } from '../src/core/math.js';
import { createAll, stepAll, solvedCount, dynOf, promptFor, forceSolved, validState, solvedLine } from '../src/puzzles/index.js';
import { SITES, heightAt, zoneAt, marshTileCentre, marshTileAt, MARSH_SURFACE } from '../src/world/layout.js';
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
  expect(s.path).toEqual(pathFor(3, 0)); expect(s.held).toBe(false); expect(s.solved).toBe(false);
});
test('maskOf: 0 with nobody on the plate, the path while someone is, 0 when they leave, forever once solved', () => {
  const s = create(5);
  step(s, [P(far), P(far)], 1 / 30); expect(maskOf(s)).toBe(0);
  step(s, [P(plate), P(far)], 1 / 30); expect(s.held).toBe(true); expect(maskOf(s)).toBe(sol(pathFor(5, 0)));
  step(s, [P(far), P(far)], 1 / 30); expect(s.held).toBe(false); expect(maskOf(s)).toBe(0);
  step(s, [P(far), P(plate)], 1 / 30); expect(maskOf(s)).toBe(sol(pathFor(5, 1)));   // a new deal every time it is left
  const full = sol(s.path);
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
  expect(prompt(s, 0, [P(plate), P(far)])).toBe(null);
  const edge = [M.origin[0] - 1.5, M.origin[1] + 6];
  expect(prompt(s, 0, [P(edge), P(far)])).toBe(null);
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

test('seesPath: only from the plate with the barrier up, or once solved', () => {
  const s = create(2);
  // The barrier waits while a walker is near it. Until it is up nobody sees the path: otherwise
  // a watcher could hold it down from the plate's edge, read the path, let the partner take the
  // plate and stroll off to cross from memory (no re-deal, the plate was never left empty).
  expect(seesPath(s, P(plate))).toBe(false);
  s.up = true;
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
  expect(S.marsh.path).toEqual(pathFor(9, 0));
  expect(dynOf(S).marsh).toBe(0);
  forceSolved(S, 6);
  expect(solvedCount(S)).toBe(6);
  stepAll(S, [P(plate), P(far)], 1 / 30);
  expect(dynOf(S).marsh).toBe(sol(S.marsh.path));
  expect(promptFor(S, 0, [P(plate), P(far)])).toBe(null);
  stepAll(S, [P(far), P(M.lever, { pressed: true })], 1 / 30);
  expect(S.marsh.solved).toBe(true); expect(solvedCount(S)).toBe(7);
  expect(solvedLine(6)).toBe('The path holds');
  expect(validState(JSON.parse(JSON.stringify(S)))).toBe(true);
  const T = createAll(9); forceSolved(T, 7); expect(T.marsh.solved).toBe(true);
  const U = JSON.parse(JSON.stringify(S)); U.marsh.path = [1, 2]; expect(validState(U)).toBe(false);
});

// ---- Fix round 1: what only LOOKS at the world must not read the live marsh mask
import { lookDyn } from '../src/world/layout.js';
import { aimPoint } from '../src/world/sight.js';

test('lookDyn: every marsh tile solid, other keys untouched, argument not mutated', () => {
  const dyn = { gateOpen: true, bridge: false, plank: true, lift: 0.4, ladder: false, causeway: true, bells: false, marsh: 5 };
  const copy = { ...dyn };
  const l = lookDyn(dyn);
  expect(dyn).toEqual(copy);
  expect(l).not.toBe(dyn);
  expect(l.marsh).toBe((1 << (COLS * ROWS)) - 1);
  expect({ ...l, marsh: 5 }).toEqual(dyn);
  expect(lookDyn({}).marsh).toBe((1 << 30) - 1);
});
test('the pointer lands on the same surface for path and non-path tiles through lookDyn; the raw dyn leaks the path', () => {
  const s = create(4); s.held = true;
  const dyn = { marsh: maskOf(s) };
  const off = [...Array(30).keys()].filter((i) => !s.path.includes(i));
  const down = [0, -1, 0];
  const land = (i, d) => aimPoint([marshTileCentre(i)[0], MARSH_SURFACE + 8, marshTileCentre(i)[1]], down, d)[1];
  for (const i of [...s.path, ...off]) expect(Math.abs(land(i, lookDyn(dyn)) - MARSH_SURFACE)).toBeLessThan(0.1);
  expect(off.some((i) => Math.abs(land(i, dyn) - MARSH_SURFACE) > 0.1)).toBe(true);   // the leak
});
test('one logic tick with the mask dropped does not drown a walker on a path tile; three seconds does', () => {
  const s = create(4); s.held = true;
  const on = maskOf(s), tile = marshTileCentre(s.path[2]);
  const idle = { camYaw: 0, mx: 0, mz: 0 };
  const p = createPlayer(tile[0], tile[1]);
  stepPlayer(p, idle, 1 / 30, { marsh: on });
  expect(p.y).toBe(MARSH_SURFACE);
  stepPlayer(p, idle, 1 / 30, { marsh: 0 });
  expect(needsRespawn(p, { marsh: 0 })).toBe(false);
  stepPlayer(p, idle, 1 / 30, { marsh: on });
  expect(needsRespawn(p, { marsh: on })).toBe(false);
  expect(p.y).toBe(MARSH_SURFACE);
  const q = createPlayer(tile[0], tile[1]);
  let sank = false;
  for (let i = 0; i < 90; i++) { stepPlayer(q, idle, 1 / 30, { marsh: 0 }); if (needsRespawn(q, { marsh: 0 })) sank = true; }
  expect(sank).toBe(true);
});

test('sinksUnder: only a walker who is actually unsupported sinks a slab', () => {
  const s = create(4); s.held = true;
  const dyn = { marsh: maskOf(s) };
  const safe = s.path[1], unsafe = [...Array(30).keys()].find((i) => !s.path.includes(i));
  const W = (xz) => ({ present: true, x: xz[0], z: xz[1] });
  // on a safe tile
  expect(sinksUnder(W(marshTileCentre(safe)), safe, dyn)).toBe(false);
  // an unsafe tile with its centre far from any safe tile, unset: sinks
  const lone = [...Array(30).keys()].find((i) => !s.path.includes(i) &&
    s.path.every((p) => Math.abs((p % 5) - (i % 5)) + Math.abs(Math.floor(p / 5) - Math.floor(i / 5)) >= 2));
  expect(lone).toBeDefined();
  expect(sinksUnder(W(marshTileCentre(lone)), lone, dyn)).toBe(true);
  // 0.2 m past a safe tile's edge, over an unsafe neighbour: still held by the margin
  const nb = [safe - 5, safe + 5, safe - 1, safe + 1].find((i) => i >= 0 && i < 30 && !s.path.includes(i) && Math.abs((i % 5) - (safe % 5)) <= 1);
  expect(nb).toBeDefined();
  const c = marshTileCentre(safe), n = marshTileCentre(nb), d = [n[0] - c[0], n[1] - c[1]], dl = Math.hypot(...d);
  const half = SITES.marsh.tile / 2;
  const p = W([c[0] + (d[0] / dl) * (half + 0.2), c[1] + (d[1] / dl) * (half + 0.2)]);
  expect(marshTileAt(p.x, p.z)).toBe(nb);
  expect(sinksUnder(p, nb, dyn)).toBe(false);
  // wrong tile, absent walker
  expect(sinksUnder(W(marshTileCentre(lone)), safe, dyn)).toBe(false);
  expect(sinksUnder({ present: false }, lone, dyn)).toBe(false);
  expect(sinksUnder(null, lone, dyn)).toBe(false);
});

// ---- the watch-stone's wall and its re-deal (issue 15)
import { pathFor, pathOk } from '../src/puzzles/marsh.js';

const SEEDS = [0, 1, -1, 12345, 2 ** 31 - 1, -(2 ** 31), Number.MAX_SAFE_INTEGER, Number.MIN_SAFE_INTEGER];
const stepFor = (s, a, b) => step(s, [a, b], 1 / 30);
const bar = M.barrier;

test('the slice has seed, deal and up; create starts at deal 0 with the dealt path', () => {
  const s = create(77);
  expect(s.seed).toBe(77); expect(s.deal).toBe(0); expect(s.up).toBe(false);
  expect(s.path).toEqual(pathFor(77, 0));
});
test('pathFor: always pathOk, never equal to the next deal, for the awkward seeds', () => {
  const deals = [...Array(201).keys(), 1e9 - 1, 1e9];
  for (const seed of SEEDS) {
    let prev = pathFor(seed, deals[0]);
    expect(pathOk(prev), `${seed}/0`).toBe(true);
    for (const d of deals.slice(1)) {
      const p = pathFor(seed, d);
      expect(pathOk(p), `${seed}/${d}`).toBe(true);
      if (d === 1e9) { expect(p).not.toEqual(pathFor(seed, d - 1)); }
      else if (d === 1e9 - 1) { expect(p).not.toEqual(pathFor(seed, d + 1)); }
      else expect(p, `${seed}/${d}`).not.toEqual(prev);
      prev = p;
    }
    expect(pathFor(seed, 5)).toEqual(pathFor(seed, 5));
  }
});
test('stepping off the plate re-deals once; back on does not; standing does not; solved never does', () => {
  const s = create(9);
  const first = s.path;
  stepFor(s, P(plate), P(far));
  for (let i = 0; i < 100; i++) stepFor(s, P(plate), P(far));
  expect(s.deal).toBe(0); expect(s.path).toEqual(first);
  stepFor(s, P(far), P(far));
  expect(s.deal).toBe(1); expect(s.path).toEqual(pathFor(9, 1)); expect(s.path).not.toEqual(first);
  for (let i = 0; i < 20; i++) stepFor(s, P(far), P(far));
  expect(s.deal).toBe(1);
  stepFor(s, P(plate), P(far)); expect(s.deal).toBe(1);
  stepFor(s, P(far), P(far)); expect(s.deal).toBe(2);
  stepFor(s, P(plate), P(M.lever, { pressed: true })); expect(s.solved).toBe(true);
  stepFor(s, P(far), P(far)); expect(s.deal).toBe(2);
});
test('a watcher who stops being present counts as leaving', () => {
  const s = create(9);
  stepFor(s, P(plate), P(far)); expect(s.held).toBe(true);
  stepFor(s, { ...P(plate), present: false }, P(far));
  expect(s.held).toBe(false); expect(s.deal).toBe(1); expect(s.up).toBe(false);
});
test('two walkers swapping on the plate in one step keep it held, with no re-deal', () => {
  const s = create(9);
  stepFor(s, P(plate), P(far));
  stepFor(s, P(far), P(plate));
  expect(s.held).toBe(true); expect(s.deal).toBe(0);
});
test('the barrier: up while held, down when left, down when solved', () => {
  const s = create(4);
  stepFor(s, P(far), P(far)); expect(s.up).toBe(false);
  stepFor(s, P(plate), P(far)); expect(s.up).toBe(true);
  stepFor(s, P(plate), P(far)); expect(s.up).toBe(true);
  stepFor(s, P(far), P(far)); expect(s.up).toBe(false);
  stepFor(s, P(plate), P(far)); expect(s.up).toBe(true);
  stepFor(s, P(plate), P(M.lever, { pressed: true })); expect(s.solved).toBe(true); expect(s.up).toBe(false);
  stepFor(s, P(plate), P(far)); expect(s.up).toBe(false);
});
test('the barrier waits while a walker is within 0.9 m of it, and a far plate-stander does not stop it', () => {
  const mid = [(bar.ax + bar.bx) / 2, (bar.az + bar.bz) / 2];
  const s = create(4);
  stepFor(s, P(plate), P([mid[0] - 0.5, mid[1]])); expect(s.held).toBe(true); expect(s.up).toBe(false);
  stepFor(s, P(plate), P([mid[0] - 0.5, mid[1]])); expect(s.up).toBe(false);
  stepFor(s, P(plate), P([mid[0] - 1.0, mid[1]])); expect(s.up).toBe(true);
  const t = create(4);
  const stander = [bar.ax + 0.9 + 0.01, mid[1]];
  expect(onPlate(P(stander))).toBe(true);
  stepFor(t, P(stander), P(far)); expect(t.up).toBe(true);
  // an absent walker's position does not count
  const u = create(4);
  stepFor(u, P(plate), { ...P(mid), present: false }); expect(u.up).toBe(true);
});
test('valid: accepts every state a long random walk makes, survives JSON, rejects what the host could not deal', () => {
  const r = rng(5);
  for (const seed of [3, -7, Number.MAX_SAFE_INTEGER]) {
    const s = create(seed);
    const pos = [[...far], [...far]];
    for (let n = 0; n < 4000; n++) {
      for (const q of pos) {
        const roll = r();
        if (roll < 0.03) { q[0] = plate[0] + (r() - 0.5) * 3; q[1] = plate[1] + (r() - 0.5) * 3; }
        else if (roll < 0.05) { q[0] = far[0]; q[1] = far[1]; }
        else if (roll < 0.06) { q[0] = bar.ax + (r() - 0.5) * 2; q[1] = plate[1] + (r() - 0.5) * 3; }
      }
      stepFor(s, P(pos[0]), P(pos[1]));
      expect(valid(s)).toBe(true);
      if (n % 400 === 0) expect(valid(JSON.parse(JSON.stringify(s)))).toBe(true);
      if (s.solved) break;
    }
    expect(s.deal).toBeGreaterThan(3);
  }
  const s = create(8);
  expect(valid({ ...s, path: pathFor(8, 1) })).toBe(false);
  expect(valid({ ...s, path: [...s.path].reverse() })).toBe(false);
  for (const seed of [1.5, NaN, '3', undefined, 2 ** 60]) expect(valid({ ...s, seed })).toBe(false);
  for (const deal of [-1, 1.5, NaN, 1e9 + 1, '0', undefined]) expect(valid({ ...s, deal })).toBe(false);
  for (const up of [0, 1, 'true', undefined]) expect(valid({ ...s, up })).toBe(false);
  expect(valid({ ...s, deal: 1e9, path: pathFor(8, 1e9) })).toBe(true);
});
test('forceSolve drops the barrier', () => {
  const s = create(2); s.up = true; s.held = true;
  forceSolve(s); expect(s.up).toBe(false); expect(s.solved).toBe(true);
});

test('the two fallback paths are legal and of opposite kinds', () => {
  expect(FALLBACK.every(pathOk)).toBe(true);
  expect(FALLBACK.map((p) => p.reduce((a, i) => a + i, 0) & 1)).toEqual([0, 1]);
});
test('dynOf exposes the barrier as watch', () => {
  const S = createAll(9);
  expect(dynOf(S).watch).toBe(false);
  S.marsh.up = true; expect(dynOf(S).watch).toBe(true);
});

test('a watcher holding the barrier down from the plate\'s edge sees nothing until it rises', () => {
  const s = create(7), b = M.barrier;
  const edge = [b.ax + 0.5, (b.az + b.bz) / 2];          // on the plate, half a metre from the barrier
  expect(onPlate(P(edge))).toBe(true);
  step(s, [P(edge), P(far)], 1 / 30);
  expect(s.held).toBe(true); expect(s.up).toBe(false);
  expect(seesPath(s, P(edge))).toBe(false);
  step(s, [P(plate), P(far)], 1 / 30);                    // steps to the middle: the barrier rises behind them
  expect(s.up).toBe(true); expect(seesPath(s, P(plate))).toBe(true);
});

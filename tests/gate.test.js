import { test, expect } from 'vitest';
import { create, step, prompt } from '../src/puzzles/gate.js';
import { SITES } from '../src/world/layout.js';

const P = (xz, o = {}) => ({ present: true, x: xz[0], y: 0, z: xz[1], aim: [0, 0, -1], hold: false, pressed: false, ...o });
const gone = { present: false };
const far = SITES.spawn[0];
const settle = (s, players) => { for (let i = 0; i < 60; i++) step(s, players, 1 / 30); };

test('shut with nobody on a plate; open while either plate is held', () => {
  const s = create(); settle(s, [P(far), P(far)]); expect(s.open).toBe(false);
  settle(s, [P(SITES.gate.plateA), P(far)]); expect(s.open).toBe(true); expect(s.amt).toBeCloseTo(1);
  settle(s, [P(far), P(far)]); expect(s.open).toBe(false); expect(s.amt).toBeCloseTo(0);
  settle(s, [P(far), P(SITES.gate.plateB)]); expect(s.open).toBe(true);
});
test('never closes on a walker in the doorway', () => {
  const s = create(); const d = SITES.gate.door;
  const mid = [(d.ax + d.bx) / 2, (d.az + d.bz) / 2];
  settle(s, [P(SITES.gate.plateA), P(mid)]);
  settle(s, [P(far), P(mid)]);
  expect(s.open).toBe(true);
});
test('walking up to a shut gate does not open it', () => {
  const s = create(); const d = SITES.gate.door;
  const mid = [(d.ax + d.bx) / 2, (d.az + d.bz) / 2];
  settle(s, [P([mid[0], mid[1] + 0.4]), P(far)]);   // as close as the shut door lets a walker stand
  expect(s.open).toBe(false); expect(s.amt).toBe(0);
  settle(s, [P(mid), gone]);
  expect(s.open).toBe(false);
});
test('a lone walker cannot hold a plate and then reach the doorway in time', () => {
  const s = create(); const d = SITES.gate.door;
  settle(s, [P(SITES.gate.plateA), P(far)]);
  settle(s, [P([0, 104]), P(far)]);                  // off the plate, still metres short of the door
  expect(s.open).toBe(false);
  settle(s, [P([d.ax + 2.5, d.az + 0.4]), P(far)]);
  expect(s.open).toBe(false);
});
test('solved only when both are through, and then stays open', () => {
  const s = create(); const b = SITES.gate.plateB;
  settle(s, [P(b), P(far)]); expect(s.solved).toBe(false);
  settle(s, [P(b), gone]); expect(s.solved).toBe(false);
  settle(s, [P(b), P([b[0] + 1, b[1]])]); expect(s.solved).toBe(true);
  settle(s, [P(far), P(far)]); expect(s.open).toBe(true);
});
test('a walker on the ramp does not count as through', () => {
  const s = create(); const b = SITES.gate.plateB;
  settle(s, [P(b), P([0, 95])]); expect(s.solved).toBe(false);
});
test('prompt never hints: a plate holder gets null, open or solved', () => {
  const s = create(); const a = SITES.gate.plateA;
  const ps = [P(a), P(far)];
  settle(s, ps);
  expect(s.open).toBe(true);
  expect(prompt(s, 0, ps)).toBe(null);
  expect(prompt(s, 1, ps)).toBe(null);
  const b = SITES.gate.plateB;
  const two = [P(b), P([b[0] + 1, b[1]])];
  settle(s, two);
  expect(prompt(s, 0, two)).toBe(null);
});
test('state survives JSON', () => {
  const s = create(); settle(s, [P(SITES.gate.plateA), P(far)]);
  expect(JSON.parse(JSON.stringify(s))).toEqual(s);
});
test('a walker on the Far Isle (zone G) counts as through', () => {
  const s = create(); const b = SITES.gate.plateB;
  settle(s, [P(b), P(SITES.bells.a)]); expect(s.solved).toBe(true);
  const t = create(); settle(t, [P(SITES.bells.b), P(b)]); expect(t.solved).toBe(true);
});

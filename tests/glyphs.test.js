import { test, expect } from 'vitest';
import { GLYPHS, GLYPH_SIZE, GLYPH_STROKE, mirrored, same } from '../src/puzzles/glyphs.js';

const flipY = (g) => ({
  lines: g.lines.map((l) => l.map((v, i) => (i % 2 ? GLYPH_SIZE - v : v))),
  arcs: g.arcs.map(([cx, cy, r, a0, a1]) => [cx, GLYPH_SIZE - cy, r, -a1, -a0]),
  dots: g.dots.map(([cx, cy, r]) => [cx, GLYPH_SIZE - cy, r]),
});

test('there are eight glyphs, all inside the canvas', () => {
  expect(GLYPHS).toHaveLength(8);
  const half = GLYPH_STROKE / 2;
  for (const g of GLYPHS) {
    for (const l of g.lines) for (const v of l) { expect(v - half).toBeGreaterThanOrEqual(0); expect(v + half).toBeLessThanOrEqual(GLYPH_SIZE); }
    for (const [cx, cy, r] of g.arcs) for (const c of [cx, cy]) { expect(c - r - half).toBeGreaterThanOrEqual(-1e-9); expect(c + r + half).toBeLessThanOrEqual(GLYPH_SIZE + 1e-9); }
    for (const [cx, cy, r] of g.dots) for (const c of [cx, cy]) { expect(c - r).toBeGreaterThanOrEqual(0); expect(c + r).toBeLessThanOrEqual(GLYPH_SIZE); }
  }
});
test('every glyph is left-right symmetric', () => {
  GLYPHS.forEach((g, i) => expect(same(g, mirrored(g)), `glyph ${i}`).toBe(true));
});
test('no two glyphs are the same, and none is the mirror of another', () => {
  for (let i = 0; i < 8; i++) for (let j = 0; j < 8; j++) if (i !== j) {
    expect(same(GLYPHS[i], GLYPHS[j]), `${i} vs ${j}`).toBe(false);
    expect(same(GLYPHS[i], mirrored(GLYPHS[j])), `${i} vs mirror ${j}`).toBe(false);
  }
});
// The dial tops lie flat: a walker on the far side reads a glyph upside down. That must never
// turn it into a different glyph of the set (a wrong answer that looks right).
test('no glyph turned upside down is another glyph of the set', () => {
  for (let i = 0; i < 8; i++) for (let j = 0; j < 8; j++) if (i !== j) {
    expect(same(GLYPHS[i], flipY(GLYPHS[j])), `${i} vs upside-down ${j}`).toBe(false);
  }
});
test('the look-alike pairs share a part and differ in the other', () => {
  const part = (g, k) => ({ lines: [], arcs: [], dots: [], [k]: g[k] });
  expect(same(part(GLYPHS[2], 'arcs'), part(GLYPHS[3], 'arcs'))).toBe(true);     // the same arch
  expect(same(part(GLYPHS[2], 'lines'), part(GLYPHS[3], 'lines'))).toBe(true);
  expect(GLYPHS[2].dots).toHaveLength(1); expect(GLYPHS[3].dots).toHaveLength(2);   // one dot under one arch, two under the other
  const prongs = (g) => g.lines.filter((l) => l.length === 4 && l[0] === l[2] && Math.min(l[1], l[3]) === 30).length;
  expect(prongs(GLYPHS[4])).toBe(3); expect(prongs(GLYPHS[5])).toBe(2);
});
test('same ignores order and line direction, and notices a real difference', () => {
  const a = { lines: [[0, 0, 10, 10], [5, 5, 9, 9]], arcs: [], dots: [[1, 1, 2]] };
  const b = { lines: [[9, 9, 5, 5], [10, 10, 0, 0]], arcs: [], dots: [[1, 1, 2]] };
  expect(same(a, b)).toBe(true);
  expect(same(a, { ...b, dots: [[1, 1, 3]] })).toBe(false);
});

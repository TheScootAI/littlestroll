// The eight carved glyphs of the Signal and the Ring: two-part shapes in four look-alike pairs,
// so describing one takes more than a word. Pure data, no three.js, no DOM.
// Canvas 256 x 256, y down. Strokes are white with round caps and joins, dots are filled discs.
// Every glyph is left-right symmetric: the signs are double-sided, so a glyph seen from behind
// must never turn into a different glyph of the set.
export const GLYPH_SIZE = 256;
export const GLYPH_STROKE = 26;

const TAU = Math.PI * 2;
const DOT = 20;
const norm = (a) => ((a % TAU) + TAU) % TAU;

// { lines: [[x0,y0, x1,y1, ...], ...], arcs: [[cx, cy, r, a0, a1], ...], dots: [[cx, cy, r], ...] }
// An arc is stroked from a0 to a1 clockwise on screen (canvas convention); a full circle is 0..2pi.

// Turn a glyph upside down (y -> 256 - y). An arc's angles negate and swap to keep it clockwise.
const flipped = (g) => ({
  lines: g.lines.map((l) => l.map((v, i) => (i % 2 ? GLYPH_SIZE - v : v))),
  arcs: g.arcs.map(([cx, cy, r, a0, a1]) => [cx, GLYPH_SIZE - cy, r, norm(-a1), norm(-a1) + (a1 - a0)]),
  dots: g.dots.map(([cx, cy, r]) => [cx, GLYPH_SIZE - cy, r]),
});

const arch = {
  lines: [[44, 214, 44, 140], [212, 140, 212, 214]],
  arcs: [[128, 140, 84, Math.PI, TAU]],
  dots: [[128, 172, DOT]],
};
const fork = {
  lines: [[52, 30, 52, 120], [128, 30, 128, 120], [204, 30, 204, 120], [52, 120, 204, 120], [128, 120, 128, 226]],
  arcs: [],
  dots: [],
};

export const GLYPHS = [
  { lines: [], arcs: [[128, 128, 80, 0, TAU]], dots: [[128, 128, DOT]] },                  // ring, dot inside
  { lines: [], arcs: [[128, 152, 66, 0, TAU]], dots: [[128, 38, DOT]] },                   // ring, dot above
  arch,                                                                                    // arch over a dot
  flipped(arch),                                                                           // cup under a dot
  fork,                                                                                    // fork, prongs up
  flipped(fork),                                                                           // fork, prongs down
  { lines: [[40, 128, 128, 40, 216, 128], [40, 216, 128, 128, 216, 216]], arcs: [], dots: [] },   // two chevrons, both up
  { lines: [[40, 40, 128, 112, 216, 40], [40, 216, 128, 144, 216, 216]], arcs: [], dots: [] },    // chevrons facing each other
];

// The same glyph seen in a mirror: x -> 256 - x. An arc's angle a becomes pi - a, and it stays clockwise.
export const mirrored = (g) => ({
  lines: g.lines.map((l) => l.map((v, i) => (i % 2 ? v : GLYPH_SIZE - v))),
  arcs: g.arcs.map(([cx, cy, r, a0, a1]) => [GLYPH_SIZE - cx, cy, r, norm(Math.PI - a1), norm(Math.PI - a1) + (a1 - a0)]),
  dots: g.dots.map(([cx, cy, r]) => [GLYPH_SIZE - cx, cy, r]),
});

const EPS = 1e-6;
const close = (a, b) => Math.abs(a - b) <= EPS;
const allClose = (a, b) => a.length === b.length && a.every((v, i) => close(v, b[i]));
const angleClose = (a, b) => { const d = Math.abs(norm(a) - norm(b)); return d <= EPS || TAU - d <= EPS; };

const lineSame = (a, b) => allClose(a, b) || allClose(a, b.map((_, i) => b[(b.length / 2 - 1 - (i >> 1)) * 2 + (i & 1)]));
const arcSame = ([cx, cy, r, a0, a1], [dx, dy, s, b0, b1]) => {
  if (![cx - dx, cy - dy, r - s].every((v) => Math.abs(v) <= EPS)) return false;
  const full = (a, b) => b - a >= TAU - EPS;
  if (full(a0, a1) || full(b0, b1)) return full(a0, a1) && full(b0, b1);
  return close(a1 - a0, b1 - b0) && angleClose(a0, b0);
};
const dotSame = (a, b) => allClose(a, b);

// Every primitive of `a` has its own partner in `b`, and the other way round.
const matches = (xs, ys, eq) => {
  if (xs.length !== ys.length) return false;
  const used = new Set();
  return xs.every((x) => {
    const j = ys.findIndex((y, k) => !used.has(k) && eq(x, y));
    if (j < 0) return false;
    used.add(j);
    return true;
  });
};

// Are two glyphs the same set of primitives, in any order and either drawing direction?
export const same = (a, b) =>
  matches(a.lines, b.lines, lineSame) && matches(a.arcs, b.arcs, arcSame) && matches(a.dots, b.dots, dotSame);

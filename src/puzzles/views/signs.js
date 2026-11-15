// The carved signs: bold white-on-clear glyphs, the eight two-part shapes of glyphs.js, drawn
// as stroked lines and arcs plus filled dots. Used by the Signal's wall and dials and the Ring.
import { CanvasTexture, SRGBColorSpace } from 'three';
import { GLYPHS, GLYPH_SIZE, GLYPH_STROKE } from '../glyphs.js';

export const SIGN_COUNT = GLYPHS.length;

export function signTexture(i) {
  const c = document.createElement('canvas');
  c.width = c.height = GLYPH_SIZE;
  const g = c.getContext('2d');
  g.fillStyle = '#fff'; g.strokeStyle = '#fff';
  g.lineWidth = GLYPH_STROKE; g.lineJoin = 'round'; g.lineCap = 'round';
  const glyph = GLYPHS[i] ?? GLYPHS[0];   // ids are checked before they get here; never throw while drawing
  for (const l of glyph.lines) {
    g.beginPath();
    for (let k = 0; k < l.length; k += 2) g[k ? 'lineTo' : 'moveTo'](l[k], l[k + 1]);
    g.stroke();
  }
  for (const [cx, cy, r, a0, a1] of glyph.arcs) { g.beginPath(); g.arc(cx, cy, r, a0, a1); g.stroke(); }
  for (const [cx, cy, r] of glyph.dots) { g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.fill(); }
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  return t;
}

// The ending's clock. Pure. Progress comes from real elapsed seconds (the game stamps
// performance.now() when the ending begins), never from summed per-frame dt, so a slow
// frame rate cannot stretch the card past its time.
export const END_SECS = 4;                 // camera ease
export const END_CARD = END_SECS + 0.4;    // then the card

const smooth01 = (t) => t * t * (3 - 2 * t);

// `elapsed` seconds since the ending began → { k: eased camera progress 0..1, card: show it now }
export function endingProgress(elapsed) {
  const e = Number.isFinite(elapsed) ? Math.max(0, elapsed) : 0;
  return { k: smooth01(Math.min(1, e / END_SECS)), card: e >= END_CARD };
}

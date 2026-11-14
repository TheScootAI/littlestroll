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

// The ending shot, derived from where things are: `focus` = [x, y, z] is the great lamp, `behind` =
// [x, z] the Far Isle's great brazier. The camera stands off the focus on the side away from
// `behind`, a little above and to one side, looking back past the focus toward `behind`, with the
// look point below the focus so the flame rides high in the frame (the card takes the lower half).
export function endShot(focus, behind) {
  const [fx, fy, fz] = focus;
  let dx = behind[0] - fx, dz = behind[1] - fz;
  const span = Math.hypot(dx, dz);
  if (span < 1e-6) { dx = 0; dz = 1; } else { dx /= span; dz /= span; }
  const sx = -dz, sz = dx;                                   // a quarter turn from it
  const back = 26, up = 8, lateral = 7;
  return {
    pos: [fx - dx * back + sx * lateral, fy + up, fz - dz * back + sz * lateral],
    look: [fx + dx * 40, fy - 12, fz + dz * 40],
  };
}

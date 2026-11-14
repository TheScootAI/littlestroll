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
  const back = 26, up = 8, lateral = 7, ahead = 40;
  const pos = [fx - dx * back + sx * lateral, fy + up, fz - dz * back + sz * lateral];
  const lx = fx + dx * ahead, lz = fz + dz * ahead;
  // the axis points below the focus so that, in a 60-degree-tall frame, the focus lands about 37.5%
  // of the way down (clear of the card, which covers the lower half): its own dip plus 8.2 degrees
  const dip = Math.atan2(up, Math.hypot(fx - pos[0], fz - pos[2])) + Math.atan(0.125 * 2 * Math.tan(Math.PI / 6));
  return { pos, look: [lx, pos[1] - Math.tan(dip) * Math.hypot(lx - pos[0], lz - pos[2]), lz] };
}

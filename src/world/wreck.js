// The wreck's loose things, as places: what lies on the sand between the hull and the rock, and
// where a timber's two ends are drawn when it leans on the rock. Scenery only: nothing here is
// puzzle state, and the rules never read it. Pure, no three.js.
import { SITES, heightAt, DYN_NONE } from './layout.js';
import { WATER_Y } from '../config.js';

// kind, where, which way it faces (radians about the vertical)
export const DEBRIS = [
  { kind: 'barrel',     x: 9.9,  z: 127.6, yaw: 0 },
  { kind: 'barrelSide', x: 13.0, z: 126.9, yaw: 0.9 },
  { kind: 'barrel',     x: 9.0,  z: 125.6, yaw: 0 },
  { kind: 'crate',      x: 12.0, z: 125.4, yaw: 0.4 },
  { kind: 'crate',      x: 10.8, z: 125.2, yaw: -0.3 },
  { kind: 'rope',       x: 10.0, z: 126.0, yaw: 0 },
  { kind: 'sail',       x: 8.2,  z: 128.0, yaw: 0.5 },
  { kind: 'anchor',     x: 16.7, z: 124.6, yaw: 2.2 },
  { kind: 'wheel',      x: 11.5, z: 127.6, yaw: 0.7 },
];

// A piece at its rest leans on the rock: the upper end is drawn TIP_R from the rock's centre,
// TIP_RISE above its lower end (the rock is lower than the timber's own length, so the whole piece
// is drawn slid a little along its own line, at most about a metre from where S says).
export const TIP_R = 0.95;
export const TIP_RISE = 0.55;
export function leanEnds(a, b, rock = SITES.wreck.rock, len = Math.hypot(b[0] - a[0], b[1] - a[1]), tipR = TIP_R, rise = TIP_RISE) {
  const l = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const ux = (b[0] - a[0]) / l, uz = (b[1] - a[1]) / l;
  const tip = (rock[0] - a[0]) * ux + (rock[1] - a[1]) * uz - tipR;   // along the line from a
  const run = Math.sqrt(len * len - rise * rise);
  return { a: [a[0] + ux * (tip - run), a[1] + uz * (tip - run)], b: [a[0] + ux * tip, a[1] + uz * tip] };
}

// A piece too short for the gap, let go at the slot, is laid out from the near bank and falls in.
// Its pose, a pure function of its length and the seconds since it fell: first (LAY_T) it lies level
// from the near lip, its far end in the air short of the far bank; then it tips about the lip and
// slides off into the water. Ends are [x, y, z] of the piece's surface (the view adds half its
// thickness); null once it is over (FALL_END), when the piece is drawn at its rest again.
export const LAY_T = 0.4, FALL_T = 0.9, FALL_END = 1.6;
const GAP_X = 6, LIP_Z = -9, SLIDE = 0.3, TIP = 1.35;
const BANK_Y = heightAt(GAP_X, -8.5, DYN_NONE);
export function fallPose(len, t) {
  if (t >= FALL_END) return null;
  const u = Math.min(1, Math.max(0, (t - LAY_T) / FALL_T)), k = u * u;
  const th = TIP * k, nz = LIP_Z - SLIDE * k, ny = BANK_Y - (BANK_Y - WATER_Y + 0.6) * k;
  return { a: [GAP_X, ny, nz], b: [GAP_X, ny - len * Math.sin(th), nz - len * Math.cos(th)] };
}
// When the far end first reaches the water: the splash starts then.
export function hitTime(len) {
  for (let t = 0; t < FALL_END; t += 0.01) if (fallPose(len, t).b[1] <= WATER_Y) return t;
  return FALL_END;
}

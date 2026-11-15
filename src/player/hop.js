// The hop's shape, shared by the walker's controller and the avatar. Pure: no three.js, no DOM.
export const HOP_SECS = 0.5;
export const HOP_HEIGHT = 0.7;

// Metres off the support t seconds after take-off. One smooth arc (a parabola: up fast, hang,
// down), 0 before take-off and exactly 0 from the landing on.
export function hopHeight(t) {
  if (!(t > 0 && t < HOP_SECS)) return 0;
  const u = t / HOP_SECS;
  return 4 * HOP_HEIGHT * u * (1 - u);
}

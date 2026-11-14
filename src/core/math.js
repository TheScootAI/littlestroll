export const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

export const lerp = (a, b, t) => a + (b - a) * t;

// Interpolate angles (radians) the short way round.
export function lerpAngle(a, b, t) {
  const TAU = Math.PI * 2;
  let d = (b - a) % TAU;
  if (d > Math.PI) d -= TAU;
  else if (d < -Math.PI) d += TAU;
  return a + d * t;
}

// Squared distance on the XZ plane.
export const dist2 = (ax, az, bx, bz) => (ax - bx) ** 2 + (az - bz) ** 2;

// Distance from point p to segment a-b on the XZ plane; t in [0,1] along the segment.
export function pointSegDist(px, pz, ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az;
  const len2 = dx * dx + dz * dz;
  const t = len2 === 0 ? 0 : clamp(((px - ax) * dx + (pz - az) * dz) / len2, 0, 1);
  return { d: Math.hypot(px - (ax + dx * t), pz - (az + dz * t)), t };
}

// Does segment a-b touch the circle (c, r) on the XZ plane?
export const segCircle = (ax, az, bx, bz, cx, cz, r) =>
  pointSegDist(cx, cz, ax, az, bx, bz).d <= r;

// Distance from point p to the ray (o, d); d must be normalised. t is clamped to >= 0.
export function rayPointDist(o, d, p) {
  const vx = p[0] - o[0], vy = p[1] - o[1], vz = p[2] - o[2];
  const t = Math.max(0, vx * d[0] + vy * d[1] + vz * d[2]);
  return {
    d: Math.hypot(vx - d[0] * t, vy - d[1] * t, vz - d[2] * t),
    t,
  };
}

// Yaw 0 faces -Z. Forward = (-sin(yaw)cos(pitch), sin(pitch), -cos(yaw)cos(pitch)).
export function dirFromYawPitch(yaw, pitch) {
  const cp = Math.cos(pitch);
  return [-Math.sin(yaw) * cp, Math.sin(pitch), -Math.cos(yaw) * cp];
}

// Small seeded PRNG (mulberry32): rng(seed) -> () => number in [0, 1).
export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

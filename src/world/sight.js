// Line of sight against the beam rocks. Pure: no three.js.
// Each rock is a vertical cylinder of radius r standing from the ground up to the
// absolute height h.
import { SITES, heightAt } from './layout.js';

// Does the straight segment a→b ([x, y, z] each) pass through any beam rock?
export function occluded(a, b, rocks = SITES.beam.rocks) {
  const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2];
  const qa = dx * dx + dz * dz;
  for (const k of rocks) {
    const fx = a[0] - k.x, fz = a[2] - k.z;
    const c = fx * fx + fz * fz - k.r * k.r;
    let t0, t1;
    if (qa < 1e-12) {                      // vertical (or zero-length) segment
      if (c > 0) continue;
      t0 = 0; t1 = 1;
    } else {
      const qb = 2 * (fx * dx + fz * dz);
      const disc = qb * qb - 4 * qa * c;
      if (disc < 0) continue;
      const sq = Math.sqrt(disc);
      t0 = Math.max(0, (-qb - sq) / (2 * qa));
      t1 = Math.min(1, (-qb + sq) / (2 * qa));
      if (t0 > t1) continue;
    }
    // y is linear in t, so its lowest point inside the footprint is at an end of the interval.
    if (Math.min(a[1] + dy * t0, a[1] + dy * t1) <= k.h) return true;
  }
  return false;
}

// Where a pointing ray first meets the ground: marches from `origin` along the unit
// vector `dir` in 0.5 m steps and returns the first point at or below the terrain, or
// the point at maxDist if it never gets there.
export function aimPoint(origin, dir, dyn, maxDist = 40) {
  const STEP = 0.5;
  for (let d = STEP; d < maxDist; d += STEP) {
    const x = origin[0] + dir[0] * d, y = origin[1] + dir[1] * d, z = origin[2] + dir[2] * d;
    if (y <= heightAt(x, z, dyn)) return [x, y, z];
  }
  return [origin[0] + dir[0] * maxDist, origin[1] + dir[1] * maxDist, origin[2] + dir[2] * maxDist];
}

// Screen angle of a friend at `to` seen from `from` ([x, z]) by a camera with yaw camYaw:
// 0 = straight ahead (up on screen), positive clockwise, in (-pi, pi].
export function edgeArrow(camYaw, from, to) {
  const dx = to[0] - from[0], dz = to[1] - from[1];
  const s = Math.sin(camYaw), c = Math.cos(camYaw);
  const ahead = -dx * s - dz * c;       // along forward (-sin, -cos)
  const right = dx * c - dz * s;        // along right (cos, -sin)
  return Math.atan2(right, ahead);
}

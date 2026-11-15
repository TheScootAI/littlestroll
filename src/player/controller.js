// Walker movement and collision. Pure: no three.js, no DOM.
import { WALK, RUN, STEP_UP, PLAYER_R, DROWN_Y } from '../config.js';
import { lerpAngle, pointSegDist } from '../core/math.js';
import { heightAt, SITES } from '../world/layout.js';
import { obstacles } from '../world/solids.js';

const GRAVITY = 20;
const MAX_SUBSTEP = 0.1;   // metres of horizontal travel per sub-step
const TURN_RATE = 14;

export const createPlayer = (x, z) => ({ x, y: heightAt(x, z), z, yaw: 0, vy: 0, dist: 0 });

// A move is blocked when it enters a blocker, unless the walker already overlaps that
// blocker and the move does not take it closer (so it can always walk out). Allocation-free:
// there are a few hundred circles (the trees and boulders) and this runs every sub-step.
function enters(od, nd, lim) {
  if (nd >= lim) return false;
  return !(od < lim && nd >= od - 1e-9);
}
function blocked(bl, ox, oz, nx, nz) {
  const cs = bl.circles;
  for (let i = 0; i < cs.length; i++) {
    const c = cs[i];
    if (enters(Math.hypot(ox - c.x, oz - c.z), Math.hypot(nx - c.x, nz - c.z), c.r + PLAYER_R)) return true;
  }
  const ss = bl.segments;
  for (let i = 0; i < ss.length; i++) {
    const s = ss[i];
    if (enters(pointSegDist(ox, oz, s.ax, s.az, s.bx, s.bz).d, pointSegDist(nx, nz, s.ax, s.az, s.bx, s.bz).d, PLAYER_R)) return true;
  }
  return false;
}

// The first circle a move from (ox, oz) to (nx, nz) would enter, or null.
function circleEntered(bl, ox, oz, nx, nz) {
  const cs = bl.circles;
  for (let i = 0; i < cs.length; i++) {
    const c = cs[i];
    if (enters(Math.hypot(ox - c.x, oz - c.z), Math.hypot(nx - c.x, nz - c.z), c.r + PLAYER_R)) return c;
  }
  return null;
}

export function stepPlayer(p, input, dt, dyn, veto = null) {
  let dx = 0, dz = 0;
  const sy = Math.sin(input.camYaw), cy = Math.cos(input.camYaw);
  const mx = input.mx || 0, mz = input.mz || 0;
  dx = -sy * mz + cy * mx;
  dz = -cy * mz - sy * mx;
  let mag = Math.hypot(dx, dz);
  if (mag > 1) { dx /= mag; dz /= mag; mag = 1; }
  const speed = Math.min(1, mag) * (input.run ? RUN : WALK);
  const bl = obstacles(dyn);

  const n = Math.max(1, Math.ceil((speed * dt) / MAX_SUBSTEP));
  const h = dt / n;
  const ux = mag > 0 ? dx / mag : 0, uz = mag > 0 ? dz / mag : 0;
  let moved = false;

  for (let k = 0; k < n; k++) {
    // ground rising under a standing walker (the lift) carries them up
    let g = heightAt(p.x, p.z, dyn);
    if (g > p.y) { p.y = g; p.vy = 0; }

    if (speed > 0) {
      const ox = p.x, oz = p.z;
      const sx = ux * speed * h, sz = uz * speed * h;
      const tryMove = (nx, nz) => {
        if (heightAt(nx, nz, dyn) - p.y > STEP_UP) return false;
        if (blocked(bl, p.x, p.z, nx, nz)) return false;
        if (veto && veto(nx, nz)) return false;
        p.x = nx; p.z = nz;
        return true;
      };
      if (sx !== 0) tryMove(p.x + sx, p.z);
      if (sz !== 0) tryMove(p.x, p.z + sz);
      // Stopped dead by something round (a trunk, a boulder, a standing stone): glance off it,
      // going along its rim by as much of the step as points that way. Dead centre still stops.
      if (p.x === ox && p.z === oz) {
        const c = circleEntered(bl, ox, oz, ox + sx, oz + sz);
        if (c) {
          const rx = ox - c.x, rz = oz - c.z, rl = Math.hypot(rx, rz);
          if (rl > 1e-9) {
            const tx = -rz / rl, tz = rx / rl, along = sx * tx + sz * tz;
            if (Math.abs(along) > 1e-6) tryMove(ox + tx * along, oz + tz * along);
          }
        }
      }
      const d = Math.hypot(p.x - ox, p.z - oz);
      if (d > 0) { p.dist += d; moved = true; }
    }

    g = heightAt(p.x, p.z, dyn);
    if (p.y > g) {
      p.vy -= GRAVITY * h;
      p.y += p.vy * h;
      if (p.y <= g) { p.y = g; p.vy = 0; }
    } else { p.y = g; p.vy = 0; }
  }

  if (moved) p.yaw = lerpAngle(p.yaw, Math.atan2(-dx, -dz), 1 - Math.exp(-TURN_RATE * dt));
}

export function needsRespawn(p, dyn) {
  const g = heightAt(p.x, p.z, dyn);
  return g < DROWN_Y && p.y <= g + 0.05;
}

export function respawn(p, solvedCount, slot) {
  const [x, z] = SITES.checkpoints[solvedCount][slot];
  p.x = x; p.z = z; p.y = heightAt(x, z); p.vy = 0;
}

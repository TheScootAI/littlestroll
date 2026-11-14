// Walker movement and collision. Pure: no three.js, no DOM.
import { WALK, RUN, STEP_UP, PLAYER_R, DROWN_Y } from '../config.js';
import { lerpAngle, pointSegDist } from '../core/math.js';
import { heightAt, blockers, SITES } from '../world/layout.js';

const GRAVITY = 20;
const MAX_SUBSTEP = 0.1;   // metres of horizontal travel per sub-step
const TURN_RATE = 14;

export const createPlayer = (x, z) => ({ x, y: heightAt(x, z), z, yaw: 0, vy: 0, dist: 0 });

// Distance from (x, z) to each blocker, as {d, lim}: overlapping when d < lim.
function overlaps(bl, x, z) {
  const out = [];
  for (const c of bl.circles) out.push({ d: Math.hypot(x - c.x, z - c.z), lim: c.r + PLAYER_R });
  for (const s of bl.segments) out.push({ d: pointSegDist(x, z, s.ax, s.az, s.bx, s.bz).d, lim: PLAYER_R });
  return out;
}

// A move is blocked when it enters a blocker, unless the walker already overlaps that
// blocker and the move does not take it closer (so it can always walk out).
function blocked(bl, ox, oz, nx, nz) {
  const before = overlaps(bl, ox, oz), after = overlaps(bl, nx, nz);
  for (let i = 0; i < after.length; i++) {
    if (after[i].d >= after[i].lim) continue;
    if (before[i].d < before[i].lim && after[i].d >= before[i].d - 1e-9) continue;
    return true;
  }
  return false;
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
  const bl = blockers(dyn);

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

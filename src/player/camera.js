// Third-person orbit camera. camYaw/camPitch are where the walker is looking; the
// camera sits behind the walker along the opposite of that direction.
import { PerspectiveCamera } from 'three';
import { heightAt } from '../world/layout.js';
import { dirFromYawPitch } from '../core/math.js';

export const CAM_DIST = 5;      // metres from the look point
export const LOOK_UP = 1.3;     // look point above the walker's feet
export const CAM_CLEAR = 0.3;   // camera never closer than this above the ground
const MIN_DIST = 0.6;
const BOOM_STEP = 0.1;
const SNAP_JUMP = 4;            // a target jump bigger than this (respawn) snaps the camera
const Y_EASE = 12;              // 1/s: smooths the look point's height over steps and ramps
const OUT_EASE = 4;             // 1/s: boom lengthening after a pull-in

// How far back from target (along -dir) the camera can sit before the ground,
// sampled every BOOM_STEP, comes within CAM_CLEAR of it.
export function boomDistance(target, dir, maxDist, groundAt, clear = CAM_CLEAR) {
  const [tx, ty, tz] = target;
  let safe = 0;
  for (let d = BOOM_STEP; d <= maxDist + 1e-9; d += BOOM_STEP) {
    const x = tx - dir[0] * d, y = ty - dir[1] * d, z = tz - dir[2] * d;
    if (y < groundAt(x, z) + clear) break;
    safe = d;
  }
  return Math.max(Math.min(safe, maxDist), Math.min(MIN_DIST, maxDist));
}

export function createCamera(aspect) {
  const camera = new PerspectiveCamera(60, aspect, 0.1, 600);
  let ty = null, tx = 0, tz = 0, dist = CAM_DIST;

  function update(player, input, dyn, dt) {
    const ground = (x, z) => heightAt(x, z, dyn);
    const wantY = player.y + LOOK_UP;
    const jumped = ty === null || Math.hypot(player.x - tx, wantY - ty, player.z - tz) > SNAP_JUMP;
    ty = jumped ? wantY : ty + (wantY - ty) * (1 - Math.exp(-Y_EASE * dt));
    tx = player.x; tz = player.z;

    const dir = dirFromYawPitch(input.camYaw || 0, input.camPitch || 0);
    const target = [tx, ty, tz];
    const room = boomDistance(target, dir, CAM_DIST, ground);
    // pull in at once, ease back out
    dist = jumped || room < dist ? room : dist + (room - dist) * (1 - Math.exp(-OUT_EASE * dt));

    let x = tx - dir[0] * dist, y = ty - dir[1] * dist, z = tz - dir[2] * dist;
    y = Math.max(y, ground(x, z) + CAM_CLEAR);
    camera.position.set(x, y, z);
    camera.lookAt(tx, ty, tz);
  }

  return { camera, update };
}

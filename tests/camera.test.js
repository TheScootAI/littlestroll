import { describe, test, expect } from 'vitest';
import { boomDistance, createCamera, CAM_DIST, CAM_CLEAR, LOOK_UP } from '../src/player/camera.js';
import { createPlayer } from '../src/player/controller.js';
import { heightAt, DYN_NONE, SITES, ZONES } from '../src/world/layout.js';
import { dirFromYawPitch } from '../src/core/math.js';

const flat = () => 0;

describe('camera boom', () => {
  test('full length over open ground', () => {
    expect(boomDistance([0, 1.3, 0], [0, 0, -1], 5, flat)).toBeCloseTo(5, 5);
  });

  test('pulls in in front of a wall behind the walker', () => {
    // ground rises to 10 m for z > 2 (behind a walker looking toward -Z)
    const wall = (x, z) => (z > 2 ? 10 : 0);
    const d = boomDistance([0, 1.3, 0], [0, 0, -1], 5, wall);
    expect(d).toBeLessThanOrEqual(2);
    expect(d).toBeGreaterThan(1);
  });

  test('pulls in when looking up would put the camera under the ground', () => {
    const d = boomDistance([0, 1.3, 0], [0, Math.sin(1), -Math.cos(1)], 5, flat);
    // y at distance d is 1.3 - d·sin(1) and must stay >= CAM_CLEAR
    expect(1.3 - d * Math.sin(1)).toBeGreaterThanOrEqual(CAM_CLEAR - 1e-9);
    expect(d).toBeLessThan(5);
  });
});

describe('createCamera', () => {
  const settle = (cam, p, inp, n = 120) => { for (let i = 0; i < n; i++) cam.update(p, inp, DYN_NONE, 1 / 60); };

  test('sits behind the walker along the aim and looks at it', () => {
    const cam = createCamera(16 / 9);
    const p = createPlayer(...SITES.spawn[0]);
    const inp = { camYaw: 0, camPitch: -0.3 };
    settle(cam, p, inp);
    const dir = dirFromYawPitch(0, -0.3);
    const c = cam.camera.position;
    const t = [p.x, p.y + LOOK_UP, p.z];
    expect(Math.hypot(c.x - t[0], c.y - t[1], c.z - t[2])).toBeCloseTo(CAM_DIST, 1);
    // behind: opposite the aim
    expect(c.z).toBeGreaterThan(p.z);
    const fwd = cam.camera.getWorldDirection(cam.camera.position.clone());
    expect(fwd.x).toBeCloseTo(dir[0], 2); expect(fwd.y).toBeCloseTo(dir[1], 2); expect(fwd.z).toBeCloseTo(dir[2], 2);
  });

  test('never goes below ground + clearance anywhere on the island at any look angle', () => {
    const cam = createCamera(1);
    let worst = Infinity;
    // walkers at the foot of cliffs and on plateaus, every 45° of yaw, pitch up and down
    const spots = [[0, 90.5], [6, 44], [6, -14], [6, -33.5], [11, -27], [-27, 66], ...ZONES.slice(0, 4).map((d) => [d.x, d.z])];
    for (const [x, z] of spots) {
      const p = createPlayer(x, z);
      for (let k = 0; k < 8; k++) for (const pitch of [-1.1, -0.4, 0, 0.5, 1.0]) {
        settle(cam, p, { camYaw: (k * Math.PI) / 4, camPitch: pitch }, 30);
        const c = cam.camera.position;
        worst = Math.min(worst, c.y - heightAt(c.x, c.z, DYN_NONE));
      }
    }
    expect(worst).toBeGreaterThanOrEqual(CAM_CLEAR - 0.02);
  });

  test('snaps rather than swoops when the walker jumps (respawn)', () => {
    const cam = createCamera(1);
    const p = createPlayer(0, 84);
    settle(cam, p, { camYaw: 0, camPitch: -0.3 });
    p.x = SITES.spawn[0][0]; p.z = SITES.spawn[0][1]; p.y = heightAt(p.x, p.z);
    cam.update(p, { camYaw: 0, camPitch: -0.3 }, DYN_NONE, 1 / 60);
    const c = cam.camera.position;
    expect(Math.hypot(c.x - p.x, c.y - (p.y + LOOK_UP), c.z - p.z)).toBeLessThan(CAM_DIST + 0.1);
  });
});

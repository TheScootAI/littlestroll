// Breadth-first flood over a 0.5 m grid: where can a walker get to from `from`
// under the world state `dyn`? A step to one of the 8 neighbours is allowed when
// the neighbour is above DROWN_Y, rises no more than STEP_UP, and is at least
// PLAYER_R clear of every blocker. Heights are computed lazily, only for cells
// the flood touches.
import { heightAt, blockers } from '../../src/world/layout.js';
import { DROWN_Y, STEP_UP, PLAYER_R } from '../../src/config.js';
import { pointSegDist } from '../../src/core/math.js';

const STEP = 0.5;
const X0 = -160, Z0 = -130;       // grid covers x -160..160, z -130..190
const N = 641;

export function reachable(from, dyn) {
  const { circles, segments } = blockers(dyn);
  const height = new Float32Array(N * N).fill(NaN);
  const seen = new Uint8Array(N * N);
  const queue = new Int32Array(N * N);
  const wx = (i) => X0 + (i % N) * STEP;
  const wz = (i) => Z0 + Math.floor(i / N) * STEP;
  const h = (i) => {
    if (Number.isNaN(height[i])) height[i] = heightAt(wx(i), wz(i), dyn);
    return height[i];
  };
  const clear = (x, z) => {
    for (const c of circles) if (Math.hypot(x - c.x, z - c.z) < c.r + PLAYER_R) return false;
    for (const s of segments) if (pointSegDist(x, z, s.ax, s.az, s.bx, s.bz).d < PLAYER_R) return false;
    return true;
  };

  const ci = Math.round((from[0] - X0) / STEP), cj = Math.round((from[1] - Z0) / STEP);
  const start = cj * N + ci;
  let head = 0, tail = 0;
  seen[start] = 1;
  queue[tail++] = start;
  while (head < tail) {
    const i = queue[head++];
    const ix = i % N, iz = (i - ix) / N;
    const hi = h(i);
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dz) continue;
        const nx = ix + dx, nz = iz + dz;
        if (nx < 0 || nz < 0 || nx >= N || nz >= N) continue;
        const j = nz * N + nx;
        if (seen[j]) continue;
        const hj = h(j);
        if (!(hj > DROWN_Y) || hj - hi > STEP_UP) continue;
        if (!clear(wx(j), wz(j))) continue;
        seen[j] = 1;
        queue[tail++] = j;
      }
    }
  }

  return (x, z) => {
    const cx = Math.round((x - X0) / STEP), cz = Math.round((z - Z0) / STEP);
    for (let dz = -2; dz <= 2; dz++) {
      for (let dx = -2; dx <= 2; dx++) {
        const nx = cx + dx, nz = cz + dz;
        if (nx < 0 || nz < 0 || nx >= N || nz >= N) continue;
        const j = nz * N + nx;
        if (seen[j] && Math.hypot(wx(j) - x, wz(j) - z) <= 1) return true;
      }
    }
    return false;
  };
}

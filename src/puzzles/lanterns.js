// The Lanterns: six lanterns round the tor, each burns BURN seconds once lit (E beside it lights
// it, or tops it up). All six burning at the same moment: solved, and they then burn for good.
// A lone walker cannot outrun the burn round all six; two who split the posts can. Nothing is
// lost when one goes out. Pure rules, no three.js.
import { SITES } from '../world/layout.js';
import { MAX_DT } from '../config.js';

export const BURN = 25, REACH = 1.5, POSTS = 6;
export const LAMP_H = 6;      // the great lamp's flame centre above the tor's top (the ending shot frames it)

const posts = SITES.lanterns.posts;

export const create = () => ({ t: [0, 0, 0, 0, 0, 0], solved: false });

// The post this walker would light (the nearest within REACH), or -1.
function postNear(p) {
  let best = -1, bd = REACH;
  posts.forEach(([x, z], i) => { const d = Math.hypot(p.x - x, p.z - z); if (d <= bd) { bd = d; best = i; } });
  return best;
}

export function step(s, players, dt) {
  if (s.solved) return;
  dt = Number.isFinite(dt) ? Math.min(Math.max(dt, 0), MAX_DT) : 0;
  for (let i = 0; i < POSTS; i++) s.t[i] = Math.max(0, s.t[i] - dt);
  for (const p of players) {
    if (!p?.present || !p.pressed) continue;
    const k = postNear(p);
    if (k >= 0) s.t[k] = BURN;
  }
  if (s.t.every((v) => v > 0)) { s.solved = true; s.t.fill(BURN); }
}

export function prompt(s, idx, players) {
  const me = players[idx];
  if (s.solved || !me?.present) return null;
  return postNear(me) >= 0 ? 'E — light the lantern' : null;
}

export const valid = (s) => !!s && typeof s === 'object' && Array.isArray(s.t) && s.t.length === POSTS &&
  s.t.every((v) => Number.isFinite(v) && v >= 0 && v <= BURN) && typeof s.solved === 'boolean';

export function forceSolve(s) { s.t.fill(BURN); s.solved = true; }

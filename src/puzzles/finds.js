// The finds: ten pieces of clothing lying off the trail (the tenth by the wreck). S.finds is an
// array of ten: -1 not found, 0 found by the host, 1 found by the joiner, for good.
// Walk within FOUND_R of one (and within FOUND_DY of its ground height) and you put it on. If both
// walkers are in reach in the same tick the nearer one gets it; an exact tie goes to the host.
// Not a puzzle: no prompt, no gate, not in the order, not counted as solved.
import { SITES, heightAt } from '../world/layout.js';

export const FINDS = 10, FOUND_R = 1.2, FOUND_DY = 1.5;
export const NAMES = ['glasses', 'boots', 'belt', 'jacket', 'backpack', 'moustache', 'medal', 'flower', 'gloves', 'pirate hat'];

const GROUND = SITES.finds.map(([x, z]) => heightAt(x, z));   // each find's ground height, once

export const create = () => Array(FINDS).fill(-1);

// -> the same array when nothing changed, a new one when something did; never mutates `finds`.
export function step(finds, players) {
  let out = finds;
  for (let i = 0; i < FINDS; i++) {
    if (finds[i] !== -1) continue;
    const [x, z] = SITES.finds[i];
    let who = -1, best = Infinity;
    for (let w = 0; w < players.length; w++) {
      const p = players[w];
      if (!p?.present) continue;
      const d = Math.hypot(p.x - x, p.z - z);
      if (d <= FOUND_R && Math.abs(p.y - GROUND[i]) <= FOUND_DY && d < best) { best = d; who = w; }   // strict <: a tie stays with the host
    }
    if (who !== -1) {
      if (out === finds) out = finds.slice();
      out[i] = who;
    }
  }
  return out;
}

export const count = (finds) => finds.reduce((n, v) => n + (v === 0 || v === 1 ? 1 : 0), 0);
export const countBy = (finds, idx) => finds.reduce((n, v) => n + (v === idx ? 1 : 0), 0);
export const wornMask = (finds, idx) => finds.reduce((m, v, i) => (v === idx ? m | (1 << i) : m), 0);

// What changed since `prev` (null/undefined: no baseline yet, as after a welcome, so nothing is
// announced). One line per newly found piece, in index order, as walker `idx` should read it.
export function news(prev, finds, idx) {
  const lines = [];
  if (Array.isArray(prev)) {
    for (let i = 0; i < FINDS; i++) {
      if (prev[i] === -1 && (finds[i] === 0 || finds[i] === 1)) {
        lines.push(`${finds[i] === idx ? 'You' : 'Your friend'} found the ${NAMES[i]}`);
      }
    }
  }
  return { lines, next: finds };
}

export function valid(finds) {
  if (!Array.isArray(finds) || finds.length !== FINDS) return false;
  for (let i = 0; i < FINDS; i++) { const v = finds[i]; if (v !== -1 && v !== 0 && v !== 1) return false; }   // a hole reads as undefined
  return true;
}

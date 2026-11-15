// Message format between the two browsers. Pure: no three.js, no DOM, no network.
import { dirFromYawPitch } from '../core/math.js';
import { readInput } from '../player/input.js';
import { clean, MAX_LEN } from '../core/chat.js';

export const PROTOCOL_V = 10;   // bump whenever the shape of S or dyn, or what a message means, changes
export const MAX_BYTES = 16384;

// [field, min, max]
const NUM = [['x', -1e4, 1e4], ['y', -1e4, 1e4], ['z', -1e4, 1e4], ['yaw', -100, 100], ['ay', -100, 100],
  ['ap', -100, 100], ['speed', 0, 50], ['dist', 0, 1e7]];
const BOOL = ['hold', 'q'];
const COUNT = ['eN', 'shoutN', 'waveN', 'jumpN'];

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const isCount = (v) => Number.isInteger(v) && v >= 0 && v <= 1e9;
const isPlain = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

export const encode = (msg) => JSON.stringify(msg);

export function decode(text) {
  if (typeof text !== 'string' || text.length > MAX_BYTES) return null;
  let m;
  try { m = JSON.parse(text); } catch { return null; }
  if (!isPlain(m)) return null;
  switch (m.t) {
    case 'hello':
      return m.v === PROTOCOL_V ? { t: 'hello', v: m.v } : null;
    case 'welcome':
      if (m.v !== PROTOCOL_V || !Number.isSafeInteger(m.seed)) return null;
      if (!Number.isInteger(m.solved) || m.solved < 0 || m.solved > 11) return null;
      return { t: 'welcome', v: m.v, seed: m.seed, solved: m.solved };
    case 'full':
      return { t: 'full' };
    case 'p': {
      const out = { t: 'p' };
      for (const [k, lo, hi] of NUM) { if (!isNum(m[k]) || m[k] < lo || m[k] > hi) return null; out[k] = m[k]; }
      for (const k of BOOL) { if (typeof m[k] !== 'boolean') return null; out[k] = m[k]; }
      for (const k of COUNT) { if (!isCount(m[k])) return null; out[k] = m[k]; }
      return out;
    }
    case 'c': {
      // raw length is capped before cleaning (two UTF-16 units per character, so a full line of
      // emoji fits); what is left after cleaning must be something to say
      if (typeof m.text !== 'string' || m.text.length < 1 || m.text.length > 2 * MAX_LEN) return null;
      const text = clean(m.text);
      return text ? { t: 'c', text } : null;
    }
    case 's':
      return isPlain(m.S) ? { t: 's', S: m.S } : null;
    default:
      return null;
  }
}

// The version a well-formed hello/welcome claims, of ANY version, else null. decode() drops a
// wrong-version handshake as a game message; this is how a session notices that is why.
export function versionOf(text) {
  if (typeof text !== 'string' || text.length > MAX_BYTES) return null;
  let m;
  try { m = JSON.parse(text); } catch { return null; }
  if (!isPlain(m) || (m.t !== 'hello' && m.t !== 'welcome')) return null;
  if (!Number.isInteger(m.v)) return null;
  if (m.t === 'welcome' && (!Number.isSafeInteger(m.seed) || !Number.isInteger(m.solved) || m.solved < 0)) return null;
  return m.v;
}

// Which decoded message types a side acts on. The host: `hello` until it has
// welcomed, then `p`/`c`. The joiner: `welcome` or `full` until welcomed, then `p`/`s`/`c`.
export function accepts(role, handshakeDone, type) {
  if (role === 'host') return handshakeDone ? type === 'p' || type === 'c' : type === 'hello';
  if (role === 'join') return handshakeDone ? type === 'p' || type === 's' || type === 'c' : type === 'welcome' || type === 'full';
  return false;
}

// A walk takes exactly one partner.
export const shouldAccept = (hasPartner) => !hasPartner;

// One walker as the puzzle rules see them.
export function toPIn(snap, lastEN) {
  if (!snap) return { present: false };
  return {
    present: true, x: snap.x, y: snap.y, z: snap.z,
    aim: dirFromYawPitch(snap.ay, snap.ap),
    hold: !!snap.hold, pressed: snap.eN !== lastEN,
  };
}

// Turns a walker's rising eN counter into one-shot presses. The first value seen (and
// the first after reset, e.g. a friend rejoining with their counter back at 0) is only
// a baseline, never a press.
export function pressTracker() {
  let last = null;
  return {
    seen(eN) { const pressed = last !== null && eN !== last; last = eN; return pressed; },
    reset() { last = null; },
  };
}

// The local walker as a `p` message.
export const snapshot = (player, inp, speed) => ({
  t: 'p', x: player.x, y: player.y, z: player.z, yaw: player.yaw,
  ay: inp.camYaw, ap: inp.camPitch, speed, hold: !!inp.hold,
  eN: inp.eN, q: !!inp.q, shoutN: inp.shoutN, waveN: inp.waveN, jumpN: inp.jumpN, dist: player.dist,
});

// The `p` message from an input handle: built from the same merged input the local step
// acts on (forced fields, i.e. the pilot, laid over the live keyboard and mouse).
export const netSnapshot = (player, input, speed) => snapshot(player, readInput(input), speed);

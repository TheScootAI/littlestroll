// Chat lines: cleaning, a short log, and a flood gate. Pure: no DOM, no network.
export const MAX_LEN = 400;   // characters (code points) in one chat line
export const KEEP = 50;       // lines a log remembers

// Control characters, line/paragraph separators and bidi overrides/isolates (which can make
// text read backwards or hide other text) all count as whitespace.
const ODD = new RegExp('[\\u0000-\\u001F\\u007F-\\u009F\\u2028\\u2029\\u202A-\\u202E\\u2066-\\u2069]', 'g');

// A line as it may be sent or shown.
export function clean(text) {
  if (typeof text !== 'string') return '';
  const s = text.replace(ODD, ' ').replace(/\s+/g, ' ').trim();
  // Array.from walks code points, so the cut never splits a surrogate pair
  const cps = Array.from(s);
  return cps.length > MAX_LEN ? cps.slice(0, MAX_LEN).join('').trim() : s;
}

export const createLog = () => ({ items: [], nextId: 1 });

// from: 0 (host) | 1 (joiner) | 'system'. ids rise by 1 and are never reused.
export function addLine(log, from, text, at) {
  const item = { id: log.nextId++, from, text, at };
  log.items.push(item);
  if (log.items.length > KEEP) log.items.splice(0, log.items.length - KEEP);
  return item;
}

export const since = (log, afterId = 0) => log.items.filter((i) => i.id > afterId);

// Token bucket against floods: `burst` messages at once, one more every `everyMs`.
export function createGate({ burst = 5, everyMs = 1000 } = {}) {
  let tokens = burst, last = null;
  return {
    allow(nowMs) {
      if (last !== null && nowMs > last) tokens = Math.min(burst, tokens + (nowMs - last) / everyMs);
      if (last === null || nowMs > last) last = nowMs;
      if (tokens < 1) return false;
      tokens -= 1;
      return true;
    },
  };
}

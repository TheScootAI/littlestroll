// Feedback: a note a player typed becomes a link to GitHub's new-issue page with the note filled
// in. Nothing is sent from the game: the player posts it on GitHub themselves. A link cannot
// carry a picture, so a screenshot goes beside it (on the clipboard, or saved as a file) and the
// note says how to attach it. Pure, no DOM.
export const REPO = 'TheScootAI/littlestroll';
export const MAX_CHARS = 1500;   // characters (code points) of a note that are kept
export const MAX_URL = 6000;     // GitHub turns away much longer links
const TITLE_CHARS = 60;
export const SHOT_FILE = 'little-stroll-screenshot.png';
const SHOT_MAX = 1280;           // longest side of a screenshot, in pixels

// How to attach the screenshot, by where it went.
const SHOT_LINE = {
  clipboard: 'Screenshot: it is on your clipboard. Click here and paste it (Ctrl+V, or Cmd+V on a Mac), then delete this line.',
  file: `Screenshot: it was saved as ${SHOT_FILE}. Drag that file in here, then delete this line.`,
};

// The size to save a w × h view at: inside `max` on its longest side, same shape, never bigger.
export function shotSize(w, h, max = SHOT_MAX) {
  if (!(w > 0) || !(h > 0)) return [1, 1];
  const k = Math.min(1, max / Math.max(w, h));
  return [Math.max(1, Math.round(w * k)), Math.max(1, Math.round(h * k))];
}

// Control characters (but not the line break) and bidi overrides/isolates, as in chat.
const ODD = new RegExp('[\\u0000-\\u0009\\u000B-\\u001F\\u007F-\\u009F\\u2028\\u2029\\u202A-\\u202E\\u2066-\\u2069]', 'g');

// A note as it will be posted: plain lines, no control characters, no long gaps.
export function tidy(text) {
  if (typeof text !== 'string') return '';
  return text.replace(/\r\n?/g, '\n').replace(ODD, ' ').replace(/ +/g, ' ')
    .replace(/ ?\n ?/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

const cut = (s, n) => { const cp = Array.from(s); return cp.length > n ? cp.slice(0, n).join('') : s; };

// The link for a note, or null when there is nothing to say. `info` is one line about the walk
// (how far the pair had got), added under the note. `shot` says where a screenshot went
// ('clipboard' | 'file'), or is empty when there is none.
export function issueUrl(text, info = '', shot = null) {
  let note = cut(tidy(text), MAX_CHARS).trim();
  if (!note) return null;
  const first = note.split('\n')[0];
  const title = `Feedback: ${Array.from(first).length > TITLE_CHARS ? `${cut(first, TITLE_CHARS - 1)}…` : first}`;
  const from = tidy(info).replace(/\n+/g, ' ');
  const how = Object.hasOwn(SHOT_LINE, shot) ? `\n\n${SHOT_LINE[shot]}` : '';
  const foot = `${how}\n\n---\nSent from inside the game${from ? ` · ${from}` : ''}`;
  const build = () => `https://github.com/${REPO}/issues/new?${new URLSearchParams({ title, body: note + foot })}`;
  let url = build();
  // an escaped link can be many times longer than the note (emoji): shorten the note until it fits
  while (url.length > MAX_URL && Array.from(note).length > 1) {
    note = cut(note, Math.floor(Array.from(note).length * Math.min(0.9, MAX_URL / url.length))).trim();
    url = build();
  }
  return url;
}

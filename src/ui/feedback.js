// The feedback button: a small round button in the top-right corner, on the menu and in the
// walk. It opens a box to type a bug or an idea; "Open on GitHub" opens GitHub's new-issue page
// in a new tab with the note filled in. Nothing is sent from here. All text is set as text.
//
// In a walk, pressing the button also takes a picture of the game view as it was at that moment
// (the 3D view only: the chat and the room code are not in it). A link cannot carry a picture,
// so on sending it is copied to the clipboard for the player to paste into the issue, or, where
// the browser will not allow that, saved as a file to drag in.
import { injectStyles, el, ACCENT, INK, PAPER } from './style.js';
import { issueUrl, shotSize, MAX_CHARS, SHOT_FILE } from '../core/feedback.js';

const CSS = `
.lr-fb { position: fixed; top: 12px; right: 12px; z-index: 30; pointer-events: none;
  font-family: system-ui, -apple-system, sans-serif; color: ${INK};
  display: flex; flex-direction: column; align-items: flex-end; gap: 8px; }
.lr-fb-btn { width: 38px; height: 38px; padding: 0; border: 0; border-radius: 50%; cursor: pointer; pointer-events: auto;
  background: rgba(255,247,234,0.88); color: ${INK}; box-shadow: 0 4px 14px rgba(90,60,30,0.2);
  display: flex; align-items: center; justify-content: center; }
.lr-fb-btn:hover, .lr-fb-btn:focus-visible { background: ${PAPER}; color: ${ACCENT}; outline: none; }
.lr-fb-btn svg { width: 20px; height: 20px; display: block; }
.lr-fb-card { display: none; box-sizing: border-box; width: min(340px, calc(100vw - 24px)); padding: 16px 16px 14px;
  border-radius: 20px; background: rgba(255,247,234,0.96); box-shadow: 0 10px 30px rgba(90,60,30,0.28); pointer-events: auto; }
.lr-fb-card h3 { margin: 0 0 8px; font-size: 17px; }
.lr-fb-card textarea { box-sizing: border-box; width: 100%; height: 120px; resize: none; padding: 10px 12px; border-radius: 12px;
  border: 1px solid rgba(74,59,48,0.25); background: #fff; color: ${INK}; font: 15px/1.35 system-ui, sans-serif; outline: none; }
.lr-fb-card textarea:focus { border-color: ${ACCENT}; }
.lr-fb-card p { margin: 8px 0 12px; font-size: 13px; line-height: 1.35; opacity: 0.75; }
.lr-fb-shot { display: none; align-items: center; gap: 10px; margin-top: 10px; font-size: 13px; line-height: 1.3; cursor: pointer; }
.lr-fb-shot canvas { width: 96px; height: auto; max-height: 72px; border-radius: 8px; flex: none;
  box-shadow: 0 2px 8px rgba(90,60,30,0.25); }
.lr-fb-shot input { flex: none; width: 16px; height: 16px; margin: 0; accent-color: ${ACCENT}; }
.lr-fb-row { display: flex; gap: 8px; justify-content: flex-end; }
.lr-fb-row button { padding: 8px 16px; border: 0; border-radius: 999px; font: 600 14px system-ui, sans-serif; cursor: pointer; }
.lr-fb-send { background: ${ACCENT}; color: #fff; }
.lr-fb-send:disabled { opacity: 0.45; cursor: default; }
.lr-fb-cancel { background: rgba(60,48,40,0.08); color: ${INK}; }
`;

// A speech bubble, drawn with DOM calls (no markup strings).
function bubbleIcon() {
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  const path = document.createElementNS(NS, 'path');
  path.setAttribute('d', 'M4 5.5h16a1.5 1.5 0 0 1 1.5 1.5v9a1.5 1.5 0 0 1-1.5 1.5h-7.2L8 21.5v-4H4A1.5 1.5 0 0 1 2.5 16V7A1.5 1.5 0 0 1 4 5.5z');
  path.setAttribute('fill', 'none');
  path.setAttribute('stroke', 'currentColor');
  path.setAttribute('stroke-width', '2');
  path.setAttribute('stroke-linejoin', 'round');
  svg.appendChild(path);
  return svg;
}

// A reduced copy of a canvas as it is drawn right now. For a WebGL canvas, call this in the same
// task as the render that drew it, before the browser clears the drawing buffer.
export function snapshot(src) {
  const [w, h] = shotSize(src.width, src.height);
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  c.getContext('2d').drawImage(src, 0, 0, w, h);
  return c;
}

// Put a PNG on the clipboard. Resolves true when it is there, false when the browser will not
// (or does not answer in time: the send must not hang on it).
function copyImage(blob) {
  try {
    if (!navigator.clipboard?.write || typeof ClipboardItem === 'undefined') return Promise.resolve(false);
    const wrote = navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]).then(() => true, () => false);
    return Promise.race([wrote, new Promise((res) => setTimeout(() => res(false), 800))]);
  } catch { return Promise.resolve(false); }
}

function saveImage(blob) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = SHOT_FILE;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 10000);
}

// Returns { onOpen, info, capture }: set `onOpen` to be told when the box opens (the game lets
// go of its keys), `info` to a function giving one line about the walk to add under the note,
// and `capture` to a function returning a canvas picture of the game as it is now (or null).
export function createFeedback(root) {
  injectStyles('lr-fb-css', CSS);
  const api = { onOpen: null, info: null, capture: null, get open() { return shown; } };
  let shown = false;
  let shot = null;      // { canvas, blob } taken when the box was opened, or null

  const wrap = el('div', 'lr-fb');
  const btn = el('button', 'lr-fb-btn');
  btn.type = 'button';
  btn.title = 'Send feedback';
  btn.setAttribute('aria-label', 'Send feedback');
  btn.appendChild(bubbleIcon());

  const card = el('div', 'lr-fb-card');
  const box = el('textarea');
  box.maxLength = MAX_CHARS;
  box.placeholder = 'What happened, or what would you like to see?';
  const send = el('button', 'lr-fb-send', 'Open on GitHub');
  const cancel = el('button', 'lr-fb-cancel', 'Cancel');
  send.type = cancel.type = 'button';
  send.disabled = true;
  const row = el('div', 'lr-fb-row');
  row.append(cancel, send);
  // the screenshot row: a tick box, the picture, and what will happen to it
  const shotRow = el('label', 'lr-fb-shot');
  const include = el('input');
  include.type = 'checkbox';
  include.checked = true;
  const shotText = el('span', '', 'Add this screenshot. It is copied for you to paste into the issue.');
  shotRow.append(include, shotText);
  card.append(
    el('h3', '', 'Found a bug or have an idea?'),
    box,
    shotRow,
    el('p', '', 'This opens GitHub with your note filled in, ready to post. You need a GitHub account.'),
    row,
  );
  wrap.append(btn, card);
  root.appendChild(wrap);

  // Take the picture before the box covers anything, and have its PNG ready for the send.
  const takeShot = () => {
    shot?.canvas.remove();
    shot = null;
    let canvas = null;
    try { canvas = api.capture?.() || null; } catch { canvas = null; }
    shotRow.style.display = canvas ? 'flex' : 'none';
    if (!canvas) return;
    const mine = shot = { canvas, blob: null };
    include.checked = true;
    shotRow.insertBefore(canvas, shotText);
    try { canvas.toBlob((b) => { mine.blob = b; }, 'image/png'); } catch { /* no picture then */ }
  };
  const show = (on) => {
    if (on && !shown) takeShot();
    shown = on;
    card.style.display = on ? 'block' : 'none';
    if (on) { box.focus(); api.onOpen?.(); } else box.blur();
  };
  btn.addEventListener('click', () => show(!shown));
  cancel.addEventListener('click', () => show(false));
  box.addEventListener('input', () => { send.disabled = !box.value.trim(); });
  box.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.preventDefault(); show(false); } });
  send.addEventListener('click', async () => {
    const note = box.value;
    if (!issueUrl(note)) return;
    let info = '';
    try { info = api.info?.() || ''; } catch { /* the note matters more than the footer */ }
    send.disabled = true;                      // one send per press
    let where = null;
    const blob = include.checked ? shot?.blob : null;
    if (blob) {
      if (await copyImage(blob)) where = 'clipboard';
      else { try { saveImage(blob); where = 'file'; } catch { where = null; } }
    }
    window.open(issueUrl(note, info, where), '_blank', 'noopener');
    box.value = '';
    show(false);
  });
  return api;
}

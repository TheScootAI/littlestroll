// The feedback button: a small round button in the top-right corner, on the menu and in the
// walk. It opens a box to type a bug or an idea. "Open on GitHub" is a real link to GitHub's
// new-issue page with the note filled in, so no browser can block it as a pop-up; the note is
// only posted when the player presses GitHub's own button there, and the box says so and stays
// open until they are done. Nothing is sent from here. All text is set as text.
//
// In a walk, pressing the button also takes a picture of the game view as it was at that moment
// (the 3D view only: the chat and the room code are not in it). A link cannot carry a picture,
// so "Copy screenshot" puts it on the clipboard for the player to paste into the issue, or,
// where the browser will not allow that, saves it as a file to drag in.
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
.lr-fb-shot { display: none; align-items: center; gap: 10px; margin-top: 10px; font-size: 13px; line-height: 1.3; }
.lr-fb-shot canvas { width: 96px; height: auto; max-height: 72px; border-radius: 8px; flex: none;
  box-shadow: 0 2px 8px rgba(90,60,30,0.25); }
.lr-fb-shot div { display: flex; flex-direction: column; align-items: flex-start; gap: 6px; }
.lr-fb-copy { padding: 6px 12px; border: 0; border-radius: 999px; font: 600 13px system-ui, sans-serif; cursor: pointer;
  background: rgba(60,48,40,0.1); color: ${INK}; }
.lr-fb-copy:disabled { opacity: 0.5; cursor: default; }
.lr-fb-row { display: flex; gap: 8px; justify-content: flex-end; }
.lr-fb-row button, .lr-fb-row a { padding: 8px 16px; border: 0; border-radius: 999px; font: 600 14px system-ui, sans-serif;
  cursor: pointer; text-decoration: none; }
.lr-fb-send { background: ${ACCENT}; color: #fff; }
.lr-fb-send[aria-disabled="true"] { opacity: 0.45; cursor: default; }
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
// (or does not answer in time).
function copyImage(blob) {
  try {
    if (!navigator.clipboard?.write || typeof ClipboardItem === 'undefined') return Promise.resolve(false);
    const wrote = navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]).then(() => true, () => false);
    return Promise.race([wrote, new Promise((res) => setTimeout(() => res(false), 2000))]);
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
  // A real link, opened by the browser itself: a pop-up blocker never stops it.
  const send = el('a', 'lr-fb-send', 'Open on GitHub');
  send.target = '_blank';
  send.rel = 'noopener';
  const cancel = el('button', 'lr-fb-cancel', 'Cancel');
  cancel.type = 'button';
  const row = el('div', 'lr-fb-row');
  row.append(cancel, send);
  // the screenshot row: the picture, and a button that copies it for pasting into the issue
  const shotRow = el('div', 'lr-fb-shot');
  const shotSide = el('div');
  const copy = el('button', 'lr-fb-copy', 'Copy screenshot');
  copy.type = 'button';
  const shotText = el('span');
  shotSide.append(copy, shotText);
  shotRow.appendChild(shotSide);
  const HOW = 'Step 1: open GitHub with your note filled in. Step 2: press the green button there to post it. You need a GitHub account.';
  const OPENED = 'GitHub opened in a new tab. Your note is not sent until you press the green button there.';
  const how = el('p', '', HOW);
  card.append(el('h3', '', 'Found a bug or have an idea?'), box, shotRow, how, row);
  wrap.append(btn, card);
  root.appendChild(wrap);

  let where = null;     // where the screenshot went, once copied: 'clipboard' | 'file'
  // The link always points at the note as it is now.
  const relink = () => {
    let info = '';
    try { info = api.info?.() || ''; } catch { /* the note matters more than the footer */ }
    const url = issueUrl(box.value, info, where);
    if (url) { send.href = url; send.removeAttribute('aria-disabled'); } else { send.removeAttribute('href'); send.setAttribute('aria-disabled', 'true'); }
  };

  // Take the picture before the box covers anything, and have its PNG ready to copy.
  const takeShot = () => {
    shot?.canvas.remove();
    shot = null;
    where = null;
    let canvas = null;
    try { canvas = api.capture?.() || null; } catch { canvas = null; }
    shotRow.style.display = canvas ? 'flex' : 'none';
    if (!canvas) return;
    const mine = shot = { canvas, blob: null };
    copy.disabled = false;
    shotText.textContent = 'Optional: copy it, then paste it into the issue.';
    shotRow.insertBefore(canvas, shotSide);
    try { canvas.toBlob((b) => { mine.blob = b; }, 'image/png'); } catch { /* no picture then */ }
  };
  const show = (on) => {
    if (on && !shown) { takeShot(); how.textContent = HOW; cancel.textContent = 'Cancel'; relink(); }
    shown = on;
    card.style.display = on ? 'block' : 'none';
    if (on) { box.focus(); api.onOpen?.(); } else box.blur();
  };
  btn.addEventListener('click', () => show(!shown));
  // Cancel before the link is used; Done after it: only then is the note cleared.
  cancel.addEventListener('click', () => {
    if (cancel.textContent === 'Done') box.value = '';
    show(false);
  });
  box.addEventListener('input', relink);
  box.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.preventDefault(); show(false); } });
  copy.addEventListener('click', async () => {
    const blob = shot?.blob;
    if (!blob) return;
    copy.disabled = true;
    if (await copyImage(blob)) { where = 'clipboard'; shotText.textContent = 'Copied. Paste it into the issue on GitHub.'; }
    else {
      try { saveImage(blob); where = 'file'; shotText.textContent = `Saved as ${SHOT_FILE}. Drag it into the issue on GitHub.`; }
      catch { where = null; shotText.textContent = 'Could not copy or save the screenshot.'; }
    }
    relink();
  });
  send.addEventListener('click', (e) => {
    relink();                                   // the walk may have moved on since the last key
    if (!send.href) { e.preventDefault(); return; }
    // the browser follows the link itself; the box stays so the player knows what comes next
    how.textContent = OPENED;
    cancel.textContent = 'Done';
  });
  return api;
}

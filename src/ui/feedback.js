// The feedback button: a small round button in the top-right corner, on the menu and in the
// walk. It opens a box to type a bug or an idea; "Open on GitHub" opens GitHub's new-issue page
// in a new tab with the note filled in. Nothing is sent from here. All text is set as text.
import { injectStyles, el, ACCENT, INK, PAPER } from './style.js';
import { issueUrl, MAX_CHARS } from '../core/feedback.js';

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

// Returns { onOpen, info }: set `onOpen` to be told when the box opens (the game lets go of its
// keys), and `info` to a function giving one line about the walk to add under the note.
export function createFeedback(root) {
  injectStyles('lr-fb-css', CSS);
  const api = { onOpen: null, info: null, get open() { return shown; } };
  let shown = false;

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
  card.append(
    el('h3', '', 'Found a bug or have an idea?'),
    box,
    el('p', '', 'This opens GitHub with your note filled in, ready to post. You need a GitHub account.'),
    row,
  );
  wrap.append(btn, card);
  root.appendChild(wrap);

  const show = (on) => {
    shown = on;
    card.style.display = on ? 'block' : 'none';
    if (on) { box.focus(); api.onOpen?.(); } else box.blur();
  };
  btn.addEventListener('click', () => show(!shown));
  cancel.addEventListener('click', () => show(false));
  box.addEventListener('input', () => { send.disabled = !box.value.trim(); });
  box.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.preventDefault(); show(false); } });
  send.addEventListener('click', () => {
    let info = '';
    try { info = api.info?.() || ''; } catch { /* the note matters more than the footer */ }
    const url = issueUrl(box.value, info);
    if (!url) return;
    window.open(url, '_blank', 'noopener');
    box.value = '';
    send.disabled = true;
    show(false);
  });
  return api;
}

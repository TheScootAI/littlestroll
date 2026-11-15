// Title screen: Start a walk / Join a walk (with a code field).
import { normalizeCode } from '../net/code.js';
import { injectStyles, el, ACCENT, INK, PAPER } from './style.js';

const CSS = `
.lr-menu { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
  pointer-events: auto; background: linear-gradient(180deg, #bfe3ea 0%, #f6e7cf 62%, #f0cf9f 100%);
  font-family: system-ui, -apple-system, sans-serif; color: ${INK}; }
.lr-card { text-align: center; padding: 40px 48px; border-radius: 32px; background: rgba(255,247,234,0.85);
  box-shadow: 0 12px 40px rgba(90,60,30,0.18); min-width: 300px; }
.lr-title { margin: 0 0 6px; font-size: 52px; font-weight: 700; letter-spacing: 0.02em; }
.lr-sub { margin: 0 0 28px; opacity: 0.7; font-size: 16px; }
.lr-btn { display: block; width: 100%; box-sizing: border-box; margin: 10px 0 0; padding: 14px 22px;
  border: 0; border-radius: 999px; font: 600 18px system-ui, sans-serif; cursor: pointer;
  background: ${ACCENT}; color: #fff; box-shadow: 0 4px 0 #c96a22; }
.lr-btn:active { transform: translateY(2px); box-shadow: 0 2px 0 #c96a22; }
.lr-btn.alt { background: ${PAPER}; color: ${INK}; box-shadow: 0 4px 0 #d8c7aa; border: 2px solid #e6d4b4; }
.lr-join { display: none; margin-top: 10px; }
.lr-join.open { display: block; }
.lr-input { width: 100%; box-sizing: border-box; padding: 12px; border-radius: 16px; border: 2px solid #e6d4b4;
  background: #fffdf8; font: 700 28px ui-monospace, monospace; letter-spacing: 0.35em; text-align: center;
  text-transform: uppercase; color: ${INK}; outline: none; }
.lr-input:focus { border-color: ${ACCENT}; }
.lr-err { min-height: 22px; margin: 8px 0 0; color: #b04a1c; font-size: 15px; }
`;

export function showMenu(root) {
  injectStyles('lr-menu-css', CSS);
  return new Promise((resolve) => {
    const menu = el('div', 'lr-menu');
    const card = el('div', 'lr-card');
    card.appendChild(el('h1', 'lr-title', 'Little Stroll'));
    card.appendChild(el('p', 'lr-sub', 'A stroll across three small islands, for two.'));

    const start = el('button', 'lr-btn', 'Start a stroll');
    const joinBtn = el('button', 'lr-btn alt', 'Join a stroll');
    const join = el('div', 'lr-join');
    const input = el('input', 'lr-input');
    input.type = 'text';
    input.maxLength = 12;
    input.placeholder = 'CODE';
    input.autocomplete = 'off';
    input.spellcheck = false;
    input.setAttribute('aria-label', 'Stroll code');
    const err = el('p', 'lr-err');
    join.append(input, err);

    const done = (r) => { menu.remove(); resolve(r); };
    start.onclick = () => done({ role: 'host', code: '' });
    joinBtn.onclick = () => { join.classList.add('open'); input.focus(); };
    const submit = () => {
      const code = normalizeCode(input.value);
      if (!code) { err.textContent = "That isn't a stroll code — five letters."; return; }
      done({ role: 'join', code });
    };
    input.addEventListener('input', () => { err.textContent = ''; });
    input.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') submit();
    });

    card.append(start, joinBtn, join);
    menu.appendChild(card);
    root.appendChild(menu);
  });
}

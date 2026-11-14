// HUD: room code, status line, interact prompt, friend arrow, ending card.
import { injectStyles, el, ACCENT, INK, PAPER } from './style.js';

const CSS = `
.lr-hud { position: absolute; inset: 0; font-family: system-ui, -apple-system, sans-serif; color: ${INK}; }
.lr-code { position: absolute; top: 18px; left: 50%; transform: translateX(-50%); text-align: center;
  padding: 10px 26px 12px; border-radius: 24px; background: rgba(255,247,234,0.88);
  box-shadow: 0 6px 20px rgba(90,60,30,0.18); display: none; }
.lr-code b { display: block; font: 700 40px ui-monospace, monospace; letter-spacing: 0.4em; margin-right: -0.4em; color: ${ACCENT}; }
.lr-code span { font-size: 14px; opacity: 0.75; }
.lr-status { position: absolute; top: 112px; left: 50%; transform: translateX(-50%); display: none; text-align: center;
  padding: 10px 20px; border-radius: 20px; background: rgba(60,48,40,0.62); color: ${PAPER}; font-size: 16px; max-width: 460px; }
.lr-status button { display: block; margin: 10px auto 0; padding: 8px 18px; border: 0; border-radius: 999px;
  background: ${ACCENT}; color: #fff; font: 600 15px system-ui, sans-serif; cursor: pointer; pointer-events: auto; }
.lr-prompt { position: absolute; bottom: 86px; left: 50%; transform: translateX(-50%); display: none;
  padding: 8px 18px; border-radius: 999px; background: rgba(255,247,234,0.9); font-size: 16px; font-weight: 600; }
.lr-flash { position: absolute; top: 150px; left: 50%; transform: translateX(-50%); display: none;
  padding: 10px 22px; border-radius: 999px; background: ${ACCENT}; color: #fff; font-size: 18px; font-weight: 700;
  box-shadow: 0 6px 20px rgba(90,60,30,0.25); }
.lr-arrow { position: absolute; width: 0; height: 0; display: none; left: 50%; top: 50%;
  border-left: 14px solid transparent; border-right: 14px solid transparent; border-bottom: 30px solid ${ACCENT};
  filter: drop-shadow(0 2px 3px rgba(0,0,0,0.35)); }
@keyframes lr-pulse { from { opacity: 1; } to { opacity: 0.3; } }
.lr-arrow.pulse { animation: lr-pulse 0.35s ease-in-out infinite alternate; }
/* the card sits low so the lit beacon stays in view above it */
.lr-end { position: absolute; inset: 0; display: none; align-items: flex-end; justify-content: center; pointer-events: auto;
  padding: 0 16px 7vh; box-sizing: border-box;
  background: linear-gradient(180deg, rgba(60,48,40,0) 45%, rgba(60,48,40,0.35) 100%); }
.lr-end .card { padding: 34px 48px 30px; border-radius: 30px; background: rgba(255,247,234,0.94); text-align: center;
  box-shadow: 0 12px 40px rgba(90,60,30,0.3); max-width: calc(100vw - 32px); box-sizing: border-box;
  animation: lr-rise 0.9s cubic-bezier(.2,.8,.2,1) both; }
@keyframes lr-rise { from { opacity: 0; transform: translateY(18px) scale(0.97); } to { opacity: 1; transform: none; } }
.lr-end h2 { margin: 0 0 6px; font-size: 34px; letter-spacing: 0.01em; }
.lr-end .time { margin: 4px 0 18px; font-size: 18px; opacity: 0.8; }
.lr-end .time b { font: 700 22px ui-monospace, monospace; opacity: 1; }
.lr-end .walkers { display: flex; gap: 14px; justify-content: center; margin-bottom: 22px; }
.lr-end .walker { padding: 10px 18px; border-radius: 18px; background: rgba(60,48,40,0.06); font-size: 15px; min-width: 110px; }
.lr-end .walker b { display: block; font-size: 24px; margin-top: 2px; }
.lr-end .dot { display: inline-block; width: 11px; height: 11px; border-radius: 50%; margin-right: 6px; vertical-align: -1px; }
.lr-end button { padding: 10px 26px; border: 0; border-radius: 999px; background: ${ACCENT}; color: #fff;
  font: 600 16px system-ui, sans-serif; cursor: pointer; }
/* chat: log above, one-line box below, bottom-left; only the box takes the pointer */
/* it sits above the start hint's row and stays narrow, clear of the centred prompt */
.lr-chat { position: absolute; left: 18px; bottom: 74px; width: min(340px, 36vw); pointer-events: none;
  display: flex; flex-direction: column; align-items: flex-start; gap: 6px; }
.lr-chat-log { display: flex; flex-direction: column; align-items: flex-start; gap: 4px; max-width: 100%;
  opacity: 1; transition: opacity 0.6s; }
.lr-chat-line { padding: 5px 12px; border-radius: 14px; background: rgba(60,48,40,0.62); color: ${PAPER};
  font-size: 15px; line-height: 1.3; overflow-wrap: anywhere; }
.lr-chat-line.sys { color: #cfc6bb; font-style: italic; }
.lr-chat-line .dot { display: inline-block; width: 10px; height: 10px; border-radius: 50%; margin-right: 7px; vertical-align: -1px; }
.lr-chat-box { display: none; box-sizing: border-box; width: 100%; padding: 8px 16px; border: 0; outline: none;
  border-radius: 999px; background: rgba(255,247,234,0.94); color: ${INK}; font: 600 16px system-ui, sans-serif;
  pointer-events: auto; box-shadow: 0 4px 14px rgba(90,60,30,0.2); }
`;

const SCARVES = [{ name: 'Orange', hex: '#f08a3c' }, { name: 'Teal', hex: '#2fb5a6' }];

export const fmtTime = (s) => {
  const t = Math.max(0, Math.round(s));
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
};

export function createHud(root) {
  injectStyles('lr-hud-css', CSS);
  const hud = el('div', 'lr-hud');
  const code = el('div', 'lr-code');
  const codeText = el('b');
  code.append(codeText, el('span', '', 'Share this code with your friend'));
  const status = el('div', 'lr-status');
  const statusText = el('div');
  status.appendChild(statusText);
  const prompt = el('div', 'lr-prompt');
  const flashEl = el('div', 'lr-flash');
  let flashTimer = null;
  const arrow = el('div', 'lr-arrow');
  const end = el('div', 'lr-end');
  // chat: all text goes in through textContent / text nodes, never as markup
  const chat = el('div', 'lr-chat');
  const chatLog = el('div', 'lr-chat-log');
  const chatBox = el('input', 'lr-chat-box');
  chatBox.maxLength = 200;
  chatBox.placeholder = 'Say something…';
  chatBox.autocomplete = 'off';
  chat.append(chatLog, chatBox);
  let chatShown = false, chatFade = null, chatEnabled = false;
  const showLog = () => {
    chatLog.style.opacity = '1';
    clearTimeout(chatFade);
    chatFade = setTimeout(() => { if (!chatShown) chatLog.style.opacity = '0'; }, 10000);
  };
  hud.append(code, status, prompt, flashEl, arrow, chat, end);
  root.appendChild(hud);

  return {
    setCode(c) {
      codeText.textContent = c || '';
      code.style.display = c ? 'block' : 'none';
    },
    // text, plus an optional { label, onClick } button
    setStatus(text, action = null) {
      status.querySelector('button')?.remove();
      statusText.textContent = text || '';
      status.style.display = text ? 'block' : 'none';
      if (text && action) {
        const b = el('button', '', action.label);
        b.onclick = action.onClick;
        status.appendChild(b);
      }
    },
    setPrompt(text) {
      prompt.textContent = text || '';
      prompt.style.display = text ? 'block' : 'none';
    },
    // a short line that goes away by itself (a puzzle was solved)
    flash(text, ms = 3000) {
      clearTimeout(flashTimer);
      flashEl.textContent = text || '';
      flashEl.style.display = text ? 'block' : 'none';
      if (text) flashTimer = setTimeout(() => { flashEl.style.display = 'none'; }, ms);
    },
    // angle in radians from screen-up, clockwise; null hides it; pulse makes it blink (a fresh shout)
    setFriendArrow(angle, pulse = false) {
      if (angle === null || angle === undefined) { arrow.style.display = 'none'; return; }
      const r = Math.min(window.innerWidth, window.innerHeight) * 0.42;
      const x = Math.sin(angle) * r, y = -Math.cos(angle) * r;
      arrow.style.display = 'block';
      arrow.classList.toggle('pulse', !!pulse);
      arrow.style.transform = `translate(calc(${x}px - 50%), calc(${y}px - 50%)) rotate(${angle}rad)`;
    },
    // The ending card: time as m:ss and each walker's metres ([host, joiner]) by scarf colour.
    showEnding({ time, dist }) {
      end.replaceChildren();
      const card = el('div', 'card');
      card.appendChild(el('h2', '', 'You walked it together'));
      const t = el('p', 'time', 'Time ');
      t.appendChild(el('b', '', fmtTime(time)));
      card.appendChild(t);
      const walkers = el('div', 'walkers');
      (Array.isArray(dist) ? dist : [dist]).forEach((m, i) => {
        const w = el('div', 'walker');
        const dot = el('span', 'dot');
        dot.style.background = SCARVES[i].hex;
        w.append(dot, document.createTextNode(SCARVES[i].name));
        w.appendChild(el('b', '', `${Math.round(Number.isFinite(m) ? m : 0)} m`));
        walkers.appendChild(w);
      });
      card.appendChild(walkers);
      const again = el('button', '', 'Walk again');
      again.onclick = () => window.location.reload();
      card.appendChild(again);
      end.appendChild(card);
      end.style.display = 'flex';
    },
    // who: 0 | 1 (scarf colours) or null for a grey system line
    chatLine(who, text) {
      const line = el('div', who === 0 || who === 1 ? 'lr-chat-line' : 'lr-chat-line sys');
      if (who === 0 || who === 1) {
        const dot = el('span', 'dot');
        dot.style.background = SCARVES[who].hex;
        line.append(dot, document.createTextNode(`${SCARVES[who].name}: ${text}`));
      } else line.appendChild(document.createTextNode(String(text)));
      chatLog.appendChild(line);
      while (chatLog.childNodes.length > 6) chatLog.firstChild.remove();
      showLog();
    },
    // Enter opens the box; Enter in it sends, Esc cancels. Call once.
    enableChat({ onSend, onOpen }) {
      if (chatEnabled) return;
      chatEnabled = true;
      const close = () => {
        if (!chatShown) return;
        chatShown = false;
        chatBox.value = '';
        chatBox.style.display = 'none';
        chatBox.blur();
        showLog();   // starts the fade countdown again
      };
      // Focus gone (a click on the game to look around, another window): the box closes with
      // it. Left open and unfocused it would swallow nothing, show forever and block Enter.
      chatBox.addEventListener('blur', close);
      window.addEventListener('keydown', (e) => {
        // keyCode 229: an IME is composing (Safari reports the confirming Enter this way)
        if (e.repeat || e.isComposing || e.keyCode === 229) return;
        const t = e.target;
        if (chatShown && t === chatBox) {
          if (e.key === 'Enter') {
            e.preventDefault(); e.stopPropagation();
            const v = chatBox.value;
            close();
            if (v.trim()) onSend(v);
          } else if (e.key === 'Escape') { e.preventDefault(); close(); }
          return;
        }
        if (e.key !== 'Enter' || chatShown || e.altKey || e.ctrlKey || e.metaKey) return;
        // Enter belongs to whatever has focus: a text field, or a button it should press
        if (t && (['INPUT', 'TEXTAREA', 'BUTTON', 'SELECT', 'A'].includes(t.tagName) || t.isContentEditable)) return;
        e.preventDefault();
        chatShown = true;
        chatBox.style.display = 'block';
        chatBox.focus();
        showLog();
        onOpen?.();
      });
    },
    get chatOpen() { return chatShown; },
  };
}

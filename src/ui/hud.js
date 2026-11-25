// HUD: room code, status line, interact prompt, friend arrow, ending card.
import { injectStyles, el, ACCENT, INK, PAPER } from './style.js';
import { MAX_LEN } from '../core/chat.js';

const CSS = `
.lr-hud { position: absolute; inset: 0; font-family: system-ui, -apple-system, sans-serif; color: ${INK}; }
.lr-code { position: absolute; top: calc(18px + env(safe-area-inset-top, 0px)); left: 50%; transform: translateX(-50%); text-align: center;
  width: max-content; max-width: calc(100vw - 120px); box-sizing: border-box; padding: 10px 26px 12px; border-radius: 24px; background: rgba(255,247,234,0.88);
  box-shadow: 0 6px 20px rgba(90,60,30,0.18); display: none; }
.lr-code b { display: block; font: 700 40px ui-monospace, monospace; letter-spacing: 0.4em; margin-right: -0.4em; color: ${ACCENT}; }
.lr-code span { font-size: 14px; opacity: 0.75; }
.lr-status { position: absolute; top: calc(112px + env(safe-area-inset-top, 0px)); left: 50%; transform: translateX(-50%); display: none; text-align: center;
  padding: 10px 20px; border-radius: 20px; background: rgba(60,48,40,0.62); color: ${PAPER}; font-size: 16px;
  width: max-content; max-width: min(460px, calc(100vw - 32px)); box-sizing: border-box; }
.lr-status button { display: block; margin: 10px auto 0; padding: 8px 18px; border: 0; border-radius: 999px;
  background: ${ACCENT}; color: #fff; font: 600 15px system-ui, sans-serif; cursor: pointer; pointer-events: auto; }
.lr-prompt { position: absolute; bottom: 86px; left: 50%; transform: translateX(-50%); display: none; text-align: center;
  width: max-content; max-width: calc(100vw - 32px); box-sizing: border-box;
  padding: 8px 18px; border-radius: 22px; background: rgba(255,247,234,0.9); font-size: 16px; font-weight: 600; }
.lr-flash { position: absolute; top: calc(150px + env(safe-area-inset-top, 0px)); left: 50%; transform: translateX(-50%); display: none; text-align: center;
  width: max-content; max-width: calc(100vw - 32px); box-sizing: border-box;
  padding: 10px 22px; border-radius: 24px; background: ${ACCENT}; color: #fff; font-size: 18px; font-weight: 700;
  box-shadow: 0 6px 20px rgba(90,60,30,0.25); }
/* the start hint: one row under the prompt's place, gone once the player has looked around */
.lr-hint { position: absolute; left: 50%; bottom: 28px; transform: translateX(-50%); text-align: center;
  width: max-content; max-width: calc(100vw - 32px); box-sizing: border-box;
  padding: 8px 16px; border-radius: 20px; background: rgba(60,48,40,0.55); color: ${PAPER};
  font: 500 15px/1.3 system-ui, sans-serif; letter-spacing: 0.02em; transition: opacity 0.6s; }
.lr-arrow { position: absolute; width: 0; height: 0; display: none; left: 50%; top: 50%;
  border-left: 14px solid transparent; border-right: 14px solid transparent; border-bottom: 30px solid ${ACCENT};
  filter: drop-shadow(0 2px 3px rgba(0,0,0,0.35)); }
@keyframes lr-pulse { from { opacity: 1; } to { opacity: 0.3; } }
.lr-arrow.pulse { animation: lr-pulse 0.35s ease-in-out infinite alternate; }
/* the card sits low so the lit beacon stays in view above it */
.lr-end { position: absolute; inset: 0; display: none; align-items: flex-end; justify-content: center; pointer-events: auto;
  padding: 0 16px 7vh; box-sizing: border-box;
  background: linear-gradient(180deg, rgba(60,48,40,0) 45%, rgba(60,48,40,0.35) 100%); }
.lr-end .card { padding: 34px 48px 30px; max-height: calc(100% - 16px); overflow-y: auto; border-radius: 30px; background: rgba(255,247,234,0.94); text-align: center;
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
/* a phone, upright or on its side: the card and the room code take less room */
@media (max-width: 520px), (max-height: 480px) {
  .lr-end { padding-bottom: 3vh; }
  .lr-end .card { padding: 18px 22px 16px; border-radius: 24px; }
  .lr-end h2 { font-size: 24px; }
  .lr-end .time { margin: 2px 0 8px; font-size: 16px; }
  .lr-end .time b { font-size: 18px; }
  .lr-end .walkers { margin-bottom: 12px; }
  .lr-end .walker { padding: 6px 14px; min-width: 90px; }
  .lr-end .walker b { font-size: 20px; }
  .lr-code { padding: 6px 20px 8px; }
  .lr-code b { font-size: 30px; }
  .lr-status { top: calc(96px + env(safe-area-inset-top, 0px)); }
}
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
.lr-chat-row { display: none; width: 100%; gap: 6px; }
.lr-chat-box { flex: 1; min-width: 0; box-sizing: border-box; padding: 8px 16px; border: 0; outline: none;
  border-radius: 999px; background: rgba(255,247,234,0.94); color: ${INK}; font: 600 16px system-ui, sans-serif;
  pointer-events: auto; box-shadow: 0 4px 14px rgba(90,60,30,0.2); }
/* Send is for fingers: a keyboard has Enter */
.lr-chat-send { display: none; flex: none; padding: 0 16px; border: 0; border-radius: 999px; background: ${ACCENT}; color: #fff;
  font: 600 15px system-ui, sans-serif; pointer-events: auto; touch-action: none; cursor: pointer; }

/* Touch (the class is on the #ui layer, set by ui/touch.js): the stick is bottom-left and the
   buttons bottom-right, so chat moves up under its button (kept narrow, beside the centred
   lines) and the prompt keeps to the gap between them (on its side) or sits above them (upright). */
.lr-touch .lr-chat-send { display: block; }
.lr-touch .lr-chat { top: calc(58px + env(safe-area-inset-top, 0px)); bottom: auto; left: calc(12px + env(safe-area-inset-left, 0px));
  width: min(340px, 30vw); flex-direction: column-reverse; }
.lr-touch .lr-prompt { bottom: calc(24px + env(safe-area-inset-bottom, 0px)); max-width: calc(100vw - 400px); }
.lr-touch .lr-hint { bottom: calc(72px + env(safe-area-inset-bottom, 0px)); max-width: calc(100vw - 400px); }
@media (orientation: portrait) {
  /* upright there is no room beside the room code and the status line, so chat goes under them */
  .lr-touch .lr-chat { top: calc(200px + env(safe-area-inset-top, 0px)); width: min(340px, 64vw); }
  .lr-touch .lr-prompt { bottom: calc(184px + env(safe-area-inset-bottom, 0px)); max-width: calc(100vw - 32px); }
  .lr-touch .lr-hint { bottom: calc(232px + env(safe-area-inset-bottom, 0px)); max-width: calc(100vw - 32px); }
}
`;

// The prompts name the key ("E — ring the bell", "Hold E — turn the crank"). On touch the
// same thing is the Use button.
const USE_KEY = /^(Hold )?E — /;
export const needsUse = (text) => typeof text === 'string' && USE_KEY.test(text);
export const touchPrompt = (text) => (typeof text === 'string' ? text.replace(USE_KEY, (m, hold) => `${hold || ''}Use — `) : text);

export const KEY_HINT = 'Click to look around · WASD to stroll · Shift to run · Space to jump · Enter to chat';
export const TOUCH_HINT = 'Left thumb to stroll (push far to run) · drag to look around';

const SCARVES = [{ name: 'Orange', hex: '#f08a3c' }, { name: 'Teal', hex: '#2fb5a6' }];

export const fmtTime = (s) => {
  const t = Math.max(0, Math.round(s));
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
};

// "you 4 · your friend 3 · of 10" from [mine, theirs, total]; null unless three whole numbers.
export const findsLine = (f) => {
  if (!Array.isArray(f) || f.length !== 3 || !f.every((v) => Number.isInteger(v) && v >= 0)) return null;
  return `you ${f[0]} · your friend ${f[1]} · of ${f[2]}`;
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
  const chatRow = el('div', 'lr-chat-row');
  const chatBox = el('input', 'lr-chat-box');
  chatBox.maxLength = MAX_LEN;
  chatBox.placeholder = 'Say something…';
  chatBox.autocomplete = 'off';
  chatBox.enterKeyHint = 'send';
  const chatSend = el('button', 'lr-chat-send', 'Send');
  chatSend.type = 'button';
  chatRow.append(chatBox, chatSend);
  chat.append(chatLog, chatRow);
  let chatShown = false, chatFade = null, chatEnabled = false, openChat = null;
  let touch = false, promptText = null;
  const hint = el('div', 'lr-hint', KEY_HINT);
  hint.style.display = 'none';
  const drawPrompt = () => {
    prompt.textContent = (touch ? touchPrompt(promptText) : promptText) || '';
    prompt.style.display = promptText ? 'block' : 'none';
  };
  const showLog = () => {
    chatLog.style.opacity = '1';
    clearTimeout(chatFade);
    chatFade = setTimeout(() => { if (!chatShown) chatLog.style.opacity = '0'; }, 10000);
  };
  hud.append(code, status, prompt, hint, flashEl, arrow, chat, end);
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
      promptText = text || null;
      drawPrompt();
    },
    // touch controls are in use: the prompts and the start hint name the buttons, not the keys
    setTouch(on) {
      touch = !!on;
      hint.textContent = touch ? TOUCH_HINT : KEY_HINT;
      drawPrompt();
    },
    // the line that says how to move, shown as the walk starts; fades for good once told to hide
    showHint(on) {
      if (on) { hint.style.display = 'block'; hint.style.opacity = '1'; return; }
      hint.style.opacity = '0';
      setTimeout(() => { hint.style.display = 'none'; }, 700);
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
    showEnding({ time, dist, finds }) {
      end.replaceChildren();
      const card = el('div', 'card');
      card.appendChild(el('h2', '', 'You strolled it together'));
      const t = el('p', 'time', 'Time ');
      t.appendChild(el('b', '', fmtTime(time)));
      card.appendChild(t);
      const findsText = findsLine(finds);
      if (findsText !== null) {
        const o = el('p', 'time', 'Clothes found ');
        o.appendChild(el('b', '', findsText));
        card.appendChild(o);
      }
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
      const again = el('button', '', 'Stroll again');
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
      // at most 6 lines, and no taller than most of the view (two full-length lines fit a
      // laptop screen): long lines push old ones out sooner. A hidden tab reports no height,
      // so there the count alone decides.
      const room = window.innerHeight * 0.7 || Infinity;
      while (chatLog.childNodes.length > 6
        || (chatLog.childNodes.length > 1 && chatLog.offsetHeight > room)) chatLog.firstChild.remove();
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
        chatRow.style.display = 'none';
        chatBox.blur();
        showLog();   // starts the fade countdown again
      };
      const send = () => {
        const v = chatBox.value;
        close();
        if (v.trim()) onSend(v);
      };
      openChat = () => {
        if (chatShown) return;
        chatShown = true;
        chatRow.style.display = 'flex';
        chatBox.focus();
        showLog();
        onOpen?.();
      };
      // on the press, before the box can lose its focus to the button and close unsent
      chatSend.addEventListener('pointerdown', (e) => { e.preventDefault(); send(); });
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
            send();
          } else if (e.key === 'Escape') { e.preventDefault(); close(); }
          return;
        }
        if (e.key !== 'Enter' || chatShown || e.altKey || e.ctrlKey || e.metaKey) return;
        // Enter belongs to whatever has focus: a text field, or a button it should press
        if (t && (['INPUT', 'TEXTAREA', 'BUTTON', 'SELECT', 'A'].includes(t.tagName) || t.isContentEditable)) return;
        e.preventDefault();
        openChat();
      });
    },
    // the Chat button's way in (touch); nothing happens before enableChat
    openChat() { openChat?.(); },
    get chatOpen() { return chatShown; },
  };
}

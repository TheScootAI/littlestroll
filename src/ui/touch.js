// Touch controls: the stick's picture and the buttons, for phones and tablets. They stay
// hidden until the page is on a touch device or a finger first comes down, so a mouse and
// keyboard player never sees them. Every button stands for a key: Use is E, Point is Q,
// Shout is F, Wave is 1, Jump is Space and Chat is Enter.
import { injectStyles, el, ACCENT, INK, PAPER } from './style.js';
import { attachTouch, blurTyping, TOUCH_LOOK } from '../player/touch.js';

const L = 'env(safe-area-inset-left, 0px)', R = 'env(safe-area-inset-right, 0px)';
const T = 'env(safe-area-inset-top, 0px)', B = 'env(safe-area-inset-bottom, 0px)';

const CSS = `
.lr-tc { position: absolute; inset: 0; display: none; pointer-events: none;
  font-family: system-ui, -apple-system, sans-serif; color: ${INK};
  -webkit-user-select: none; user-select: none; -webkit-touch-callout: none; -webkit-tap-highlight-color: transparent; }
.lr-touch .lr-tc { display: block; }
.lr-touch .lr-tc.off { display: none; }
/* the stick rests bottom-left; while a thumb is on it, it sits where the thumb came down */
.lr-stick { position: absolute; left: calc(22px + ${L}); bottom: calc(22px + ${B}); width: 116px; height: 116px;
  box-sizing: border-box; border-radius: 50%; background: rgba(255,247,234,0.16);
  border: 2px solid rgba(255,247,234,0.55); box-shadow: 0 4px 16px rgba(60,48,40,0.18); opacity: 0.7; }
.lr-stick.on { opacity: 1; }
.lr-stick.run { border-color: ${ACCENT}; }
.lr-knob { position: absolute; left: 50%; top: 50%; width: 52px; height: 52px; margin: -26px 0 0 -26px;
  border-radius: 50%; background: rgba(255,247,234,0.9); box-shadow: 0 3px 10px rgba(60,48,40,0.3); }
.lr-pad { position: absolute; right: calc(16px + ${R}); bottom: calc(22px + ${B});
  display: flex; flex-direction: column; align-items: flex-end; gap: 8px; }
.lr-pad-row { display: flex; gap: 8px; }
.lr-tb { box-sizing: border-box; width: 50px; height: 50px; border-radius: 50%; pointer-events: auto; touch-action: none;
  display: flex; align-items: center; justify-content: center; cursor: pointer;
  background: rgba(255,247,234,0.82); color: ${INK}; font: 700 13px system-ui, sans-serif;
  box-shadow: 0 4px 14px rgba(60,48,40,0.25); }
.lr-tb.big { width: 78px; height: 78px; font-size: 17px; }
.lr-tb.ready { background: ${ACCENT}; color: #fff; }
.lr-tb.down { transform: scale(0.93); background: ${PAPER}; color: ${ACCENT}; }
.lr-tb.chat { position: absolute; top: calc(12px + ${T}); left: calc(12px + ${L}); width: auto; height: 38px;
  padding: 0 16px; border-radius: 999px; }
`;

const LABELS = { interact: 'Use', jump: 'Jump', point: 'Point', shout: 'Shout', wave: 'Wave' };

// One round button. `down`/`up` are the press and the release; `drag` (optional) gets the
// finger's travel while it stays down.
function button(label, cls, { down, up, drag }) {
  const b = el('div', `lr-tb${cls ? ` ${cls}` : ''}`, label);
  b.setAttribute('role', 'button');
  let id = null, lx = 0, ly = 0;
  b.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    e.preventDefault();   // keeps the focus where it is, and stops the made-up mouse click
    if (id !== null) return;
    id = e.pointerId; lx = e.clientX; ly = e.clientY;
    try { b.setPointerCapture(id); } catch { /* the release still comes with the finger */ }
    b.classList.add('down');
    down?.(e);
  });
  const end = (e) => {
    if (e.pointerId !== id) return;
    id = null;
    b.classList.remove('down');
    up?.(e);
  };
  b.addEventListener('pointerup', end);
  b.addEventListener('pointercancel', end);
  b.addEventListener('pointermove', (e) => {
    if (e.pointerId !== id || !drag) return;
    drag(e.clientX - lx, e.clientY - ly);
    lx = e.clientX; ly = e.clientY;
  });
  b.addEventListener('contextmenu', (e) => e.preventDefault());
  return b;
}

// True when the page is on a phone or tablet: a finger is the main pointer and nothing hovers.
export const touchFirst = (win) => {
  try { return !!win.matchMedia?.('(hover: none) and (pointer: coarse)').matches; } catch { return false; }
};

// root: the #ui layer (it gets the class `lr-touch` once touch is in use, which the HUD's
// styles read too). onChat opens the chat box; onEnable is called once, when the controls
// first show.
export function createTouchControls(root, canvas, input, { onChat = null, onEnable = null } = {}) {
  injectStyles('lr-touch-css', CSS);
  const doc = canvas.ownerDocument, win = doc.defaultView;
  const tc = el('div', 'lr-tc');
  const stick = el('div', 'lr-stick');
  const knob = el('div', 'lr-knob');
  stick.appendChild(knob);

  const press = (a) => ({ down: () => { input.touchAt = Date.now(); blurTyping(doc); input.action(a, true); }, up: () => { input.touchAt = Date.now(); input.action(a, false); } });
  const use = button(LABELS.interact, 'big', press('interact'));
  const jump = button(LABELS.jump, 'big', press('jump'));
  // Point: held like Q, and the same finger can slide to aim
  const point = button(LABELS.point, '', { ...press('point'), drag: (dx, dy) => input.look(dx * TOUCH_LOOK, dy * TOUCH_LOOK) });
  const shout = button(LABELS.shout, '', press('shout'));
  const wave = button(LABELS.wave, '', press('wave'));
  // Chat opens on the click, not the press: a phone only raises its keyboard for a finished tap
  const chat = el('div', 'lr-tb chat', 'Chat');
  chat.setAttribute('role', 'button');
  chat.addEventListener('click', () => { input.touchAt = Date.now(); onChat?.(); });

  const pad = el('div', 'lr-pad');
  const small = el('div', 'lr-pad-row'), big = el('div', 'lr-pad-row');
  small.append(point, shout, wave);
  big.append(use, jump);
  pad.append(small, big);
  tc.append(stick, pad, chat);
  root.appendChild(tc);

  const gestures = attachTouch(canvas, input, {
    onStick(s) {
      stick.classList.toggle('on', !!s);
      stick.classList.toggle('run', !!s?.run);
      if (!s) { stick.style.left = stick.style.top = stick.style.bottom = ''; knob.style.transform = ''; return; }
      const half = stick.offsetWidth / 2;
      stick.style.left = `${s.ox - half}px`;
      stick.style.top = `${s.oy - half}px`;
      stick.style.bottom = 'auto';
      knob.style.transform = `translate(${s.kx}px, ${s.ky}px)`;
    },
  });

  let on = false;
  const enable = () => {
    if (on) return;
    on = true;
    win.removeEventListener('pointerdown', first, true);
    root.classList.add('lr-touch');
    onEnable?.();
  };
  function first(e) { if (e.pointerType === 'touch') enable(); }
  win.addEventListener('pointerdown', first, true);
  if (touchFirst(win)) enable();

  return {
    get on() { return on; },
    // light the Use button while there is something here to use
    setUsable(yes) { use.classList.toggle('ready', !!yes); },
    // the walk has ended: the card takes the screen
    hide() { tc.classList.add('off'); },
    dispose() {
      gestures.dispose();
      win.removeEventListener('pointerdown', first, true);
      tc.remove();
    },
  };
}

// Keyboard + mouse → input state. The key and look rules are pure functions so they
// can be tested without a DOM; createInput wires them to the browser. Touch (player/touch.js)
// comes in through the same state: a stick laid over the movement keys, and the same actions.
import { clamp } from '../core/math.js';

export const PITCH_MIN = -1.1;
export const PITCH_MAX = 1.0;
const LOOK_SENS = 0.0025;   // radians per pixel of mouse travel
const TAP_MOUSE_MS = 1000;  // a mouse click this soon after a touch is the browser's echo of the tap

const KEYS = {
  KeyW: 'fwd', ArrowUp: 'fwd',
  KeyS: 'back', ArrowDown: 'back',
  KeyA: 'left', ArrowLeft: 'left',
  KeyD: 'right', ArrowRight: 'right',
  ShiftLeft: 'run', ShiftRight: 'run',
  KeyE: 'interact',
  KeyQ: 'point',
  KeyF: 'shout',
  Digit1: 'wave',
  Space: 'jump',
};

// Keyed on KeyboardEvent.code (the physical key), so Shift+W still releases W.
export const keyAction = (code) => KEYS[code] ?? null;

export const createInputState = () => ({
  mx: 0, mz: 0, run: false, hold: false, eN: 0, q: false, shoutN: 0, waveN: 0, jumpN: 0, camYaw: 0, camPitch: -0.15,
});

// The touch stick: an analogue push (each axis -1..1) and whether it is pushed far enough to run.
export const createPad = () => ({ mx: 0, mz: 0, run: false });

// Recompute the held flags from the set of held actions, with the stick laid over the keys.
function syncHeld(s, held, pad) {
  const kz = (held.has('fwd') ? 1 : 0) - (held.has('back') ? 1 : 0);
  const kx = (held.has('right') ? 1 : 0) - (held.has('left') ? 1 : 0);
  s.mz = pad ? clamp(kz + pad.mz, -1, 1) : kz;
  s.mx = pad ? clamp(kx + pad.mx, -1, 1) : kx;
  s.run = held.has('run') || !!pad?.run;
  s.hold = held.has('interact');
  s.q = held.has('point');
}

// Press or let go of one action (what a key or a touch button stands for).
export function applyAction(s, held, a, down, repeat = false, pad = null) {
  if (down) {
    if (!repeat) {
      if (a === 'interact') s.eN++;
      else if (a === 'shout') s.shoutN++;
      else if (a === 'wave') s.waveN++;
      else if (a === 'jump') s.jumpN++;
    }
    held.add(a);
  } else held.delete(a);
  syncHeld(s, held, pad);
}

// Apply one key event. Returns true when the key belongs to the game.
export function applyKey(s, held, code, down, repeat, pad = null) {
  const a = keyAction(code);
  if (!a) return false;
  applyAction(s, held, a, down, repeat, pad);
  return true;
}

// Move the stick: mx right, mz forward, each -1..1.
export function applyStick(s, held, pad, mx, mz, run) {
  pad.mx = clamp(mx || 0, -1, 1);
  pad.mz = clamp(mz || 0, -1, 1);
  pad.run = !!run;
  syncHeld(s, held, pad);
}

// Let go of every key and the stick (window blur): nobody gets stuck walking.
export function releaseAll(s, held, pad = null) {
  held.clear();
  if (pad) { pad.mx = 0; pad.mz = 0; pad.run = false; }
  syncHeld(s, held, pad);
}

// Mouse travel in pixels → look. Right turns right (yaw down), up looks up.
export function applyLook(s, dx, dy) {
  s.camYaw -= dx * LOOK_SENS;
  s.camPitch = clamp(s.camPitch - dy * LOOK_SENS, PITCH_MIN, PITCH_MAX);
}

// The input the game acts on: forced fields (the debug handle) laid over the live state.
// The one merge the local step and the network snapshot both read. `input.mustWalk` (set by
// the game) is a hook for puzzles that forbid running (the relay's flame carrier): whatever
// the keyboard, the stand-in or the pilot asks for, run is off while it says true.
export const readInput = (input) => {
  const r = input.forced ? { ...input.state, ...input.forced } : { ...input.state };
  if (input.mustWalk?.()) r.run = false;
  return r;
};

const typing = (t) => t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
// Space on a focused button, list or link is that control's own key: it presses it, no jump
const ownsSpace = (e) => e.code === 'Space' && !!e.target && ['BUTTON', 'SELECT', 'A'].includes(e.target.tagName);

export function createInput(canvas) {
  const state = createInputState();
  const held = new Set();
  const pad = createPad();
  const doc = canvas.ownerDocument;
  const win = doc.defaultView;
  let dragging = false;
  const canLock = 'requestPointerLock' in canvas;
  // Drag-look for this click only: set when this click's lock request is refused. Every new
  // click tries for the lock again (a refusal right after Esc must not last the whole walk).
  let lockFailed = !canLock;

  // release(): let go of every key (the chat box just opened), so the walker stops.
  // stick / action / look are the touch controls' way in; touchAt is when a finger last
  // came down or lifted (the browser follows a tap with a made-up mouse click).
  const input = {
    state, forced: null, captured: false, touchAt: -Infinity, dispose,
    release: () => releaseAll(state, held, pad),
    stick: (mx, mz, run) => applyStick(state, held, pad, mx, mz, run),
    action: (a, down) => applyAction(state, held, a, down, false, pad),
    look: (dx, dy) => { applyLook(state, dx, dy); input.captured = true; },
  };
  const locked = () => doc.pointerLockElement === canvas;

  const onKeyDown = (e) => {
    if (typing(e.target) || ownsSpace(e)) return;
    if (applyKey(state, held, e.code, true, e.repeat, pad)) e.preventDefault();
  };
  const onKeyUp = (e) => {
    if (applyKey(state, held, e.code, false, false, pad) && !ownsSpace(e)) e.preventDefault();
  };
  const onBlur = () => { releaseAll(state, held, pad); dragging = false; };
  const onVisibility = () => { if (doc.hidden) onBlur(); };

  const onMouseDown = (e) => {
    if (e.button !== 0) return;
    // the click a browser makes up after a tap: fingers look by dragging, and never take the pointer
    if (Date.now() - input.touchAt < TAP_MOUSE_MS) return;
    dragging = true;
    if (canLock && !locked()) {
      lockFailed = false;
      try {
        const r = canvas.requestPointerLock();
        if (r && typeof r.catch === 'function') r.catch(() => { lockFailed = true; });
      } catch { lockFailed = true; }
    }
  };
  const onMouseUp = (e) => { if (e.button === 0) dragging = false; };
  const onMouseMove = (e) => {
    // captured pointer looks; without pointer lock, a left-button drag looks instead
    if (!locked() && !(dragging && lockFailed)) return;
    applyLook(state, e.movementX || 0, e.movementY || 0);
    input.captured = true;
  };
  const onLockChange = () => { if (locked()) input.captured = true; else dragging = false; };
  const onLockError = () => { lockFailed = true; };

  win.addEventListener('keydown', onKeyDown);
  win.addEventListener('keyup', onKeyUp);
  win.addEventListener('blur', onBlur);
  doc.addEventListener('visibilitychange', onVisibility);
  canvas.addEventListener('mousedown', onMouseDown);
  win.addEventListener('mouseup', onMouseUp);
  doc.addEventListener('mousemove', onMouseMove);
  doc.addEventListener('pointerlockchange', onLockChange);
  doc.addEventListener('pointerlockerror', onLockError);

  function dispose() {
    win.removeEventListener('keydown', onKeyDown);
    win.removeEventListener('keyup', onKeyUp);
    win.removeEventListener('blur', onBlur);
    doc.removeEventListener('visibilitychange', onVisibility);
    canvas.removeEventListener('mousedown', onMouseDown);
    win.removeEventListener('mouseup', onMouseUp);
    doc.removeEventListener('mousemove', onMouseMove);
    doc.removeEventListener('pointerlockchange', onLockChange);
    doc.removeEventListener('pointerlockerror', onLockError);
    if (locked()) doc.exitPointerLock();
  }

  return input;
}

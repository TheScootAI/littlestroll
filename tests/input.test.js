import { describe, test, expect } from 'vitest';
import { keyAction, createInputState, applyKey, releaseAll, applyLook, readInput, PITCH_MIN, PITCH_MAX } from '../src/player/input.js';

const press = (s, held, code, repeat = false) => applyKey(s, held, code, true, repeat);
const lift = (s, held, code) => applyKey(s, held, code, false, false);

describe('input', () => {
  test('keys map by physical code, arrows mirror WASD', () => {
    expect(keyAction('KeyW')).toBe('fwd');
    expect(keyAction('ArrowUp')).toBe('fwd');
    expect(keyAction('KeyS')).toBe('back');
    expect(keyAction('ArrowDown')).toBe('back');
    expect(keyAction('KeyA')).toBe('left');
    expect(keyAction('ArrowLeft')).toBe('left');
    expect(keyAction('KeyD')).toBe('right');
    expect(keyAction('ArrowRight')).toBe('right');
    expect(keyAction('ShiftLeft')).toBe('run');
    expect(keyAction('ShiftRight')).toBe('run');
    expect(keyAction('KeyE')).toBe('interact');
    expect(keyAction('KeyQ')).toBe('point');
    expect(keyAction('KeyF')).toBe('shout');
    expect(keyAction('Digit1')).toBe('wave');
    expect(keyAction('KeyZ')).toBe(null);
  });

  test('W is forward (mz +1), D is right (mx +1), opposites cancel', () => {
    const s = createInputState(), held = new Set();
    press(s, held, 'KeyW');
    expect(s.mz).toBe(1); expect(s.mx).toBe(0);
    press(s, held, 'KeyD');
    expect(s.mx).toBe(1);
    press(s, held, 'KeyS');
    expect(s.mz).toBe(0);
    lift(s, held, 'KeyW');
    expect(s.mz).toBe(-1);
    press(s, held, 'KeyA');
    expect(s.mx).toBe(0);
  });

  test('Shift runs, E and Q are held flags', () => {
    const s = createInputState(), held = new Set();
    press(s, held, 'ShiftLeft'); press(s, held, 'KeyE'); press(s, held, 'KeyQ');
    expect(s.run).toBe(true); expect(s.hold).toBe(true); expect(s.q).toBe(true);
    lift(s, held, 'ShiftLeft'); lift(s, held, 'KeyE'); lift(s, held, 'KeyQ');
    expect(s.run).toBe(false); expect(s.hold).toBe(false); expect(s.q).toBe(false);
  });

  test('E, F and 1 count presses, not auto-repeats', () => {
    const s = createInputState(), held = new Set();
    press(s, held, 'KeyE'); press(s, held, 'KeyE', true); press(s, held, 'KeyE', true);
    lift(s, held, 'KeyE'); press(s, held, 'KeyE');
    press(s, held, 'KeyF'); press(s, held, 'KeyF', true);
    press(s, held, 'Digit1'); lift(s, held, 'Digit1'); press(s, held, 'Digit1');
    expect(s.eN).toBe(2); expect(s.shoutN).toBe(1); expect(s.waveN).toBe(2);
  });

  test('releaseAll (window blur) lets go of everything but keeps counters and look', () => {
    const s = createInputState(), held = new Set();
    press(s, held, 'KeyW'); press(s, held, 'KeyD'); press(s, held, 'ShiftLeft');
    press(s, held, 'KeyE'); press(s, held, 'KeyQ');
    applyLook(s, 50, 0);
    const yaw = s.camYaw;
    releaseAll(s, held);
    expect(s).toMatchObject({ mx: 0, mz: 0, run: false, hold: false, q: false, eN: 1, camYaw: yaw });
    expect(held.size).toBe(0);
  });

  test('mouse right turns right (yaw down), mouse up looks up, pitch is clamped', () => {
    const s = createInputState();
    applyLook(s, 100, 0);
    expect(s.camYaw).toBeLessThan(0);
    applyLook(s, 0, -100);
    expect(s.camPitch).toBeGreaterThan(0);
    applyLook(s, 0, -1e6);
    expect(s.camPitch).toBe(PITCH_MAX);
    applyLook(s, 0, 1e6);
    expect(s.camPitch).toBe(PITCH_MIN);
    expect(PITCH_MIN).toBeCloseTo(-1.1, 5);
    expect(PITCH_MAX).toBeCloseTo(1.0, 5);
  });

  test('readInput lays forced fields over state', () => {
    const s = createInputState();
    s.mz = 1;
    expect(readInput({ state: s, forced: null })).toEqual(s);
    const r = readInput({ state: s, forced: { mz: 0, camYaw: 2 } });
    expect(r.mz).toBe(0); expect(r.camYaw).toBe(2); expect(r.mx).toBe(0);
    expect(s.mz).toBe(1);
  });
});

// ---- final review fixes
import { netSnapshot } from '../src/net/protocol.js';
import { createInput } from '../src/player/input.js';

test('C3: the network snapshot carries the forced (pilot) input, counters included', () => {
  const state = createInputState();
  state.eN = 5; state.shoutN = 2; state.waveN = 1;
  const input = { state, forced: { mx: 0, mz: 1, run: true, hold: true, eN: 7, q: true, shoutN: 3, waveN: 4, camYaw: 1, camPitch: 0.5 } };
  const player = { x: 1, y: 2, z: 3, yaw: 0.2, dist: 9 };
  const m = netSnapshot(player, input, 4);
  expect(m).toMatchObject({ t: 'p', x: 1, y: 2, z: 3, eN: 7, hold: true, q: true, shoutN: 3, waveN: 4, ay: 1, ap: 0.5, speed: 4, dist: 9 });
  // without a pilot the live state goes out
  expect(netSnapshot(player, { state, forced: null }, 0)).toMatchObject({ eN: 5, shoutN: 2, waveN: 1, hold: false, q: false });
});

// A minimal fake browser for createInput.
function fakeDom(lockResults) {
  const win = new EventTarget(), doc = new EventTarget(), canvas = new EventTarget();
  doc.defaultView = win; doc.pointerLockElement = null; doc.exitPointerLock = () => {};
  canvas.ownerDocument = doc;
  canvas.requestPointerLock = () => {
    const ok = lockResults.shift();
    if (ok) { doc.pointerLockElement = canvas; doc.dispatchEvent(new Event('pointerlockchange')); return Promise.resolve(); }
    return Promise.reject(new Error('refused'));
  };
  const ev = (type, o) => Object.assign(new Event(type), o);
  return { win, doc, canvas, ev };
}
const settle = () => new Promise((r) => setTimeout(r, 0));

test('M1: a refused pointer lock falls back to drag-look for that click only; the next click retries', async () => {
  const { win, doc, canvas, ev } = fakeDom([false, true]);
  const input = createInput(canvas);
  // click 1: refused -> drag looks
  canvas.dispatchEvent(ev('mousedown', { button: 0 }));
  await settle();
  doc.dispatchEvent(ev('mousemove', { movementX: 100, movementY: 0 }));
  expect(input.state.camYaw).toBeLessThan(0);
  win.dispatchEvent(ev('mouseup', { button: 0 }));
  const yaw = input.state.camYaw;
  doc.dispatchEvent(ev('mousemove', { movementX: 100, movementY: 0 }));   // not dragging: no look
  expect(input.state.camYaw).toBe(yaw);
  // click 2: retried and granted -> the locked pointer looks without a drag
  canvas.dispatchEvent(ev('mousedown', { button: 0 }));
  await settle();
  expect(doc.pointerLockElement).toBe(canvas);
  win.dispatchEvent(ev('mouseup', { button: 0 }));
  doc.dispatchEvent(ev('mousemove', { movementX: 100, movementY: 0 }));
  expect(input.state.camYaw).toBeLessThan(yaw);
  input.dispose();
});

test('M1: a lock refused through pointerlockerror also retries on the next click', async () => {
  const { win, doc, canvas, ev } = fakeDom([]);
  let calls = 0;
  canvas.requestPointerLock = () => { calls++; doc.dispatchEvent(new Event('pointerlockerror')); };   // old-style: no promise
  const input = createInput(canvas);
  canvas.dispatchEvent(ev('mousedown', { button: 0 }));
  doc.dispatchEvent(ev('mousemove', { movementX: 50, movementY: 0 }));
  expect(input.state.camYaw).toBeLessThan(0);
  win.dispatchEvent(ev('mouseup', { button: 0 }));
  canvas.dispatchEvent(ev('mousedown', { button: 0 }));
  expect(calls).toBe(2);
  input.dispose();
});

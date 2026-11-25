import { describe, test, expect } from 'vitest';
import { stickVector, touchZone, attachTouch, blurTyping, STICK_R, STICK_DEAD, STICK_FULL, STICK_RUN, TOUCH_LOOK } from '../src/player/touch.js';
import { createInput, createInputState, createPad, applyKey, applyAction, applyStick, releaseAll } from '../src/player/input.js';
import { touchPrompt, needsUse } from '../src/ui/hud.js';
import { stepPlayer, createPlayer } from '../src/player/controller.js';
import { WALK, RUN } from '../src/config.js';

describe('the stick', () => {
  test('at rest and inside the dead zone it pushes nothing', () => {
    expect(stickVector(0, 0)).toEqual({ mx: 0, mz: 0, run: false, kx: 0, ky: 0 });
    const v = stickVector(STICK_R * STICK_DEAD * 0.9, 0);
    expect(v.mx).toBe(0); expect(v.mz).toBe(0); expect(v.run).toBe(false);
    expect(v.kx).toBeCloseTo(STICK_R * STICK_DEAD * 0.9, 9);   // the knob still follows the thumb
  });

  test('up the screen is forward, right is right, down is back', () => {
    const up = stickVector(0, -STICK_R * 0.8), right = stickVector(STICK_R * 0.8, 0), down = stickVector(0, STICK_R * 0.8);
    expect(up.mz).toBeCloseTo(1, 9); expect(up.mx).toBeCloseTo(0, 9);
    expect(right.mx).toBeCloseTo(1, 9); expect(right.mz).toBeCloseTo(0, 9);
    expect(down.mz).toBeCloseTo(-1, 9);
  });

  test('the push grows from the dead zone to a full walk, and is never longer than 1', () => {
    const half = stickVector(0, -STICK_R * (STICK_DEAD + STICK_FULL) / 2);
    expect(half.mz).toBeCloseTo(0.5, 9);
    for (const [dx, dy] of [[30, 30], [500, -500], [-STICK_R, 0], [3, 4], [1e6, 1]]) {
      const v = stickVector(dx, dy);
      expect(Math.hypot(v.mx, v.mz)).toBeLessThanOrEqual(1 + 1e-9);
    }
    const diag = stickVector(400, -400);
    expect(diag.mx).toBeCloseTo(Math.SQRT1_2, 9); expect(diag.mz).toBeCloseTo(Math.SQRT1_2, 9);
  });

  test('it runs only pushed to the rim; the knob stays on the rim however far the thumb goes', () => {
    expect(stickVector(0, -STICK_R * (STICK_RUN - 0.02)).run).toBe(false);
    expect(stickVector(0, -STICK_R * (STICK_RUN + 0.02)).run).toBe(true);
    const far = stickVector(300, 400);
    expect(far.run).toBe(true);
    expect(Math.hypot(far.kx, far.ky)).toBeCloseTo(STICK_R, 9);
    expect(far.kx).toBeCloseTo(STICK_R * 0.6, 9); expect(far.ky).toBeCloseTo(STICK_R * 0.8, 9);
  });

  test('the left half below the top quarter is the stick; the rest looks', () => {
    expect(touchZone(100, 300, 800, 400)).toBe('stick');
    expect(touchZone(399, 399, 800, 400)).toBe('stick');
    expect(touchZone(401, 300, 800, 400)).toBe('look');
    expect(touchZone(100, 90, 800, 400)).toBe('look');
    expect(touchZone(300, 700, 390, 844)).toBe('look');   // upright: the right half
    expect(touchZone(100, 700, 390, 844)).toBe('stick');
  });
});

describe('the stick and the buttons in the input state', () => {
  test('the stick lies over the keys and the sum is kept to -1..1', () => {
    const s = createInputState(), held = new Set(), pad = createPad();
    applyStick(s, held, pad, 0.4, 0.6, false);
    expect(s.mx).toBeCloseTo(0.4, 9); expect(s.mz).toBeCloseTo(0.6, 9); expect(s.run).toBe(false);
    applyKey(s, held, 'KeyW', true, false, pad);
    expect(s.mz).toBe(1);
    applyKey(s, held, 'KeyW', false, false, pad);
    expect(s.mz).toBeCloseTo(0.6, 9);
    applyStick(s, held, pad, 5, -5, true);
    expect(s.mx).toBe(1); expect(s.mz).toBe(-1); expect(s.run).toBe(true);
    applyStick(s, held, pad, 0, 0, false);
    expect(s).toMatchObject({ mx: 0, mz: 0, run: false });
  });

  test('Shift or a stick at the rim runs; either one alone is enough', () => {
    const s = createInputState(), held = new Set(), pad = createPad();
    applyKey(s, held, 'ShiftLeft', true, false, pad);
    expect(s.run).toBe(true);
    applyStick(s, held, pad, 0, 1, true);
    applyKey(s, held, 'ShiftLeft', false, false, pad);
    expect(s.run).toBe(true);
    applyStick(s, held, pad, 0, 1, false);
    expect(s.run).toBe(false);
  });

  test('a button is its key: Use counts a press and holds, Jump, Shout and Wave count, Point holds', () => {
    const s = createInputState(), held = new Set(), pad = createPad();
    applyAction(s, held, 'interact', true, false, pad);
    expect(s.eN).toBe(1); expect(s.hold).toBe(true);
    applyAction(s, held, 'interact', false, false, pad);
    expect(s.eN).toBe(1); expect(s.hold).toBe(false);
    applyAction(s, held, 'jump', true); applyAction(s, held, 'jump', false);
    applyAction(s, held, 'shout', true); applyAction(s, held, 'shout', false);
    applyAction(s, held, 'wave', true); applyAction(s, held, 'wave', false);
    expect(s).toMatchObject({ jumpN: 1, shoutN: 1, waveN: 1 });
    applyAction(s, held, 'point', true, false, pad);
    expect(s.q).toBe(true);
    applyAction(s, held, 'point', false, false, pad);
    expect(s.q).toBe(false);
  });

  test('releaseAll lets go of the stick too', () => {
    const s = createInputState(), held = new Set(), pad = createPad();
    applyStick(s, held, pad, 0.5, 1, true);
    applyAction(s, held, 'interact', true, false, pad);
    releaseAll(s, held, pad);
    expect(s).toMatchObject({ mx: 0, mz: 0, run: false, hold: false, eN: 1 });
    expect(pad).toEqual({ mx: 0, mz: 0, run: false });
  });

  test('a half-pushed stick walks at half pace; at the rim the walker runs', () => {
    const flat = { hard: [], segments: [], perches: [] };
    const go = (mz, run) => {
      const p = createPlayer(0, 0);
      const x0 = p.x, z0 = p.z;
      for (let i = 0; i < 30; i++) stepPlayer(p, { mx: 0, mz, run, camYaw: 0, jumpN: 0 }, 1 / 60, undefined, null, flat);
      return Math.hypot(p.x - x0, p.z - z0) / 0.5;
    };
    const full = go(1, false);
    expect(full).toBeGreaterThan(WALK * 0.8);            // the ground here lets a walker through
    expect(go(0.5, false)).toBeCloseTo(full / 2, 1);
    expect(go(1, true)).toBeGreaterThan(full * 1.3);
    expect(go(1, true)).toBeLessThanOrEqual(RUN + 1e-6);
  });
});

// A minimal fake browser, as in input.test.js.
function fakeDom({ w = 800, h = 400 } = {}) {
  const win = new EventTarget(), doc = new EventTarget(), canvas = new EventTarget();
  Object.assign(win, { innerWidth: w, innerHeight: h });
  doc.defaultView = win; doc.pointerLockElement = null; doc.exitPointerLock = () => {}; doc.activeElement = null;
  canvas.ownerDocument = doc;
  let locks = 0;
  canvas.requestPointerLock = () => { locks++; return Promise.reject(new Error('refused')); };
  const ev = (type, o) => Object.assign(new Event(type, { cancelable: true }), o);
  const touch = (type, id, x, y) => { const e = ev(type, { pointerType: 'touch', pointerId: id, clientX: x, clientY: y }); canvas.dispatchEvent(e); return e; };
  return { win, doc, canvas, ev, touch, locks: () => locks };
}

describe('touches on the view', () => {
  test('a thumb on the left strolls from where it came down, and stops when it lifts', () => {
    const { canvas, touch } = fakeDom();
    const input = createInput(canvas);
    const drawn = [];
    const t = attachTouch(canvas, input, { onStick: (s) => drawn.push(s) });
    const down = touch('pointerdown', 1, 120, 300);
    expect(down.defaultPrevented).toBe(true);
    expect(drawn.at(-1)).toMatchObject({ ox: 120, oy: 300, kx: 0, ky: 0 });
    expect(input.captured).toBe(false);
    touch('pointermove', 1, 120, 300 - STICK_R * 0.8);
    expect(input.state.mz).toBeCloseTo(1, 9); expect(input.state.mx).toBeCloseTo(0, 9); expect(input.state.run).toBe(false);
    expect(input.captured).toBe(true);   // the start hint can go
    touch('pointermove', 1, 120 + STICK_R * 2, 300);
    expect(input.state.mx).toBeCloseTo(1, 9); expect(input.state.run).toBe(true);
    expect(drawn.at(-1)).toMatchObject({ ox: 120, oy: 300, run: true });
    touch('pointerup', 1, 300, 300);
    expect(input.state).toMatchObject({ mx: 0, mz: 0, run: false });
    expect(drawn.at(-1)).toBe(null);
    t.dispose(); input.dispose();
  });

  test('a drag on the right looks: right turns right, up looks up, and nothing moves', () => {
    const { canvas, touch } = fakeDom();
    const input = createInput(canvas);
    const t = attachTouch(canvas, input);
    const yaw = input.state.camYaw, pitch = input.state.camPitch;
    touch('pointerdown', 7, 600, 200);
    touch('pointermove', 7, 650, 180);
    expect(input.state.camYaw).toBeCloseTo(yaw - 50 * TOUCH_LOOK * 0.0025, 9);
    expect(input.state.camPitch).toBeCloseTo(pitch + 20 * TOUCH_LOOK * 0.0025, 9);
    expect(input.state.mx).toBe(0); expect(input.state.mz).toBe(0);
    touch('pointerup', 7, 650, 180);
    const after = input.state.camYaw;
    touch('pointermove', 7, 700, 180);   // lifted: no more look
    expect(input.state.camYaw).toBe(after);
    t.dispose(); input.dispose();
  });

  test('two thumbs at once: one strolls while the other looks, each by its own finger', () => {
    const { canvas, touch } = fakeDom();
    const input = createInput(canvas);
    const t = attachTouch(canvas, input);
    touch('pointerdown', 1, 100, 300);
    touch('pointerdown', 2, 600, 200);
    touch('pointermove', 1, 100, 300 - STICK_R);
    const yaw = input.state.camYaw;
    touch('pointermove', 2, 640, 200);
    expect(input.state.mz).toBeCloseTo(1, 9);
    expect(input.state.camYaw).toBeLessThan(yaw);
    touch('pointerup', 2, 640, 200);       // the looking thumb lifts: still strolling
    expect(input.state.mz).toBeCloseTo(1, 9);
    touch('pointercancel', 1, 100, 250);   // the browser takes the touch away: the walker stops
    expect(input.state.mz).toBe(0);
    t.dispose(); input.dispose();
  });

  test('a second finger on the left, while the stick is held, looks instead', () => {
    const { canvas, touch } = fakeDom();
    const input = createInput(canvas);
    const t = attachTouch(canvas, input);
    touch('pointerdown', 1, 100, 300);
    touch('pointerdown', 2, 200, 300);
    const yaw = input.state.camYaw;
    touch('pointermove', 2, 260, 300);
    expect(input.state.camYaw).toBeLessThan(yaw);
    expect(input.state.mx).toBe(0);
    t.dispose(); input.dispose();
  });

  test('a mouse or pen is left to the mouse rules', () => {
    const { canvas, ev } = fakeDom();
    const input = createInput(canvas);
    const t = attachTouch(canvas, input);
    const e = ev('pointerdown', { pointerType: 'mouse', pointerId: 1, clientX: 100, clientY: 300 });
    canvas.dispatchEvent(e);
    canvas.dispatchEvent(ev('pointermove', { pointerType: 'mouse', pointerId: 1, clientX: 100, clientY: 200 }));
    expect(e.defaultPrevented).toBe(false);
    expect(input.state.mz).toBe(0);
    t.dispose(); input.dispose();
  });

  test('the mouse click a browser makes up after a tap does not ask for the pointer lock', () => {
    const { canvas, ev, touch, locks } = fakeDom();
    const input = createInput(canvas);
    const t = attachTouch(canvas, input);
    touch('pointerdown', 1, 600, 200);
    touch('pointerup', 1, 600, 200);
    canvas.dispatchEvent(ev('mousedown', { button: 0 }));
    expect(locks()).toBe(0);
    input.touchAt = Date.now() - 5000;   // long after the tap, a real mouse click still locks
    canvas.dispatchEvent(ev('mousedown', { button: 0 }));
    expect(locks()).toBe(1);
    t.dispose(); input.dispose();
  });

  test('a finger on the view closes a text box; the long-press menu is refused only while a finger is down', () => {
    const { doc, canvas, ev, touch } = fakeDom();
    const input = createInput(canvas);
    const t = attachTouch(canvas, input);
    let blurred = 0;
    doc.activeElement = { tagName: 'INPUT', blur: () => { blurred++; } };
    const idle = ev('contextmenu', {});
    canvas.dispatchEvent(idle);
    expect(idle.defaultPrevented).toBe(false);
    touch('pointerdown', 1, 600, 200);
    expect(blurred).toBe(1);
    const held = ev('contextmenu', {});
    canvas.dispatchEvent(held);
    expect(held.defaultPrevented).toBe(true);
    doc.activeElement = { tagName: 'BUTTON', blur: () => { throw new Error('a button keeps its focus'); } };
    blurTyping(doc);
    t.dispose(); input.dispose();
  });

  test('dispose lets go of a held stick', () => {
    const { canvas, touch } = fakeDom();
    const input = createInput(canvas);
    const t = attachTouch(canvas, input);
    touch('pointerdown', 1, 100, 300);
    touch('pointermove', 1, 100, 200);
    t.dispose();
    expect(input.state.mz).toBe(0);
    touch('pointermove', 1, 100, 100);
    expect(input.state.mz).toBe(0);
    input.dispose();
  });

  test('the chat box opening (input.release) stops a walker the stick was moving', () => {
    const { canvas, touch } = fakeDom();
    const input = createInput(canvas);
    const t = attachTouch(canvas, input);
    touch('pointerdown', 1, 100, 300);
    touch('pointermove', 1, 100, 200);
    input.action('interact', true);
    input.release();
    expect(input.state).toMatchObject({ mx: 0, mz: 0, run: false, hold: false, eN: 1 });
    t.dispose(); input.dispose();
  });
});

describe('prompts on touch', () => {
  test('the key becomes the Use button; lines without a key are left alone', () => {
    expect(touchPrompt('E — ring the bell')).toBe('Use — ring the bell');
    expect(touchPrompt('Hold E — turn the crank')).toBe('Hold Use — turn the crank');
    expect(touchPrompt("You can't run with the flame")).toBe("You can't run with the flame");
    expect(touchPrompt(null)).toBe(null);
    expect(needsUse('E — let go')).toBe(true);
    expect(needsUse('Hold E — turn the crank')).toBe(true);
    expect(needsUse("You can't run with the flame")).toBe(false);
    expect(needsUse(null)).toBe(false);
  });
});

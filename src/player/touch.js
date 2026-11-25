// Touch → input state: a thumb on the left of the view is a stick to stroll with, a drag
// anywhere else looks around. The stick and zone rules are pure functions so they can be
// tested without a DOM; attachTouch wires them to the view. The buttons are in ui/touch.js.

export const STICK_R = 50;        // pixels the thumb travels from the stick's centre to its rim
export const STICK_DEAD = 0.16;   // of the travel: a resting thumb does not creep
export const STICK_FULL = 0.72;   // full walking pace from here out
export const STICK_RUN = 0.94;    // pushed to the rim: run
export const TOUCH_LOOK = 2.4;    // a finger's pixel turns the view this many mouse pixels

const REST = { mx: 0, mz: 0, run: false, kx: 0, ky: 0 };

// A thumb (dx, dy) pixels from where it came down (screen y grows downward) → the push on
// the walker (mx right, mz forward, 0..1 long), whether it runs, and where to draw the
// knob (kx, ky: the thumb's offset, kept on the rim).
export function stickVector(dx, dy, r = STICK_R) {
  const len = Math.hypot(dx, dy);
  if (!(len > 0) || !(r > 0)) return { ...REST };
  const t = Math.min(len / r, 1);
  const ux = dx / len, uy = dy / len;
  const m = t <= STICK_DEAD ? 0 : Math.min((t - STICK_DEAD) / (STICK_FULL - STICK_DEAD), 1);
  return { mx: ux * m, mz: 0 - uy * m, run: t >= STICK_RUN, kx: ux * t * r, ky: uy * t * r };   // 0 - …: never -0
}

// Which job a finger landing at (x, y) on a w × h view takes: the left half is the stick,
// below the top quarter (chat and the room code sit up there); the rest looks.
export const touchZone = (x, y, w, h) => (x < w * 0.5 && y > h * 0.25 ? 'stick' : 'look');

const typing = (t) => !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
// A finger on the game takes it back from a text box (the chat box closes when it loses focus).
export function blurTyping(doc) {
  const a = doc.activeElement;
  if (typing(a)) a.blur?.();
}

// Wire the view's touches to an input handle (createInput's). onStick is told where to draw
// the stick: { ox, oy, kx, ky, run } while a thumb is on it, null when it lifts.
export function attachTouch(canvas, input, { onStick = null } = {}) {
  const doc = canvas.ownerDocument;
  const win = doc.defaultView;
  let stick = null;   // { id, ox, oy }: the thumb on the stick and where it came down
  let look = null;    // { id, x, y }: the finger looking and where it was last

  const onDown = (e) => {
    if (e.pointerType !== 'touch') return;
    input.touchAt = Date.now();
    e.preventDefault();   // no made-up mouse click, no long-press menu
    blurTyping(doc);
    const w = win.innerWidth || canvas.clientWidth || 0, h = win.innerHeight || canvas.clientHeight || 0;
    if (!stick && touchZone(e.clientX, e.clientY, w, h) === 'stick') {
      stick = { id: e.pointerId, ox: e.clientX, oy: e.clientY };
      input.stick(0, 0, false);
      onStick?.({ ox: stick.ox, oy: stick.oy, kx: 0, ky: 0, run: false });
    } else if (!look) look = { id: e.pointerId, x: e.clientX, y: e.clientY };
  };
  const onMove = (e) => {
    if (stick && e.pointerId === stick.id) {
      const v = stickVector(e.clientX - stick.ox, e.clientY - stick.oy);
      input.stick(v.mx, v.mz, v.run);
      if (v.mx || v.mz) input.captured = true;
      onStick?.({ ox: stick.ox, oy: stick.oy, kx: v.kx, ky: v.ky, run: v.run });
    } else if (look && e.pointerId === look.id) {
      input.look((e.clientX - look.x) * TOUCH_LOOK, (e.clientY - look.y) * TOUCH_LOOK);
      look.x = e.clientX; look.y = e.clientY;
    }
  };
  const onEnd = (e) => {
    if (e.pointerType === 'touch') input.touchAt = Date.now();
    if (stick && e.pointerId === stick.id) {
      stick = null;
      input.stick(0, 0, false);
      onStick?.(null);
    } else if (look && e.pointerId === look.id) look = null;
  };
  // a thumb resting on the glass is not a long press for the browser's menu
  const noMenu = (e) => { if (stick || look) e.preventDefault(); };

  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerup', onEnd);
  canvas.addEventListener('pointercancel', onEnd);
  canvas.addEventListener('contextmenu', noMenu);

  return {
    dispose() {
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerup', onEnd);
      canvas.removeEventListener('pointercancel', onEnd);
      canvas.removeEventListener('contextmenu', noMenu);
      if (stick) { stick = null; input.stick(0, 0, false); onStick?.(null); }
      look = null;
    },
  };
}

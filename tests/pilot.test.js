// The pilot handle against a stand-in game (no DOM): what it forces on the input, and what it
// leaves to the keyboard.
import { test, expect, describe } from 'vitest';
import { createPilot } from '../src/debug/pilot.js';
import { createInputState, readInput } from '../src/player/input.js';
import { SITES, DYN_NONE, heightAt } from '../src/world/layout.js';

function fakeGame() {
  const [x, z] = SITES.spawn[1];
  const input = { state: createInputState(), forced: null };
  return {
    input, player: { x, y: heightAt(x, z), z, yaw: 0 }, remote: null, dyn: { ...DYN_NONE },
    S: { marsh: { solved: false } }, solved: 0, prompt: null, chat: { items: [] }, idx: 1, say: () => true,
  };
}

describe('the pilot and the keyboard share the walker', () => {
  test('standing still, the pilot forces nothing: the keys still move the walker', () => {
    const g = fakeGame();
    createPilot(g);
    g.input.state.mz = 1; g.input.state.mx = -1; g.input.state.run = true; g.input.state.hold = true;
    expect(readInput(g.input)).toMatchObject({ mz: 1, mx: -1, run: true, hold: true });
  });
  test('while it walks somewhere the pilot steers, and gives the keys back when it stops', () => {
    const g = fakeGame();
    const p = createPilot(g);
    g.input.state.mx = 1;                               // a key held the other way
    p.goTo(0, 115, { run: true });
    p._tick(0.016);
    const r = readInput(g.input);
    expect(r.mx).toBe(0);
    expect(r.mz).toBe(1);
    expect(p.state().busy).toBe(true);
    p.stop();
    expect(readInput(g.input)).toMatchObject({ mx: 1, mz: 0 });
    expect(p.state().busy).toBe(false);
  });
  test('state() says how many finds there are and which this walker wears; no finds array is zero and nothing', () => {
    const g = fakeGame();
    const p = createPilot(g);
    expect(p.state()).toMatchObject({ finds: 0, wearing: [] });
    expect(p.state()).not.toHaveProperty('owls');
    g.S.finds = [0, 1, -1, 1, -1, -1, 0, -1, -1, 1];   // this fake walker is the joiner (idx 1)
    expect(p.state()).toMatchObject({ finds: 5, wearing: ['boots', 'jacket', 'pirate hat'] });
  });
  test('press, shout and wave count on top of the keyboard\'s own', () => {
    const g = fakeGame();
    const p = createPilot(g);
    g.input.state.eN = 4; g.input.state.shoutN = 2; g.input.state.waveN = 1;
    p.press(); p.press(); p.shout(); p.wave();
    expect(readInput(g.input)).toMatchObject({ eN: 6, shoutN: 3, waveN: 2 });
    g.input.state.eN++;                                 // the E key itself
    expect(readInput(g.input).eN).toBe(7);
  });
  test('hold and point: the pilot can hold them down; letting go leaves the keys in charge', () => {
    const g = fakeGame();
    const p = createPilot(g);
    p.hold(true); p.point(true);
    expect(readInput(g.input)).toMatchObject({ hold: true, q: true });
    p.hold(false); p.point(false);
    expect(readInput(g.input)).toMatchObject({ hold: false, q: false });
    g.input.state.hold = true; g.input.state.q = true;
    expect(readInput(g.input)).toMatchObject({ hold: true, q: true });
  });
  test('look turns the view the keyboard and mouse also use', () => {
    const g = fakeGame();
    const p = createPilot(g);
    p.look(1.25, -0.2);
    expect(readInput(g.input)).toMatchObject({ camYaw: 1.25, camPitch: -0.2 });
    g.input.state.camYaw = 0.5;                         // the mouse moved it
    expect(readInput(g.input).camYaw).toBe(0.5);
  });
});

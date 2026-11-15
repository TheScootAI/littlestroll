import { test, expect, describe, vi } from 'vitest';
import { parse, runCommand, describeState, yawFromBearing, bearingOf, compass } from '../src/debug/command.js';

const SITES = { gate: { plateA: [0, 110], plateB: [0, 87], door: { ax: -2.5, az: 97, bx: 2.5, bz: 97 } }, marsh: { plate: { x: 102.5, z: -56, r: 1.5 } }, spawn: [[-1.5, 124], [1.5, 124]] };
const STATE = { me: { x: 1.5, y: 1, z: 124, yaw: 0, zone: 'A' }, friend: { x: 1.5, y: 1, z: 114 }, solved: 3, owls: 1, prompt: 'E — ring the bell', ended: null, busy: false, chatN: 0 };

function fake(over = {}) {
  let done;
  const p = {
    goTo: vi.fn(() => new Promise((res) => { done = res; })),
    follow: vi.fn(), stop: vi.fn(), press: vi.fn(), hold: vi.fn(), look: vi.fn(), point: vi.fn(), shout: vi.fn(), wave: vi.fn(), jump: vi.fn(),
    say: vi.fn(() => true), state: vi.fn(() => STATE), sites: () => SITES,
    pillar: vi.fn(() => [149.7, -55.2]), tile: vi.fn(() => [111.2, -60.8]),
    ...over,
  };
  const said = [];
  return { p, said, emit: (t) => said.push(t), finish: (r) => done(r) };
}
const run = (line, f) => runCommand(line, { pilot: f.p, emit: f.emit });

describe('pilot commands: reading a typed line', () => {
  test('parse: name in lower case, arguments, and the rest of the line as typed', () => {
    expect(parse('  GoTo 0  110 walk ')).toEqual({ name: 'goto', args: ['0', '110', 'walk'], rest: '0  110 walk' });
    expect(parse('say Hello There')).toEqual({ name: 'say', args: ['Hello', 'There'], rest: 'Hello There' });
    expect(parse('   ')).toBeNull();
    expect(parse(7)).toBeNull();
  });
  test('compass: bearings are degrees clockwise from north, yaw 0 faces north (−z)', () => {
    expect(yawFromBearing(0)).toBeCloseTo(0);
    expect(yawFromBearing(90)).toBeCloseTo(-Math.PI / 2);   // east is +x
    expect(bearingOf(1, 0)).toBeCloseTo(90);                // +x is east
    expect(bearingOf(0, -1)).toBeCloseTo(0);                // −z is north
    expect(bearingOf(0, 1)).toBeCloseTo(180);
    expect(bearingOf(-1, 0)).toBeCloseTo(270);
    expect([0, 44, 46, 90, 180, 270, 359].map(compass)).toEqual(['N', 'NE', 'NE', 'E', 'S', 'W', 'N']);
  });
});

describe('pilot commands: what each one does', () => {
  test('help names every command', () => {
    const t = run('help', fake());
    for (const w of ['goto', 'follow', 'stop', 'press', 'hold', 'look', 'say', 'where', 'sites', 'point', 'shout', 'wave', 'jump']) expect(t).toContain(w);
  });
  test('goto x z walks there at a run and reports when it arrives', async () => {
    const f = fake();
    expect(run('goto 0 110', f)).toBe('walking to (0, 110)…');
    expect(f.p.goTo).toHaveBeenCalledWith(0, 110, { run: true, within: 0.4, timeoutMs: 60000 });
    f.finish({ arrived: true, x: 0.1, z: 110.2 });
    await Promise.resolve(); await Promise.resolve();
    expect(f.said).toEqual(['arrived at (0.1, 110.2)']);
  });
  test('goto ... walk does not run; a failure says why and where it stopped', async () => {
    const f = fake();
    run('goto 0 87 walk', f);
    expect(f.p.goTo).toHaveBeenCalledWith(0, 87, { run: false, within: 0.4, timeoutMs: 60000 });
    f.finish({ arrived: false, reason: 'no-path', x: 0, z: 110 });
    await Promise.resolve(); await Promise.resolve();
    expect(f.said).toEqual(['did not get there (no path): stopped at (0, 110)']);
  });
  test('goto a named place from the sites', () => {
    const f = fake();
    expect(run('goto gate.plateA', f)).toBe('walking to gate.plateA (0, 110)…');
    expect(f.p.goTo).toHaveBeenCalledWith(0, 110, expect.any(Object));
    run('goto marsh.plate', f);
    expect(f.p.goTo).toHaveBeenLastCalledWith(102.5, -56, expect.any(Object));
    run('goto spawn.1', f);
    expect(f.p.goTo).toHaveBeenLastCalledWith(1.5, 124, expect.any(Object));
  });
  test('goto with nothing usable explains itself and moves nobody', () => {
    const f = fake();
    for (const line of ['goto', 'goto 5', 'goto x y', 'goto gate.nothing', 'goto gate', 'goto gate.door']) {
      expect(run(line, f)).toMatch(/^usage|^unknown place/);
    }
    expect(f.p.goTo).not.toHaveBeenCalled();
  });
  test('press, hold, stop, follow, point, shout, wave', () => {
    const f = fake();
    expect(run('press', f)).toBe('pressed E'); expect(f.p.press).toHaveBeenCalledTimes(1);
    expect(run('e', f)).toBe('pressed E'); expect(f.p.press).toHaveBeenCalledTimes(2);
    expect(run('hold on', f)).toBe('holding E'); expect(f.p.hold).toHaveBeenLastCalledWith(true);
    expect(run('hold off', f)).toBe('let go of E'); expect(f.p.hold).toHaveBeenLastCalledWith(false);
    expect(run('hold', f)).toMatch(/^usage/);
    expect(run('stop', f)).toBe('stopped'); expect(f.p.stop).toHaveBeenCalled();
    expect(run('follow', f)).toBe('following your friend (within 2.5 m)'); expect(f.p.follow).toHaveBeenLastCalledWith(2.5);
    run('follow 4', f); expect(f.p.follow).toHaveBeenLastCalledWith(4);
    expect(run('point on', f)).toBe('pointing'); expect(f.p.point).toHaveBeenLastCalledWith(true);
    expect(run('point off', f)).toBe('stopped pointing');
    expect(run('shout', f)).toBe('shouted'); expect(f.p.shout).toHaveBeenCalled();
    expect(run('wave', f)).toBe('waved'); expect(f.p.wave).toHaveBeenCalled();
    expect(run('jump', f)).toBe('jumped'); expect(f.p.jump).toHaveBeenCalled();
  });
  test('look: a compass point, a bearing in degrees with an optional tilt, or the friend', () => {
    const f = fake();
    run('look e', f);
    expect(f.p.look.mock.calls.at(-1)[0]).toBeCloseTo(-Math.PI / 2);
    run('look 180 -20', f);
    expect(f.p.look.mock.calls.at(-1)[0]).toBeCloseTo(yawFromBearing(180));
    expect(f.p.look.mock.calls.at(-1)[1]).toBeCloseTo(-20 * Math.PI / 180);
    expect(run('look friend', f)).toBe('looking N');          // the friend is 10 m north
    expect(f.p.look.mock.calls.at(-1)[0]).toBeCloseTo(0);
    expect(run('look up', f)).toMatch(/^usage/);
  });
  test('say sends the rest of the line as typed', () => {
    const f = fake();
    expect(run('say Hello There, friend', f)).toBe('said: Hello There, friend');
    expect(f.p.say).toHaveBeenCalledWith('Hello There, friend');
    expect(run('say', f)).toMatch(/^usage/);
    const g = fake({ say: vi.fn(() => false) });
    expect(run('say hi', g)).toBe('not sent (is your friend connected?)');
  });
  test('sites lists the names; sites <name> gives its places, rounded', () => {
    const f = fake();
    expect(run('sites', f)).toContain('gate');
    const t = run('sites gate', f);
    expect(t).toContain('plateA (0, 110)');
    expect(t).toContain('plateB (0, 87)');
    expect(run('sites nope', f)).toMatch(/^unknown/);
  });
  test('where describes the walker, the friend and the walk so far', () => {
    const t = run('where', fake());
    expect(t).toBe(describeState(STATE));
    expect(t).toContain('You (1.5, 124) on A');
    expect(t).toContain('friend 10 m N');
    expect(t).toContain('solved 3');
    expect(t).toContain('owls 1');
    expect(t).toContain('E — ring the bell');
    expect(describeState({ ...STATE, friend: null, busy: true, prompt: null })).toContain('no friend');
    expect(describeState({ ...STATE, busy: true })).toContain('moving');
    expect(describeState(null)).toBe('no state yet');
  });
  test('pillar and tile give coordinates', () => {
    const f = fake();
    expect(run('pillar 0 0', f)).toBe('pillar 0 0 is at (149.7, -55.2)');
    expect(run('tile 7', f)).toBe('tile 7 is at (111.2, -60.8)');
    expect(run('pillar', f)).toMatch(/^usage/);
  });
  test('anything else, and anything that throws, answers in words', () => {
    expect(run('dance', fake())).toBe('unknown command "dance" — type help');
    expect(run('', fake())).toBe('');
    const f = fake({ press: () => { throw new Error('x'); } });
    expect(run('press', f)).toMatch(/^could not/);
  });
});

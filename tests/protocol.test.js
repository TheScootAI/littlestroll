import { describe, test, expect } from 'vitest';
import { encode, decode, shouldAccept, accepts, toPIn, snapshot, PROTOCOL_V, MAX_BYTES } from '../src/net/protocol.js';

const P = { t: 'p', x: 1, y: 2, z: 3, yaw: 0.5, ay: 0.1, ap: -0.2, speed: 3.2, hold: true, eN: 4, q: false, shoutN: 1, waveN: 0, dist: 12.5 };

describe('protocol', () => {
  test('round-trips every message type', () => {
    expect(decode(encode(P))).toEqual(P);
    expect(decode(encode({ t: 'hello', v: 1 }))).toEqual({ t: 'hello', v: 1 });
    const w = { t: 'welcome', v: 1, seed: 12345, solved: 2 };
    expect(decode(encode(w))).toEqual(w);
    expect(decode(encode({ t: 'full' }))).toEqual({ t: 'full' });
    const s = { t: 's', S: { time: 1, gate: { a: 1 } } };
    expect(decode(encode(s))).toEqual(s);
    expect(PROTOCOL_V).toBe(1);
    expect(MAX_BYTES).toBe(16384);
  });

  test('drops anything malformed without throwing', () => {
    const bad = ['', 'not json', '[]', 'null', '{"t":"zap"}', '{"t":"p","x":"1"}',
      JSON.stringify({ t: 'p', x: 1e400 }), JSON.stringify({ t: 'p', x: null, y: 0, z: 0 }),
      JSON.stringify({ t: 'hello', v: 2 }), 'x'.repeat(20000),
      JSON.stringify({ t: 'welcome', v: 2, seed: 1, solved: 0 }),
      JSON.stringify({ t: 'welcome', v: 1, seed: 1.5, solved: 0 }),
      JSON.stringify({ t: 'welcome', v: 1, seed: 1, solved: 6 }),
      JSON.stringify({ t: 's', S: [] }), JSON.stringify({ t: 's', S: null }),
      JSON.stringify({ ...P, hold: 1 }), JSON.stringify({ ...P, eN: -1 }), JSON.stringify({ ...P, eN: 1.5 }),
      JSON.stringify({ ...P, q: 'no' })];
    for (const b of bad) expect(decode(b)).toBeNull();
    for (const b of [undefined, null, 5, {}, []]) expect(decode(b)).toBeNull();
  });

  test('a message too big is dropped even if valid', () => {
    const s = JSON.stringify({ t: 's', S: { pad: 'x'.repeat(MAX_BYTES) } });
    expect(decode(s)).toBeNull();
  });

  test('unknown extra fields are dropped', () => {
    const m = decode(JSON.stringify({ ...P, evil: 'x' }));
    expect(m).toEqual(P);
    expect(decode(JSON.stringify({ t: 'full', extra: 1 }))).toEqual({ t: 'full' });
  });

  test('a walk takes one partner', () => {
    expect(shouldAccept(false)).toBe(true);
    expect(shouldAccept(true)).toBe(false);
  });

  test('toPIn', () => {
    expect(toPIn(null, 0).present).toBe(false);
    const a = toPIn({ x: 1, y: 2, z: 3, ay: 0, ap: 0, hold: true, eN: 5 }, 4);
    expect(a).toMatchObject({ present: true, x: 1, y: 2, z: 3, hold: true, pressed: true });
    expect(a.aim[2]).toBeCloseTo(-1);
    expect(toPIn({ x: 1, y: 2, z: 3, ay: 0, ap: 0, hold: false, eN: 5 }, 5).pressed).toBe(false);
  });

  test('snapshot builds a valid p message', () => {
    const player = { x: 1, y: 2, z: 3, yaw: 0.5, dist: 12.5 };
    const inp = { camYaw: 0.1, camPitch: -0.2, hold: true, eN: 4, q: false, shoutN: 1, waveN: 0 };
    expect(snapshot(player, inp, 3.2)).toEqual(P);
    expect(decode(encode(snapshot(player, inp, 3.2)))).toEqual(P);
  });

  test('accepts: who acts on what', () => {
    const types = ['hello', 'welcome', 'full', 'p', 's'];
    const table = {
      'host/false': ['hello'],
      'host/true': ['p'],
      'join/false': ['welcome', 'full'],
      'join/true': ['p', 's'],
    };
    for (const role of ['host', 'join']) for (const done of [false, true]) {
      for (const t of types) {
        expect(accepts(role, done, t), `${role} ${done} ${t}`).toBe(table[`${role}/${done}`].includes(t));
      }
    }
    expect(accepts('host', true, 'nonsense')).toBe(false);
  });

  test('out-of-range p messages are dropped, in-range ones kept', () => {
    const bad = [{ x: 1e300 }, { x: 10001 }, { y: -10001 }, { z: 1e5 }, { yaw: 101 }, { ay: -101 }, { ap: 1e300 },
      { speed: 51 }, { speed: -1 }, { dist: 1e7 + 1 }, { dist: -1 }, { eN: 1e9 + 1 }, { shoutN: 2e9 }, { waveN: 1e10 }];
    for (const o of bad) expect(decode(JSON.stringify({ ...P, ...o })), JSON.stringify(o)).toBeNull();
    const edge = { ...P, x: 10000, y: -10000, z: 10000, yaw: -100, ay: 100, ap: 100, speed: 50, dist: 1e7, eN: 1e9, shoutN: 1e9, waveN: 1e9 };
    expect(decode(JSON.stringify(edge))).toEqual(edge);
    expect(decode(JSON.stringify({ t: 'welcome', v: 1, seed: 2 ** 53, solved: 0 }))).toBeNull();
    expect(decode(JSON.stringify({ t: 'welcome', v: 1, seed: 2 ** 53 - 1, solved: 0 }))).not.toBeNull();
  });
});

import { pressTracker } from '../src/net/protocol.js';
describe('pressTracker', () => {
  test('the first value is a baseline, a change is a press, the same value is not', () => {
    const t = pressTracker();
    expect(t.seen(7)).toBe(false);
    expect(t.seen(7)).toBe(false);
    expect(t.seen(8)).toBe(true);
    expect(t.seen(8)).toBe(false);
  });
  test('after reset the next value is a new baseline (a rejoining friend restarts at 0)', () => {
    const t = pressTracker();
    t.seen(5); t.reset();
    expect(t.seen(0)).toBe(false);
    expect(t.seen(1)).toBe(true);
  });
});

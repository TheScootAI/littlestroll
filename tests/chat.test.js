import { describe, test, expect } from 'vitest';
import { clean, createLog, addLine, since, createGate, MAX_LEN, KEEP } from '../src/core/chat.js';

describe('clean', () => {
  test('non-strings become empty', () => {
    for (const v of [null, undefined, 5, {}, [], true]) expect(clean(v)).toBe('');
  });
  test('control characters become spaces', () => {
    expect(clean('a\u0000b\u001fc\u007fd\u009fe')).toBe('a b c d e');
    expect(clean('a b c')).toBe('a b c');
  });
  test('newlines and tabs collapse', () => {
    expect(clean('hi\n\n  there\t\tyou\r\n')).toBe('hi there you');
  });
  test('bidi overrides and isolates are removed', () => {
    expect(clean('a‮b‪c‭d⁦e⁩f')).toBe('a b c d e f');
  });
  test('trims', () => { expect(clean('   hey  ')).toBe('hey'); });
  test('all-whitespace is empty', () => { expect(clean(' \n\t  ')).toBe(''); });
  test('cuts to MAX_LEN code points', () => {
    expect(MAX_LEN).toBe(200);
    expect(clean('x'.repeat(300))).toBe('x'.repeat(200));
  });
  test('never splits a surrogate pair at the cut', () => {
    const s = 'x'.repeat(199) + '😀' + 'tail';
    const out = clean(s);
    expect(out).toBe('x'.repeat(199) + '😀');
    expect([...out].length).toBe(200);
    expect(out.length).toBe(201);
  });
});

describe('log', () => {
  test('ids rise and items carry from/text/at', () => {
    const log = createLog();
    const a = addLine(log, 0, 'one', 10), b = addLine(log, 'system', 'two', 20);
    expect(a).toEqual({ id: 1, from: 0, text: 'one', at: 10 });
    expect(b.id).toBe(2);
    expect(log.items).toHaveLength(2);
  });
  test('keeps only KEEP lines; ids are never reused', () => {
    expect(KEEP).toBe(50);
    const log = createLog();
    for (let i = 0; i < KEEP + 5; i++) addLine(log, 1, `m${i}`, i);
    expect(log.items).toHaveLength(KEEP);
    expect(log.items[0].id).toBe(6);
    expect(addLine(log, 1, 'next', 0).id).toBe(KEEP + 6);
  });
  test('since returns newer items oldest first', () => {
    const log = createLog();
    for (let i = 0; i < 4; i++) addLine(log, 0, `m${i}`, i);
    expect(since(log).map((x) => x.id)).toEqual([1, 2, 3, 4]);
    expect(since(log, 2).map((x) => x.id)).toEqual([3, 4]);
    expect(since(log, 4)).toEqual([]);
  });
});

describe('gate', () => {
  test('allows burst at once, refuses the next', () => {
    const g = createGate();
    for (let i = 0; i < 5; i++) expect(g.allow(0)).toBe(true);
    expect(g.allow(0)).toBe(false);
  });
  test('refills one per everyMs', () => {
    const g = createGate();
    for (let i = 0; i < 5; i++) g.allow(0);
    expect(g.allow(999)).toBe(false);
    expect(g.allow(1000)).toBe(true);
    expect(g.allow(1000)).toBe(false);
  });
  test('never banks more than burst', () => {
    const g = createGate();
    g.allow(0);
    for (let i = 0; i < 5; i++) expect(g.allow(1e6)).toBe(true);
    expect(g.allow(1e6)).toBe(false);
  });
});

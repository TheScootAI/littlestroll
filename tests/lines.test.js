import { test, expect, vi, beforeEach, afterEach } from 'vitest';
import { createLineQueue } from '../src/core/lines.js';

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(0); });
afterEach(() => { vi.useRealTimers(); });

const make = () => { const shown = []; return { shown, q: createLineQueue((line) => shown.push([Date.now(), line]), 3200) }; };

test('a line shows at once when nothing is in the way', () => {
  const { shown, q } = make();
  q.push('a');
  expect(shown).toEqual([[0, 'a']]);
});

test('lines pushed together show one after the other, a gap apart', () => {
  const { shown, q } = make();
  q.push('a'); q.push('b'); q.push('c');
  expect(shown).toEqual([[0, 'a']]);
  vi.advanceTimersByTime(3200);
  expect(shown).toEqual([[0, 'a'], [3200, 'b']]);
  vi.advanceTimersByTime(3200);
  expect(shown).toEqual([[0, 'a'], [3200, 'b'], [6400, 'c']]);
});

test('a line can be held back (something else is on screen), and later lines queue behind it', () => {
  const { shown, q } = make();
  q.push('a', 3200);
  expect(shown).toEqual([]);
  vi.advanceTimersByTime(1000);
  q.push('b');
  vi.advanceTimersByTime(2200);
  expect(shown).toEqual([[3200, 'a']]);
  vi.advanceTimersByTime(3200);
  expect(shown).toEqual([[3200, 'a'], [6400, 'b']]);
});

test('once the gap has passed, the next line shows at once again', () => {
  const { shown, q } = make();
  q.push('a');
  vi.advanceTimersByTime(5000);
  q.push('b');
  expect(shown).toEqual([[0, 'a'], [5000, 'b']]);
});

test('clear drops everything waiting and frees the queue', () => {
  const { shown, q } = make();
  q.push('a'); q.push('b'); q.push('c');
  q.clear();
  vi.advanceTimersByTime(20000);
  expect(shown).toEqual([[0, 'a']]);
  q.push('d');                                   // not held behind lines that will never show
  expect(shown).toEqual([[0, 'a'], [20000, 'd']]);
});

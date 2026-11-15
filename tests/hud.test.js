import { test, expect } from 'vitest';
import { fmtTime, findsLine } from '../src/ui/hud.js';

test('fmtTime: m:ss', () => {
  expect(fmtTime(0)).toBe('0:00');
  expect(fmtTime(75)).toBe('1:15');
  expect(fmtTime(-3)).toBe('0:00');
});

test('findsLine: "you N · your friend M · of T" from three whole numbers, anything else omitted', () => {
  expect(findsLine([4, 3, 10])).toBe('you 4 · your friend 3 · of 10');
  expect(findsLine([0, 0, 10])).toBe('you 0 · your friend 0 · of 10');
  for (const v of [[NaN, 3, 10], [4, Infinity, 10], [-1, 3, 10], [4, 3, -10], [1.5, 3, 10], ['4', 3, 10], [4, 3], [4, 3, 10, 1], [], undefined, null, 'x', 5, {}]) expect(findsLine(v)).toBeNull();
});

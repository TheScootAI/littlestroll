import { test, expect } from 'vitest';
import { fmtTime, owlsLine } from '../src/ui/hud.js';

test('fmtTime: m:ss', () => {
  expect(fmtTime(0)).toBe('0:00');
  expect(fmtTime(75)).toBe('1:15');
  expect(fmtTime(-3)).toBe('0:00');
});

test('owlsLine: "N of M" from an array of two, bad numbers shown as 0, anything else omitted', () => {
  expect(owlsLine([5, 8])).toBe('5 of 8');
  expect(owlsLine([NaN, 8])).toBe('0 of 8');
  expect(owlsLine([3, Infinity])).toBe('3 of 0');
  expect(owlsLine([-2, 8])).toBe('0 of 8');
  expect(owlsLine([3, -1])).toBe('3 of 0');
  expect(owlsLine(['3', 8])).toBe('0 of 8');
  for (const v of [undefined, null, [1], [1, 2, 3], 'x', 5, {}]) expect(owlsLine(v)).toBeNull();
});

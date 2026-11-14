import { test, expect } from 'vitest';
import { endingProgress, END_SECS, END_CARD } from '../src/core/ending.js';

test('endingProgress: 0 at the start, 1 once the ease time has passed, card at END_CARD', () => {
  expect(endingProgress(0)).toEqual({ k: 0, card: false });
  expect(endingProgress(END_SECS / 2).k).toBeCloseTo(0.5, 6);
  expect(endingProgress(END_SECS).k).toBe(1);
  expect(endingProgress(END_SECS + 100).k).toBe(1);
  expect(endingProgress(END_CARD - 0.01).card).toBe(false);
  expect(endingProgress(END_CARD).card).toBe(true);
  expect(endingProgress(-3)).toEqual({ k: 0, card: false });
  expect(endingProgress(NaN)).toEqual({ k: 0, card: false });
});

test('the card is due at the same real time however many updates ran (wall clock, no per-update dt)', () => {
  const start = 1000;
  for (const updates of [1, 3, 44, 600]) {
    let shownAt = null;
    const step = (END_CARD * 1000 + 50) / updates;
    for (let i = 1; i <= updates; i++) {
      const now = start + i * step;
      if (shownAt === null && endingProgress((now - start) / 1000).card) shownAt = now - start;
    }
    expect(shownAt).toBeLessThanOrEqual(END_CARD * 1000 + 51);
    expect(shownAt).toBeGreaterThanOrEqual(END_CARD * 1000);
  }
});

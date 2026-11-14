import { test, expect } from 'vitest';
import { tickerDrives, FRAME_GAP_MS } from '../src/core/ticker.js';

test('C4: the ticker drives movement only for a pilot whose frames have stopped for 150 ms', () => {
  expect(FRAME_GAP_MS).toBe(150);
  expect(tickerDrives(true, 1000, 900)).toBe(false);     // frames running
  expect(tickerDrives(true, 1000, 850)).toBe(true);      // 150 ms with no frame
  expect(tickerDrives(true, 10000, 0)).toBe(true);
  expect(tickerDrives(false, 10000, 0)).toBe(false);     // no pilot: never
  expect(tickerDrives(true, 1000, null)).toBe(false);    // the loop has not started yet
});

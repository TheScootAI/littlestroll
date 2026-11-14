import { describe, it, expect } from 'vitest';
import { retryDelay, shouldReplacePartner, isSilent, SILENCE_MS, RETRY_TOTAL_MS } from '../src/net/reconnect.js';

describe('retryDelay', () => {
  it('first retry after 1 s', () => expect(retryDelay(0, 0)).toBe(1000));
  it('then every 2 s', () => {
    expect(retryDelay(1, 1000)).toBe(2000);
    expect(retryDelay(5, 11000)).toBe(2000);
  });
  it('gives up when the next retry would fall past 30 s', () => {
    expect(retryDelay(14, 28000)).toBe(2000);
    expect(retryDelay(15, 29000)).toBeNull();
    expect(retryDelay(20, RETRY_TOTAL_MS)).toBeNull();
    expect(retryDelay(3, 45000)).toBeNull();
  });
  it('a full schedule ends within the budget', () => {
    let attempt = 0, t = 0, d;
    while ((d = retryDelay(attempt, t)) !== null) { t += d; attempt++; }
    expect(t).toBeLessThanOrEqual(30000);
    expect(t).toBeGreaterThan(26000);
    expect(attempt).toBeGreaterThan(10);
  });
});

describe('shouldReplacePartner', () => {
  it('a partner heard from recently keeps the slot', () => {
    expect(shouldReplacePartner(0)).toBe(false);
    expect(shouldReplacePartner(1500)).toBe(false);
  });
  it('a partner silent for more than 1.5 s is replaced', () => {
    expect(shouldReplacePartner(1501)).toBe(true);
    expect(shouldReplacePartner(7000)).toBe(true);
  });
});

describe('isSilent', () => {
  it('compares now - lastRx with the limit', () => {
    expect(isSilent(10000, 2000, 8000)).toBe(false);
    expect(isSilent(10001, 2000, 8000)).toBe(true);
  });
  it('the shared silence limit is 8 s', () => expect(SILENCE_MS).toBe(8000));
});

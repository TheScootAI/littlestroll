import { test, expect } from 'vitest';
import { makeCode, normalizeCode, peerIdFor } from '../src/net/code.js';

test('makeCode is five letters from the alphabet', () => {
  for (let i = 0; i < 200; i++) expect(makeCode()).toMatch(/^[ABCDEFGHJKMNPQRSTUVWXYZ]{5}$/);
});
test('normalizeCode tidies what people type', () => {
  expect(normalizeCode(' abcde ')).toBe('ABCDE');
  expect(normalizeCode('ab c de')).toBe('ABCDE');
});
test('normalizeCode refuses bad codes', () => {
  for (const bad of ['', 'ABCD', 'ABCDEF', 'ABCD1', 'ABCDI', 'ABCDO', 'ABCDL', null, undefined])
    expect(normalizeCode(bad)).toBeNull();
});
test('peerIdFor', () => expect(peerIdFor('ABCDE')).toBe('littlerun-ABCDE'));

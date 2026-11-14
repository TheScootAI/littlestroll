import { test, expect, describe } from 'vitest';
import { riffNotes, RIFF_STEPS } from '../src/core/riff.js';

const end = (notes) => Math.max(...notes.map((n) => n.at + n.dur));
const lead = (notes) => notes.filter((n) => n.voice === 'lead');

describe('the solved riff', () => {
  test('every puzzle gets playable notes: finite, in order, in a comfortable range', () => {
    for (let n = 0; n < RIFF_STEPS.length; n++) {
      const notes = riffNotes(n);
      expect(notes.length).toBeGreaterThanOrEqual(8);
      for (const k of notes) {
        for (const v of [k.f, k.at, k.dur, k.vol]) expect(Number.isFinite(v)).toBe(true);
        expect(k.f).toBeGreaterThan(60);
        expect(k.f).toBeLessThan(2200);
        expect(k.at).toBeGreaterThanOrEqual(0);
        expect(k.dur).toBeGreaterThan(0);
        expect(k.vol).toBeGreaterThan(0);
        expect(k.vol).toBeLessThanOrEqual(0.4);
        expect(['lead', 'bass']).toContain(k.voice);
      }
      const at = notes.map((k) => k.at);
      expect(at).toEqual([...at].sort((a, b) => a - b));
    }
  });
  test('it is a riff, not a chime: a tune with a bass under it, over in about a second and a half', () => {
    const notes = riffNotes(0);
    expect(lead(notes).length).toBeGreaterThanOrEqual(7);
    expect(new Set(lead(notes).map((k) => k.f)).size).toBeGreaterThanOrEqual(4);
    expect(notes.some((k) => k.voice === 'bass')).toBe(true);
    expect(end(notes)).toBeGreaterThan(1);
    expect(end(notes)).toBeLessThan(1.8);
  });
  test('each puzzle plays it a step higher than the one before', () => {
    for (let n = 1; n < RIFF_STEPS.length; n++) {
      expect(riffNotes(n)[0].f).toBeGreaterThan(riffNotes(n - 1)[0].f);
      // the same tune: every note moved by the same ratio
      const a = riffNotes(n - 1), b = riffNotes(n), ratio = b[0].f / a[0].f;
      expect(b.length).toBe(a.length);
      b.forEach((k, i) => { expect(k.f / a[i].f).toBeCloseTo(ratio, 6); expect(k.at).toBe(a[i].at); });
    }
  });
  test('there is a step for each of the eleven puzzles', () => {
    expect(RIFF_STEPS.length).toBe(11);
  });
  test('the last puzzle gets the riff and then a longer flourish', () => {
    const plain = riffNotes(10), final = riffNotes(10, true);
    // the tune up to its last held note is untouched
    const held = Math.max(...plain.map((k) => k.at));
    const before = (notes) => notes.filter((k) => k.at < held);
    expect(before(plain).length).toBeGreaterThanOrEqual(7);
    expect(final.slice(0, before(plain).length)).toEqual(before(plain));
    expect(final.length).toBeGreaterThan(plain.length + 3);
    expect(end(final)).toBeGreaterThan(end(plain) + 1);
    expect(end(final)).toBeLessThan(5);
  });
  test('a number out of range never throws: it is held to the nearest step', () => {
    expect(riffNotes(-3)).toEqual(riffNotes(0));
    expect(riffNotes(99)).toEqual(riffNotes(10));
    expect(riffNotes(NaN)).toEqual(riffNotes(0));
    expect(riffNotes(undefined)).toEqual(riffNotes(0));
    expect(riffNotes(2.7)).toEqual(riffNotes(2));
  });
});

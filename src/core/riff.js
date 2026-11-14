// The riff played when a puzzle is solved: a short bouncy tune over a bass, the same tune each
// time but a scale step higher for each puzzle along the trail, with a longer flourish after
// the last one. Pure: it only says which notes to play; src/audio.js plays them.

// Semitones above the first puzzle's key, one entry per puzzle in trail order: up a major scale.
export const RIFF_STEPS = [0, 2, 4, 5, 7, 9, 11, 12, 14, 16, 17];

const ROOT = 261.63;          // C4: the first puzzle's key note
const BEAT = 0.1;             // seconds per sixteenth
const hz = (semi) => ROOT * 2 ** (semi / 12);

// [sixteenth it starts on, semitones above the key note, length in sixteenths]
const TUNE = [[0, 0, 1.6], [1, 4, 1.6], [2, 7, 2.4], [4, 9, 1.6], [5, 7, 1.6], [6, 4, 1.6], [7, 7, 1.6], [8, 12, 6]];
const BASS = [[0, -12, 3.5], [4, -5, 3.5], [8, -12, 6]];
// after the last puzzle: the tune's last note cut short, a run up, and a held chord
const FLOURISH = [[8, 12, 1.6], [9, 16, 1.6], [10, 19, 1.6], [11, 24, 2.4], [14, 12, 16], [14, 16, 16], [14, 19, 16], [14, 24, 16]];
const FLOURISH_BASS = [[8, -12, 5], [14, -12, 16], [14, -5, 16]];

const note = (voice, vol, key) => ([beat, semi, len]) => ({ voice, f: hz(key + semi), at: beat * BEAT, dur: len * BEAT, vol });
const byTime = (a, b) => a.at - b.at;

// The notes for puzzle n (0-based, trail order): [{ voice: 'lead' | 'bass', f, at, dur, vol }],
// earliest first. `last` adds the flourish. n is held to the steps there are.
export function riffNotes(n, last = false) {
  const i = Number.isFinite(n) ? Math.min(Math.max(Math.floor(n), 0), RIFF_STEPS.length - 1) : 0;
  const key = RIFF_STEPS[i];
  const plain = [...TUNE.map(note('lead', 0.3, key)), ...BASS.map(note('bass', 0.24, key))].sort(byTime);
  if (!last) return plain;
  // everything before the last sixteenth-8 notes stays exactly as it was
  const head = plain.filter((k) => k.at < 8 * BEAT);
  const tail = [...FLOURISH.map(note('lead', 0.26, key)), ...FLOURISH_BASS.map(note('bass', 0.22, key))].sort(byTime);
  return [...head, ...tail];
}

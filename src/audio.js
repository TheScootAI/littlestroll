// Quiet synthesised sound: Web Audio oscillators and noise, no files. The context is
// built lazily on the first click or key press (browsers start audio suspended); every
// method is a no-op until then and never throws.
import { riffNotes } from './core/riff.js';

export function createAudio() {
  let ctx = null, master = null, noiseBuf = null, creakUntil = 0;

  function ensure() {
    if (ctx) return ctx;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.15;
      master.connect(ctx.destination);
      const len = Math.floor(ctx.sampleRate * 1.5);
      noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    } catch { ctx = null; }
    return ctx;
  }

  const live = () => ctx && ctx.state === 'running';
  const safe = (fn) => (...a) => { try { if (live()) fn(...a); } catch { /* sound is optional */ } };

  // one enveloped oscillator note
  function tone(freq, t0, dur, vol, type = 'sine') {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type;
    o.frequency.value = freq;
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(vol, t0 + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(master);
    o.start(t0); o.stop(t0 + dur + 0.05);
  }

  // filtered noise burst: swell up over `rise`, die away by `dur`
  function noise(t0, dur, rise, freq, q, vol) {
    const s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    s.buffer = noiseBuf;
    f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = q;
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(vol, t0 + rise);
    g.gain.linearRampToValueAtTime(0, t0 + dur);
    s.connect(f); f.connect(g); g.connect(master);
    s.start(t0, Math.random()); s.stop(t0 + dur + 0.05);
  }

  const audio = {
    resume() {
      try {
        ensure();
        if (ctx && ctx.state === 'suspended') ctx.resume().catch(() => {});
      } catch { /* ignore */ }
    },
    get running() { return !!live(); },
    calls: { step: 0, riff: 0, shout: 0, creak: 0, bell: 0, pass: 0, roar: 0, blip: 0, thud: 0, chimeStone: 0, dud: 0, find: 0, splash: 0, hop: 0 },   // for checking in a browser
    // a footfall: a soft low scuff with a faint pat under it, a little different every time
    // (it is heard hundreds of times, so it is quiet and dull, never a click)
    step: safe(() => {
      audio.calls.step++;
      const t = ctx.currentTime, k = 0.8 + Math.random() * 0.4;
      noise(t, 0.1, 0.025, 230 * k, 0.7, 0.15);
      tone(72 * k, t, 0.09, 0.06);
    }),
    // a soft short whup as a walker leaves the ground (it will be mashed, so it is quiet)
    hop: safe(() => {
      audio.calls.hop++;
      const t = ctx.currentTime;
      tone(190, t, 0.09, 0.05);
      noise(t, 0.07, 0.015, 420, 0.8, 0.1);
    }),
    // a puzzle solved: the riff for puzzle n (0-based), with the flourish after the last
    riff: safe((n, last) => {
      audio.calls.riff++;
      const t = ctx.currentTime + 0.03;
      for (const k of riffNotes(n, last)) tone(k.f, t + k.at, k.dur + 0.12, k.vol, k.voice === 'lead' ? 'triangle' : 'sine');
    }),
    // a soft two-note tick: the friend said something
    blip: safe(() => {
      audio.calls.blip++;
      const t = ctx.currentTime;
      tone(880, t, 0.12, 0.12);
      tone(1174.66, t + 0.08, 0.16, 0.1);
    }),
    // a short two-tone call; near is 0..1
    shout: safe((near) => {
      audio.calls.shout++;
      const v = 0.08 + 0.55 * Math.min(1, Math.max(0, near || 0));
      const t = ctx.currentTime;
      tone(440, t, 0.22, v, 'triangle');
      tone(587.33, t + 0.16, 0.3, v, 'triangle');
    }),
    // a struck bell: which 0 / 1 are a fifth apart; a soft metal tone with a few seconds of ring
    bell: safe((which) => {
      audio.calls.bell++;
      const f = which ? 587.33 : 392;   // D5 and G4: a fifth
      const t = ctx.currentTime;
      tone(f, t, 4.5, 0.4);
      tone(f * 2.01, t, 2.6, 0.14);
      tone(f * 2.76, t, 1.4, 0.07);
      tone(f * 0.5, t, 3.2, 0.12);
      noise(t, 0.08, 0.003, f * 3, 2, 0.12);
    }),
    // a pillar coming up: one soft low knock
    thud: safe(() => {
      audio.calls.thud++;
      tone(110, ctx.currentTime, 0.22, 0.28);
    }),
    // the n-th stone of the ring lit: a soft rising note (the same whether it is right or wrong)
    chimeStone: safe((n) => {
      audio.calls.chimeStone++;
      const f = 392 * Math.pow(2, ([0, 2, 4, 7][Math.min(3, Math.max(0, n | 0))]) / 12);
      const t = ctx.currentTime;
      tone(f, t, 0.9, 0.2);
      tone(f * 2, t, 0.5, 0.05);
    }),
    // a piece of clothing found: a soft three-note "ta-da", quick and rising (under half a second)
    find: safe(() => {
      audio.calls.find++;
      const t = ctx.currentTime;
      tone(523.25, t, 0.12, 0.12);
      tone(659.25, t + 0.09, 0.12, 0.12);
      tone(783.99, t + 0.18, 0.28, 0.14);
    }),
    // a timber falling into the water: a burst of soft hissing noise over a quick low thump
    splash: safe(() => {
      audio.calls.splash++;
      const t = ctx.currentTime;
      noise(t, 0.55, 0.03, 1800, 0.7, 0.45);
      noise(t + 0.04, 0.4, 0.05, 900, 0.8, 0.3);
      tone(95, t, 0.25, 0.22);
    }),
    // four judged wrong: a soft low note
    dud: safe(() => {
      audio.calls.dud++;
      tone(130.81, ctx.currentTime, 0.5, 0.22);
    }),
    // the flame changing hands: a soft, short whoosh
    pass: safe(() => {
      audio.calls.pass++;
      noise(ctx.currentTime, 0.45, 0.12, 900, 0.8, 0.35);
    }),
    // the great brazier catching: a low roar that swells and rolls away, under a warm held chord
    roar: safe(() => {
      audio.calls.roar++;
      const t = ctx.currentTime;
      noise(t, 3.4, 1.1, 110, 0.7, 1.1);
      noise(t, 2.6, 0.7, 380, 0.6, 0.5);
      [98, 146.83, 196].forEach((f, i) => tone(f, t + 0.2 + i * 0.12, 3.2, 0.16));
    }),
    // low noise swell; ignored while an earlier creak is still sounding
    creak: safe(() => {
      if (ctx.currentTime < creakUntil) return;
      audio.calls.creak++;
      creakUntil = ctx.currentTime + 0.9;
      noise(ctx.currentTime, 0.9, 0.4, 140, 6, 0.9);
    }),
  };

  // browsers need a gesture before audio may start
  if (typeof window !== 'undefined') {
    const go = () => {
      audio.resume();
      if (live()) { window.removeEventListener('pointerdown', go); window.removeEventListener('keydown', go); }
    };
    window.addEventListener('pointerdown', go);
    window.addEventListener('keydown', go);
  }
  return audio;
}

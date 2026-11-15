// ?pilot only: a handle (window.__pilot, and the typed command box in panel.js) that lets an
// AI assistant play the walker in this tab by the same rules as a human. It does nothing a
// keyboard and mouse could not: it works the input fields (mx, mz, run, hold, eN, q, shoutN,
// waveN, camYaw, camPitch), so stepPlayer, the plank veto and the blockers all still apply. It
// never writes to S and never moves the walker directly. main.js imports this only under ?pilot.
//
// The pilot and the keyboard share the walker. input.forced holds only what the pilot is
// asserting right now: movement while it walks somewhere, E or the pointing arm while it holds
// them. Everything else stays the keyboard's and the mouse's, so an agent that can only press
// keys is never frozen. Presses, shouts, waves and the view go straight into the live state.
import { SITES, zoneAt, marshTileCentre, pillarCentre } from '../world/layout.js';
import { findPath, steer, planningDyn } from './path.js';
import { PITCH_MIN, PITCH_MAX } from '../player/input.js';
import { clamp } from '../core/math.js';
import { CHEST } from '../puzzles/beam.js';
import { since } from '../core/chat.js';
import { bothInside } from '../puzzles/ring.js';
import { count as owlCount } from '../puzzles/owls.js';
import { glowOf } from '../puzzles/lanterns.js';
import { lengthOf } from '../puzzles/plank.js';

const r2 = (n) => (typeof n === 'number' && Number.isFinite(n) ? Math.round(n * 100) / 100 : null);
const STALL_SECS = 1.5;      // no progress for this long: re-plan
const MAX_REPLANS = 3;
const PROGRESS = 0.15;       // metres that count as progress within the stall window
// All pilot timing is wall-clock: the update that steers may run from animation frames or
// from the logic ticker (when frames stop), so frame counts and summed dt mean nothing.
const now = () => performance.now();

export function createPilot(game) {
  const input = game.input, live = input.state;
  const forced = {};
  input.forced = forced;

  let job = null;     // { kind: 'goTo' | 'follow', ... }

  const yawTo = (dx, dz) => Math.atan2(-dx, -dz);   // yaw 0 faces -Z
  const halt = () => { delete forced.mx; delete forced.mz; delete forced.run; };   // the keys take over
  const finish = (res) => {
    const j = job;
    job = null;
    halt();
    if (j?.timer) clearTimeout(j.timer);
    let x = null, z = null;
    try { x = r2(game.player.x); z = r2(game.player.z); } catch { /* */ }
    j?.resolve?.({ ...res, x, z });
  };

  function stepGoTo(j) {
    const p = game.player, t = now();
    if (t - j.started > j.timeoutMs) return finish({ arrived: false, reason: 'timeout' });
    if (Math.hypot(p.x - j.to[0], p.z - j.to[1]) <= j.within) return finish({ arrived: true });
    if (!j.path) {
      // steer measures clearance on the world it was planned for (a moving lift would
      // otherwise make a new clearance grid every update)
      // plan on what a player sees: until the marsh is solved every tile looks solid
      j.dyn = planningDyn(game.dyn, !!game.S?.marsh?.solved);
      j.path = findPath([p.x, p.z], j.to, j.dyn);
      j.i = 1;
      if (!j.path) return finish({ arrived: false, reason: 'no-path' });
    }
    // progress watchdog
    if (Math.hypot(p.x - j.mark[0], p.z - j.mark[1]) > PROGRESS) { j.mark = [p.x, p.z]; j.since = t; }
    if (t - j.since > STALL_SECS * 1000) {
      if (++j.replans > MAX_REPLANS) return finish({ arrived: false, reason: 'stuck' });
      j.path = null; j.since = t; j.mark = [p.x, p.z];
      halt();
      return;
    }
    // waypoint to waypoint (steer is pure and simulated in tests/path.test.js)
    const s = steer({ x: p.x, z: p.z }, j.path, j.i, { dyn: j.dyn, run: j.run, within: j.within, camYaw: live.camYaw });
    j.i = s.i;
    if (s.done) return finish({ arrived: true });
    live.camYaw = s.camYaw;
    forced.mx = 0; forced.mz = s.mz; forced.run = s.run;
  }

  function stepFollow(j) {
    const p = game.player, f = game.remote;
    if (!f) return halt();
    const dx = f.x - p.x, dz = f.z - p.z;
    if (Math.hypot(dx, dz) > j.dist) {
      live.camYaw = yawTo(dx, dz);
      forced.mx = 0; forced.mz = 1; forced.run = Math.hypot(dx, dz) > j.dist + 6;
    } else halt();
  }

  const api = {
    sites: () => SITES,
    pillar: (line, r) => (line === 0 || line === 1) && Number.isInteger(r) && r >= 0 && r < SITES.pillars.n ? pillarCentre(line, r).map(r2) : null,   // [x, z] centre of pillar r (0 = nearest) on line 0 (west) or 1 (east)
    tile: (i) => { try { return marshTileCentre(i).map(r2); } catch { return null; } },   // [x, z] centre of marsh tile i

    state() {
      try {
        const p = game.player, S = game.S, f = game.remote;
        const puzzles = S && S.gate ? {
          gate: { open: !!S.gate.open, solved: !!S.gate.solved },
          signal: { lit: !!S.signal.lit, held: !!S.signal.held, up: !!S.signal.up, dials: [...S.signal.dials], solved: !!S.signal.solved },
          plank: { boards: S.plank.boards.map((b, i) => ({ len: lengthOf(i), ends: [r2(b.ax), r2(b.az), r2(b.bx), r2(b.bz)], holdA: b.holdA, holdB: b.holdB })), placed: S.plank.placed, fell: S.plank.fell },
          lift: { y: r2(S.lift.y), cranking: !!S.lift.cranking, ladder: !!S.lift.ladder },
          beam: { mirrors: S.beam.mirrors.map((m) => ({ x: r2(m.x), z: r2(m.z), by: m.by })), onLens: !!S.beam.onLens, charge: r2(S.beam.charge), solved: !!S.beam.solved },
          bells: { a: r2(S.bells.a), b: r2(S.bells.b), steps: r2(S.bells.steps), hint: !!S.bells.hint, solved: !!S.bells.solved },
          marsh: { held: !!S.marsh.held, solved: !!S.marsh.solved },   // never the path: a player cannot see it
          relay: { holder: S.relay.holder, t: r2(S.relay.t), solved: !!S.relay.solved },
          pillars: { mask: game.dyn?.pillars | 0, solved: !!S.pillars?.solved },
          ring: S.ring ? { touched: [...S.ring.touched], both: bothInside(game.pins ? game.pins(false) : []), steps: r2(S.ring.steps), solved: !!S.ring.solved } : null,   // never signs or order
          lanterns: S.lanterns ? { glow: glowOf(S.lanterns), solved: !!S.lanterns.solved } : null,
        } : null;
        return {
          me: p ? { x: r2(p.x), y: r2(p.y), z: r2(p.z), yaw: r2(p.yaw), zone: zoneAt(p.x, p.z) } : null,
          friend: f ? { x: r2(f.x), y: r2(f.y), z: r2(f.z) } : null,
          solved: game.solved ?? null,
          owls: S?.owls != null ? owlCount(S.owls) : 0,
          prompt: game.prompt ?? null,
          ended: S?.ended ?? null,
          busy: !!job,
          puzzles,
          chatN: game.chat?.items.at(-1)?.id ?? 0,   // newest chat line id: a cheap "anything new?"
        };
      } catch { return { me: null, friend: null, solved: null, owls: 0, prompt: null, ended: null, busy: false, puzzles: null, chatN: 0 }; }
    },

    goTo(x, z, { run = true, within = 0.4, timeoutMs = 60000 } = {}) {
      return new Promise((resolve) => {
        try {
          if (job) finish({ arrived: false, reason: 'cancelled' });
          if (![x, z].every(Number.isFinite)) return resolve({ arrived: false, reason: 'no-path', x: r2(game.player.x), z: r2(game.player.z) });
          const ms = Number.isFinite(timeoutMs) ? Math.max(0, timeoutMs) : 60000;
          const j = {
            kind: 'goTo', to: [x, z], run, within, timeoutMs: ms, resolve,
            path: null, i: 1, started: now(), since: now(), replans: 0, mark: [game.player.x, game.player.z],
          };
          job = j;
          // backstop: the promise answers on time even if no update runs at all
          j.timer = setTimeout(() => { if (job === j) finish({ arrived: false, reason: 'timeout' }); }, ms + 250);
        } catch { resolve({ arrived: false, reason: 'no-path', x: null, z: null }); }
      });
    },

    follow(dist = 2.5) {
      try {
        if (job) finish({ arrived: false, reason: 'cancelled' });
        job = { kind: 'follow', dist: Number.isFinite(dist) ? dist : 2.5 };
      } catch { /* never throws */ }
    },

    stop() {
      try { if (job) finish({ arrived: false, reason: 'cancelled' }); halt(); } catch { /* */ }
    },

    hold(on) { if (on) forced.hold = true; else delete forced.hold; },
    press() { live.eN++; },
    look(yaw, pitch) {
      if (Number.isFinite(yaw)) live.camYaw = yaw;
      if (Number.isFinite(pitch)) live.camPitch = clamp(pitch, PITCH_MIN, PITCH_MAX);
    },
    aimAt(pt) {
      try {
        const p = game.player;
        const dx = pt[0] - p.x, dy = pt[1] - (p.y + CHEST), dz = pt[2] - p.z;
        if (![dx, dy, dz].every(Number.isFinite)) return;
        if (Math.hypot(dx, dz) > 1e-6) live.camYaw = yawTo(dx, dz);
        live.camPitch = clamp(Math.atan2(dy, Math.hypot(dx, dz)), PITCH_MIN, PITCH_MAX);
      } catch { /* */ }
    },
    point(on) { if (on) forced.q = true; else delete forced.q; },
    shout() { live.shoutN++; },
    wave() { live.waveN++; },
    jump() { live.jumpN++; },

    // chat: say() goes through the same rules as the box (cleaning, flood gate, no friend)
    say(text) { try { return !!game.say(text); } catch { return false; } },
    chat(after = 0) {
      try {
        return since(game.chat, Number.isFinite(after) ? after : 0).map(({ id, from, text }) => (
          { id, from: from === 'system' ? 'system' : (from === game.idx ? 'me' : 'friend'), text }));
      } catch { return []; }
    },

    help: () => [
      'No console? Type the same things as words in the "Pilot command" box on the page: try "help" there.',
      '__pilot.sites()                    SITES (where everything is)',
      '__pilot.tile(i)                    [x, z] centre of marsh tile i; tiles are numbered row*5+col from the near-left corner',
      '__pilot.pillar(line, r)            [x, z] centre of pillar r (0 = nearest) on line 0 (west) or 1 (east)',
      'pillars: mask bit line*9+r = raised',
      'ring: touched = stones lit so far (in order), both = both walkers inside the ring, steps 0..1',
      'lanterns: glow = each lantern\'s flame (0 dark, then 0.25 / 0.5 / 0.75 / 1, rounded up), solved',
      '__pilot.state()                    me, friend, solved, prompt, ended, busy, puzzles (no signal answer)',
      '__pilot.goTo(x, z, {run, within, timeoutMs})  walk there -> Promise {arrived, reason?, x, z}',
      '__pilot.follow(dist) / stop()      keep within dist of the friend / cancel and stand still',
      '__pilot.hold(bool) / press()       E held / one E press',
      '__pilot.look(yaw, pitch) / aimAt([x,y,z])',
      '__pilot.point(bool) / shout() / wave() / jump()',
      '__pilot.say(text)                  send a chat line -> true if it went',
      '__pilot.chat(afterId)              chat lines with id > afterId: [{ id, from: \'me\'|\'friend\'|\'system\', text }]; state().chatN is the newest id',
    ].join('\n'),
  };

  // called from Game.update() every update, on whichever clock is running it
  api._tick = (dt) => {
    try {
      if (!job) return;
      if (job.kind === 'goTo') stepGoTo(job); else stepFollow(job);
    } catch { try { finish({ arrived: false, reason: 'stuck' }); } catch { job = null; halt(); } }
  };

  return api;
}

// The handle, its badge and its typed command box. `name` is who is piloting (shown on the badge).
export async function attachPilot(game, { name = '', box = true } = {}) {
  const pilot = createPilot(game);
  game.pilot = pilot;
  window.__pilot = pilot;
  const { createPilotPanel } = await import('./panel.js');
  createPilotPanel(pilot, { name, box });
  return pilot;
}

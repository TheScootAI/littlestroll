// All puzzle state (S) and the one place the rules are stepped, read and summarised.
// Owned by the host; the joiner only receives it. S is plain JSON.
//
// To add a puzzle: put its slice in createAll, step it in stepAll, add its flag(s) to
// dynOf, an entry to ORDER (trail order), and optionally a veto in constraintFor.
import { MAX_DT } from '../config.js';
import * as gate from './gate.js';
import * as signal from './signal.js';
import * as plank from './plank.js';
import * as lift from './lift.js';
import * as beam from './beam.js';
import * as bells from './bells.js';
import * as marsh from './marsh.js';
import * as relay from './relay.js';
import * as pillars from './pillars.js';
import * as ring from './ring.js';
import * as lanterns from './lanterns.js';
import * as finds from './finds.js';

// Trail order. `solved(S)` says whether that puzzle is done.
const ORDER = [
  { key: 'gate', mod: gate, valid: gate.valid, solved: (S) => S.gate.solved, done: 'The gate stays open' },
  { key: 'signal', mod: signal, valid: signal.valid, solved: (S) => S.signal.solved, done: 'The bridge is out' },
  { key: 'plank', mod: plank, valid: plank.valid, solved: (S) => S.plank.solved, done: 'The plank is down' },
  { key: 'lift', mod: lift, valid: lift.valid, solved: (S) => S.lift.solved, done: 'The ladder is down' },
  { key: 'beam', mod: beam, valid: beam.valid, solved: (S) => S.beam.solved, done: 'A causeway rises from the sea' },
  { key: 'bells', mod: bells, valid: bells.valid, solved: (S) => S.bells.solved, done: 'The steps rise' },
  { key: 'marsh', mod: marsh, valid: marsh.valid, solved: (S) => S.marsh.solved, done: 'The path holds' },
  { key: 'relay', mod: relay, valid: relay.valid, solved: (S) => S.relay.solved, done: 'The Far Isle is lit' },
  { key: 'pillars', mod: pillars, valid: pillars.valid, solved: (S) => S.pillars.solved, done: 'The pillars stand' },
  { key: 'ring', mod: ring, valid: ring.valid, solved: (S) => S.ring.solved, done: 'The steps rise again' },
  { key: 'lanterns', mod: lanterns, valid: lanterns.valid, solved: (S) => S.lanterns.solved, done: 'The Lantern Isle is lit' },
];

export const createAll = (seed) => ({ time: 0, gate: gate.create(seed), signal: signal.create(seed), plank: plank.create(), lift: lift.create(), beam: beam.create(), bells: bells.create(), marsh: marsh.create(seed), relay: relay.create(), pillars: pillars.create(), ring: ring.create(seed), lanterns: lanterns.create(), finds: finds.create(), ended: null });

export function stepAll(S, players, dt) {
  dt = Number.isFinite(dt) ? Math.min(Math.max(dt, 0), MAX_DT) : 0;
  if (!S.ended && players.every((p) => p.present)) S.time += dt;
  gate.step(S.gate, players, dt);
  signal.step(S.signal, players, dt);
  plank.step(S.plank, players, dt);
  lift.step(S.lift, players, dt);
  beam.step(S.beam, players, dt);
  bells.step(S.bells, players, dt);
  marsh.step(S.marsh, players, dt);
  relay.step(S.relay, players, dt);
  pillars.step(S.pillars, players, dt, S.relay.solved);   // dormant until the Relay is solved
  ring.step(S.ring, players, dt);
  lanterns.step(S.lanterns, players, dt);
  S.finds = finds.step(S.finds, players);   // not a puzzle: nothing else reads it
  // the walk ends the moment the last puzzle in the order is solved
  if (!S.ended && ORDER.at(-1).solved(S)) S.ended = { time: S.time };
}

// Is S safe to adopt (joiner side)? Every ORDER row's slice is checked by its module, and finds (an array of ten).
export function validState(S) {
  if (!S || typeof S !== 'object' || Array.isArray(S)) return false;
  if (!Number.isFinite(S.time) || S.time < 0) return false;
  const e = S.ended;
  if (e !== null && !(e && typeof e === 'object' && !Array.isArray(e) && Number.isFinite(e.time))) return false;
  if (!finds.valid(S.finds)) return false;
  return ORDER.every((p) => p.valid(S[p.key]));
}

// Count solved puzzles in trail order, stopping at the first unsolved one.
export function solvedCount(S) {
  let n = 0;
  while (n < ORDER.length && ORDER[n].solved(S)) n++;
  return n;
}

// The name flashed on the HUD when puzzle n (0-based) becomes solved.
export const solvedLine = (n) => ORDER[n]?.done ?? null;

// What the puzzles currently do to the world.
export const dynOf = (S) => ({
  gateOpen: S.gate.amt > 0.5 || S.gate.open,
  bridge: S.signal.bridge >= 1, spur: S.signal.up, plank: S.plank.placed !== null, lift: S.lift.y, ladder: S.lift.ladder,
  causeway: S.beam.solved, bells: S.bells.steps >= 1, marsh: marsh.maskOf(S.marsh), watch: S.marsh.up,
  pillars: pillars.maskOf(S.pillars), ring: S.ring.steps >= 1,
});

// First hint among the unsolved puzzles, in trail order.
export function promptFor(S, idx, players) {
  for (const p of ORDER) {
    if (p.solved(S)) continue;
    const t = p.mod.prompt(S[p.key], idx, players);
    if (t) return t;
  }
  return null;
}

// A veto on walker idx's next step, or null. (Only the plank has one.)
export function constraintFor(S, idx, players) {
  return S.plank.placed !== null ? null : plank.veto(S.plank, idx, players);
}

// Debug/test only: put the first n puzzles (trail order) in their solved, settled form.
export function forceSolved(S, n) {
  for (let i = 0; i < Math.min(n, ORDER.length); i++) ORDER[i].mod.forceSolve(S[ORDER[i].key]);
  if (!S.ended && ORDER.at(-1).solved(S)) S.ended = { time: S.time };
}

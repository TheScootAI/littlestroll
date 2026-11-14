// The Gate: one holds, one goes. Pure rules, no three.js.
import { SITES, zoneAt } from '../world/layout.js';
import { pointSegDist } from '../core/math.js';

const PLATE_R = 1.0;      // standing this close to a plate holds the gate
const DOOR_R = 0.9;       // an open gate stays open while someone is this close to the doorway
const SWING_S = 0.5;      // seconds for the gate to swing fully open or shut
// any plateau past the gate counts: everything but A, a ramp, the water, and (null) nowhere
const through = (zone) => zone !== null && zone !== 'A';

export const create = () => ({ open: false, amt: 0, solved: false });

const near = (p, xz, r) => Math.hypot(p.x - xz[0], p.z - xz[1]) <= r;

// Is walker p holding plate `which` ('plateA' | 'plateB')?
export const onPlate = (p, which) => !!p.present && near(p, SITES.gate[which], PLATE_R);

export function step(s, players, dt) {
  const { door } = SITES.gate;
  const here = players.filter((p) => p.present);
  // A plate opens the gate. The doorway only keeps an open gate from shutting on whoever is in it:
  // it never opens a shut one, or a lone walker could just walk up and through.
  const onAPlate = here.some((p) =>
    near(p, SITES.gate.plateA, PLATE_R) || near(p, SITES.gate.plateB, PLATE_R));
  const inDoorway = here.some((p) =>
    pointSegDist(p.x, p.z, door.ax, door.az, door.bx, door.bz).d <= DOOR_R);
  const held = onAPlate || (s.open && inDoorway);
  if (!s.solved && players.length === 2 && here.length === 2 &&
      here.every((p) => through(zoneAt(p.x, p.z)))) s.solved = true;
  s.open = s.solved || held;
  const target = s.open ? 1 : 0;
  const k = dt / SWING_S;
  s.amt = s.amt < target ? Math.min(target, s.amt + k) : Math.max(target, s.amt - k);
}

export function prompt(s, idx, players) {
  return null;   // no hints: the gate has no controls of its own
}

// Is `s` a well-formed gate slice? (checked on every state a joiner receives)
export const valid = (s) => !!s && typeof s === 'object' && typeof s.open === 'boolean' &&
  typeof s.solved === 'boolean' && Number.isFinite(s.amt) && s.amt >= 0 && s.amt <= 1;

export function forceSolve(s) { s.solved = true; s.open = true; s.amt = 1; }

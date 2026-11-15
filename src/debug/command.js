// ?pilot only: the pilot handle as typed commands, for an agent that can click and type but
// cannot run JavaScript in the page. A line such as "goto 0 110" or "press" is read here and
// carried out through the same handle (src/debug/pilot.js), so it can do nothing the handle
// cannot. Every command answers in plain words. Pure: no DOM; the panel (panel.js) shows it.

const r1 = (n) => Math.round(n * 10) / 10;
const at = (x, z) => `(${r1(x)}, ${r1(z)})`;
const num = (s) => (/^-?\d+(\.\d+)?$/.test(s ?? '') ? Number(s) : NaN);

// ---- compass: bearings are degrees clockwise from north; yaw 0 faces north (−z), east is +x
export const yawFromBearing = (deg) => -deg * Math.PI / 180;
export const bearingOf = (dx, dz) => ((Math.atan2(dx, -dz) * 180 / Math.PI) + 360) % 360;
const POINTS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
export const compass = (deg) => POINTS[Math.round((((deg % 360) + 360) % 360) / 45) % 8];

// A typed line -> { name, args, rest } (rest = everything after the name, as typed), or null.
export function parse(line) {
  if (typeof line !== 'string') return null;
  const t = line.trim();
  if (!t) return null;
  const m = /^(\S+)\s*([\s\S]*)$/.exec(t);
  return { name: m[1].toLowerCase(), args: m[2] ? m[2].split(/\s+/) : [], rest: m[2] };
}

// One line about where things stand: what a player could tell by looking.
export function describeState(s) {
  if (!s?.me) return 'no state yet';
  const parts = [`You ${at(s.me.x, s.me.z)} on ${s.me.zone ?? 'no plateau'}`];
  if (s.friend) {
    const dx = s.friend.x - s.me.x, dz = s.friend.z - s.me.z;
    parts.push(`friend ${Math.round(Math.hypot(dx, dz))} m ${compass(bearingOf(dx, dz))} at ${at(s.friend.x, s.friend.z)}`);
  } else parts.push('no friend here');
  parts.push(`solved ${s.solved ?? 0}`, `owls ${s.owls ?? 0}`);
  if (s.prompt) parts.push(`prompt: ${s.prompt}`);
  parts.push(s.ended ? 'the stroll has ended' : s.busy ? 'moving' : 'standing');
  return parts.join(' · ');
}

// A place by name: "gate.plateA", "marsh.plate", "spawn.1" -> [x, z], or null.
function place(sites, path) {
  let v = sites;
  for (const k of path.split('.')) { if (v == null || typeof v !== 'object') return null; v = v[k]; }
  if (Array.isArray(v) && v.length >= 2 && v.slice(0, 2).every(Number.isFinite) && v.length <= 3) return v.length === 3 ? [v[0], v[2]] : [v[0], v[1]];
  if (v && typeof v === 'object' && Number.isFinite(v.x) && Number.isFinite(v.z)) return [v.x, v.z];
  return null;
}

// What is at a site, one level deep: "plateA (0, 110), plateB (0, 87)".
function listSite(site) {
  if (Array.isArray(site) && place({ s: site }, 's')) return at(...place({ s: site }, 's'));
  const out = [];
  for (const [k, v] of Object.entries(site ?? {})) {
    const p = place({ v }, 'v');
    if (p) out.push(`${k} ${at(...p)}`);
    else if (Array.isArray(v)) v.forEach((e, i) => { const q = place({ e }, 'e'); if (q) out.push(`${k}.${i} ${at(...q)}`); });
  }
  return out.join(', ');
}

const HELP = [
  'where — where you and your friend are, puzzles solved, the prompt on screen',
  'goto X Z — walk to a spot (add "walk" to not run); goto NAME — a named place, e.g. goto gate.plateA',
  'sites — the names of the places; sites NAME — what is there, with coordinates',
  'follow [metres] — keep close to your friend; stop — stand still',
  'press (or e) — press E once; hold on / hold off — hold E down',
  'look N|NE|E|SE|S|SW|W|NW, look DEGREES [TILT], or look friend — turn the view (0 is north, 90 east)',
  'point on / point off, shout, wave',
  'say TEXT — say it in the game chat',
  'pillar LINE R, tile I — where a pillar or a marsh tile is',
].join('\n');

const WHY = { 'no-path': 'no path', timeout: 'out of time', stuck: 'stuck', cancelled: 'a newer command took over' };

// Carry out one typed line. Returns the answer at once; a walk reports again through
// ctx.emit when it ends. ctx = { pilot, emit }. Never throws.
export function runCommand(line, { pilot, emit = () => {} }) {
  const c = parse(line);
  if (!c) return '';
  const [a, b, d] = c.args;
  try {
    switch (c.name) {
      case 'help': case '?': return HELP;
      case 'where': case 'state': return describeState(pilot.state());
      case 'goto': case 'go': {
        const named = a && Number.isNaN(num(a)) ? place(pilot.sites(), a) : null;
        const usage = 'usage: goto X Z [walk], or goto NAME (see: sites)';
        if (a && Number.isNaN(num(a)) && !named) return /^[A-Za-z][\w.]*$/.test(a) ? `unknown place "${a}" — try: sites` : usage;
        const [x, z] = named ?? [num(a), num(b)];
        if (!Number.isFinite(x) || !Number.isFinite(z)) return usage;
        const walk = (named ? b : d) === 'walk';
        pilot.goTo(x, z, { run: !walk, within: 0.4, timeoutMs: 60000 }).then((r) => {
          emit(r?.arrived ? `arrived at ${at(r.x, r.z)}` : `did not get there (${WHY[r?.reason] ?? r?.reason ?? 'unknown'}): stopped at ${at(r?.x, r?.z)}`);
        }, () => emit('did not get there'));
        return `walking to ${named ? `${a} ` : ''}${at(x, z)}…`;
      }
      case 'sites': {
        const sites = pilot.sites();
        if (!a) return `places: ${Object.keys(sites).join(', ')} — try: sites gate`;
        if (!Object.hasOwn(sites, a)) return `unknown place "${a}" — try: sites`;
        return `${a}: ${listSite(sites[a]) || 'nothing to walk to'}`;
      }
      case 'follow': {
        const m = a === undefined ? 2.5 : num(a);
        if (!(m > 0)) return 'usage: follow [metres]';
        pilot.follow(m);
        return `following your friend (within ${m} m)`;
      }
      case 'stop': pilot.stop(); return 'stopped';
      case 'press': case 'e': pilot.press(); return 'pressed E';
      case 'hold':
        if (a !== 'on' && a !== 'off') return 'usage: hold on | hold off';
        pilot.hold(a === 'on');
        return a === 'on' ? 'holding E' : 'let go of E';
      case 'point':
        if (a !== 'on' && a !== 'off') return 'usage: point on | point off';
        pilot.point(a === 'on');
        return a === 'on' ? 'pointing' : 'stopped pointing';
      case 'shout': pilot.shout(); return 'shouted';
      case 'wave': pilot.wave(); return 'waved';
      case 'look': {
        let deg = POINTS.indexOf((a ?? '').toUpperCase()) * 45;
        if (deg < 0 && a === 'friend') {
          const s = pilot.state();
          if (!s?.me || !s.friend) return 'no friend to look at';
          deg = bearingOf(s.friend.x - s.me.x, s.friend.z - s.me.z);
        } else if (deg < 0) deg = num(a);
        if (!Number.isFinite(deg)) return 'usage: look N|NE|E|SE|S|SW|W|NW, look DEGREES [TILT], or look friend';
        const tilt = num(b);
        pilot.look(yawFromBearing(deg), Number.isFinite(tilt) ? tilt * Math.PI / 180 : undefined);
        return `looking ${compass(deg)}`;
      }
      case 'say':
        if (!c.rest) return 'usage: say TEXT';
        return pilot.say(c.rest) ? `said: ${c.rest}` : 'not sent (is your friend connected?)';
      case 'pillar': {
        const p = Number.isInteger(num(a)) && Number.isInteger(num(b)) ? pilot.pillar(num(a), num(b)) : null;
        return p ? `pillar ${a} ${b} is at ${at(...p)}` : 'usage: pillar LINE R (line 0 or 1, r 0 to 8)';
      }
      case 'tile': {
        const p = Number.isInteger(num(a)) ? pilot.tile(num(a)) : null;
        return p ? `tile ${a} is at ${at(...p)}` : 'usage: tile I (0 to 29)';
      }
      default: return `unknown command "${c.name}" — type help`;
    }
  } catch { return `could not do "${c.name}"`; }
}

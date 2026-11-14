// ?debug only: a stand-in second walker driven from this tab's keyboard. Its snapshot
// feeds game.remote exactly as a network `p` message would, so it goes through toPIn
// and the same puzzle rules as a real partner. Main imports this only under ?debug.
//
//   T  bring it to where I am        Y  toggle it holding E       I  one E press
//   U  toggle following me at the offset it has now
//   O  cycle its aim: nothing -> my chest -> the lens (aimed from its own chest, where a
//      held mirror sends the beam from)
//   P  send both walkers to the next checkpoint (and solve the puzzles before it)
import { SITES, heightAt } from '../world/layout.js';
import { forceSolved, solvedCount } from '../puzzles/index.js';
import { CHEST } from '../puzzles/beam.js';
import { el } from '../ui/style.js';

const AIMS = ['nothing', 'me', 'the lens'];

export function createStandin(game) {
  const st = { x: SITES.spawn[1][0], z: SITES.spawn[1][1], yaw: 0, hold: false, eN: 0, follow: null, aim: 0, ay: 0, ap: 0 };
  const chestY = () => heightAt(st.x, st.z, game.dyn) + CHEST;

  const line = el('div', '', '');
  Object.assign(line.style, {
    position: 'absolute', right: '12px', bottom: '12px', padding: '4px 10px', borderRadius: '8px',
    background: 'rgba(40,40,40,0.6)', color: '#bff', font: '12px/1.3 ui-monospace, monospace', pointerEvents: 'none',
  });
  document.getElementById('ui')?.appendChild(line);

  const aimAt = (tx, ty, tz) => {
    const dx = tx - st.x, dy = ty - chestY(), dz = tz - st.z;
    st.ay = Math.atan2(-dx, -dz);
    st.ap = Math.asin(Math.max(-1, Math.min(1, dy / (Math.hypot(dx, dy, dz) || 1))));
  };

  const standin = {
    // a protocol `p` snapshot of the stand-in
    pin() {
      return {
        t: 'p', x: st.x, y: heightAt(st.x, st.z, game.dyn), z: st.z, yaw: st.yaw, ay: st.ay, ap: st.ap,
        speed: 0, hold: st.hold, q: false, eN: st.eN, shoutN: 0, waveN: 0, dist: 0,
      };
    },
    update() {
      const me = game.player;
      if (st.follow) { st.x = me.x + st.follow[0]; st.z = me.z + st.follow[1]; }
      if (st.aim === 1) aimAt(me.x, me.y + CHEST, me.z);
      else if (st.aim === 2) aimAt(...SITES.beam.lens);
      else { st.ay = st.yaw; st.ap = 0; }
      const mode = [
        st.follow ? 'following' : 'parked',
        st.hold ? 'holding E' : null,
        st.aim ? `aim: ${AIMS[st.aim]}` : null,
      ].filter(Boolean).join(' | ');
      if (line.textContent !== `stand-in: ${mode}`) line.textContent = `stand-in: ${mode}`;
    },
    key(code) {
      const me = game.player;
      switch (code) {
        case 'KeyT': st.x = me.x; st.z = me.z; st.follow = null; break;
        case 'KeyY': st.hold = !st.hold; break;
        case 'KeyI': st.eN++; break;
        case 'KeyU': st.follow = st.follow ? null : [st.x - me.x, st.z - me.z]; break;
        case 'KeyO': st.aim = (st.aim + 1) % AIMS.length; break;
        case 'KeyP': {
          const n = solvedCount(game.S);
          const cp = SITES.checkpoints[Math.min(n + 1, SITES.checkpoints.length - 1)];
          forceSolved(game.S, n + 1);
          game.applyState();
          const mine = cp[game.idx], theirs = cp[1 - game.idx];
          me.x = mine[0]; me.z = mine[1]; me.y = heightAt(me.x, me.z, game.dyn); me.vy = 0;
          st.x = theirs[0]; st.z = theirs[1];
          if (st.follow) st.follow = [st.x - me.x, st.z - me.z];
          break;
        }
        default: return false;
      }
      return true;
    },
  };

  window.addEventListener('keydown', (e) => {
    const t = e.target;
    if (e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
    standin.key(e.code);
  });
  standin.update();
  return standin;
}

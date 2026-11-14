// Little Run entry point: menu → session → Game.
import { Game } from './game.js';
import { showMenu } from './ui/menu.js';
import { createHud } from './ui/hud.js';
import { Session } from './net/session.js';
import { makeCode, normalizeCode } from './net/code.js';
import { heightAt } from './world/layout.js';

const params = new URLSearchParams(window.location.search);
// ?debug (the solo stand-in) exists only on the dev server: in a production build
// import.meta.env.DEV is the constant false, so this branch and the stand-in are dropped.
const debug = import.meta.env.DEV && params.has('debug');
const pilotMode = params.has('pilot');

// ?pilot only: give an AI assistant a console handle to this tab's walker
async function attachPilot(game) {
  const { attachPilot: attach } = await import('./debug/pilot.js');
  attach(game);
}
const canvas = document.getElementById('view');
const ui = document.getElementById('ui');

// the first status a session reports
const firstStatus = (s) => new Promise((res) => {
  const prev = s.onStatus;
  s.onStatus = (st) => { s.onStatus = prev; res(st); };
});

async function startHost(hud) {
  for (let i = 0; i < 3; i++) {
    const code = makeCode();
    const session = Session.host(code);
    const st = await firstStatus(session);
    if (st === 'waiting') return { session, code };
    session.close();   // code taken or broker unreachable: try a new code
  }
  return null;
}

async function main() {
  if (import.meta.env.DEV && debug) {
    const game = new Game(canvas, { role: 'host', session: null, debug, hud: createHud(ui) });
    const { createStandin } = await import('./debug/standin.js');
    const standin = createStandin(game);
    game.standin = standin;
    if (pilotMode) await attachPilot(game);
    window.__lr = {
      game, input: game.input, S: () => game.S, standin,
      teleport(x, z) {
        const p = game.player;
        p.x = x; p.z = z; p.y = heightAt(x, z, game.dyn); p.vy = 0;
      },
    };
    game.start();
    return;
  }
  // ?pilot&join=CODE skips the menu; a bad code falls back to it
  const direct = pilotMode ? normalizeCode(params.get('join')) : null;
  const choice = direct ? { role: 'join', code: direct } : await showMenu(ui);
  const hud = createHud(ui);
  let game;
  if (choice.role === 'host') {
    hud.setStatus('Starting a walk…');
    const started = await startHost(hud);
    if (!started) {
      hud.setStatus("Couldn't start a walk — check your connection and try again.",
        { label: 'Back to menu', onClick: () => window.location.reload() });
      return;
    }
    hud.setCode(started.code);
    game = new Game(canvas, { role: 'host', session: started.session, hud, code: started.code });
  } else {
    hud.setStatus('Connecting…');
    game = new Game(canvas, { role: 'join', session: Session.join(choice.code), hud });
  }
  if (pilotMode) await attachPilot(game);
  game.start();
}

main();

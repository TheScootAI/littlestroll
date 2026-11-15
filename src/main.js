// Little Stroll entry point: menu → session → Game.
import { Game } from './game.js';
import { showMenu } from './ui/menu.js';
import { createHud } from './ui/hud.js';
import { createFeedback, snapshot } from './ui/feedback.js';
import { Session } from './net/session.js';
import { makeCode, normalizeCode } from './net/code.js';
import { heightAt } from './world/layout.js';
import { clean } from './core/chat.js';
import { count as findCount } from './puzzles/finds.js';

const params = new URLSearchParams(window.location.search);
// ?debug (the solo stand-in) exists only on the dev server: in a production build
// import.meta.env.DEV is the constant false, so this branch and the stand-in are dropped.
const debug = import.meta.env.DEV && params.has('debug');
const pilotMode = params.has('pilot');

// ?pilot only: give an AI assistant a handle on this tab's walker (a console handle, and a
// command box on the page for agents that can only click and type). ?pilot=Name puts that
// name on the badge; &box=0 leaves the command box off.
async function attachPilot(game) {
  const { attachPilot: attach } = await import('./debug/pilot.js');
  const name = Array.from(clean(params.get('pilot') || '')).slice(0, 24).join('');
  await attach(game, { name, box: params.get('box') !== '0' });
}
const canvas = document.getElementById('view');
const ui = document.getElementById('ui');

// the first status a session reports
const firstStatus = (s) => new Promise((res) => {
  const prev = s.onStatus;
  s.onStatus = (st) => { s.onStatus = prev; res(st); };
});

// Dev server only: a console handle on the game, for testing (never in a build).
const devHandle = (game) => ({
  game, input: game.input, S: () => game.S,
  teleport(x, z) {
    const p = game.player;
    p.x = x; p.z = z; p.y = heightAt(x, z, game.dyn); p.vy = 0;
  },
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

// The feedback button is there from the menu on; once a walk exists it lets go of the walker's
// keys while the box is open, adds how far the pair had got, and can take a picture of the view.
function wireFeedback(feedback, game) {
  feedback.onOpen = () => game.input.release();
  feedback.info = () => `puzzles solved: ${game.solved} · clothes found: ${findCount(game.S.finds)}`;
  // the view as it is now: drawn and copied in one go, before the browser clears the buffer
  feedback.capture = () => { game.render(); return snapshot(canvas); };
}

async function main() {
  const feedback = createFeedback(ui);
  if (import.meta.env.DEV && debug) {
    const game = new Game(canvas, { role: 'host', session: null, debug, hud: createHud(ui) });
    wireFeedback(feedback, game);
    const { createStandin } = await import('./debug/standin.js');
    const standin = createStandin(game);
    game.standin = standin;
    if (pilotMode) await attachPilot(game);
    window.__lr = { ...devHandle(game), standin };
    game.start();
    return;
  }
  // ?pilot&join=CODE skips the menu; a bad code falls back to it
  const direct = pilotMode ? normalizeCode(params.get('join')) : null;
  const choice = direct ? { role: 'join', code: direct } : await showMenu(ui);
  const hud = createHud(ui);
  let game;
  if (choice.role === 'host') {
    hud.setStatus('Starting a stroll…');
    const started = await startHost(hud);
    if (!started) {
      hud.setStatus("Couldn't start a stroll — check your connection and try again.",
        { label: 'Back to menu', onClick: () => window.location.reload() });
      return;
    }
    hud.setCode(started.code);
    game = new Game(canvas, { role: 'host', session: started.session, hud, code: started.code });
  } else {
    hud.setStatus('Connecting…');
    game = new Game(canvas, { role: 'join', session: Session.join(choice.code), hud });
  }
  wireFeedback(feedback, game);
  if (pilotMode) await attachPilot(game);
  // ?handle on the dev server: the ?debug handle on a real two-browser walk
  if (import.meta.env.DEV && params.has('handle')) window.__lr = devHandle(game);
  game.start();
}

main();

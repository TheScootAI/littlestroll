// ?pilot only: the pilot's badge and its typed command box, for an agent that can click and
// type but cannot run JavaScript in the page. Click the box, type a command ("help" lists
// them), press Enter; the answer appears above it as ordinary page text, with a line that says
// where things stand, refreshed twice a second. Commands are read by command.js. All text is
// set as text, never as markup.
import { runCommand, describeState } from './command.js';

const KEEP = 10;      // answers kept on screen

const CSS = `
.lr-pilot-badge { position: fixed; right: 60px; top: 17px; padding: 5px 12px; border-radius: 999px;
  background: rgba(60,48,40,0.7); color: #ffe3a0; font: 600 13px/1.3 system-ui, sans-serif;
  letter-spacing: 0.03em; pointer-events: none; z-index: 20; }
.lr-pilot { position: fixed; right: 12px; top: 62px; z-index: 20; box-sizing: border-box;
  width: min(380px, calc(100vw - 24px)); padding: 10px 12px; border-radius: 14px;
  background: rgba(40,32,26,0.82); color: #fff7ea; font: 13px/1.4 ui-monospace, Menlo, Consolas, monospace;
  pointer-events: auto; user-select: text; }
.lr-pilot-status { margin: 0 0 8px; padding-bottom: 8px; border-bottom: 1px solid rgba(255,247,234,0.2); color: #ffe3a0; }
.lr-pilot-log { margin: 0 0 8px; max-height: 38vh; overflow: auto; white-space: pre-wrap; overflow-wrap: anywhere; }
.lr-pilot-log div { margin: 0 0 4px; }
.lr-pilot-log .cmd { color: #9fd8cf; }
.lr-pilot input { box-sizing: border-box; width: 100%; padding: 7px 10px; border: 0; border-radius: 8px; outline: none;
  background: #fff7ea; color: #4a3b30; font: 14px/1.3 ui-monospace, Menlo, Consolas, monospace; }
.lr-pilot input:focus { box-shadow: 0 0 0 2px #f08a3c; }
`;

// `box: false` shows the badge alone (for a pilot that uses the console handle and wants the view clear).
export function createPilotPanel(pilot, { name = '', box: withBox = true } = {}) {
  const root = document.getElementById('ui') || document.body;
  if (!document.getElementById('lr-pilot-css')) {
    const st = document.createElement('style');
    st.id = 'lr-pilot-css';
    st.textContent = CSS;
    document.head.appendChild(st);
  }
  const make = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };

  const badge = make('div', 'lr-pilot-badge', `Piloted by ${name || 'Claude'}`);
  if (!withBox) { root.appendChild(badge); return { badge, panel: null, dispose() { badge.remove(); } }; }
  const panel = make('div', 'lr-pilot');
  const status = make('div', 'lr-pilot-status', 'no state yet');
  status.setAttribute('role', 'status');
  status.setAttribute('aria-label', 'Pilot status');
  const log = make('div', 'lr-pilot-log');
  log.setAttribute('aria-label', 'Pilot answers');
  const box = make('input');
  box.type = 'text';
  box.autocomplete = 'off';
  box.spellcheck = false;
  box.placeholder = 'Pilot command — type help, then Enter';
  box.setAttribute('aria-label', 'Pilot command');
  panel.append(status, log, box);
  root.append(badge, panel);

  const say = (text, cls) => {
    if (!text) return;
    log.appendChild(make('div', cls, text));
    while (log.childNodes.length > KEEP) log.firstChild.remove();
    log.scrollTop = log.scrollHeight;
  };
  say('Click the box below, type a command and press Enter. Try: help');

  box.addEventListener('keydown', (e) => {
    if (e.isComposing || e.keyCode === 229) return;
    e.stopPropagation();                      // the game's own keys never see what is typed here
    if (e.key === 'Escape') { box.blur(); return; }
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const line = box.value.trim();
    box.value = '';
    if (!line) return;
    say(`> ${line}`, 'cmd');
    say(runCommand(line, { pilot, emit: (t) => say(t) }));
  });
  // keyup too, so a key let go in the box is not read as a game key let go
  box.addEventListener('keyup', (e) => e.stopPropagation());

  const refresh = () => { try { const t = describeState(pilot.state()); if (status.textContent !== t) status.textContent = t; } catch { /* keep the last line */ } };
  refresh();
  const timer = setInterval(refresh, 500);
  return { badge, panel, dispose() { clearInterval(timer); badge.remove(); panel.remove(); } };
}

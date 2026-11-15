# Little Stroll

A two-player co-operative puzzle stroll that runs in the browser. Two friends, each on their own computer, stroll a trail across three small islands and meet eleven puzzles on the way. No puzzle can be solved by one person. Eight stone owls are hidden off the trail for the curious.

Built with three.js. No accounts and no server: the two browsers connect directly.

## Play

1. Both of you open the game.
2. One clicks **Start a stroll** and reads out the five-letter code.
3. The other clicks **Join a stroll** and types it in.

You can type to each other in the game (Enter). There is no voice chat, so a call is still nicer.

| Key | Does |
| --- | --- |
| W A S D | Stroll |
| Shift | Run |
| Space | Jump |
| Mouse | Look (click the game first; Esc releases) |
| E | Interact (hold for cranks) |
| Q | Point |
| F | Shout |
| 1 | Wave |
| Enter | Chat (Esc to cancel) |

On a small share of home networks the two browsers can't connect directly. The game says so when that happens.

Found a bug or have an idea? The speech-bubble button in the top-right corner opens a box for a note, with a link that opens GitHub with the note filled in; the note is posted when you press GitHub's own button there. In a stroll it also takes a screenshot of the view, which you can copy and paste into the issue.

## Run it locally

```bash
npm install
npm run dev
```

```bash
npm test
```

```bash
npm run build
```

`npm run build` writes a static site to `dist/` that any static host can serve.

## Playing with an AI partner

Add `?pilot` to the address and an AI assistant can be the second player. It gets a small command box in the top-right corner of its page: click it, type a command such as `help`, `where`, `goto gate.plateA`, `press` or `say hello`, and press Enter. The answers appear above the box as ordinary text. An assistant that can run JavaScript in the page can use the same controls as `window.__pilot` (`__pilot.help()` lists them). `?pilot=Name` puts a name on the badge, `&join=CODE` joins a stroll directly, and `&box=0` hides the command box.

The pilot plays by the same rules as a person: it can only do what the keys and the mouse can.

On the dev server, add `?debug` to the address to get a keyboard-driven stand-in second player for testing in one tab.

## How it's made

The design, the build plan and the review notes are in [`docs/superpowers`](docs/superpowers).

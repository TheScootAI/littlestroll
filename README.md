# Little Run

A two-player co-operative puzzle walk that runs in the browser. Two friends, each on their own computer, walk a trail across three small islands and meet eleven puzzles on the way. No puzzle can be solved by one person. Eight stone owls are hidden off the trail for the curious.

Built with three.js. No accounts and no server: the two browsers connect directly.

## Play

1. Both of you open the game.
2. One clicks **Start a walk** and reads out the five-letter code.
3. The other clicks **Join a walk** and types it in.

You can type to each other in the game (Enter). There is no voice chat, so a call is still nicer.

| Key | Does |
| --- | --- |
| W A S D | Walk |
| Shift | Run |
| Mouse | Look (click the game first; Esc releases) |
| E | Interact (hold for cranks) |
| Q | Point |
| F | Shout |
| 1 | Wave |
| Enter | Chat (Esc to cancel) |

On a small share of home networks the two browsers can't connect directly. The game says so when that happens.

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

On the dev server, add `?debug` to the address to get a keyboard-driven stand-in second player for testing in one tab.

## How it's made

The design, the build plan and the review notes are in [`docs/superpowers`](docs/superpowers).

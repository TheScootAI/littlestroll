# Little Run — design

Date: 2026-11-13
Working title: **Little Run** (from the project folder name; my call, easy to change).

## Intent

A two-player cooperative puzzle walk that runs in the browser. Two friends, each on
their own computer, walk a trail up a small island and meet five puzzles on the way.
No puzzle can be solved by one person.

The owner's favourite part of Big Walk was the puzzle solving, and they want to play
with exactly one friend who is on their own computer. Those three things are the
owner's. Everything else in this document is my call unless marked **(owner)**.

This is an original game in the same genre. It borrows the structure — walk together,
hit a puzzle that needs both of you — and nothing else: its own name, world,
characters, art and puzzles.

## Goals

- The puzzles are the point **(owner)**. Each one needs both players to do different
  things at the same time, or needs one player to tell the other something they
  can't see for themselves.
- Exactly two players **(owner)**, each on their own computer **(owner)**.
- Getting into a game together is one short code: no accounts, no server to run.
- A complete walk, start to ending, in roughly 20–30 minutes.
- Nobody gets stuck permanently and nobody can fail. There is no death, no timer,
  no score.

## Non-goals

- Solo play, or more than two players.
- In-game voice or text chat. The players are expected to be on a call already.
  Voice that fades with distance is a possible later addition.
- Phones, tablets, gamepads. Keyboard and mouse on a desktop browser only.
- Putting the game on the web. The build produces a folder of static files that any
  static host can serve; choosing and setting up a host is a later step the owner
  decides. Until then the game is tested with two browser tabs on one machine.
- Saving progress between sessions. A walk is played in one sitting.
- Carrying on if the host leaves. If the host closes their tab the walk is over.

## Anti-goals

- A puzzle one player can finish alone, by any trick. That would make the game
  technically work and miss the point.
- A puzzle whose difficulty is the controls rather than the co-operation. If
  two people who understand the answer can't execute it in a few tries, the
  tolerances are wrong.
- Anything that reads as a copy of Big Walk's characters, art or levels.

## Constraints

- three.js **0.187.0** (the newest release on npm as of 2026-11-13) **(owner: "latest
  version of three js")**.
- Vite for the dev server and build. Plain JavaScript ES modules, no framework.
- No art or sound files. All shapes are built in code; all sound is synthesised
  with the Web Audio API.
- No physics engine. Movement and collision are hand-written and simple.
- Connection is browser-to-browser over WebRTC using the PeerJS library and its free
  public broker. The broker only introduces the two browsers; game data does not go
  through it. The only thing sent to the broker is the room code. Known limit: on a
  small share of home networks a direct connection can't be made. The game should
  say so plainly when connecting times out; fixing it (a relay server) is out of
  scope.

## How a session goes

1. Title screen: **Start a walk** or **Join a walk**.
2. Start: the game shows a five-letter code (letters only, no look-alike characters)
   and waits. The starter can already walk around the beach while waiting.
3. Join: type the code, press Enter. Both players appear on the beach.
4. They follow the trail through five puzzles to the top of the island.
5. Ending: the beacon lights, the camera pulls back, and a card shows how long the
   walk took and how far each of them walked.

If the joiner's connection drops, the host sees "Waiting for your friend…" and the
same code lets the joiner back in at the last checkpoint with all solved puzzles
still solved.

## The world

One small island, about 300 m across, low-poly and flat-shaded with soft colours.
The trail starts on a beach and winds up to a stone beacon on the summit. The
terrain is a height function, so the ground is walkable everywhere it isn't too
steep; cliffs, water and rock walls keep the pair on the trail and make each puzzle
the only way forward. Walking into deep water puts you back at the last checkpoint.
Each solved puzzle is a checkpoint.

The players are "pebble folk": short, rounded, stone-coloured bodies on stubby legs
with a bright scarf — orange for the host, teal for the joiner. They have arms that
can point and wave.

## Moving and communicating

- **W A S D** walk, **Shift** run, mouse looks (the pointer is captured on click;
  Esc releases it). Third-person camera that orbits the player and doesn't pass
  through terrain.
- **E** interact: press for one-shot things, hold for things like cranks and carrying.
- **Q** (hold) point: your character points where you're looking and a small marker
  appears on whatever you're pointing at. Your friend sees both.
- **F** shout: a ring pulses out from you that your friend can see through terrain,
  with an arrow at the edge of their screen if you're out of view.
- **1** wave.
- A small arrow at the screen edge always shows which way your friend is when
  they're off screen.

No jumping.

## The puzzles

In trail order. Each is solved once and stays solved.

1. **The Gate** — teaches "one holds, one goes". A gate stays open only while
   someone stands on the plate in front of it. One holds it, the other walks
   through and finds a second plate on the far side that holds it from there.
2. **The Signal** — one sees, one does. The trail forks around a ravine. From a
   lookout on one side you can see four painted symbols on the back of a wall. On
   the other side, facing the front of that wall, are four dials. The watcher tells
   the dialler what to set. The symbols are picked at random each session. Right
   answer: a bridge swings out and reunites them.
   The symbols glow only while someone is standing at the dials and are blank
   otherwise, so one player can't read them and then walk round to set them.
3. **The Plank** — a plank too long for one. Each player picks up an end (E to grab,
   E to let go). It hangs between them; drift too far apart and it drops. They carry
   it through a narrow zigzag of standing stones, which takes turning it together,
   and set it across a gap in the trail.
   The plank can't pass through a stone: a carrier simply can't step anywhere that
   would push the plank into one. It never drops from touching a stone, only from
   the two carriers drifting too far apart.
4. **The Lift** — one works, one rides. A crank raises a platform only while it's
   held turning; let go and the platform sinks back. One cranks, the other rides up
   to a ledge and kicks down a rope ladder so the cranker can follow.
5. **The Beam** — the finale. A lamp throws a fixed beam of light. Each player picks
   up a mirror. A held mirror sends the beam out in the direction its holder's
   camera is looking, up and down included, whatever angle the beam came in at —
   it redirects rather than obeying real mirror angles, and only while the incoming
   beam is actually landing on the holder. A rock outcrop blocks every single-bounce path, so it takes lamp → first
   mirror → second mirror → the beacon's lens. Hold it on the lens for two seconds
   and the beacon lights. Aiming is forgiving: within a few degrees counts.

## How it works underneath

- **Who decides what.** Each browser moves its own character and sends its position,
  facing and what it's doing about 15 times a second; the other side smooths
  between updates. The host alone decides the state of every puzzle, from both
  players' positions and interact presses, and sends that state to the joiner. The
  joiner's browser only draws what the host says.
- **Puzzles are plain logic.** Each puzzle is a small module with a state object and
  a step function that takes the state, both players' inputs and the time passed,
  and returns the new state — no three.js, no network inside it. A separate piece
  draws the state. This is what makes them testable without a browser.
- **The plank.** The one place the two rules above meet. Each browser stops its own
  character from stepping where the line between itself and its friend's last
  known position would cross a standing stone. The host only judges distance,
  dropping and placement.
- **The host keeps running when its tab is hidden.** Browsers pause drawing in a
  background tab. The host's puzzle logic and network sending must not depend on
  drawing, so the walk carries on if the host switches to their call window.
- **Testing.** Unit tests (Vitest) for every puzzle's logic, the plank's distance
  and stone rules, the beam's redirect maths, the room-code generator and the
  message format. Then one person plays a real two-tab session far enough to prove
  connecting, seeing each other move, and The Gate; and plays every puzzle through
  to the ending in one tab with the stand-in below.
- **A stand-in for development.** A `?debug` flag adds a dummy second player driven
  from the keyboard of the same tab: park it on a spot, have it hold E, have it
  follow you at a fixed offset (for the plank), or have it aim at a chosen target
  (for the beam). It runs through the same puzzle logic as a real second player.
  It never ships as a way to play.

## Left to the builder

- File layout, exact message format, exact tolerances and sizes.
- The island's exact shape and the look of each puzzle's set dressing.
- The four-symbol set for The Signal and how many options each dial has (enough that
  guessing isn't quicker than talking).
- Sound design, within "synthesised, quiet, a chime when a puzzle is solved".

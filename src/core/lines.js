// Lines that flash on screen one at a time: pushed together, they show a gap apart, in order.
// `show(line)` is called when a line's turn comes. Pure but for the clock and timers.
export function createLineQueue(show, gap = 3200) {
  let free = 0;                 // when the next line may show
  const timers = new Set();
  return {
    // `wait`: hold this line back at least that long (something else is on screen now)
    push(line, wait = 0) {
      const now = Date.now(), at = Math.max(now + wait, free);
      free = at + gap;
      if (at <= now) { show(line); return; }
      const id = setTimeout(() => { timers.delete(id); show(line); }, at - now);
      timers.add(id);
    },
    // forget whatever is waiting (the friend rejoined, or the stroll is over)
    clear() {
      for (const id of timers) clearTimeout(id);
      timers.clear();
      free = 0;
    },
  };
}

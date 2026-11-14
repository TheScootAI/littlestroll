// A fixed-rate ticker that keeps firing in a hidden tab. Timers on a page are throttled
// when the tab is hidden; a Worker's are not, so the tick comes from an inline Worker.
// Falls back to a page setInterval where Workers (or blob URLs) are unavailable.

// ?pilot: animation frames can stop without the page reporting itself hidden (an off-screen
// browser pane). Should the logic ticker run the walker's movement this tick? Only for a
// pilot, once the frame loop has started and no frame has run for FRAME_GAP_MS.
export const FRAME_GAP_MS = 150;
export const tickerDrives = (pilot, now, lastFrame, gapMs = FRAME_GAP_MS) =>
  !!pilot && lastFrame !== null && lastFrame !== undefined && now - lastFrame >= gapMs;

export function createTicker(hz, fn) {
  const ms = Math.round(1000 / hz);
  let last = performance.now();
  const tick = () => {
    const now = performance.now();
    const dt = (now - last) / 1000;
    last = now;
    fn(dt);
  };

  let worker = null, url = null, timer = null;
  try {
    const src = `let id = setInterval(() => postMessage(0), ${ms}); onmessage = () => clearInterval(id);`;
    url = URL.createObjectURL(new Blob([src], { type: 'text/javascript' }));
    worker = new Worker(url);
    worker.onmessage = tick;
    worker.onerror = () => {
      if (!worker) return;
      worker.terminate();
      worker = null;
      timer = setInterval(tick, ms);
    };
  } catch {
    worker = null;
    timer = setInterval(tick, ms);
  }

  return {
    stop() {
      if (worker) { worker.postMessage(1); worker.terminate(); worker = null; }
      if (url) { URL.revokeObjectURL(url); url = null; }
      if (timer !== null) { clearInterval(timer); timer = null; }
    },
  };
}

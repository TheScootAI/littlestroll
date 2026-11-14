// Reconnect and silence rules. Pure: no three.js, no DOM, no network.

export const SILENCE_MS = 8000;        // no message from the other side this long: treat the link as closed
export const RETRY_TOTAL_MS = 30000;   // a joiner keeps trying this long before giving up
export const REPLACE_AFTER_MS = 1500;  // a partner this quiet yields to a new `hello`

// How long to wait before retry number `attempt` (0 = the first), `elapsedMs` after the
// connection closed. null = give up (the next retry would fall past the budget).
export function retryDelay(attempt, elapsedMs) {
  const d = attempt === 0 ? 1000 : 2000;
  return elapsedMs + d > RETRY_TOTAL_MS ? null : d;
}

// Host: a new `hello` arrives while a partner is held. Is the old one half-dead?
export const shouldReplacePartner = (silentMs) => silentMs > REPLACE_AFTER_MS;

export const isSilent = (now, lastRx, limitMs) => now - lastRx > limitMs;

export const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ';

export function makeCode(rand = Math.random) {
  let s = '';
  for (let i = 0; i < 5; i++) s += ALPHABET[Math.floor(rand() * ALPHABET.length)];
  return s;
}

export function normalizeCode(text) {
  if (typeof text !== 'string') return null;
  const s = text.replace(/\s+/g, '').toUpperCase();
  return new RegExp(`^[${ALPHABET}]{5}$`).test(s) ? s : null;
}

export const peerIdFor = (code) => `littlerun-${code}`;

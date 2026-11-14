// Shared look for the menu and the HUD: soft, warm, one orange accent.
export const ACCENT = '#f08a3c';
export const INK = '#4a3b30';
export const PAPER = '#fff7ea';

export function injectStyles(id, css) {
  if (document.getElementById(id)) return;
  const el = document.createElement('style');
  el.id = id;
  el.textContent = css;
  document.head.appendChild(el);
}

export function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

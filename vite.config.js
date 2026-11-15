import { defineConfig } from 'vite';

export default defineConfig({
  // Relative asset paths, so the built game works from any folder (e.g. GitHub Pages' /littlestroll/).
  base: './',
  test: { include: ['tests/**/*.test.js'] },
});

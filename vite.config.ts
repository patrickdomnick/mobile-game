import { defineConfig } from 'vite';

export default defineConfig({
  // Relative base so the same dist/ works at both http://localhost:4173/ and GitHub Pages (/mobile-game/)
  base: './',
  server: {
    port: 5173,
    strictPort: true,
  },
  preview: {
    host: '127.0.0.1',
    port: 4173,
    strictPort: true,
  },
  build: {
    target: 'es2022',
    sourcemap: false,
  },
});

import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    port: 5173,
    open: true,
  },
  build: {
    // Allow top-level await (used to load config at runtime).
    target: 'esnext',
  },
});

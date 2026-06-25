import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// https://vite.dev/config/
// Vitest configuration lives in vitest.config.ts (kept separate so this file
// stays pure Vite 8 — its rolldown types conflict with vitest's bundled Vite).
export default defineConfig({
  plugins: [react()],
  resolve: {
    // Resolve the @/* path alias from tsconfig (native in Vite 8).
    tsconfigPaths: true,
  },
  css: {
    modules: {
      localsConvention: 'camelCaseOnly',
    },
  },
  build: {
    // The bundle is dominated by @mastra/client-js; the heavy thread view is
    // additionally split out via React.lazy (see App.tsx).
    chunkSizeWarningLimit: 800,
  },
});

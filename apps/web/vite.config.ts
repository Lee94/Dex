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
    // The vinci/帆软 stack peer-depends on React 18 and some deps (@fd/fine-design-biz)
    // bundle their own copy; force a single React 19 instance so hooks don't break
    // ("Invalid hook call"). Paired with the npm `overrides` in package.json.
    dedupe: ['react', 'react-dom', 'react/jsx-runtime'],
  },
  optimizeDeps: {
    // Force every React entry point into ONE optimize pass. Otherwise Vite buckets
    // react-dom/client separately from react (different ?v= hashes) → two React
    // instances → "Invalid hook call" with the heavy vinci/帆软 dep graph.
    include: [
      'react',
      'react-dom',
      'react-dom/client',
      'react/jsx-runtime',
      'react/jsx-dev-runtime',
    ],
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

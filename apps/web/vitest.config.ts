import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

// Vitest config (separate from vite.config.ts, which is pinned to Vite 8 / rolldown
// types that clash with vitest's bundled Vite). Kept out of the tsc build via the
// tsconfig includes, so the type mismatch never reaches `npm run typecheck`.
export default defineConfig({
  plugins: [react()],
  resolve: {
    // Mirror the @/* alias (vitest's bundled Vite doesn't read tsconfigPaths).
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  // Emit the automatic JSX runtime (react/jsx-runtime) so test files need no
  // `React` in scope.
  esbuild: { jsx: 'automatic' },
  test: {
    environment: 'jsdom',
    globals: true,
    include: ['src/**/*.test.{ts,tsx}'],
  },
});

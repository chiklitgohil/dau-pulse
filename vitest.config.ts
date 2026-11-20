import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  resolve: {
    alias: { '@': path.resolve(import.meta.dirname, 'src') },
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    // Each integration test file spins up its own in-memory Postgres (PGlite).
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});

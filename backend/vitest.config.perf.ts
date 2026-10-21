import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    globals: true,
    root: './',
    include: ['**/*.perf-spec.ts'],
    fileParallelism: false,
    // The suite emulates a 2 s round trip on every request, so the timeouts
    // are generous by design.
    testTimeout: 180_000,
    hookTimeout: 180_000,
  },
});

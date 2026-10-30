import tsconfigPaths from "vite-tsconfig-paths";
import { defineConfig } from "vitest/config";

/**
 * End-to-end API flows against a RUNNING backend (not part of `npm test`).
 * Uses the frontend's own API functions, real OTP login (code recovered from the
 * local dev Redis) and fresh test users. Run: `npm run test:e2e`.
 * Env: E2E_API_URL (default http://localhost:3000/api/v1), E2E_REDIS_CONTAINER (default docker-redis-1).
 */
export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: "node",
    include: ["src/e2e/**/*.e2e.ts"],
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
    env: {
      NEXT_PUBLIC_API_URL: process.env.E2E_API_URL ?? "http://localhost:3000/api/v1",
    },
  },
});

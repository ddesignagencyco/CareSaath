import react from "@vitejs/plugin-react";
import tsconfigPaths from "vite-tsconfig-paths";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [tsconfigPaths(), react()],
  test: {
    environment: "jsdom",
    // One jsdom per worker (files still isolated in their own VM context): ~3x faster than the default pool.
    pool: "vmThreads",
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.test.{ts,tsx}"],
    // API-layer tests exercise the real HTTP path; mock-mode tests opt in with vi.stubEnv + vi.resetModules.
    env: {
      NEXT_PUBLIC_USE_MOCKS: "false",
      NEXT_PUBLIC_API_URL: "http://api.test/api/v1",
      TZ: "Asia/Karachi",
    },
    restoreMocks: true,
    unstubEnvs: true,
    unstubGlobals: true,
  },
});

import path from "node:path";
import { defineConfig } from "vitest/config";

// Dev-only: runs scripts/dev/*.seed.ts (data for hand testing) with the same aliases and the same LOCAL-only guard
// as the access tests. Nothing here is part of the test suite.  Usage: pnpm dev:seed-play
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
      "server-only": path.resolve(import.meta.dirname, "tests/stubs/server-only.ts"),
    },
  },
  test: {
    environment: "node",
    include: ["scripts/dev/*.seed.ts"],
    setupFiles: ["tests/access/setup-env.ts"],
    testTimeout: 120_000,
    hookTimeout: 120_000,
    fileParallelism: false,
  },
});

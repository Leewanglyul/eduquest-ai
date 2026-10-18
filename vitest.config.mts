import path from "node:path";
import { defineConfig } from "vitest/config";

// Application-level authorization tests. They run against the LOCAL Supabase stack
// (`supabase start` + `supabase db reset`), using .env.local.
export default defineConfig({
  // The student screens are rendered to static markup in tests; tsconfig keeps JSX for Next, so tell the test transform.
  oxc: { jsx: { runtime: "automatic" } },
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
      "server-only": path.resolve(import.meta.dirname, "tests/stubs/server-only.ts"),
    },
  },
  test: {
    environment: "node",
    include: ["tests/access/**/*.test.{ts,tsx}"],
    setupFiles: ["tests/access/setup-env.ts"],
    testTimeout: 30_000,
    hookTimeout: 60_000,
    fileParallelism: false,
  },
});

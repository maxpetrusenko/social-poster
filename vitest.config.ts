import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    environment: "happy-dom",
    globals: true,
    testTimeout: 10000,
    include: [
      "src/lib/__tests__/**/*.test.{ts,tsx}",
      "src/lib/providers/instagram-personal.test.ts",
      "src/components/__tests__/**/*.test.{ts,tsx}",
      "src/app/api/__tests__/**/*.test.{ts,tsx}",
    ],
    setupFiles: [],
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "lcov"],
      include: [
        "src/lib/providers/instagram-personal.ts",
        "src/lib/supabase/browser.ts",
      ],
      thresholds: {
        lines: 90,
        functions: 90,
        branches: 90,
        statements: 90,
      },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});

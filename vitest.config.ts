import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    environment: "happy-dom",
    globals: true,
    testTimeout: 10000,
    include: ["src/lib/__tests__/**/*.test.{ts,tsx}", "src/components/__tests__/**/*.test.{ts,tsx}", "src/app/api/__tests__/**/*.test.{ts,tsx}"],
    setupFiles: [],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});

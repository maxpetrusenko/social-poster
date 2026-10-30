import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: { "@": path.resolve(__dirname, "src") },
  },
  test: {
    include: ["scripts/thesis-live.ts"],
    environment: "node",
    testTimeout: 240000,
    hookTimeout: 240000,
  },
});

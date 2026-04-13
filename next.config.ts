import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  distDir: process.env.NEXT_DIST_DIR || ".next",
  output: "standalone",
  outputFileTracingRoot: process.cwd(),
  serverExternalPackages: ["better-sqlite3", "node-cron"],
};

export default nextConfig;

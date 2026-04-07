import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  outputFileTracingRoot: process.cwd(),
  serverExternalPackages: ["better-sqlite3", "node-cron"],
};

export default nextConfig;

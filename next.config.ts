import type { NextConfig } from "next";

import { MAX_MEDIA_BYTES } from "./src/lib/media-limits";

const nextConfig: NextConfig = {
  distDir: process.env.NEXT_DIST_DIR || ".next",
  output: "standalone",
  outputFileTracingRoot: process.cwd(),
  experimental: {
    // Middleware matches /api/media/upload; without this Next truncates the
    // request body at 10 MB and request.formData() throws.
    middlewareClientMaxBodySize: MAX_MEDIA_BYTES,
  },
  serverExternalPackages: ["better-sqlite3", "node-cron"],
  images: {
    localPatterns: [
      {
        // Preserve Next's existing "all local images are allowed" behavior while
        // explicitly permitting query-string backed internal artifact previews.
        pathname: "/**",
      },
    ],
    remotePatterns: [
      {
        protocol: "https",
        hostname: "unavatar.io",
      },
    ],
  },
};

export default nextConfig;

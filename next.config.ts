import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Runs as a long-lived Node server in Docker (see specs/architecture.md), not serverless.
  output: "standalone",
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;

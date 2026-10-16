import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  output: "standalone",
  // Set at build time to serve under a sub-path, e.g. BASE_PATH=/radar.
  basePath: process.env.BASE_PATH || undefined,
  serverExternalPackages: ["pg"],
};

export default nextConfig;

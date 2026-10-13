import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Thread workers avoid Windows child-process failures during type checks/builds.
  experimental: { workerThreads: true, useTypeScriptCli: false, cpus: 2 },
  // Allow importing from the monorepo packages
  transpilePackages: ["@aegis/sdk"],
  outputFileTracingExcludes: {
    "*": ["**/.env*", "**/.aegis-data/**"],
  },
};

export default nextConfig;

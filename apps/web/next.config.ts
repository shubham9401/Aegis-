import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Allow importing from the monorepo packages
  transpilePackages: ["@aegis/sdk"],
};

export default nextConfig;

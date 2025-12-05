import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  reactCompiler: true,
  // External packages for server components
  serverExternalPackages: ["pino", "pino-pretty"],
  turbopack: {
    // Force root to the app workspace so .env and lockfiles resolve correctly
    root: __dirname,
  },
};

export default nextConfig;

import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  reactCompiler: true,
  // External packages for server components
  serverExternalPackages: ["pino", "pino-pretty"],
};

export default nextConfig;

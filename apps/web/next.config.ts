import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  /* config options here */
  reactCompiler: true,
  // External packages for server components
  serverExternalPackages: ["pino", "pino-pretty"],
  turbopack: {
    // Force root to monorepo root so Turbopack finds hoisted deps
    root: path.join(__dirname, "..", ".."),
    // Ensure Next can resolve workspace packages (monorepo)
    resolveAlias: {
      "@": "./src",
    },
  },
};

export default nextConfig;

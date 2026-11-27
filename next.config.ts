import type { NextConfig } from "next";
const config: NextConfig = {
  poweredByHeader: false,
  experimental: { cpus: 2, webpackMemoryOptimizations: true },
  serverExternalPackages: ["node:sqlite"],
  // The Python worker owns its weights; Next must not trace gigabytes of models.
  outputFileTracingExcludes: {
    "/**": ["./.local/models/**/*", "./.local/wheels/**/*", "./ai-worker/**/*", "./test-results/**/*"],
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
    ];
  },
};
export default config;

import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  async rewrites() {
    return [
      // landing v3 promovida a HOME (14/08) — antiga arquivada em /old
      { source: "/", destination: "/nova/index.html" },
      { source: "/nova", destination: "/nova/index.html" },
      { source: "/nova/en", destination: "/nova/en/index.html" },
      { source: "/nova/es", destination: "/nova/es/index.html" },
    ];
  },
};

export default nextConfig;

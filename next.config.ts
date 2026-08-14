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
      // landing v3 em teste (noindex) — promover pra home quando o funil for validado
      { source: "/nova", destination: "/nova/index.html" },
      { source: "/nova/en", destination: "/nova/en/index.html" },
      { source: "/nova/es", destination: "/nova/es/index.html" },
    ];
  },
};

export default nextConfig;

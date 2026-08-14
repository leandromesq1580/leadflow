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
    ];
  },
};

export default nextConfig;

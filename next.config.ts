import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  async redirects() {
    // Keep the original standalone HTML byte-for-byte. An explicit index URL
    // gives its relative docs/media URLs the correct base, including #inicio.
    // Do not change global trailingSlash behavior or the auth/native proxy.
    return [{ source: "/academy", destination: "/academy/index.html", permanent: false }];
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

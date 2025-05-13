import type { NextConfig } from "next";

const nextConfig = {
  async rewrites() {
    return [
      {
        source: '/py/:path*',
        destination: 'http://0.0.0.0:8000/:path*',
      },
    ]
  },
};

export default nextConfig;

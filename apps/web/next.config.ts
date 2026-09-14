import type { NextConfig } from "next";

const apiInternal = process.env.API_INTERNAL_URL ?? "http://localhost:3001";

const nextConfig: NextConfig = {
  output: "standalone",
  transpilePackages: ["@enermesh/shared"],
  allowedDevOrigins: [".monkeycode-ai.live"],
  experimental: {
    cpus: 1,
    webpackBuildWorker: false,
  },
  webpack: (config) => {
    config.parallelism = 1;
    config.cache = false;
    return config;
  },
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${apiInternal}/api/:path*`,
      },
      {
        source: "/socket.io/:path*",
        destination: `${apiInternal}/socket.io/:path*`,
      },
    ];
  },
};

export default nextConfig;

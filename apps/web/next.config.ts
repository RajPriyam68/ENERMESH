import type { NextConfig } from "next";

const apiInternal = process.env.API_INTERNAL_URL ?? "http://localhost:3001";

const nextConfig: NextConfig = {
  output: "standalone",
  transpilePackages: ["@enermesh/shared"],
  allowedDevOrigins: ["*.monkeycode-ai.live"],
  distDir: process.env.NODE_ENV === "production" ? ".next" : ".next-dev",
  experimental: {
    cpus: 1,
    webpackBuildWorker: false,
  },
  webpack: (config) => {
    config.parallelism = 1;
    config.cache = false;
    return config;
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
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

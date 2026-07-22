import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  async rewrites() {
    return [{ source: "/.well-known/x402", destination: "/well-known/x402" }];
  },
};

export default nextConfig;

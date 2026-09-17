import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  async rewrites() {
    return [
      { source: "/.well-known/x402", destination: "/well-known/x402" },
      { source: "/.well-known/402index-verify.txt", destination: "/well-known/402index-verify.txt" },
    ];
  },
};

export default nextConfig;

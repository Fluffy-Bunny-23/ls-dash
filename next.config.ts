import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Firebase client SDK touches browser globals; keep default bundling.
};

export default nextConfig;

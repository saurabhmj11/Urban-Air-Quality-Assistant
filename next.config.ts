import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  /* config options here */
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
  // Hide the dev-mode floating indicator so the UI preview stays clean.
  devIndicators: false,
};

export default nextConfig;

import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  reactStrictMode: true,
  // Hide the dev-mode floating indicator so the UI preview stays clean.
  devIndicators: false,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          // Browser hardening — standard OWASP secure-headers baseline.
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains",
          },
          {
            // Content-Security-Policy: everything is same-origin except
            // nothing — the client only calls /api; fonts are self-hosted by
            // next/font. 'unsafe-inline'/'unsafe-eval' for scripts cover the
            // inline hydration bootstrap and dev HMR (no nonce infra here);
            // frame-ancestors + object-src 'none' block embedding/plugin
            // abuse outright.
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' data: blob:",
              "font-src 'self' data:",
              "connect-src 'self'",
              "object-src 'none'",
              "base-uri 'self'",
              "form-action 'self'",
              "frame-ancestors 'none'",
            ].join("; "),
          },
        ],
      },
      {
        // Never let a misconfigured deployment cache live API responses.
        source: "/api/:path*",
        headers: [{ key: "Cache-Control", value: "no-store" }],
      },
    ];
  },
};

export default nextConfig;

import type { NextConfig } from "next";

const production = process.env.NODE_ENV === "production";

// The content security policy is set per request in src/proxy.ts; these headers go on everything.
const nextConfig: NextConfig = {
  devIndicators: false,
  poweredByHeader: false,
  distDir: process.env.NEXT_DIST_DIR || ".next", // lets a check build run beside a running dev server
  async headers() {
    return [{
      source: "/:path*",
      headers: [
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "X-Frame-Options", value: "DENY" },
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), browsing-topics=()" },
        { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
        { key: "X-Permitted-Cross-Domain-Policies", value: "none" },
        // Browsers that have seen the site once will only ever use HTTPS for it.
        ...(production ? [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" }] : []),
      ],
    }, {
      source: "/api/:path*",
      headers: [{ key: "Content-Security-Policy", value: "default-src 'none'; frame-ancestors 'none'" }, { key: "X-Robots-Tag", value: "noindex" }, { key: "Cache-Control", value: "no-store" }],
    }];
  },
};

export default nextConfig;

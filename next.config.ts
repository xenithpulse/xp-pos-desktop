import type { NextConfig } from "next";

/**
 * Security headers applied to every response.
 *
 * Notes:
 *   - HSTS only takes effect over HTTPS (Vercel default). Safe in dev.
 *   - X-Frame-Options DENY blocks all framing. Switch to SAMEORIGIN if you
 *     ever need to embed your own pages in iframes (e.g. preview).
 *   - We deliberately do NOT set a Content-Security-Policy here yet because
 *     Next.js Turbopack injects inline scripts; a strict CSP requires nonce
 *     integration on every Server Component. Add later as a focused effort.
 */
const securityHeaders = [
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), interest-cohort=()" },
  { key: "X-DNS-Prefetch-Control", value: "on" },
];

const nextConfig: NextConfig = {
  // Produce a self-contained server bundle (.next/standalone) so the installer
  // can ship the app as `node server.js` with no npm install on the client box.
  // installer/build.ps1 stages this tree, and the XPPOS-App Windows service
  // runs it directly. Removing this breaks the native packaging entirely.
  output: "standalone",
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;

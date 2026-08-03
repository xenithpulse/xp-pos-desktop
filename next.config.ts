import type { NextConfig } from "next";
import pkg from "./package.json";

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

  // ── Keep the build's OWN OUTPUT out of the build ───────────────────────────
  //
  // Next traces which files each entry needs and copies them into
  // .next/standalone. Adding the update agent made it copy the repository:
  // installer\payload and installer\dist\*.exe ended up INSIDE the app bundle,
  // so every build packaged the build before it. Measured: 438 MB payload to
  // 1,483 MB, standalone 33 MB to 1,901 MB, compounding on each release, with a
  // larger download as the only symptom.
  //
  // Two patterns caused it, and BOTH are fixed at the source rather than here:
  //
  //   1. Paths built from process.cwd(). The tracer evaluates it at build time,
  //      so a runtime path derived from it reads as "this entry might open
  //      anything under the repo root". lib/updates/paths.ts now uses literal
  //      constants and POS_INSTALL_DIR (set from WinSW's %BASE%), and the app
  //      version is baked in below instead of read from package.json on disk.
  //
  //   2. Literal filenames beside an unresolvable directory. Given
  //      path.join(installDir(), "scripts", "apply-update.ps1") the tracer
  //      globs for the part it DOES know and takes every match on disk - which
  //      is how installer\dist got swept in via **\XP-POS-Setup-*.exe. The
  //      downloaded payload is therefore named XP-POS-Update-<version>.exe,
  //      which matches nothing in the repo.
  //
  // This exclude list is a BACKSTOP, not the fix, and it is worth knowing why:
  // the "**/*" key covers route handlers but does NOT cover instrumentation,
  // and naming that entry explicitly did not work either. It was still listing
  // every apply-update.ps1 and XP-POS-Setup-*.exe on disk after both were
  // added. The keys are kept because they do correctly stop the route handlers
  // from dragging the repo in.
  //
  // build.ps1 asserts the resulting payload, because an exclude list is only as
  // good as the next person's memory to update it.
  outputFileTracingExcludes: {
    "**/*": ["./installer/**", "./docs/**", "./.next/cache/**", "./.git/**"],
    "instrumentation": ["./installer/**", "./docs/**", "./.next/cache/**", "./.git/**"],
    "/instrumentation": ["./installer/**", "./docs/**", "./.next/cache/**", "./.git/**"],
  },

  // ── The installed version, baked in at build time ─────────────────────────
  //
  // The update check compares this against what the release manifest offers, so
  // it has to be the version the installer actually shipped. Reading
  // package.json at runtime would do that too, but it means an fs call on a
  // path derived from process.cwd() - which is exactly what makes the file
  // tracer copy the repo into the bundle (see outputFileTracingExcludes above).
  //
  // Baking it in is also simply more correct: one build produces one artifact
  // with one version, and it cannot disagree with itself. Site-specific values
  // must never be inlined this way - that is why the NEXT_PUBLIC_PUSHER_*
  // variables were removed during the migration - but the version is a property
  // of the BUILD, which is the same everywhere it is installed.
  env: {
    POS_APP_VERSION: pkg.version,
  },

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

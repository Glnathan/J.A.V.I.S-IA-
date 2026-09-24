import type { NextConfig } from "next";

// `node scripts/build-desktop.mjs` sets JARVIS_DESKTOP_BUILD=1 to produce the self-contained
// server bundled inside the Windows installer (separate .next-desktop folder).
const desktopBuild = process.env.JARVIS_DESKTOP_BUILD === "1";

const nextConfig: NextConfig = {
  serverExternalPackages: ["@electric-sql/pglite"],
  // Next.js matches these patterns anywhere in a path ("contains"), so keep them unambiguous:
  // e.g. "desktop/**" would also drop ".next-desktop/…" server chunks from the desktop bundle.
  outputFileTracingExcludes: {
    "*": ["downloads/**", "dist-desktop/**", ".cache-desktop/**", ".jarvis-data/**"],
  },
  ...(desktopBuild ? { output: "standalone" as const, distDir: ".next-desktop", images: { unoptimized: true } } : {}),
};

export default nextConfig;

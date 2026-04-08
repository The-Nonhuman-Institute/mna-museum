import type { NextConfig } from "next";
import path from "node:path";

/**
 * MNA Steward Terminal — Next.js 16 config.
 *
 * Turbopack is the default bundler in Next.js 16 (no config needed). File
 * system caching is stable and on by default from 16.1+, giving fast dev
 * server restarts without any additional wiring.
 */
const nextConfig: NextConfig = {
  // Explicitly tell Turbopack that this directory is the workspace root.
  // The terminal lives in a sibling directory of a multi-app repo (website,
  // system, terminal) and the project-root has its own package-lock.json
  // for system/scripts/, which confuses Turbopack's root inference.
  turbopack: {
    root: path.resolve(__dirname),
  },

  // better-sqlite3 is a native module; keep it external to the server bundle
  // so the Node runtime loads it directly rather than through Turbopack.
  serverExternalPackages: ["better-sqlite3"],

  // The Terminal is a private internal tool served over Tailscale — no CDN
  // image optimization, no remote images, minimal surface area.
  images: { unoptimized: true },

  // Don't expose source maps in production builds of a private tool.
  productionBrowserSourceMaps: false,
};

export default nextConfig;

/** @type {import('next').NextConfig} */
const nextConfig = {
  // The DB module (registration-db) is, via ceremonies.ts, transitively
  // reachable from a "use client" component. Its server-only `fs` usage (for
  // resolving the bundled snapshot) must not be pulled into the client bundle —
  // stub it to an empty module there. It only ever runs server-side.
  webpack: (config, { isServer }) => {
    if (!isServer) {
      config.resolve.fallback = { ...config.resolve.fallback, fs: false };
    }
    return config;
  },

  experimental: {
    // Ship the read-only institution snapshot inside the serverless function
    // filesystem so getDb() can read public content from it (zero Turso reads).
    // Harmless when the file is absent (pre-activation): nothing to include.
    outputFileTracingIncludes: {
      "/**": ["./data/snapshot.db"],
    },
  },
};

export default nextConfig;

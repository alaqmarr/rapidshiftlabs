import type { NextConfig } from "next";
import path from "node:path";

// Monorepo: a single .env lives at the repository root and is shared by portal, worker and scripts.
try {
  process.loadEnvFile(path.resolve(process.cwd(), "../../.env"));
} catch {
  /* no root .env — rely on real environment variables (production) */
}

const nextConfig: NextConfig = {
  // Admin/portal screens are per-request & session-driven; we use classic dynamic rendering
  // and explicit caching in the domain layer (LRU caches + outbox-driven invalidation).
  cacheComponents: false,
  transpilePackages: ["@rsl/core"],
  serverExternalPackages: ["@libsql/client", "libsql", "ssh2", "@node-rs/argon2", "nodemailer", "@react-pdf/renderer"],
  poweredByHeader: false,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-XSS-Protection", value: "1; mode=block" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          {
            key: "Strict-Transport-Security",
            value: "max-age=31536000; includeSubDomains; preload",
          },
        ],
      },
      {
        // Admin + portal must never be framed (embeds live under /embed and allow framing).
        source: "/(admin|portal)/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          {
            key: "Content-Security-Policy",
            value:
              "default-src 'self'; script-src 'self' 'unsafe-eval' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https: blob:; font-src 'self' data:; connect-src 'self' ws: wss: https:; frame-ancestors 'none';",
          },
        ],
      },
      {
        // Embed routes are designed to be embedded in client apps
        source: "/embed/:path*",
        headers: [
          {
            key: "Content-Security-Policy",
            value:
              "default-src 'self'; script-src 'self' 'unsafe-eval' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https: blob:; font-src 'self' data:; connect-src 'self' ws: wss: https:; frame-ancestors *;",
          },
        ],
      },
    ];
  },
};

export default nextConfig;

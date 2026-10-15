import fs from "node:fs";
import path from "node:path";
import { z } from "zod";

/**
 * Centralised, validated runtime configuration (read lazily so that build steps
 * that never touch the DB don't require secrets).
 */
const EnvSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  DATA_DIR: z.string().optional(),
  /** 32-byte key (base64 or hex) for AES-256-GCM encryption of secrets at rest. */
  MASTER_KEY: z.string().min(32, "MASTER_KEY must be at least 32 chars (base64/hex of 32 bytes)"),
  /** Previous master key, kept during key rotation so old ciphertexts can still be read. */
  MASTER_KEY_PREVIOUS: z.string().optional(),
  /** NextAuth secret (also used as HMAC pepper for analytics visitor hashing salt derivation). */
  AUTH_SECRET: z.string().min(16),
  /** Public base URLs (used in emails, embed snippets and docs). */
  ADMIN_URL: z.string().url().default("http://localhost:3000"),
  PORTAL_URL: z.string().url().default("http://localhost:3000"),
  API_URL: z.string().url().default("http://localhost:3000"),
  /** Optional host-based routing (production). Leave empty for path-based dev routing. */
  ADMIN_HOST: z.string().optional(),
  PORTAL_HOST: z.string().optional(),
  API_HOST: z.string().optional(),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
});

export type AppConfig = z.infer<typeof EnvSchema> & {
  dataDir: string;
  dbPaths: { core: string; analytics: string; metrics: string };
  uploadsDir: string;
  backupsDir: string;
  repoRoot: string;
};

let cached: AppConfig | null = null;

export function findRepoRoot(start = process.cwd()): string {
  if (process.env.REPO_ROOT) return path.resolve(/*turbopackIgnore: true*/ process.env.REPO_ROOT);
  const current = path.resolve(/*turbopackIgnore: true*/ start);
  if (fs.existsSync(path.join(current, "pnpm-workspace.yaml"))) return current;
  const parent2 = path.resolve(/*turbopackIgnore: true*/ current, "../..");
  if (fs.existsSync(path.join(parent2, "pnpm-workspace.yaml"))) return parent2;
  const parent1 = path.resolve(/*turbopackIgnore: true*/ current, "..");
  if (fs.existsSync(path.join(parent1, "pnpm-workspace.yaml"))) return parent1;
  return current;
}

export function getConfig(): AppConfig {
  if (cached) return cached;
  const repoRoot = findRepoRoot();
  if (!process.env.MASTER_KEY || !process.env.AUTH_SECRET) {
    try {
      const envPath = path.join(repoRoot, ".env");
      if (fs.existsSync(envPath) && typeof process.loadEnvFile === "function") {
        process.loadEnvFile(envPath);
      }
    } catch {
      // ignore if .env is unreadable
    }
  }
  const parsed = EnvSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`).join("\n");
    throw new Error(`Invalid environment configuration:\n${issues}\nSee .env.example`);
  }
  const env = parsed.data;
  const dataDir = path.resolve(/*turbopackIgnore: true*/ env.DATA_DIR ?? path.join(repoRoot, "data"));
  fs.mkdirSync(dataDir, { recursive: true });
  const uploadsDir = path.join(dataDir, "uploads");
  const backupsDir = path.join(dataDir, "backups");
  fs.mkdirSync(uploadsDir, { recursive: true });
  fs.mkdirSync(backupsDir, { recursive: true });
  cached = {
    ...env,
    repoRoot,
    dataDir,
    uploadsDir,
    backupsDir,
    dbPaths: {
      core: path.join(dataDir, "core.db"),
      analytics: path.join(dataDir, "analytics.db"),
      metrics: path.join(dataDir, "metrics.db"),
    },
  };
  return cached;
}

/** For tests: override configuration. */
export function setConfigForTests(overrides: Partial<AppConfig>) {
  cached = { ...getConfig(), ...overrides };
}

export const isProduction = () => process.env.NODE_ENV === "production";

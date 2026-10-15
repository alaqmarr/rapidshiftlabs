/**
 * PM2 Ecosystem Configuration for RapidShift Labs Control Plane
 * Runs @rsl/portal (Next.js 16 Web App) and @rsl/worker (Background Daemon)
 *
 * Requirements:
 * - Next.js 16 App Router on port 3000
 * - Background automation worker via tsx / compiled dist
 * - WAL-safe single instance concurrency
 * - Unified log files (logs/portal.log and logs/worker.log)
 * - Auto-restart with exponential backoff & 1GB memory threshold
 */
const path = require("node:path");
const fs = require("node:fs");

// Ensure central logs directory exists
const logsDir = path.resolve(__dirname, "logs");
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

// Parse root .env file so both portal and worker receive all configured variables
function loadRootEnv() {
  const envFile = path.resolve(__dirname, ".env");
  const vars = {};
  if (!fs.existsSync(envFile)) return vars;
  const content = fs.readFileSync(envFile, "utf8");
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eqIdx = line.indexOf("=");
    if (eqIdx <= 0) continue;
    const key = line.slice(0, eqIdx).trim();
    let val = line.slice(eqIdx + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    vars[key] = val;
  }
  return vars;
}

const rootEnv = loadRootEnv();
const port = process.env.PORT || rootEnv.PORT || 3000;

// Detect worker entrypoint (prefer dist/index.js if compiled, fallback to pure JS tsx cli.mjs)
const workerDist = path.resolve(__dirname, "apps/worker/dist/index.js");
const hasWorkerDist = fs.existsSync(workerDist);

module.exports = {
  apps: [
    {
      name: "rapidshift-portal",
      script: "node_modules/next/dist/bin/next",
      args: `start --port ${port}`,
      cwd: path.resolve(__dirname, "apps/portal"),
      instances: 1, // Single instance to preserve in-process write mutex and SSE hub
      exec_mode: "fork",
      autorestart: true,
      max_memory_restart: "1G",
      exp_backoff_restart_delay: 100,
      env: {
        ...rootEnv,
        NODE_ENV: "production",
        PORT: port,
        REPO_ROOT: __dirname,
      },
      log_file: path.resolve(logsDir, "portal.log"),
      out_file: path.resolve(logsDir, "portal.log"),
      error_file: path.resolve(logsDir, "portal.log"),
      merge_logs: true,
      time: true,
    },
    {
      name: "rapidshift-worker",
      script: hasWorkerDist ? "dist/index.js" : "node_modules/tsx/dist/cli.mjs",
      args: hasWorkerDist ? "" : "src/index.ts",
      cwd: path.resolve(__dirname, "apps/worker"),
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      max_memory_restart: "1G",
      exp_backoff_restart_delay: 200,
      env: {
        ...rootEnv,
        NODE_ENV: "production",
        REPO_ROOT: __dirname,
      },
      log_file: path.resolve(logsDir, "worker.log"),
      out_file: path.resolve(logsDir, "worker.log"),
      error_file: path.resolve(logsDir, "worker.log"),
      merge_logs: true,
      time: true,
    },
  ],
};


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

// Detect worker entrypoint (prefer dist/index.js if compiled, fallback to tsx src/index.ts)
const workerDist = path.resolve(__dirname, "apps/worker/dist/index.js");
const hasWorkerDist = fs.existsSync(workerDist);

module.exports = {
  apps: [
    {
      name: "rapidshift-portal",
      script: "node_modules/next/dist/bin/next",
      args: `start --port ${process.env.PORT || 3000}`,
      cwd: path.resolve(__dirname, "apps/portal"),
      instances: 1, // Single instance to preserve in-process write mutex and SSE hub
      exec_mode: "fork",
      autorestart: true,
      max_memory_restart: "1G",
      exp_backoff_restart_delay: 100,
      env: {
        NODE_ENV: "production",
        PORT: process.env.PORT || 3000,
      },
      log_file: path.resolve(logsDir, "portal.log"),
      out_file: path.resolve(logsDir, "portal.log"),
      error_file: path.resolve(logsDir, "portal.log"),
      merge_logs: true,
      time: true,
    },
    {
      name: "rapidshift-worker",
      script: hasWorkerDist ? "dist/index.js" : "node_modules/.bin/tsx",
      args: hasWorkerDist ? "" : "src/index.ts",
      cwd: path.resolve(__dirname, "apps/worker"),
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      max_memory_restart: "1G",
      exp_backoff_restart_delay: 200,
      env: {
        NODE_ENV: "production",
      },
      log_file: path.resolve(logsDir, "worker.log"),
      out_file: path.resolve(logsDir, "worker.log"),
      error_file: path.resolve(logsDir, "worker.log"),
      merge_logs: true,
      time: true,
    },
  ],
};

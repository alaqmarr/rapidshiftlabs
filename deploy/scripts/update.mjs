#!/usr/bin/env node
/**
 * RapidShift Labs — Automated Zero-Friction Update Script
 *
 * Performs a complete production update cycle:
 *   1. git stash          (safely stashes any local tracked file edits; .env and data/ are untouched)
 *   2. git pull           (pulls latest commits from origin/main)
 *   3. pnpm install       (installs/updates workspace dependencies)
 *   4. pnpm db:migrate    (applies database migrations & auto-heals missing Drizzle columns)
 *   5. pnpm build         (builds Next.js portal, worker, SDK, tracker & embeds)
 *   6. pm2 restart        (reloads rapidshift-portal and rapidshift-worker with updated env & config)
 */

import { execSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../..");

function run(cmd, label, { allowFailure = false } = {}) {
  console.log(`\n================================================================================`);
  console.log(`[Update] ▶ ${label}`);
  console.log(`[Update] $ ${cmd}`);
  console.log(`================================================================================`);
  try {
    execSync(cmd, {
      cwd: repoRoot,
      stdio: "inherit",
      env: { ...process.env },
    });
    return true;
  } catch (err) {
    if (allowFailure) {
      console.warn(`[Update] ⚠ Non-fatal warning during "${label}": ${err.message}`);
      return false;
    }
    console.error(`\n[Update] ✖ Failed at step "${label}". Aborting.`);
    process.exit(1);
  }
}

function hasPm2() {
  try {
    execSync("pm2 --version", { cwd: repoRoot, stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

async function main() {
  const startedAt = Date.now();
  console.log("🚀 Starting RapidShift Labs Automated Update Pipeline...");

  // 1. Stash any local tracked file modifications (.env and data/*.db are gitignored and untouched)
  run("git stash", "Step 1/6: Stashing local tracked changes", { allowFailure: true });

  // 2. Pull latest code from remote repository
  run("git pull origin main", "Step 2/6: Pulling latest code from origin/main");

  // 3. Install dependencies
  run("pnpm install", "Step 3/6: Installing workspace dependencies");

  // 4. Run database migrations & automatic schema column sync
  run("pnpm db:migrate", "Step 4/6: Migrating & auto-healing SQLite databases");

  // 5. Build production artifacts
  run("pnpm build", "Step 5/6: Building production packages & Next.js portal");

  // 6. Restart PM2 services if PM2 is available on this machine
  if (hasPm2()) {
    run(
      "pm2 delete rapidshift-portal rapidshift-worker",
      "Step 6a/6: Clearing previous RapidShift PM2 process definitions",
      { allowFailure: true }
    );
    run(
      "pm2 start ecosystem.config.cjs --update-env",
      "Step 6b/6: Starting rapidshift-portal & rapidshift-worker via PM2"
    );
    run("pm2 save", "Step 6c/6: Saving PM2 process list", { allowFailure: true });
    run("pm2 status", "Current PM2 Status", { allowFailure: true });
  } else {
    console.log("\n[Update] ℹ PM2 not detected on this system — skipping PM2 restart step.");
  }

  const elapsedSec = ((Date.now() - startedAt) / 1000).toFixed(1);
  console.log(`\n✅ RapidShift Labs update completed successfully in ${elapsedSec}s!`);
}

main();

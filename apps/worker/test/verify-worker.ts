/**
 * Standalone verification script for RapidShift Background Worker Daemon.
 * Can be executed via: tsx --env-file-if-exists=../../.env test/verify-worker.ts
 */
import { bootstrap, gracefulShutdown, activeJobs, WORKER_ID } from "../src/index";

async function verify() {
  console.log(`[Verify] Starting RapidShift Worker Daemon Verification (Worker ID: ${WORKER_ID})...`);

  // 1. Bootstrap daemon
  const jobs = await bootstrap();
  console.log(`[Verify] Successfully booted ${jobs.length} background jobs.`);

  const expectedJobs = [
    "OutboxPoller",
    "InvoiceGenerator",
    "DunningJob",
    "UptimeChecker",
    "SslChecker",
    "DnsChecker",
    "MetricsPoller",
    "RdapChecker",
    "SlaEscalator",
    "AnalyticsRollup",
    "AnalyticsOffload",
  ];

  for (const name of expectedJobs) {
    const found = jobs.find((j) => j.name === name);
    if (!found) {
      throw new Error(`[Verify] Expected job "${name}" was not registered!`);
    }
    console.log(`[Verify] Verified job registered: ${name}`);
  }

  // 2. Verify activeJobs export
  if (activeJobs.length !== expectedJobs.length) {
    throw new Error(`[Verify] activeJobs length mismatch: expected ${expectedJobs.length}, got ${activeJobs.length}`);
  }

  // 3. Verify graceful shutdown
  console.log("[Verify] Testing graceful shutdown execution...");
  await gracefulShutdown("VERIFY_SIGTERM", false);
  console.log("[Verify] All jobs drained and graceful shutdown confirmed.");

  console.log("[Verify] ALL WORKER VERIFICATION CHECKS PASSED SUCCESSFULLY.");
}

verify().catch((err) => {
  console.error("[Verify] Verification failed:", err);
  process.exit(1);
});

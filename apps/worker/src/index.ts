import process from "node:process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { startOutboxPoller } from "./jobs/outbox-poller";
import { startInvoiceGenerator } from "./jobs/invoice-generator";
import { startDunningJob } from "./jobs/dunning";
import { startUptimeChecker } from "./jobs/uptime-checker";
import { startSslChecker } from "./jobs/ssl-checker";
import { startDnsChecker } from "./jobs/dns-checker";
import { startMetricsPoller } from "./jobs/metrics-poller";
import { startRdapChecker } from "./jobs/rdap-expiry-checker";
import { startSlaEscalator } from "./jobs/sla-escalator";
import { startAnalyticsRollup } from "./jobs/analytics-rollup";
import { startAnalyticsOffload } from "./jobs/analytics-offload";
import { getContainer } from "@rsl/core/container";
import { runMigrations } from "@rsl/core/db";

export const WORKER_ID = `worker-${process.pid}-${Date.now().toString(36)}`;
const HEARTBEAT_INTERVAL_MS = 60_000;

console.log(
  `[Worker] Initializing RapidShift Background Daemon [ID: ${WORKER_ID}]`,
);
console.log(`[Worker] Node Version: ${process.version}, PID: ${process.pid}`);

export interface RunningJob {
  name: string;
  stop: () => Promise<void>;
}

export const activeJobs: RunningJob[] = [];
let isShuttingDown = false;
let heartbeatTimer: NodeJS.Timeout | null = null;

export async function bootstrap(): Promise<RunningJob[]> {
  isShuttingDown = false;
  activeJobs.length = 0;
  try {
    // 0. Ensure all DB migrations have been applied
    console.log("[Worker] Running database migrations...");
    await runMigrations();

    // 1. Initialize Outbox Poller
    console.log("[Worker] Starting Outbox Poller job...");
    const outboxPoller = startOutboxPoller({
      workerId: WORKER_ID,
      pollIntervalMs: 1_000,
      batchSize: 50,
      lockDurationMs: 30_000,
      maxRetries: 5,
    });

    // Wire Milestone 3 Entitlement State Machine event subscribers
    const container = getContainer();

    outboxPoller.registerHandler("invoice.paid", async (record) => {
      try {
        let payload: Record<string, any> = {};
        try {
          payload = JSON.parse(record.payload);
        } catch {}
        await container.entitlementModule.handleBillingEvent("InvoicePaid", {
          clientId: record.clientId,
          invoiceId: record.aggregateId,
          balancePaise: payload.balancePaise ?? 0,
        });
      } catch (err) {
        console.error(
          `[Worker] Error handling invoice.paid for record ${record.id}:`,
          err,
        );
      }
    });

    outboxPoller.registerHandler("payment.recorded", async (record) => {
      try {
        let payload: Record<string, any> = {};
        try {
          payload = JSON.parse(record.payload);
        } catch {}
        await container.entitlementModule.handleBillingEvent(
          "PaymentRecorded",
          {
            clientId: record.clientId,
            invoiceId: payload.invoiceId ?? record.aggregateId,
            amountPaise: payload.amountPaise ?? 0,
            balancePaise: payload.balancePaise ?? 0,
          },
        );
      } catch (err) {
        console.error(
          `[Worker] Error handling payment.recorded for record ${record.id}:`,
          err,
        );
      }
    });

    outboxPoller.registerHandler("invoice.overdue", async (record) => {
      try {
        let payload: Record<string, any> = {};
        try {
          payload = JSON.parse(record.payload);
        } catch {}
        await container.entitlementModule.handleBillingEvent("InvoiceOverdue", {
          clientId: record.clientId,
          invoiceId: record.aggregateId,
          amountPaise: payload.amountPaise ?? 0,
          gracePeriodDays: payload.gracePeriodDays ?? 0,
        });
      } catch (err) {
        console.error(
          `[Worker] Error handling invoice.overdue for record ${record.id}:`,
          err,
        );
      }
    });

    outboxPoller.registerHandler("domain.down", async (record) => {
      try {
        console.warn(
          `[Worker Notification] Domain DOWN incident raised:`,
          record.payload,
        );
        let payload: Record<string, any> = {};
        try {
          payload = JSON.parse(record.payload);
        } catch {}

        // Milestone 5: Auto-create P1 system ticket on domain down incident
        const existingTicket =
          await container.ticketRepo.findByLinkedIncidentId(record.aggregateId);
        if (!existingTicket && record.clientId) {
          const autoTicket =
            await container.support.createTicketUseCase.execute(
              {
                clientId: record.clientId,
                subject: `[SYSTEM OUTAGE] Domain Down Incident: ${payload.hostname || record.aggregateId}`,
                message: `Automated incident ticket raised by monitoring system.\nReason: ${payload.reason || "Health check failed consecutive threshold"}\nTarget URL: ${payload.targetUrl || "N/A"}`,
                priority: "P1",
                category: "outage",
                source: "system",
                linkedIncidentId: record.aggregateId,
              },
              { kind: "system", name: "monitoring-daemon" },
            );
          console.log(
            `[Worker] Auto-created incident ticket ${autoTicket.ticket.number} for incident ${record.aggregateId}`,
          );
        }
      } catch (ticketErr) {
        console.error(
          `[Worker] Error auto-creating incident ticket:`,
          ticketErr,
        );
      }
    });

    outboxPoller.registerHandler("domain.recovered", async (record) => {
      try {
        console.log(`[Worker Notification] Domain RECOVERED:`, record.payload);

        // Milestone 5: Auto-resolve linked incident ticket on domain recovery
        const ticket = await container.ticketRepo.findByLinkedIncidentId(
          record.aggregateId,
        );
        if (
          ticket &&
          ticket.status !== "resolved" &&
          ticket.status !== "closed"
        ) {
          ticket.updateStatus(
            "resolved",
            Date.now(),
            "Incident resolved automatically on domain recovery",
          );
          await container.ticketRepo.save(ticket);
          console.log(
            `[Worker] Auto-resolved incident ticket ${ticket.number} on domain recovery`,
          );
        }
      } catch (ticketErr) {
        console.error(
          `[Worker] Error auto-resolving incident ticket:`,
          ticketErr,
        );
      }
    });

    outboxPoller.registerHandler("ssl.expiring", async (record) => {
      try {
        console.warn(
          `[Worker Notification] SSL Certificate expiring soon:`,
          record.payload,
        );
      } catch (err) {
        console.error(
          `[Worker] Error handling ssl.expiring for record ${record.id}:`,
          err,
        );
      }
    });

    activeJobs.push({
      name: "OutboxPoller",
      stop: () => outboxPoller.stop(),
    });

    // 2. Initialize Invoice Generator Job (Milestone 2 CRM & Billing)
    console.log("[Worker] Starting Invoice Generator job...");
    const invoiceGenerator = startInvoiceGenerator({
      workerId: WORKER_ID,
      pollIntervalMs: 30_000,
      leadTimeDays: 7,
    });
    activeJobs.push({
      name: "InvoiceGenerator",
      stop: () => invoiceGenerator.stop(),
    });

    // 3. Initialize Dunning Reminder Job (Milestone 2 Collections)
    console.log("[Worker] Starting Dunning Reminder job...");
    const dunningJob = startDunningJob({
      workerId: WORKER_ID,
      pollIntervalMs: 60_000,
    });
    activeJobs.push({
      name: "DunningJob",
      stop: () => dunningJob.stop(),
    });

    // 4. Initialize Domain Monitoring Daemons (Milestone 4 Domain Monitoring)
    console.log("[Worker] Starting Uptime Checker daemon...");
    const uptimeChecker = startUptimeChecker({
      workerId: WORKER_ID,
      pollIntervalMs: 60_000,
      batchSize: 50,
      concurrency: 5,
    });
    activeJobs.push({
      name: "UptimeChecker",
      stop: () => uptimeChecker.stop(),
    });

    console.log("[Worker] Starting SSL Checker daemon...");
    const sslChecker = startSslChecker({
      workerId: WORKER_ID,
      pollIntervalMs: 21_600_000,
      batchSize: 50,
      concurrency: 5,
    });
    activeJobs.push({
      name: "SslChecker",
      stop: () => sslChecker.stop(),
    });

    console.log("[Worker] Starting DNS Checker daemon...");
    const dnsChecker = startDnsChecker({
      workerId: WORKER_ID,
      pollIntervalMs: 900_000,
      batchSize: 50,
      concurrency: 5,
    });
    activeJobs.push({
      name: "DnsChecker",
      stop: () => dnsChecker.stop(),
    });

    // 5. Initialize Server Fleet Metrics Poller (Milestone 4 Fleet)
    console.log("[Worker] Starting Fleet Metrics Poller daemon...");
    const metricsPoller = startMetricsPoller({
      workerId: WORKER_ID,
      pollIntervalMs: 30_000,
    });
    activeJobs.push({
      name: "MetricsPoller",
      stop: () => metricsPoller.stop(),
    });

    // 6. Initialize RDAP Expiry Checker (Milestone 4 Monitoring)
    console.log("[Worker] Starting RDAP Expiry Checker daemon...");
    const rdapChecker = startRdapChecker({
      workerId: WORKER_ID,
      pollIntervalMs: 86_400_000,
      batchSize: 50,
      concurrency: 5,
    });
    activeJobs.push({
      name: "RdapChecker",
      stop: () => rdapChecker.stop(),
    });

    // 7. Initialize SLA Escalator Daemon (Milestone 5 Support Desk)
    console.log("[Worker] Starting SLA Escalator daemon...");
    const slaEscalator = startSlaEscalator({
      workerId: WORKER_ID,
      pollIntervalMs: 60_000,
    });
    activeJobs.push({
      name: "SlaEscalator",
      stop: () => slaEscalator.stop(),
    });

    // 8. Initialize Analytics Rollup & Retention Daemon (Milestone 5 Analytics)
    console.log("[Worker] Starting Analytics Rollup daemon...");
    const analyticsRollup = startAnalyticsRollup({
      workerId: WORKER_ID,
      pollIntervalMs: 300_000,
      retentionDays: 60,
    });
    activeJobs.push({
      name: "AnalyticsRollup",
      stop: () => analyticsRollup.stop(),
    });

    // 9. Initialize Analytics Webhook Offload Daemon (Milestone 5 Analytics)
    console.log("[Worker] Starting Analytics Webhook Offload daemon...");
    const analyticsOffload = startAnalyticsOffload({
      workerId: WORKER_ID,
      pollIntervalMs: 60_000,
    });
    activeJobs.push({
      name: "AnalyticsOffload",
      stop: () => analyticsOffload.stop(),
    });

    // 10. Periodic Worker Heartbeat
    heartbeatTimer = setInterval(() => {
      if (isShuttingDown) return;
      const memUsage = process.memoryUsage();
      console.log(
        `[Worker Heartbeat] Uptime: ${Math.floor(process.uptime())}s | RSS: ${Math.round(memUsage.rss / 1024 / 1024)}MB | Heap: ${Math.round(memUsage.heapUsed / 1024 / 1024)}MB`,
      );
    }, HEARTBEAT_INTERVAL_MS);
    heartbeatTimer.unref();

    console.log(
      `[Worker] Daemon successfully bootstrapped: ${activeJobs.length} jobs listening.`,
    );
    return activeJobs;
  } catch (err) {
    console.error("[Worker] Fatal error during bootstrap:", err);
    if (process.env.NODE_ENV !== "test") {
      process.exit(1);
    }
    throw err;
  }
}

export async function gracefulShutdown(
  signal: string,
  exitOnComplete = true,
): Promise<void> {
  if (isShuttingDown) return;
  isShuttingDown = true;

  console.log(`[Worker] Received ${signal}. Initiating graceful shutdown...`);

  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }

  let forceExitTimeout: NodeJS.Timeout | null = null;
  if (exitOnComplete) {
    forceExitTimeout = setTimeout(() => {
      console.error(
        "[Worker] Graceful shutdown timed out after 5000ms. Forcing exit.",
      );
      process.exit(1);
    }, 5_000);
    forceExitTimeout.unref();
  }

  try {
    for (const job of activeJobs) {
      console.log(`[Worker] Stopping job: ${job.name}...`);
      try {
        await job.stop();
        console.log(`[Worker] Job ${job.name} stopped cleanly.`);
      } catch (stopErr) {
        console.error(`[Worker] Error stopping job ${job.name}:`, stopErr);
      }
    }
    console.log("[Worker] All jobs drained. Exiting cleanly.");
    if (forceExitTimeout) clearTimeout(forceExitTimeout);
    if (exitOnComplete) {
      process.exit(0);
    } else {
      isShuttingDown = false;
    }
  } catch (err) {
    console.error("[Worker] Error during job shutdown:", err);
    if (exitOnComplete) {
      process.exit(1);
    } else {
      isShuttingDown = false;
    }
    throw err;
  }
}

function isMain(): boolean {
  if (!process.argv[1]) return false;
  try {
    const currentFile = path
      .resolve(fileURLToPath(import.meta.url))
      .toLowerCase();
    const entryFile = path.resolve(process.argv[1]).toLowerCase();
    return currentFile === entryFile;
  } catch {
    return false;
  }
}

if (isMain() && process.env.NODE_ENV !== "test") {
  process.on("SIGINT", () => void gracefulShutdown("SIGINT"));
  process.on("SIGTERM", () => void gracefulShutdown("SIGTERM"));
  process.on("unhandledRejection", (reason) => {
    console.error("[Worker] Unhandled Rejection:", reason);
  });
  process.on("uncaughtException", (err) => {
    console.error("[Worker] Uncaught Exception:", err);
    void gracefulShutdown("uncaughtException");
  });

  void bootstrap();
}

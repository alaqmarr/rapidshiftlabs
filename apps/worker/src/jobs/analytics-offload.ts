import { createHmac } from "node:crypto";
import { DrizzleAnalyticsRepository } from "@rsl/core/analytics";

export interface AnalyticsOffloadOptions {
  workerId: string;
  pollIntervalMs?: number; // default 60,000ms (60s)
  batchLimit?: number; // default 500
}

export class AnalyticsOffloadJob {
  private isRunning = false;
  private timer: NodeJS.Timeout | null = null;
  private readonly analyticsRepo: DrizzleAnalyticsRepository;

  constructor(private readonly options: AnalyticsOffloadOptions) {
    this.analyticsRepo = new DrizzleAnalyticsRepository();
  }

  start(): void {
    if (this.isRunning) return;
    this.isRunning = true;
    const interval = this.options.pollIntervalMs ?? 60_000;
    console.log(
      `[AnalyticsOffloadJob] Started analytics webhook offload daemon (poll interval: ${interval}ms)`,
    );
    void this.scheduleNext(0);
  }

  async stop(): Promise<void> {
    this.isRunning = false;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  private scheduleNext(delayMs: number): void {
    if (!this.isRunning) return;
    try {
      this.timer = setTimeout(() => {
        void this.runCycle().catch((err) => {
          console.error("[AnalyticsOffloadJob] Unhandled rejection in runCycle:", err);
        });
      }, delayMs);
      this.timer.unref();
    } catch (schedErr) {
      console.error("[AnalyticsOffloadJob] Error scheduling next cycle:", schedErr);
    }
  }

  async runCycle(): Promise<void> {
    if (!this.isRunning) return;
    const now = Date.now();

    try {
      const activeConfigs = await this.analyticsRepo.listActiveOffloadConfigs();

      for (const config of activeConfigs) {
        if (!this.isRunning) break;

        try {
          const fromEpoch = config.lastExportedAt ?? now - 24 * 3600 * 1000;
          const events = await this.analyticsRepo.exportEvents(
            config.clientId,
            fromEpoch,
            now,
            this.options.batchLimit ?? 500,
          );

          if (events.length === 0) continue;

          const payload = {
            clientId: config.clientId,
            exportedAt: now,
            eventCount: events.length,
            events: events.map((e) => e.props),
          };

          const jsonBody = JSON.stringify(payload);
          const signature = createHmac("sha256", config.secret)
            .update(jsonBody)
            .digest("hex");

          const res = await fetch(config.endpointUrl, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "X-RSL-Signature": signature,
              "User-Agent": "RapidShift-Analytics-Offload/1.0",
            },
            body: jsonBody,
          });

          if (res.ok) {
            await this.analyticsRepo.recordOffloadStatus(
              config.clientId,
              `success (${events.length} events)`,
              now,
            );
            console.log(
              `[AnalyticsOffloadJob] Successfully pushed ${events.length} events for client ${config.clientId}`,
            );
          } else {
            const errText = await res.text().catch(() => "");
            await this.analyticsRepo.recordOffloadStatus(
              config.clientId,
              `failed: HTTP ${res.status} ${errText.slice(0, 100)}`,
              now,
            );
          }
        } catch (configErr: any) {
          console.error(
            `[AnalyticsOffloadJob] Error processing offload for client ${config.clientId}:`,
            configErr,
          );
          try {
            await this.analyticsRepo.recordOffloadStatus(
              config.clientId,
              `failed: ${configErr?.message || "unknown error"}`,
              now,
            );
          } catch (statusErr) {
            console.warn(
              `[AnalyticsOffloadJob] Failed recording status for client ${config.clientId}:`,
              statusErr,
            );
          }
        }
      }
    } catch (err) {
      console.error("[AnalyticsOffloadJob] Error executing analytics offload:", err);
    } finally {
      this.scheduleNext(this.options.pollIntervalMs ?? 60_000);
    }
  }
}

export function startAnalyticsOffload(options: AnalyticsOffloadOptions): AnalyticsOffloadJob {
  const job = new AnalyticsOffloadJob(options);
  job.start();
  return job;
}

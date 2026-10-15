import { DrizzleAnalyticsRepository } from "@rsl/core/analytics";

export interface AnalyticsRollupOptions {
  workerId: string;
  pollIntervalMs?: number; // default 5 minutes = 300_000ms
  retentionDays?: number; // default 60 days
}

export class AnalyticsRollupJob {
  private isRunning = false;
  private timer: NodeJS.Timeout | null = null;
  private readonly analyticsRepo: DrizzleAnalyticsRepository;

  constructor(private readonly options: AnalyticsRollupOptions) {
    this.analyticsRepo = new DrizzleAnalyticsRepository();
  }

  start(): void {
    if (this.isRunning) return;
    this.isRunning = true;
    const interval = this.options.pollIntervalMs ?? 300_000;
    console.log(
      `[AnalyticsRollupJob] Started analytics rollup & retention daemon (poll interval: ${interval}ms, retention: ${this.options.retentionDays ?? 60}d)`,
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
          console.error("[AnalyticsRollupJob] Unhandled rejection in runCycle:", err);
        });
      }, delayMs);
      this.timer.unref();
    } catch (schedErr) {
      console.error("[AnalyticsRollupJob] Error scheduling next cycle:", schedErr);
    }
  }

  async runCycle(): Promise<void> {
    if (!this.isRunning) return;
    const now = Date.now();

    try {
      // 1. Build rollups for the last 24 hours
      const windowStart = now - 24 * 3600 * 1000;
      await this.analyticsRepo.buildRollups(windowStart);

      // 2. Prune raw events older than retention period (default 60 days)
      const retentionDays = this.options.retentionDays ?? 60;
      const pruneCutoff = now - retentionDays * 86400 * 1000;
      const prunedCount = await this.analyticsRepo.pruneRawEvents(pruneCutoff);

      if (prunedCount > 0) {
        console.log(
          `[AnalyticsRollupJob] Pruned ${prunedCount} raw events older than ${retentionDays} days`,
        );
      }
    } catch (err) {
      console.error("[AnalyticsRollupJob] Error executing analytics rollups:", err);
    } finally {
      this.scheduleNext(this.options.pollIntervalMs ?? 300_000);
    }
  }
}

export function startAnalyticsRollup(options: AnalyticsRollupOptions): AnalyticsRollupJob {
  const job = new AnalyticsRollupJob(options);
  job.start();
  return job;
}

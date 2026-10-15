import {
  DrizzleMonitoredDomainRepository,
  DrizzleDomainCheckRepository,
  NodeHttpChecker,
  ExecuteHttpCheckUseCase,
  type MonitoredDomain,
} from "@rsl/core/monitoring";

export interface UptimeCheckerOptions {
  workerId: string;
  pollIntervalMs?: number; // default 60,000ms (60s)
  batchSize?: number; // default 50
  concurrency?: number; // default 5
}

export class UptimeCheckerJob {
  private isRunning = false;
  private timer: NodeJS.Timeout | null = null;
  private readonly domainRepo: DrizzleMonitoredDomainRepository;
  private readonly checkRepo: DrizzleDomainCheckRepository;
  private readonly httpChecker: NodeHttpChecker;
  private readonly executeHttpCheckUseCase: ExecuteHttpCheckUseCase;

  constructor(private readonly options: UptimeCheckerOptions) {
    this.domainRepo = new DrizzleMonitoredDomainRepository();
    this.checkRepo = new DrizzleDomainCheckRepository();
    this.httpChecker = new NodeHttpChecker();
    this.executeHttpCheckUseCase = new ExecuteHttpCheckUseCase(
      this.domainRepo,
      this.checkRepo,
      this.httpChecker,
    );
  }

  start(): void {
    if (this.isRunning) return;
    this.isRunning = true;
    const interval = this.options.pollIntervalMs ?? 60_000;
    console.log(
      `[UptimeCheckerJob] Started uptime checker daemon (poll interval: ${interval}ms, concurrency: ${this.options.concurrency ?? 5})`,
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
          console.error("[UptimeCheckerJob] Unhandled rejection in runCycle:", err);
        });
      }, delayMs);
      this.timer.unref();
    } catch (schedErr) {
      console.error("[UptimeCheckerJob] Error scheduling next cycle:", schedErr);
    }
  }

  async runCycle(): Promise<void> {
    if (!this.isRunning) return;

    try {
      const batchSize = this.options.batchSize ?? 50;
      const dueDomains = await this.domainRepo.findDueForHttpCheck(batchSize);

      if (dueDomains.length > 0) {
        console.log(
          `[UptimeCheckerJob] Found ${dueDomains.length} domain(s) due for HTTP uptime check`,
        );

        const concurrency = this.options.concurrency ?? 5;
        for (let i = 0; i < dueDomains.length; i += concurrency) {
          if (!this.isRunning) break;
          const chunk = dueDomains.slice(i, i + concurrency);

          await Promise.all(
            chunk.map(async (domain: MonitoredDomain) => {
              try {
                const result = await this.executeHttpCheckUseCase.execute({
                  domain,
                });
                if (!result.isUp) {
                  console.warn(
                    `[UptimeCheckerJob] Domain ${domain.hostname} check failed: ${result.checkResult.errorMessage ?? `HTTP ${result.statusCode}`}`,
                  );
                }
              } catch (err) {
                console.error(
                  `[UptimeCheckerJob] Error executing check for ${domain.hostname}:`,
                  err,
                );
              }
            }),
          );
        }
      }
    } catch (err) {
      console.error("[UptimeCheckerJob] Error during check cycle:", err);
    } finally {
      this.scheduleNext(this.options.pollIntervalMs ?? 60_000);
    }
  }
}

export function startUptimeChecker(
  options: UptimeCheckerOptions,
): UptimeCheckerJob {
  const job = new UptimeCheckerJob(options);
  job.start();
  return job;
}

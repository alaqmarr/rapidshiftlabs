import {
  DrizzleMonitoredDomainRepository,
  DrizzleDomainCheckRepository,
  NodeSslChecker,
  ExecuteSslCheckUseCase,
  type MonitoredDomain,
} from "@rsl/core/monitoring";

export interface SslCheckerOptions {
  workerId: string;
  pollIntervalMs?: number; // default 6h = 21,600,000ms
  batchSize?: number; // default 50
  concurrency?: number; // default 5
}

export class SslCheckerJob {
  private isRunning = false;
  private timer: NodeJS.Timeout | null = null;
  private readonly domainRepo: DrizzleMonitoredDomainRepository;
  private readonly checkRepo: DrizzleDomainCheckRepository;
  private readonly sslChecker: NodeSslChecker;
  private readonly executeSslCheckUseCase: ExecuteSslCheckUseCase;

  constructor(private readonly options: SslCheckerOptions) {
    this.domainRepo = new DrizzleMonitoredDomainRepository();
    this.checkRepo = new DrizzleDomainCheckRepository();
    this.sslChecker = new NodeSslChecker();
    this.executeSslCheckUseCase = new ExecuteSslCheckUseCase(
      this.domainRepo,
      this.checkRepo,
      this.sslChecker,
    );
  }

  start(): void {
    if (this.isRunning) return;
    this.isRunning = true;
    const interval = this.options.pollIntervalMs ?? 21_600_000;
    console.log(
      `[SslCheckerJob] Started SSL checker daemon (poll interval: ${interval}ms, concurrency: ${this.options.concurrency ?? 5})`,
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
          console.error("[SslCheckerJob] Unhandled rejection in runCycle:", err);
        });
      }, delayMs);
      this.timer.unref();
    } catch (schedErr) {
      console.error("[SslCheckerJob] Error scheduling next cycle:", schedErr);
    }
  }

  async runCycle(): Promise<void> {
    if (!this.isRunning) return;

    try {
      const batchSize = this.options.batchSize ?? 50;
      const dueDomains = await this.domainRepo.findDueForSslCheck(batchSize);

      if (dueDomains.length > 0) {
        console.log(
          `[SslCheckerJob] Found ${dueDomains.length} domain(s) due for SSL certificate check`,
        );

        const concurrency = this.options.concurrency ?? 5;
        for (let i = 0; i < dueDomains.length; i += concurrency) {
          if (!this.isRunning) break;
          const chunk = dueDomains.slice(i, i + concurrency);

          await Promise.all(
            chunk.map(async (domain: MonitoredDomain) => {
              try {
                const result = await this.executeSslCheckUseCase.execute({
                  domain,
                });
                if (!result.isValid || result.isExpired) {
                  console.warn(
                    `[SslCheckerJob] Domain ${domain.hostname} SSL invalid/expired: daysRemaining=${result.daysRemaining}, error=${result.checkResult.errorMessage}`,
                  );
                }
              } catch (err) {
                console.error(
                  `[SslCheckerJob] Error executing SSL check for ${domain.hostname}:`,
                  err,
                );
              }
            }),
          );
        }
      }
    } catch (err) {
      console.error("[SslCheckerJob] Error during SSL check cycle:", err);
    } finally {
      this.scheduleNext(this.options.pollIntervalMs ?? 21_600_000);
    }
  }
}

export function startSslChecker(options: SslCheckerOptions): SslCheckerJob {
  const job = new SslCheckerJob(options);
  job.start();
  return job;
}

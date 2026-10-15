import {
  DrizzleMonitoredDomainRepository,
  DrizzleDomainCheckRepository,
  NodeDnsChecker,
  ExecuteDnsCheckUseCase,
  type MonitoredDomain,
} from "@rsl/core/monitoring";

export interface DnsCheckerOptions {
  workerId: string;
  pollIntervalMs?: number; // default 15m = 900,000ms
  batchSize?: number; // default 50
  concurrency?: number; // default 5
}

export class DnsCheckerJob {
  private isRunning = false;
  private timer: NodeJS.Timeout | null = null;
  private readonly domainRepo: DrizzleMonitoredDomainRepository;
  private readonly checkRepo: DrizzleDomainCheckRepository;
  private readonly dnsChecker: NodeDnsChecker;
  private readonly executeDnsCheckUseCase: ExecuteDnsCheckUseCase;

  constructor(private readonly options: DnsCheckerOptions) {
    this.domainRepo = new DrizzleMonitoredDomainRepository();
    this.checkRepo = new DrizzleDomainCheckRepository();
    this.dnsChecker = new NodeDnsChecker();
    this.executeDnsCheckUseCase = new ExecuteDnsCheckUseCase(
      this.domainRepo,
      this.checkRepo,
      this.dnsChecker,
    );
  }

  start(): void {
    if (this.isRunning) return;
    this.isRunning = true;
    const interval = this.options.pollIntervalMs ?? 900_000;
    console.log(
      `[DnsCheckerJob] Started DNS checker daemon (poll interval: ${interval}ms, concurrency: ${this.options.concurrency ?? 5})`,
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
          console.error("[DnsCheckerJob] Unhandled rejection in runCycle:", err);
        });
      }, delayMs);
      this.timer.unref();
    } catch (schedErr) {
      console.error("[DnsCheckerJob] Error scheduling next cycle:", schedErr);
    }
  }

  async runCycle(): Promise<void> {
    if (!this.isRunning) return;

    try {
      const batchSize = this.options.batchSize ?? 50;
      const dueDomains = await this.domainRepo.findDueForDnsCheck(batchSize);

      if (dueDomains.length > 0) {
        console.log(
          `[DnsCheckerJob] Found ${dueDomains.length} domain(s) due for DNS resolution check`,
        );

        const concurrency = this.options.concurrency ?? 5;
        for (let i = 0; i < dueDomains.length; i += concurrency) {
          if (!this.isRunning) break;
          const chunk = dueDomains.slice(i, i + concurrency);

          await Promise.all(
            chunk.map(async (domain: MonitoredDomain) => {
              try {
                const result = await this.executeDnsCheckUseCase.execute({
                  domain,
                });
                if (!result.resolved) {
                  console.warn(
                    `[DnsCheckerJob] Domain ${domain.hostname} DNS resolution failed: ${result.checkResult.errorMessage}`,
                  );
                } else if (result.driftDetected) {
                  console.warn(
                    `[DnsCheckerJob] Domain ${domain.hostname} DNS drift detected: ${result.checkResult.drifts.map((d) => d.description).join("; ")}`,
                  );
                }
              } catch (err) {
                console.error(
                  `[DnsCheckerJob] Error executing DNS check for ${domain.hostname}:`,
                  err,
                );
              }
            }),
          );
        }
      }
    } catch (err) {
      console.error("[DnsCheckerJob] Error during DNS check cycle:", err);
    } finally {
      this.scheduleNext(this.options.pollIntervalMs ?? 900_000);
    }
  }
}

export function startDnsChecker(options: DnsCheckerOptions): DnsCheckerJob {
  const job = new DnsCheckerJob(options);
  job.start();
  return job;
}

import {
  DrizzleMonitoredDomainRepository,
  DrizzleDomainCheckRepository,
  NodeRdapChecker,
  ExecuteRdapCheckUseCase,
  type MonitoredDomain,
} from "@rsl/core/monitoring";

export interface RdapCheckerOptions {
  workerId: string;
  pollIntervalMs?: number; // default 24h = 86,400,000ms
  batchSize?: number; // default 50
  concurrency?: number; // default 5
}

export class RdapExpiryCheckerJob {
  private isRunning = false;
  private timer: NodeJS.Timeout | null = null;
  private readonly domainRepo: DrizzleMonitoredDomainRepository;
  private readonly checkRepo: DrizzleDomainCheckRepository;
  private readonly rdapChecker: NodeRdapChecker;
  private readonly executeRdapCheckUseCase: ExecuteRdapCheckUseCase;

  constructor(private readonly options: RdapCheckerOptions) {
    this.domainRepo = new DrizzleMonitoredDomainRepository();
    this.checkRepo = new DrizzleDomainCheckRepository();
    this.rdapChecker = new NodeRdapChecker();
    this.executeRdapCheckUseCase = new ExecuteRdapCheckUseCase(
      this.domainRepo,
      this.checkRepo,
      this.rdapChecker,
    );
  }

  start(): void {
    if (this.isRunning) return;
    this.isRunning = true;
    const interval = this.options.pollIntervalMs ?? 86_400_000;
    console.log(
      `[RdapExpiryCheckerJob] Started RDAP expiry checker daemon (poll interval: ${interval}ms, concurrency: ${this.options.concurrency ?? 5})`,
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
          console.error("[RdapExpiryCheckerJob] Unhandled rejection in runCycle:", err);
        });
      }, delayMs);
      this.timer.unref();
    } catch (schedErr) {
      console.error("[RdapExpiryCheckerJob] Error scheduling next cycle:", schedErr);
    }
  }

  async runCycle(): Promise<void> {
    if (!this.isRunning) return;

    try {
      const batchSize = this.options.batchSize ?? 50;
      const dueDomains = await this.domainRepo.findDueForRdapCheck(batchSize);

      if (dueDomains.length > 0) {
        console.log(
          `[RdapExpiryCheckerJob] Found ${dueDomains.length} domain(s) due for RDAP registration check`,
        );

        const concurrency = this.options.concurrency ?? 5;
        for (let i = 0; i < dueDomains.length; i += concurrency) {
          if (!this.isRunning) break;
          const chunk = dueDomains.slice(i, i + concurrency);

          await Promise.all(
            chunk.map(async (domain: MonitoredDomain) => {
              try {
                const result = await this.executeRdapCheckUseCase.execute({
                  domain,
                });
                console.log(
                  `[RdapExpiryCheckerJob] Checked ${domain.hostname}: registrar=${result.registrar ?? "n/a"}, daysRemaining=${result.daysRemaining ?? "unknown"}`,
                );
              } catch (err: any) {
                console.error(
                  `[RdapExpiryCheckerJob] Error checking RDAP for ${domain.hostname}:`,
                  err?.message || err,
                );
              }
            }),
          );
        }
      }
    } catch (err) {
      console.error("[RdapExpiryCheckerJob] Error during check cycle:", err);
    } finally {
      this.scheduleNext(this.options.pollIntervalMs ?? 86_400_000);
    }
  }
}

export function startRdapChecker(
  options: RdapCheckerOptions,
): RdapExpiryCheckerJob {
  const job = new RdapExpiryCheckerJob(options);
  job.start();
  return job;
}

import { getContainer } from "@rsl/core/container";

export interface InvoiceGeneratorOptions {
  workerId: string;
  pollIntervalMs?: number; // default 30,000ms
  leadTimeDays?: number; // default 7 days before period start
}

export class InvoiceGeneratorJob {
  private isRunning = false;
  private timer: NodeJS.Timeout | null = null;

  constructor(private readonly options: InvoiceGeneratorOptions) {}

  start(): void {
    if (this.isRunning) return;
    this.isRunning = true;
    console.log(
      `[InvoiceGeneratorJob] Started with poll interval ${this.options.pollIntervalMs ?? 30_000}ms (lead time: ${this.options.leadTimeDays ?? 7}d)`,
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
          console.error("[InvoiceGeneratorJob] Unhandled rejection in runCycle:", err);
        });
      }, delayMs);
      this.timer.unref();
    } catch (schedErr) {
      console.error("[InvoiceGeneratorJob] Error scheduling next cycle:", schedErr);
    }
  }

  private async runCycle(): Promise<void> {
    if (!this.isRunning) return;

    try {
      const container = getContainer();
      const billingModule = container.billingModule;
      const contractsModule = container.contractsModule;

      const leadTimeMs = (this.options.leadTimeDays ?? 7) * 86_400_000;
      const targetWindow = Date.now() + leadTimeMs;

      const pendingPeriods = await billingModule.repo.findPendingBillingPeriods(targetWindow);

      if (pendingPeriods.length > 0) {
        console.log(`[InvoiceGeneratorJob] Found ${pendingPeriods.length} pending billing period(s) due for invoicing.`);
      }

      for (const period of pendingPeriods) {
        if (!this.isRunning) break;

        try {
          // Verify contract is active
          const contract = await contractsModule.repo.findById(period.contractId);
          if (!contract || contract.status !== "active") {
            continue;
          }

          // Create invoice draft
          const invoice = await billingModule.createManualInvoiceUseCase.execute({
            clientId: period.clientId,
            contractId: period.contractId,
            billingPeriodId: period.id,
            billingMode: contract.taxProfile,
            issueDate: period.periodStart,
            dueDate: period.dueDate,
            currency: period.currency,
            lines: [
              {
                description: `${contract.title}: Billing Period #${period.periodNumber}`,
                unitPriceMinor: period.amountMinor,
                quantity: 1,
              },
            ],
          });

          // Issue invoice (assigns FY series number and raises domain event)
          const issued = await billingModule.issueInvoiceUseCase.execute(invoice.id);

          // Update period state
          period.markInvoiced(issued.id);
          await billingModule.repo.updateBillingPeriod(period);

          console.log(
            `[InvoiceGeneratorJob] Auto-generated & issued invoice ${issued.invoiceNumber} for contract ${contract.code} (client: ${period.clientId})`,
          );
        } catch (periodErr) {
          console.error(
            `[InvoiceGeneratorJob] Error processing period ${period.id} for contract ${period.contractId}:`,
            periodErr,
          );
        }
      }
    } catch (err) {
      console.error("[InvoiceGeneratorJob] Error in run cycle:", err);
    } finally {
      this.scheduleNext(this.options.pollIntervalMs ?? 30_000);
    }
  }
}

export function startInvoiceGenerator(options: InvoiceGeneratorOptions): InvoiceGeneratorJob {
  const job = new InvoiceGeneratorJob(options);
  job.start();
  return job;
}

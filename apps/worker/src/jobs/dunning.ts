import { getContainer } from "@rsl/core/container";
import { diffDays, toDateKey } from "@rsl/core/kernel";

export interface DunningJobOptions {
  workerId: string;
  pollIntervalMs?: number; // default 60,000ms
}

export class DunningJob {
  private isRunning = false;
  private isStopped = false;
  private timer: NodeJS.Timeout | null = null;
  // Key: invoiceId:dateKey:offset
  private readonly sentLog = new Set<string>();

  constructor(private readonly options: DunningJobOptions) {}

  start(): void {
    if (this.isRunning) return;
    this.isRunning = true;
    this.isStopped = false;
    console.log(
      `[DunningJob] Started dunning engine with poll interval ${this.options.pollIntervalMs ?? 60_000}ms`,
    );
    void this.scheduleNext(0);
  }

  async stop(): Promise<void> {
    this.isRunning = false;
    this.isStopped = true;
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
          console.error("[DunningJob] Unhandled rejection in runCycle:", err);
        });
      }, delayMs);
      this.timer.unref();
    } catch (schedErr) {
      console.error("[DunningJob] Error scheduling next cycle:", schedErr);
    }
  }

  private pruneSentLog(): void {
    if (this.sentLog.size > 10_000) {
      // Clear oldest entries when tracking set grows large
      this.sentLog.clear();
    }
  }

  async runCycle(): Promise<void> {
    try {
      const container = getContainer();
      const billingModule = container.billingModule;
      const clientsModule = container.clientsModule;
      const settingsModule = container.settingsModule;

      const dunningSettings = await settingsModule.repo.getDunningSettings();
      if (!dunningSettings.enabled) {
        return;
      }

      const now = Date.now();
      const todayKey = toDateKey(now);

      // 1. Mark overdue invoices and emit outbox events
      try {
        await billingModule.checkOverdueInvoicesUseCase.execute(now);
      } catch (overdueErr) {
        console.error("[DunningJob] Error evaluating overdue invoices:", overdueErr);
      }

      // 2. Fetch all unpaid invoices (issued, partially_paid, overdue)
      const [issuedRes, partialRes, overdueRes] = await Promise.all([
        billingModule.repo.listInvoices({ status: "issued", limit: 200 }),
        billingModule.repo.listInvoices({ status: "partially_paid", limit: 200 }),
        billingModule.repo.listInvoices({ status: "overdue", limit: 200 }),
      ]);

      const seenInvoiceIds = new Set<string>();
      const unpaidInvoices = [
        ...issuedRes.items,
        ...partialRes.items,
        ...overdueRes.items,
      ].filter((inv) => {
        if (seenInvoiceIds.has(inv.id)) return false;
        seenInvoiceIds.add(inv.id);
        return true;
      });

      const targetOffsets = dunningSettings.reminderDays ?? [-7, -3, 0, 3];
      this.pruneSentLog();

      for (const invoice of unpaidInvoices) {
        if (this.isStopped) break;

        try {
          const dueKey = toDateKey(invoice.dueDate);
          const dayOffset = diffDays(dueKey, todayKey); // e.g. -7, -3, 0, 3

          if (!targetOffsets.includes(dayOffset)) {
            continue;
          }

          const logKey = `${invoice.id}:${todayKey}:${dayOffset}`;
          if (this.sentLog.has(logKey)) {
            continue;
          }

          // Find client primary contact email, with fallback to client company record
          let targetEmail: string | undefined;

          try {
            const contacts = await clientsModule.repo.findContactsByClient(invoice.clientId);
            const primaryContact = contacts.find((c) => c.isPrimary) || contacts[0];
            targetEmail = primaryContact?.email;
          } catch (contactErr) {
            console.warn(
              `[DunningJob] Failed querying contacts for client ${invoice.clientId}:`,
              contactErr,
            );
          }

          if (!targetEmail) {
            console.warn(
              `[DunningJob] No contact email found for invoice ${invoice.invoiceNumber} (client: ${invoice.clientId})`,
            );
            continue;
          }

          // Call billing email port (which uses the branded dunning template)
          await billingModule.emailService.sendDunningEmail({
            to: targetEmail,
            invoiceNumber: invoice.invoiceNumber,
            daysOffset: dayOffset,
            balanceFormatted: `₹${(invoice.balanceMinor / 100).toLocaleString("en-IN")}`,
            dueDateFormatted: dueKey,
          });

          this.sentLog.add(logKey);
          console.log(
            `[DunningJob] Dispatched dunning notice for invoice ${invoice.invoiceNumber} (offset: ${dayOffset}d) to ${targetEmail}`,
          );
        } catch (invoiceErr) {
          console.error(
            `[DunningJob] Error processing dunning for invoice ${invoice.id}:`,
            invoiceErr,
          );
        }
      }
    } catch (err) {
      console.error("[DunningJob] Error in run cycle:", err);
    } finally {
      if (this.isRunning) {
        this.scheduleNext(this.options.pollIntervalMs ?? 60_000);
      }
    }
  }
}

export function startDunningJob(options: DunningJobOptions): DunningJob {
  const job = new DunningJob(options);
  job.start();
  return job;
}

import type { BillingRepository } from "../../domain/repositories/billing-repository.port";
import type { Invoice } from "../../domain/entities/invoice.entity";
import type { BillingEventPublisherPort } from "./issue-invoice.usecase";

export class CheckOverdueInvoicesUseCase {
  constructor(
    private readonly billingRepo: BillingRepository,
    private readonly publisher?: BillingEventPublisherPort,
  ) {}

  async execute(now: number = Date.now()): Promise<Invoice[]> {
    // List issued and partially_paid invoices
    const [issuedRes, partialRes] = await Promise.all([
      this.billingRepo.listInvoices({ status: "issued", limit: 200 }),
      this.billingRepo.listInvoices({ status: "partially_paid", limit: 200 }),
    ]);

    const candidates = [...issuedRes.items, ...partialRes.items];
    const newlyOverdue: Invoice[] = [];

    for (const inv of candidates) {
      if (now > inv.dueDate && inv.status !== "overdue") {
        inv.markOverdue(now);
        await this.billingRepo.updateInvoice(inv);
        newlyOverdue.push(inv);

        const events = inv.pullEvents();
        if (this.publisher) {
          for (const ev of events) {
            await this.publisher.publish(ev);
          }
        }
      }
    }

    return newlyOverdue;
  }
}

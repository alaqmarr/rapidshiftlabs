import type { BillingRepository } from "../../domain/repositories/billing-repository.port";
import type { Invoice } from "../../domain/entities/invoice.entity";
import { InvoiceNumberGenerator } from "../../domain/services/invoice-number-generator";
import { NotFoundError } from "../../../../shared/kernel/errors";
import type { DomainEvent } from "../../../../shared/kernel/domain-event";

export interface NumberingProvider {
  getNumberingSettings(): Promise<{ gstPrefix: string; nonGstPrefix: string }>;
  incrementGstSequence(): Promise<number>;
  incrementNonGstSequence(): Promise<number>;
}

export interface BillingEventPublisherPort {
  publish(event: DomainEvent): Promise<void>;
}

export class IssueInvoiceUseCase {
  constructor(
    private readonly billingRepo: BillingRepository,
    private readonly numberingProvider: NumberingProvider,
    private readonly publisher?: BillingEventPublisherPort,
  ) {}

  async execute(invoiceId: string): Promise<Invoice> {
    const invoice = await this.billingRepo.findInvoiceById(invoiceId);
    if (!invoice) {
      throw new NotFoundError("Invoice", invoiceId);
    }

    const numbering = await this.numberingProvider.getNumberingSettings();
    let seq: number;
    if (invoice.billingMode === "gst") {
      seq = await this.numberingProvider.incrementGstSequence();
    } else {
      seq = await this.numberingProvider.incrementNonGstSequence();
    }

    const invoiceNumber = InvoiceNumberGenerator.format({
      billingMode: invoice.billingMode,
      issueDateEpochMs: invoice.issueDate,
      sequenceNumber: seq,
      gstPrefix: numbering.gstPrefix,
      nonGstPrefix: numbering.nonGstPrefix,
    });

    invoice.issue(invoiceNumber);
    await this.billingRepo.updateInvoice(invoice);

    const events = invoice.pullEvents();
    if (this.publisher) {
      for (const ev of events) {
        await this.publisher.publish(ev);
      }
    }

    return invoice;
  }
}

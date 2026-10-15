import type { BillingRepository } from "../../domain/repositories/billing-repository.port";
import { Payment, type PaymentMethod } from "../../domain/entities/payment.entity";
import type { Invoice } from "../../domain/entities/invoice.entity";
import { NotFoundError } from "../../../../shared/kernel/errors";
import type { BillingEventPublisherPort } from "./issue-invoice.usecase";

import type { BillingEmailServicePort } from "../ports/billing-email.port";

export interface RecordPaymentInput {
  invoiceId: string;
  amountMinor: number;
  method?: PaymentMethod;
  reference?: string;
  notes?: string;
  paymentDate?: number;
  recordedBy?: string;
}

export interface ClientContactLookupPort {
  findById(id: string): Promise<{ id: string; name: string } | null>;
  findContactsByClient(clientId: string): Promise<Array<{ email: string; name?: string; isPrimary?: boolean }>>;
}

export class RecordPaymentUseCase {
  constructor(
    private readonly billingRepo: BillingRepository,
    private readonly publisher?: BillingEventPublisherPort,
    private readonly emailService?: BillingEmailServicePort,
    private readonly clientRepo?: ClientContactLookupPort,
  ) {}

  async execute(input: RecordPaymentInput): Promise<{ payment: Payment; invoice: Invoice }> {
    const invoice = await this.billingRepo.findInvoiceById(input.invoiceId);
    if (!invoice) {
      throw new NotFoundError("Invoice", input.invoiceId);
    }

    const payment = Payment.create({
      invoiceId: invoice.id,
      clientId: invoice.clientId,
      amountMinor: input.amountMinor,
      currency: invoice.currency,
      method: input.method || "upi",
      reference: input.reference,
      notes: input.notes,
      paymentDate: input.paymentDate,
      recordedBy: input.recordedBy,
    });

    invoice.recordPayment(payment);

    await this.billingRepo.savePayment(payment);
    await this.billingRepo.updateInvoice(invoice);

    const events = invoice.pullEvents();
    if (this.publisher) {
      for (const ev of events) {
        await this.publisher.publish(ev);
      }
    }

    if (this.emailService && this.clientRepo) {
      (async () => {
        try {
          const contacts = await this.clientRepo!.findContactsByClient(invoice.clientId);
          const primaryContact = contacts.find((c) => c.isPrimary) || contacts[0];
          if (primaryContact && primaryContact.email) {
            const client = await this.clientRepo!.findById(invoice.clientId);
            const amountFormatted = new Intl.NumberFormat("en-IN", {
              style: "currency",
              currency: invoice.currency || "INR",
            }).format(payment.amountMinor / 100);

            await this.emailService!.sendPaymentReceiptEmail({
              to: primaryContact.email,
              receiptNumber: payment.id,
              invoiceNumber: invoice.invoiceNumber,
              amountFormatted,
              clientName: primaryContact.name || client?.name || "Valued Client",
              paymentMethod: payment.method,
            });
            console.log(
              `[Payment Receipt Email] Successfully dispatched receipt for ${invoice.invoiceNumber} to ${primaryContact.email}`,
            );
          }
        } catch (e) {
          console.error("[Payment Receipt Email] Warning: Failed to dispatch receipt email:", e);
        }
      })();
    }

    return { payment, invoice };
  }
}

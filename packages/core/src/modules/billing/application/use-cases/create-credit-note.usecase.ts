import type { BillingRepository } from "../../domain/repositories/billing-repository.port";
import { CreditNote, type CreateCreditNoteParams } from "../../domain/entities/credit-note.entity";
import { NotFoundError } from "../../../../shared/kernel/errors";

export class CreateCreditNoteUseCase {
  constructor(private readonly billingRepo: BillingRepository) {}

  async execute(params: CreateCreditNoteParams): Promise<CreditNote> {
    const invoice = await this.billingRepo.findInvoiceById(params.invoiceId);
    if (!invoice) {
      throw new NotFoundError("Invoice", params.invoiceId);
    }

    const creditNote = CreditNote.create({
      ...params,
      clientId: invoice.clientId,
    });

    await this.billingRepo.saveCreditNote(creditNote);
    return creditNote;
  }
}

import type { Invoice } from "../entities/invoice.entity";
import type { BillingPeriod } from "../entities/billing-period.entity";
import type { Payment } from "../entities/payment.entity";
import type { CreditNote } from "../entities/credit-note.entity";

export interface ListInvoicesQuery {
  clientId?: string;
  status?: string;
  search?: string;
  limit?: number;
  offset?: number;
}

export interface ListPaymentsQuery {
  clientId?: string;
  invoiceId?: string;
  limit?: number;
  offset?: number;
}

export interface BillingSummaryDTO {
  totalBilledMinor: number;
  totalPaidMinor: number;
  outstandingMinor: number;
  overdueCount: number;
  activeInvoicesCount: number;
}

export interface BillingRepository {
  saveInvoice(invoice: Invoice): Promise<void>;
  updateInvoice(invoice: Invoice): Promise<void>;
  findInvoiceById(id: string): Promise<Invoice | null>;
  findInvoiceByNumber(number: string): Promise<Invoice | null>;
  listInvoices(query?: ListInvoicesQuery): Promise<{ items: Invoice[]; total: number }>;

  saveBillingPeriods(periods: BillingPeriod[]): Promise<void>;
  updateBillingPeriod(period: BillingPeriod): Promise<void>;
  findPendingBillingPeriods(beforeDueDate: number): Promise<BillingPeriod[]>;
  findBillingPeriodsByContract(contractId: string): Promise<BillingPeriod[]>;

  savePayment(payment: Payment): Promise<void>;
  listPayments(query?: ListPaymentsQuery): Promise<{ items: Payment[]; total: number }>;

  saveCreditNote(creditNote: CreditNote): Promise<void>;
  findCreditNotesByInvoice(invoiceId: string): Promise<CreditNote[]>;

  getBillingSummary(clientId?: string): Promise<BillingSummaryDTO>;
}

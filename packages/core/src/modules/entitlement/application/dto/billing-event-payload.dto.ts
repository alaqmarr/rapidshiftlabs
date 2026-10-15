export interface BillingInvoiceOverduePayload {
  readonly clientId: string;
  readonly invoiceId: string;
  readonly amountPaise: number;
  readonly dueDate?: number;
  readonly gracePeriodDays?: number;
}

export interface BillingPaymentRecordedPayload {
  readonly clientId: string;
  readonly invoiceId?: string;
  readonly amountPaise?: number;
  readonly balancePaise?: number;
}

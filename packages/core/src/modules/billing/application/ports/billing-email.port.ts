export interface SendInvoiceEmailParams {
  to: string;
  invoiceNumber: string;
  pdfBuffer?: Buffer;
  totalFormatted: string;
  dueDateFormatted: string;
}

export interface SendDunningEmailParams {
  to: string;
  invoiceNumber: string;
  daysOffset: number; // e.g. -7, -3, 0, 3
  balanceFormatted: string;
  dueDateFormatted: string;
}

export interface SendPaymentReceiptEmailParams {
  to: string;
  receiptNumber: string;
  invoiceNumber: string;
  amountFormatted: string;
  clientName: string;
  paymentMethod: string;
}

export interface BillingEmailServicePort {
  sendInvoiceEmail(params: SendInvoiceEmailParams): Promise<void>;
  sendDunningEmail(params: SendDunningEmailParams): Promise<void>;
  sendPaymentReceiptEmail(params: SendPaymentReceiptEmailParams): Promise<void>;
}

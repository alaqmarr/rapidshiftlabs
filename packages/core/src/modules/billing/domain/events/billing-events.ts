import { createEvent, type DomainEvent } from "../../../../shared/kernel/domain-event";

export interface InvoiceIssuedPayload {
  invoiceId: string;
  invoiceNumber: string;
  clientId: string;
  contractId?: string | null;
  billingMode: "gst" | "non_gst";
  subtotalMinor: number;
  totalMinor: number;
  dueDate: number;
}

export function createInvoiceIssuedEvent(payload: InvoiceIssuedPayload): DomainEvent<"invoice.issued", InvoiceIssuedPayload> {
  return createEvent("invoice.issued", {
    aggregateType: "invoice",
    aggregateId: payload.invoiceId,
    clientId: payload.clientId,
    payload,
  });
}

export interface PaymentRecordedPayload {
  paymentId: string;
  invoiceId: string;
  clientId: string;
  amountMinor: number;
  newBalanceMinor: number;
  method: string;
  isFullyPaid: boolean;
}

export function createPaymentRecordedEvent(payload: PaymentRecordedPayload): DomainEvent<"payment.recorded", PaymentRecordedPayload> {
  return createEvent("payment.recorded", {
    aggregateType: "payment",
    aggregateId: payload.paymentId,
    clientId: payload.clientId,
    payload,
  });
}

export interface InvoicePaidPayload {
  invoiceId: string;
  invoiceNumber: string;
  clientId: string;
  totalMinor: number;
  paidAt: number;
}

export function createInvoicePaidEvent(payload: InvoicePaidPayload): DomainEvent<"invoice.paid", InvoicePaidPayload> {
  return createEvent("invoice.paid", {
    aggregateType: "invoice",
    aggregateId: payload.invoiceId,
    clientId: payload.clientId,
    payload,
  });
}

export interface InvoiceOverduePayload {
  invoiceId: string;
  invoiceNumber: string;
  clientId: string;
  balanceMinor: number;
  dueDate: number;
}

export function createInvoiceOverdueEvent(payload: InvoiceOverduePayload): DomainEvent<"invoice.overdue", InvoiceOverduePayload> {
  return createEvent("invoice.overdue", {
    aggregateType: "invoice",
    aggregateId: payload.invoiceId,
    clientId: payload.clientId,
    payload,
  });
}

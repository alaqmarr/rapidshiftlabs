import { newId, ID_PREFIX } from "../../../../shared/kernel/id";
import { DomainRuleError } from "../../../../shared/kernel/errors";

export type PaymentMethod = "upi" | "bank_transfer" | "cash" | "cheque" | "online";

export interface PaymentProps {
  id: string;
  invoiceId: string;
  clientId: string;
  amountMinor: number;
  currency: string;
  paymentDate: number; // epoch ms
  method: PaymentMethod;
  reference?: string | null;
  notes?: string | null;
  recordedBy?: string | null;
  createdAt: number;
}

export interface CreatePaymentParams {
  invoiceId: string;
  clientId: string;
  amountMinor: number;
  currency?: string;
  paymentDate?: number;
  method?: PaymentMethod;
  reference?: string;
  notes?: string;
  recordedBy?: string;
}

export class Payment {
  private props: PaymentProps;

  constructor(props: PaymentProps) {
    if (!props.invoiceId) {
      throw new DomainRuleError("payment_invoice_required", "Invoice ID is required");
    }
    if (!props.clientId) {
      throw new DomainRuleError("payment_client_required", "Client ID is required");
    }
    if (props.amountMinor <= 0) {
      throw new DomainRuleError("payment_amount_invalid", "Payment amount must be greater than 0");
    }
    this.props = { ...props };
  }

  static create(params: CreatePaymentParams): Payment {
    const now = Date.now();
    return new Payment({
      id: newId(ID_PREFIX.payment),
      invoiceId: params.invoiceId,
      clientId: params.clientId,
      amountMinor: params.amountMinor,
      currency: params.currency || "INR",
      paymentDate: params.paymentDate ?? now,
      method: params.method || "upi",
      reference: params.reference?.trim() || null,
      notes: params.notes?.trim() || null,
      recordedBy: params.recordedBy || null,
      createdAt: now,
    });
  }

  get id(): string {
    return this.props.id;
  }
  get invoiceId(): string {
    return this.props.invoiceId;
  }
  get clientId(): string {
    return this.props.clientId;
  }
  get amountMinor(): number {
    return this.props.amountMinor;
  }
  get currency(): string {
    return this.props.currency;
  }
  get paymentDate(): number {
    return this.props.paymentDate;
  }
  get method(): PaymentMethod {
    return this.props.method;
  }
  get reference(): string | null | undefined {
    return this.props.reference;
  }
  get notes(): string | null | undefined {
    return this.props.notes;
  }
  get recordedBy(): string | null | undefined {
    return this.props.recordedBy;
  }
  get createdAt(): number {
    return this.props.createdAt;
  }

  toJSON(): PaymentProps {
    return { ...this.props };
  }
}

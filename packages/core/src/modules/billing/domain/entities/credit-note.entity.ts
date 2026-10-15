import { newId, ID_PREFIX } from "../../../../shared/kernel/id";
import { DomainRuleError } from "../../../../shared/kernel/errors";

export type CreditNoteStatus = "issued" | "applied" | "void";

export interface CreditNoteProps {
  id: string;
  creditNoteNumber: string;
  invoiceId: string;
  clientId: string;
  amountMinor: number;
  reason: string;
  status: CreditNoteStatus;
  issuedAt: number;
  createdAt: number;
}

export interface CreateCreditNoteParams {
  creditNoteNumber?: string;
  invoiceId: string;
  clientId: string;
  amountMinor: number;
  reason: string;
}

export class CreditNote {
  private props: CreditNoteProps;

  constructor(props: CreditNoteProps) {
    if (!props.invoiceId) {
      throw new DomainRuleError("credit_note_invoice_required", "Invoice ID is required");
    }
    if (!props.reason || props.reason.trim().length === 0) {
      throw new DomainRuleError("credit_note_reason_required", "Credit note reason is required");
    }
    if (props.amountMinor <= 0) {
      throw new DomainRuleError("credit_note_amount_invalid", "Amount must be greater than 0");
    }
    this.props = { ...props };
  }

  static create(params: CreateCreditNoteParams): CreditNote {
    const now = Date.now();
    const creditNoteNumber =
      params.creditNoteNumber || `CRN-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`;

    return new CreditNote({
      id: newId(ID_PREFIX.creditNote),
      creditNoteNumber,
      invoiceId: params.invoiceId,
      clientId: params.clientId,
      amountMinor: params.amountMinor,
      reason: params.reason.trim(),
      status: "issued",
      issuedAt: now,
      createdAt: now,
    });
  }

  get id(): string {
    return this.props.id;
  }
  get creditNoteNumber(): string {
    return this.props.creditNoteNumber;
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
  get reason(): string {
    return this.props.reason;
  }
  get status(): CreditNoteStatus {
    return this.props.status;
  }
  get issuedAt(): number {
    return this.props.issuedAt;
  }
  get createdAt(): number {
    return this.props.createdAt;
  }

  apply(): void {
    this.props.status = "applied";
  }

  voidNote(): void {
    this.props.status = "void";
  }

  toJSON(): CreditNoteProps {
    return { ...this.props };
  }
}

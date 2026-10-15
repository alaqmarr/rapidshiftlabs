import { newId, ID_PREFIX } from "../../../../shared/kernel/id";
import { DomainRuleError } from "../../../../shared/kernel/errors";

export interface InvoiceLineProps {
  id: string;
  invoiceId: string;
  description: string;
  sacCode: string;
  quantity: number;
  unitPriceMinor: number;
  amountMinor: number;
  createdAt: number;
  updatedAt: number;
}

export interface CreateInvoiceLineParams {
  invoiceId?: string;
  description: string;
  sacCode?: string;
  quantity?: number;
  unitPriceMinor: number;
}

export class InvoiceLine {
  private props: InvoiceLineProps;

  constructor(props: InvoiceLineProps) {
    if (!props.description || props.description.trim().length === 0) {
      throw new DomainRuleError("invoice_line_desc_required", "Invoice line description is required");
    }
    if (props.quantity <= 0) {
      throw new DomainRuleError("invoice_line_quantity_invalid", "Quantity must be greater than 0");
    }
    if (props.unitPriceMinor < 0) {
      throw new DomainRuleError("invoice_line_price_invalid", "Unit price cannot be negative");
    }
    this.props = { ...props };
  }

  static create(params: CreateInvoiceLineParams, invoiceId: string): InvoiceLine {
    const now = Date.now();
    const quantity = params.quantity ?? 1;
    const amountMinor = quantity * params.unitPriceMinor;

    return new InvoiceLine({
      id: newId(ID_PREFIX.invoiceLine),
      invoiceId,
      description: params.description.trim(),
      sacCode: params.sacCode?.trim() || "998311",
      quantity,
      unitPriceMinor: params.unitPriceMinor,
      amountMinor,
      createdAt: now,
      updatedAt: now,
    });
  }

  get id(): string {
    return this.props.id;
  }
  get invoiceId(): string {
    return this.props.invoiceId;
  }
  get description(): string {
    return this.props.description;
  }
  get sacCode(): string {
    return this.props.sacCode;
  }
  get quantity(): number {
    return this.props.quantity;
  }
  get unitPriceMinor(): number {
    return this.props.unitPriceMinor;
  }
  get amountMinor(): number {
    return this.props.amountMinor;
  }
  get createdAt(): number {
    return this.props.createdAt;
  }
  get updatedAt(): number {
    return this.props.updatedAt;
  }

  toJSON(): InvoiceLineProps {
    return { ...this.props };
  }
}

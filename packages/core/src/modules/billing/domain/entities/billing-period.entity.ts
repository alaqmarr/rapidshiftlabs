import { newId, ID_PREFIX } from "../../../../shared/kernel/id";

export type BillingPeriodStatus = "pending" | "invoiced" | "skipped";

export interface BillingPeriodProps {
  id: string;
  contractId: string;
  clientId: string;
  periodNumber: number;
  periodStart: number;
  periodEnd: number;
  dueDate: number;
  amountMinor: number;
  currency: string;
  status: BillingPeriodStatus;
  invoiceId?: string | null;
  createdAt: number;
  updatedAt: number;
}

export class BillingPeriod {
  private props: BillingPeriodProps;

  constructor(props: BillingPeriodProps) {
    this.props = { ...props };
  }

  static create(props: Omit<BillingPeriodProps, "id" | "status" | "invoiceId" | "createdAt" | "updatedAt">): BillingPeriod {
    const now = Date.now();
    return new BillingPeriod({
      ...props,
      id: newId(ID_PREFIX.billingPeriod),
      status: "pending",
      invoiceId: null,
      createdAt: now,
      updatedAt: now,
    });
  }

  get id(): string {
    return this.props.id;
  }
  get contractId(): string {
    return this.props.contractId;
  }
  get clientId(): string {
    return this.props.clientId;
  }
  get periodNumber(): number {
    return this.props.periodNumber;
  }
  get periodStart(): number {
    return this.props.periodStart;
  }
  get periodEnd(): number {
    return this.props.periodEnd;
  }
  get dueDate(): number {
    return this.props.dueDate;
  }
  get amountMinor(): number {
    return this.props.amountMinor;
  }
  get currency(): string {
    return this.props.currency;
  }
  get status(): BillingPeriodStatus {
    return this.props.status;
  }
  get invoiceId(): string | null | undefined {
    return this.props.invoiceId;
  }
  get createdAt(): number {
    return this.props.createdAt;
  }
  get updatedAt(): number {
    return this.props.updatedAt;
  }

  markInvoiced(invoiceId: string): void {
    this.props.status = "invoiced";
    this.props.invoiceId = invoiceId;
    this.props.updatedAt = Date.now();
  }

  markSkipped(): void {
    this.props.status = "skipped";
    this.props.updatedAt = Date.now();
  }

  toJSON(): BillingPeriodProps {
    return { ...this.props };
  }
}

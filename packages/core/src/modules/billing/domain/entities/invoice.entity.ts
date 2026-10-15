import { AggregateRoot } from "../../../../shared/kernel/domain-event";
import { newId, ID_PREFIX } from "../../../../shared/kernel/id";
import { DomainRuleError } from "../../../../shared/kernel/errors";
import { InvoiceLine, type InvoiceLineProps } from "./invoice-line.entity";
import type { Payment } from "./payment.entity";
import {
  createInvoiceIssuedEvent,
  createPaymentRecordedEvent,
  createInvoicePaidEvent,
  createInvoiceOverdueEvent,
} from "../events/billing-events";

export type InvoiceStatus = "draft" | "issued" | "partially_paid" | "paid" | "overdue" | "void";
export type InvoiceBillingMode = "gst" | "non_gst";

export interface InvoiceProps {
  id: string;
  invoiceNumber: string;
  billingMode: InvoiceBillingMode;
  clientId: string;
  contractId?: string | null;
  billingPeriodId?: string | null;
  status: InvoiceStatus;
  issueDate: number; // epoch ms
  dueDate: number; // epoch ms
  currency: string;
  subtotalMinor: number;
  cgstRateBps: number;
  cgstMinor: number;
  sgstRateBps: number;
  sgstMinor: number;
  igstRateBps: number;
  igstMinor: number;
  totalMinor: number;
  paidMinor: number;
  balanceMinor: number;
  notes?: string | null;
  pdfPath?: string | null;
  lines: InvoiceLine[];
  issuedAt?: number | null;
  voidedAt?: number | null;
  createdAt: number;
  updatedAt: number;
}

export interface CreateInvoiceParams {
  invoiceNumber?: string;
  billingMode?: InvoiceBillingMode;
  clientId: string;
  contractId?: string;
  billingPeriodId?: string;
  issueDate?: number;
  dueDate: number;
  currency?: string;
  notes?: string;
  lines?: Array<{
    description: string;
    sacCode?: string;
    quantity?: number;
    unitPriceMinor: number;
  }>;
  cgstRateBps?: number;
  cgstMinor?: number;
  sgstRateBps?: number;
  sgstMinor?: number;
  igstRateBps?: number;
  igstMinor?: number;
}

export class Invoice extends AggregateRoot<InvoiceProps> {
  constructor(props: InvoiceProps) {
    if (!props.clientId) {
      throw new DomainRuleError("invoice_client_required", "Client ID is required");
    }
    super(props);
  }

  static create(params: CreateInvoiceParams): Invoice {
    const now = Date.now();
    const invoiceId = newId(ID_PREFIX.invoice);
    const issueDate = params.issueDate ?? now;

    const lines: InvoiceLine[] = (params.lines || []).map((l) =>
      InvoiceLine.create(l, invoiceId),
    );

    const subtotalMinor = lines.reduce((sum, l) => sum + l.amountMinor, 0);
    const cgstMinor = params.cgstMinor ?? 0;
    const sgstMinor = params.sgstMinor ?? 0;
    const igstMinor = params.igstMinor ?? 0;
    const totalMinor = subtotalMinor + cgstMinor + sgstMinor + igstMinor;

    return new Invoice({
      id: invoiceId,
      invoiceNumber: params.invoiceNumber || `DRAFT-${invoiceId}`,
      billingMode: params.billingMode || "non_gst",
      clientId: params.clientId,
      contractId: params.contractId || null,
      billingPeriodId: params.billingPeriodId || null,
      status: "draft",
      issueDate,
      dueDate: params.dueDate,
      currency: params.currency || "INR",
      subtotalMinor,
      cgstRateBps: params.cgstRateBps ?? 0,
      cgstMinor,
      sgstRateBps: params.sgstRateBps ?? 0,
      sgstMinor,
      igstRateBps: params.igstRateBps ?? 0,
      igstMinor,
      totalMinor,
      paidMinor: 0,
      balanceMinor: totalMinor,
      notes: params.notes?.trim() || null,
      pdfPath: null,
      lines,
      issuedAt: null,
      voidedAt: null,
      createdAt: now,
      updatedAt: now,
    });
  }

  get id(): string {
    return this.props.id;
  }
  get invoiceNumber(): string {
    return this.props.invoiceNumber;
  }
  get billingMode(): InvoiceBillingMode {
    return this.props.billingMode;
  }
  get clientId(): string {
    return this.props.clientId;
  }
  get contractId(): string | null | undefined {
    return this.props.contractId;
  }
  get billingPeriodId(): string | null | undefined {
    return this.props.billingPeriodId;
  }
  get status(): InvoiceStatus {
    return this.props.status;
  }
  get issueDate(): number {
    return this.props.issueDate;
  }
  get dueDate(): number {
    return this.props.dueDate;
  }
  get currency(): string {
    return this.props.currency;
  }
  get subtotalMinor(): number {
    return this.props.subtotalMinor;
  }
  get cgstRateBps(): number {
    return this.props.cgstRateBps;
  }
  get cgstMinor(): number {
    return this.props.cgstMinor;
  }
  get sgstRateBps(): number {
    return this.props.sgstRateBps;
  }
  get sgstMinor(): number {
    return this.props.sgstMinor;
  }
  get igstRateBps(): number {
    return this.props.igstRateBps;
  }
  get igstMinor(): number {
    return this.props.igstMinor;
  }
  get totalMinor(): number {
    return this.props.totalMinor;
  }
  get paidMinor(): number {
    return this.props.paidMinor;
  }
  get balanceMinor(): number {
    return this.props.balanceMinor;
  }
  get notes(): string | null | undefined {
    return this.props.notes;
  }
  get pdfPath(): string | null | undefined {
    return this.props.pdfPath;
  }
  get lines(): InvoiceLine[] {
    return this.props.lines;
  }
  get issuedAt(): number | null | undefined {
    return this.props.issuedAt;
  }
  get voidedAt(): number | null | undefined {
    return this.props.voidedAt;
  }
  get createdAt(): number {
    return this.props.createdAt;
  }
  get updatedAt(): number {
    return this.props.updatedAt;
  }

  setPdfPath(path: string): void {
    this.props.pdfPath = path;
    this.props.updatedAt = Date.now();
  }

  private assertDraft(): void {
    if (this.props.status !== "draft") {
      throw new DomainRuleError(
        "invoice_immutable",
        "Issued invoices cannot be modified",
      );
    }
  }

  addLine(line: InvoiceLine): void {
    this.assertDraft();
    this.props.lines.push(line);
    this.recalculateTotals();
  }

  setTaxCalculations(taxes: {
    cgstRateBps: number;
    cgstMinor: number;
    sgstRateBps: number;
    sgstMinor: number;
    igstRateBps: number;
    igstMinor: number;
  }): void {
    this.assertDraft();
    this.props.cgstRateBps = taxes.cgstRateBps;
    this.props.cgstMinor = taxes.cgstMinor;
    this.props.sgstRateBps = taxes.sgstRateBps;
    this.props.sgstMinor = taxes.sgstMinor;
    this.props.igstRateBps = taxes.igstRateBps;
    this.props.igstMinor = taxes.igstMinor;
    this.recalculateTotals();
  }

  private recalculateTotals(): void {
    this.props.subtotalMinor = this.props.lines.reduce((sum, l) => sum + l.amountMinor, 0);
    this.props.totalMinor =
      this.props.subtotalMinor +
      this.props.cgstMinor +
      this.props.sgstMinor +
      this.props.igstMinor;
    this.props.balanceMinor = this.props.totalMinor - this.props.paidMinor;
    this.props.updatedAt = Date.now();
  }

  issue(invoiceNumber: string, issuedAt = Date.now()): void {
    if (this.props.status !== "draft") {
      throw new DomainRuleError(
        "invoice_issue_invalid",
        `Cannot issue invoice in status '${this.props.status}'`,
      );
    }
    if (this.props.lines.length === 0) {
      throw new DomainRuleError("invoice_lines_empty", "Cannot issue invoice without line items");
    }

    this.props.status = "issued";
    this.props.invoiceNumber = invoiceNumber;
    this.props.issuedAt = issuedAt;
    this.props.balanceMinor = this.props.totalMinor - this.props.paidMinor;
    this.props.updatedAt = Date.now();

    this.raise(
      createInvoiceIssuedEvent({
        invoiceId: this.id,
        invoiceNumber: this.props.invoiceNumber,
        clientId: this.clientId,
        contractId: this.contractId,
        billingMode: this.billingMode,
        subtotalMinor: this.subtotalMinor,
        totalMinor: this.totalMinor,
        dueDate: this.dueDate,
      }),
    );
  }

  recordPayment(payment: Payment): void {
    if (this.props.status === "draft") {
      throw new DomainRuleError(
        "invoice_payment_draft",
        "Cannot record payment for draft invoice",
      );
    }
    if (this.props.status === "void") {
      throw new DomainRuleError(
        "invoice_payment_void",
        "Cannot record payment for voided invoice",
      );
    }
    if (payment.amountMinor > this.props.balanceMinor) {
      throw new DomainRuleError(
        "payment_exceeds_balance",
        `Payment amount (₹${payment.amountMinor / 100}) exceeds outstanding balance (₹${this.props.balanceMinor / 100})`,
      );
    }

    this.props.paidMinor += payment.amountMinor;
    this.props.balanceMinor -= payment.amountMinor;
    this.props.updatedAt = Date.now();

    const isFullyPaid = this.props.balanceMinor === 0;
    if (isFullyPaid) {
      this.props.status = "paid";
      this.raise(
        createInvoicePaidEvent({
          invoiceId: this.id,
          invoiceNumber: this.invoiceNumber,
          clientId: this.clientId,
          totalMinor: this.totalMinor,
          paidAt: payment.paymentDate,
        }),
      );
    } else {
      this.props.status = "partially_paid";
    }

    this.raise(
      createPaymentRecordedEvent({
        paymentId: payment.id,
        invoiceId: this.id,
        clientId: this.clientId,
        amountMinor: payment.amountMinor,
        newBalanceMinor: this.props.balanceMinor,
        method: payment.method,
        isFullyPaid,
      }),
    );
  }

  markOverdue(now: number = Date.now()): void {
    if (
      (this.props.status === "issued" || this.props.status === "partially_paid") &&
      now > this.props.dueDate
    ) {
      this.props.status = "overdue";
      this.props.updatedAt = now;

      this.raise(
        createInvoiceOverdueEvent({
          invoiceId: this.id,
          invoiceNumber: this.invoiceNumber,
          clientId: this.clientId,
          balanceMinor: this.balanceMinor,
          dueDate: this.dueDate,
        }),
      );
    }
  }

  voidInvoice(reason?: string): void {
    if (this.props.status === "paid") {
      throw new DomainRuleError(
        "invoice_cannot_void_paid",
        "Paid invoice cannot be voided directly; issue a credit note instead",
      );
    }
    if (this.props.status === "void") return;

    this.props.status = "void";
    this.props.voidedAt = Date.now();
    this.props.updatedAt = Date.now();
  }

  toJSON(): Omit<InvoiceProps, "lines"> & { lines: InvoiceLineProps[] } {
    return {
      ...this.props,
      lines: this.props.lines.map((l) => l.toJSON()),
    };
  }
}

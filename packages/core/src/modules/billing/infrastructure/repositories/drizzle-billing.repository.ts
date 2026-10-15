import { eq, or, and, count, desc, like, lte, sql } from "drizzle-orm";
import type { LibSQLDatabase } from "drizzle-orm/libsql";
import { getDb } from "../../../../shared/infrastructure/db/connection-factory";
import {
  invoices,
  invoiceLines,
  billingPeriods,
  payments,
  creditNotes,
  type InvoiceRow,
  type InvoiceLineRow,
  type BillingPeriodRow,
  type PaymentRow,
  type CreditNoteRow,
} from "../../../../shared/infrastructure/db/schema/billing";
import {
  Invoice,
  type InvoiceStatus,
  type InvoiceBillingMode,
} from "../../domain/entities/invoice.entity";
import { InvoiceLine } from "../../domain/entities/invoice-line.entity";
import {
  BillingPeriod,
  type BillingPeriodStatus,
} from "../../domain/entities/billing-period.entity";
import { Payment, type PaymentMethod } from "../../domain/entities/payment.entity";
import { CreditNote, type CreditNoteStatus } from "../../domain/entities/credit-note.entity";
import type {
  BillingRepository,
  ListInvoicesQuery,
  ListPaymentsQuery,
  BillingSummaryDTO,
} from "../../domain/repositories/billing-repository.port";

export class DrizzleBillingRepository implements BillingRepository {
  private readonly db: LibSQLDatabase<any>;

  constructor(db?: LibSQLDatabase<any>) {
    this.db = db ?? getDb("core");
  }

  private toDomainInvoice(iRow: InvoiceRow, lRows: InvoiceLineRow[]): Invoice {
    const lines = lRows.map(
      (l) =>
        new InvoiceLine({
          id: l.id,
          invoiceId: l.invoiceId,
          description: l.description,
          sacCode: l.sacCode,
          quantity: l.quantity,
          unitPriceMinor: l.unitPriceMinor,
          amountMinor: l.amountMinor,
          createdAt: l.createdAt,
          updatedAt: l.updatedAt,
        }),
    );

    return new Invoice({
      id: iRow.id,
      invoiceNumber: iRow.invoiceNumber,
      billingMode: (iRow.billingMode as InvoiceBillingMode) || "non_gst",
      clientId: iRow.clientId,
      contractId: iRow.contractId,
      billingPeriodId: iRow.billingPeriodId,
      status: (iRow.status as InvoiceStatus) || "draft",
      issueDate: iRow.issueDate,
      dueDate: iRow.dueDate,
      currency: iRow.currency || "INR",
      subtotalMinor: iRow.subtotalMinor,
      cgstRateBps: iRow.cgstRateBps,
      cgstMinor: iRow.cgstMinor,
      sgstRateBps: iRow.sgstRateBps,
      sgstMinor: iRow.sgstMinor,
      igstRateBps: iRow.igstRateBps,
      igstMinor: iRow.igstMinor,
      totalMinor: iRow.totalMinor,
      paidMinor: iRow.paidMinor,
      balanceMinor: iRow.balanceMinor,
      notes: iRow.notes,
      pdfPath: iRow.pdfPath,
      lines,
      issuedAt: iRow.issuedAt,
      voidedAt: iRow.voidedAt,
      createdAt: iRow.createdAt,
      updatedAt: iRow.updatedAt,
    });
  }

  private toDomainPeriod(row: BillingPeriodRow): BillingPeriod {
    return new BillingPeriod({
      id: row.id,
      contractId: row.contractId,
      clientId: row.clientId,
      periodNumber: row.periodNumber,
      periodStart: row.periodStart,
      periodEnd: row.periodEnd,
      dueDate: row.dueDate,
      amountMinor: row.amountMinor,
      currency: row.currency || "INR",
      status: (row.status as BillingPeriodStatus) || "pending",
      invoiceId: row.invoiceId,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    });
  }

  private toDomainPayment(row: PaymentRow): Payment {
    return new Payment({
      id: row.id,
      invoiceId: row.invoiceId,
      clientId: row.clientId,
      amountMinor: row.amountMinor,
      currency: row.currency || "INR",
      paymentDate: row.paymentDate,
      method: (row.method as PaymentMethod) || "upi",
      reference: row.reference,
      notes: row.notes,
      recordedBy: row.recordedBy,
      createdAt: row.createdAt,
    });
  }

  private toDomainCreditNote(row: CreditNoteRow): CreditNote {
    return new CreditNote({
      id: row.id,
      creditNoteNumber: row.creditNoteNumber,
      invoiceId: row.invoiceId,
      clientId: row.clientId,
      amountMinor: row.amountMinor,
      reason: row.reason,
      status: (row.status as CreditNoteStatus) || "issued",
      issuedAt: row.issuedAt,
      createdAt: row.createdAt,
    });
  }

  async saveInvoice(invoice: Invoice): Promise<void> {
    await this.db.insert(invoices).values({
      id: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
      billingMode: invoice.billingMode,
      clientId: invoice.clientId,
      contractId: invoice.contractId ?? null,
      billingPeriodId: invoice.billingPeriodId ?? null,
      status: invoice.status,
      issueDate: invoice.issueDate,
      dueDate: invoice.dueDate,
      currency: invoice.currency,
      subtotalMinor: invoice.subtotalMinor,
      cgstRateBps: invoice.cgstRateBps,
      cgstMinor: invoice.cgstMinor,
      sgstRateBps: invoice.sgstRateBps,
      sgstMinor: invoice.sgstMinor,
      igstRateBps: invoice.igstRateBps,
      igstMinor: invoice.igstMinor,
      totalMinor: invoice.totalMinor,
      paidMinor: invoice.paidMinor,
      balanceMinor: invoice.balanceMinor,
      notes: invoice.notes ?? null,
      pdfPath: invoice.pdfPath ?? null,
      issuedAt: invoice.issuedAt ?? null,
      voidedAt: invoice.voidedAt ?? null,
      createdAt: invoice.createdAt,
      updatedAt: invoice.updatedAt,
    });

    if (invoice.lines.length > 0) {
      for (const line of invoice.lines) {
        await this.db.insert(invoiceLines).values({
          id: line.id,
          invoiceId: invoice.id,
          description: line.description,
          sacCode: line.sacCode,
          quantity: line.quantity,
          unitPriceMinor: line.unitPriceMinor,
          amountMinor: line.amountMinor,
          createdAt: line.createdAt,
          updatedAt: line.updatedAt,
        });
      }
    }
  }

  async updateInvoice(invoice: Invoice): Promise<void> {
    await this.db
      .update(invoices)
      .set({
        invoiceNumber: invoice.invoiceNumber,
        status: invoice.status,
        subtotalMinor: invoice.subtotalMinor,
        cgstRateBps: invoice.cgstRateBps,
        cgstMinor: invoice.cgstMinor,
        sgstRateBps: invoice.sgstRateBps,
        sgstMinor: invoice.sgstMinor,
        igstRateBps: invoice.igstRateBps,
        igstMinor: invoice.igstMinor,
        totalMinor: invoice.totalMinor,
        paidMinor: invoice.paidMinor,
        balanceMinor: invoice.balanceMinor,
        notes: invoice.notes ?? null,
        pdfPath: invoice.pdfPath ?? null,
        issuedAt: invoice.issuedAt ?? null,
        voidedAt: invoice.voidedAt ?? null,
        updatedAt: invoice.updatedAt,
      })
      .where(eq(invoices.id, invoice.id));
  }

  async findInvoiceById(id: string): Promise<Invoice | null> {
    const iRows = await this.db.select().from(invoices).where(eq(invoices.id, id)).limit(1);
    if (!iRows[0]) return null;

    const lRows = await this.db
      .select()
      .from(invoiceLines)
      .where(eq(invoiceLines.invoiceId, id));

    return this.toDomainInvoice(iRows[0], lRows);
  }

  async findInvoiceByNumber(invoiceNumber: string): Promise<Invoice | null> {
    const iRows = await this.db
      .select()
      .from(invoices)
      .where(eq(invoices.invoiceNumber, invoiceNumber))
      .limit(1);
    if (!iRows[0]) return null;

    const lRows = await this.db
      .select()
      .from(invoiceLines)
      .where(eq(invoiceLines.invoiceId, iRows[0].id));

    return this.toDomainInvoice(iRows[0], lRows);
  }

  async listInvoices(query?: ListInvoicesQuery): Promise<{ items: Invoice[]; total: number }> {
    const limit = query?.limit ?? 50;
    const offset = query?.offset ?? 0;

    const conditions = [];
    if (query?.clientId) {
      conditions.push(eq(invoices.clientId, query.clientId));
    }
    if (query?.status) {
      conditions.push(eq(invoices.status, query.status as any));
    }
    if (query?.search && query.search.trim().length > 0) {
      const pattern = `%${query.search.trim()}%`;
      conditions.push(like(invoices.invoiceNumber, pattern));
    }

    let q = this.db.select().from(invoices);
    if (conditions.length === 1) {
      q = q.where(conditions[0]!) as any;
    } else if (conditions.length > 1) {
      q = q.where(and(...conditions)) as any;
    }

    const iRows = await q.orderBy(desc(invoices.createdAt)).limit(limit).offset(offset);

    const countRes = await this.db.select({ val: count() }).from(invoices);
    const total = countRes[0]?.val ?? iRows.length;

    const items: Invoice[] = [];
    for (const row of iRows) {
      const lRows = await this.db
        .select()
        .from(invoiceLines)
        .where(eq(invoiceLines.invoiceId, row.id));
      items.push(this.toDomainInvoice(row, lRows));
    }

    return { items, total };
  }

  async saveBillingPeriods(periodsList: BillingPeriod[]): Promise<void> {
    for (const p of periodsList) {
      await this.db.insert(billingPeriods).values({
        id: p.id,
        contractId: p.contractId,
        clientId: p.clientId,
        periodNumber: p.periodNumber,
        periodStart: p.periodStart,
        periodEnd: p.periodEnd,
        dueDate: p.dueDate,
        amountMinor: p.amountMinor,
        currency: p.currency,
        status: p.status,
        invoiceId: p.invoiceId ?? null,
        createdAt: p.createdAt,
        updatedAt: p.updatedAt,
      });
    }
  }

  async updateBillingPeriod(period: BillingPeriod): Promise<void> {
    await this.db
      .update(billingPeriods)
      .set({
        status: period.status,
        invoiceId: period.invoiceId ?? null,
        updatedAt: period.updatedAt,
      })
      .where(eq(billingPeriods.id, period.id));
  }

  async findPendingBillingPeriods(beforeDueDate: number): Promise<BillingPeriod[]> {
    const rows = await this.db
      .select()
      .from(billingPeriods)
      .where(
        and(
          eq(billingPeriods.status, "pending"),
          lte(billingPeriods.periodStart, beforeDueDate),
        ),
      );
    return rows.map((r) => this.toDomainPeriod(r));
  }

  async findBillingPeriodsByContract(contractId: string): Promise<BillingPeriod[]> {
    const rows = await this.db
      .select()
      .from(billingPeriods)
      .where(eq(billingPeriods.contractId, contractId))
      .orderBy(billingPeriods.periodNumber);
    return rows.map((r) => this.toDomainPeriod(r));
  }

  async savePayment(payment: Payment): Promise<void> {
    await this.db.insert(payments).values({
      id: payment.id,
      invoiceId: payment.invoiceId,
      clientId: payment.clientId,
      amountMinor: payment.amountMinor,
      currency: payment.currency,
      paymentDate: payment.paymentDate,
      method: payment.method,
      reference: payment.reference ?? null,
      notes: payment.notes ?? null,
      recordedBy: payment.recordedBy ?? null,
      createdAt: payment.createdAt,
    });
  }

  async listPayments(query?: ListPaymentsQuery): Promise<{ items: Payment[]; total: number }> {
    const limit = query?.limit ?? 50;
    const offset = query?.offset ?? 0;

    const conditions = [];
    if (query?.clientId) {
      conditions.push(eq(payments.clientId, query.clientId));
    }
    if (query?.invoiceId) {
      conditions.push(eq(payments.invoiceId, query.invoiceId));
    }

    let q = this.db.select().from(payments);
    if (conditions.length === 1) {
      q = q.where(conditions[0]!) as any;
    } else if (conditions.length > 1) {
      q = q.where(and(...conditions)) as any;
    }

    const rows = await q.orderBy(desc(payments.paymentDate)).limit(limit).offset(offset);

    const countRes = await this.db.select({ val: count() }).from(payments);
    const total = countRes[0]?.val ?? rows.length;

    return {
      items: rows.map((r) => this.toDomainPayment(r)),
      total,
    };
  }

  async saveCreditNote(creditNote: CreditNote): Promise<void> {
    await this.db.insert(creditNotes).values({
      id: creditNote.id,
      creditNoteNumber: creditNote.creditNoteNumber,
      invoiceId: creditNote.invoiceId,
      clientId: creditNote.clientId,
      amountMinor: creditNote.amountMinor,
      reason: creditNote.reason,
      status: creditNote.status,
      issuedAt: creditNote.issuedAt,
      createdAt: creditNote.createdAt,
    });
  }

  async findCreditNotesByInvoice(invoiceId: string): Promise<CreditNote[]> {
    const rows = await this.db
      .select()
      .from(creditNotes)
      .where(eq(creditNotes.invoiceId, invoiceId));
    return rows.map((r) => this.toDomainCreditNote(r));
  }

  async getBillingSummary(clientId?: string): Promise<BillingSummaryDTO> {
    let q = this.db.select().from(invoices);
    if (clientId) {
      q = q.where(eq(invoices.clientId, clientId)) as any;
    }

    const allInvoices = await q;

    let totalBilledMinor = 0;
    let totalPaidMinor = 0;
    let outstandingMinor = 0;
    let overdueCount = 0;
    let activeInvoicesCount = 0;

    for (const inv of allInvoices) {
      if (inv.status !== "void" && inv.status !== "draft") {
        totalBilledMinor += inv.totalMinor;
        totalPaidMinor += inv.paidMinor;
        outstandingMinor += inv.balanceMinor;
        activeInvoicesCount++;
        if (inv.status === "overdue") {
          overdueCount++;
        }
      }
    }

    return {
      totalBilledMinor,
      totalPaidMinor,
      outstandingMinor,
      overdueCount,
      activeInvoicesCount,
    };
  }
}

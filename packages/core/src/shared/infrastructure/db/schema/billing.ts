import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core";

export const billingPeriods = sqliteTable(
  "billing_periods",
  {
    id: text("id").primaryKey(), // ULID prefixed "bpd_"
    contractId: text("contract_id").notNull(),
    clientId: text("client_id").notNull(),
    periodNumber: integer("period_number").notNull(),
    periodStart: integer("period_start").notNull(), // epoch ms
    periodEnd: integer("period_end").notNull(), // epoch ms
    dueDate: integer("due_date").notNull(), // epoch ms
    amountMinor: integer("amount_minor").notNull(),
    currency: text("currency").notNull().default("INR"),
    status: text("status", { enum: ["pending", "invoiced", "skipped"] })
      .notNull()
      .default("pending"),
    invoiceId: text("invoice_id"),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (table) => [
    index("idx_billing_periods_contract").on(table.contractId),
    index("idx_billing_periods_client").on(table.clientId),
    index("idx_billing_periods_status").on(table.status),
    index("idx_billing_periods_due").on(table.dueDate),
  ],
);

export const invoices = sqliteTable(
  "invoices",
  {
    id: text("id").primaryKey(), // ULID prefixed "inv_"
    invoiceNumber: text("invoice_number").notNull().unique(), // e.g. RSL/2026-27/0001
    billingMode: text("billing_mode", { enum: ["gst", "non_gst"] })
      .notNull()
      .default("non_gst"),
    clientId: text("client_id").notNull(),
    contractId: text("contract_id"),
    billingPeriodId: text("billing_period_id"),
    status: text("status", {
      enum: ["draft", "issued", "partially_paid", "paid", "overdue", "void"],
    })
      .notNull()
      .default("draft"),
    issueDate: integer("issue_date").notNull(), // epoch ms
    dueDate: integer("due_date").notNull(), // epoch ms
    currency: text("currency").notNull().default("INR"),
    subtotalMinor: integer("subtotal_minor").notNull().default(0),
    cgstRateBps: integer("cgst_rate_bps").notNull().default(0),
    cgstMinor: integer("cgst_minor").notNull().default(0),
    sgstRateBps: integer("sgst_rate_bps").notNull().default(0),
    sgstMinor: integer("sgst_minor").notNull().default(0),
    igstRateBps: integer("igst_rate_bps").notNull().default(0),
    igstMinor: integer("igst_minor").notNull().default(0),
    totalMinor: integer("total_minor").notNull().default(0),
    paidMinor: integer("paid_minor").notNull().default(0),
    balanceMinor: integer("balance_minor").notNull().default(0),
    notes: text("notes"),
    pdfPath: text("pdf_path"),
    issuedAt: integer("issued_at"),
    voidedAt: integer("voided_at"),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (table) => [
    index("idx_invoices_client").on(table.clientId),
    index("idx_invoices_contract").on(table.contractId),
    index("idx_invoices_status").on(table.status),
    index("idx_invoices_due").on(table.dueDate),
    index("idx_invoices_number").on(table.invoiceNumber),
  ],
);

export const invoiceLines = sqliteTable(
  "invoice_lines",
  {
    id: text("id").primaryKey(), // ULID prefixed "inl_"
    invoiceId: text("invoice_id").notNull(),
    description: text("description").notNull(),
    sacCode: text("sac_code").notNull().default("998311"),
    quantity: integer("quantity").notNull().default(1),
    unitPriceMinor: integer("unit_price_minor").notNull().default(0),
    amountMinor: integer("amount_minor").notNull().default(0),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (table) => [
    index("idx_invoice_lines_invoice").on(table.invoiceId),
  ],
);

export const payments = sqliteTable(
  "payments",
  {
    id: text("id").primaryKey(), // ULID prefixed "pay_"
    invoiceId: text("invoice_id").notNull(),
    clientId: text("client_id").notNull(),
    amountMinor: integer("amount_minor").notNull(),
    currency: text("currency").notNull().default("INR"),
    paymentDate: integer("payment_date").notNull(), // epoch ms
    method: text("method", {
      enum: ["upi", "bank_transfer", "cash", "cheque", "online"],
    })
      .notNull()
      .default("upi"),
    reference: text("reference"),
    notes: text("notes"),
    recordedBy: text("recorded_by"),
    createdAt: integer("created_at").notNull(),
  },
  (table) => [
    index("idx_payments_invoice").on(table.invoiceId),
    index("idx_payments_client").on(table.clientId),
  ],
);

export const creditNotes = sqliteTable(
  "credit_notes",
  {
    id: text("id").primaryKey(), // ULID prefixed "crn_"
    creditNoteNumber: text("credit_note_number").notNull().unique(),
    invoiceId: text("invoice_id").notNull(),
    clientId: text("client_id").notNull(),
    amountMinor: integer("amount_minor").notNull(),
    reason: text("reason").notNull(),
    status: text("status", { enum: ["issued", "applied", "void"] })
      .notNull()
      .default("issued"),
    issuedAt: integer("issued_at").notNull(),
    createdAt: integer("created_at").notNull(),
  },
  (table) => [
    index("idx_credit_notes_invoice").on(table.invoiceId),
    index("idx_credit_notes_client").on(table.clientId),
  ],
);

export type BillingPeriodRow = typeof billingPeriods.$inferSelect;
export type NewBillingPeriodRow = typeof billingPeriods.$inferInsert;

export type InvoiceRow = typeof invoices.$inferSelect;
export type NewInvoiceRow = typeof invoices.$inferInsert;

export type InvoiceLineRow = typeof invoiceLines.$inferSelect;
export type NewInvoiceLineRow = typeof invoiceLines.$inferInsert;

export type PaymentRow = typeof payments.$inferSelect;
export type NewPaymentRow = typeof payments.$inferInsert;

export type CreditNoteRow = typeof creditNotes.$inferSelect;
export type NewCreditNoteRow = typeof creditNotes.$inferInsert;

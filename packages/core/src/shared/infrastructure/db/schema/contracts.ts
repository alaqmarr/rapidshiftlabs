import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core";

export const contracts = sqliteTable(
  "contracts",
  {
    id: text("id").primaryKey(), // ULID prefixed "ctr_"
    clientId: text("client_id").notNull(),
    code: text("code").notNull().unique(), // e.g. "CTR-2026-001"
    title: text("title").notNull(),
    status: text("status", {
      enum: ["draft", "active", "renewed", "expired", "terminated"],
    })
      .notNull()
      .default("draft"),
    amountMinor: integer("amount_minor").notNull().default(0),
    currency: text("currency").notNull().default("INR"),
    billingCycle: text("billing_cycle", {
      enum: [
        "monthly",
        "quarterly",
        "half_yearly",
        "yearly",
        "every_n_days",
        "one_time",
        "milestone",
      ],
    })
      .notNull()
      .default("monthly"),
    intervalCount: integer("interval_count").notNull().default(1),
    anchorDay: integer("anchor_day").notNull().default(1), // 1-31
    validFrom: integer("valid_from").notNull(), // epoch ms
    validTo: integer("valid_to").notNull(), // epoch ms
    autoRenew: integer("auto_renew", { mode: "boolean" })
      .notNull()
      .default(false),
    graceDays: integer("grace_days").notNull().default(7),
    paymentTermsDays: integer("payment_terms_days").notNull().default(15),
    taxProfile: text("tax_profile", { enum: ["gst", "non_gst"] })
      .notNull()
      .default("non_gst"),
    gstRateBps: integer("gst_rate_bps").notNull().default(1800), // 18.00%
    notes: text("notes"),
    createdAt: integer("created_at").notNull(), // epoch ms
    updatedAt: integer("updated_at").notNull(), // epoch ms
  },
  (table) => [
    index("idx_contracts_client").on(table.clientId),
    index("idx_contracts_status").on(table.status),
    index("idx_contracts_code").on(table.code),
  ],
);

export const contractItems = sqliteTable(
  "contract_items",
  {
    id: text("id").primaryKey(), // ULID prefixed "cti_"
    contractId: text("contract_id").notNull(),
    description: text("description").notNull(),
    amountMinor: integer("amount_minor").notNull().default(0),
    quantity: integer("quantity").notNull().default(1),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (table) => [
    index("idx_contract_items_contract").on(table.contractId),
  ],
);

export type ContractRow = typeof contracts.$inferSelect;
export type NewContractRow = typeof contracts.$inferInsert;

export type ContractItemRow = typeof contractItems.$inferSelect;
export type NewContractItemRow = typeof contractItems.$inferInsert;

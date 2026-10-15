import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core";

/**
 * Entitlements Table:
 * Represents the materialized access state and manual override for each client.
 * Strictly 1:1 with clients (enforced via unique constraint on client_id).
 */
export const entitlements = sqliteTable(
  "entitlements",
  {
    id: text("id").primaryKey(), // ULID prefixed "ent_"
    clientId: text("client_id").notNull().unique(), // ULID prefixed "cli_"
    status: text("status", { enum: ["Active", "Overdue", "Blocked", "Suspended"] })
      .notNull()
      .default("Active"),
    isBlocked: integer("is_blocked", { mode: "boolean" }).notNull().default(false),
    reason: text("reason"),
    overrideMode: text("override_mode", { enum: ["allow", "block", "maintenance"] }),
    overrideValidUntil: integer("override_valid_until"), // epoch ms
    overrideNote: text("override_note"),
    overrideSetBy: text("override_set_by"),
    overrideCreatedAt: integer("override_created_at"),
    lastEvaluatedAt: integer("last_evaluated_at").notNull().default(0),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (table) => [
    index("idx_entitlements_client_id").on(table.clientId),
    index("idx_entitlements_status").on(table.status),
    index("idx_entitlements_is_blocked").on(table.isBlocked),
  ],
);

export type EntitlementRow = typeof entitlements.$inferSelect;
export type NewEntitlementRow = typeof entitlements.$inferInsert;

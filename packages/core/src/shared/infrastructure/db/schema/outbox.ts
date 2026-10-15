import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core";

export const outbox = sqliteTable(
  "outbox",
  {
    id: text("id").primaryKey(), // ULID prefixed "evt_"
    type: text("type").notNull(), // e.g. "billing.invoice.issued", "support.ticket.created"
    aggregateType: text("aggregate_type").notNull(), // e.g. "invoice", "ticket", "contract"
    aggregateId: text("aggregate_id").notNull(),
    clientId: text("client_id"), // Nullable tenant ID for tenant filtering
    payload: text("payload").notNull(), // JSON serialized event data
    occurredAt: integer("occurred_at").notNull(), // epoch ms
    status: text("status", { enum: ["pending", "processing", "published", "failed"] })
      .notNull()
      .default("pending"),
    attempts: integer("attempts").notNull().default(0),
    maxAttempts: integer("max_attempts").notNull().default(5),
    nextRetryAt: integer("next_retry_at"), // epoch ms, exponential backoff
    lockedAt: integer("locked_at"), // epoch ms, lease timestamp
    lockedBy: text("locked_by"), // Identifier of worker holding lease
    processedAt: integer("processed_at"), // epoch ms when finished or dead-lettered
    lastError: text("last_error"),
    createdAt: integer("created_at").notNull(), // epoch ms
    updatedAt: integer("updated_at").notNull(), // epoch ms
  },
  (table) => [
    index("idx_outbox_poll").on(table.status, table.nextRetryAt, table.occurredAt),
    index("idx_outbox_aggregate").on(table.aggregateType, table.aggregateId),
    index("idx_outbox_client").on(table.clientId, table.occurredAt),
  ],
);

export type OutboxRow = typeof outbox.$inferSelect;
export type NewOutboxRow = typeof outbox.$inferInsert;

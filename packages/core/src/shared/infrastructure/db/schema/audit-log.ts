import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core";

export const auditLog = sqliteTable(
  "audit_log",
  {
    id: text("id").primaryKey(), // ULID prefixed "aud_"
    actorId: text("actor_id").notNull(), // User ID, API key ID, or "system"
    actorType: text("actor_type", { enum: ["admin", "client", "system", "api_key"] }).notNull(),
    actorEmail: text("actor_email"),
    clientId: text("client_id"), // Nullable for tenant isolation
    action: text("action").notNull(), // e.g. "vault.secret.reveal", "fleet.process.restart"
    entityType: text("entity_type").notNull(), // e.g. "vault_item", "pm2_process", "invoice"
    entityId: text("entity_id").notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    details: text("details"), // JSON stringified metadata/parameters
    timestamp: integer("timestamp").notNull(), // epoch ms
  },
  (table) => [
    index("idx_audit_client_time").on(table.clientId, table.timestamp),
    index("idx_audit_actor_time").on(table.actorId, table.timestamp),
    index("idx_audit_entity").on(table.entityType, table.entityId),
    index("idx_audit_timestamp").on(table.timestamp),
  ],
);

export type AuditLogRow = typeof auditLog.$inferSelect;
export type NewAuditLogRow = typeof auditLog.$inferInsert;

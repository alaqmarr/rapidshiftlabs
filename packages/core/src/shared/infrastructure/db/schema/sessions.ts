import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core";

export const sessions = sqliteTable(
  "sessions",
  {
    id: text("id").primaryKey(), // ULID prefixed "ses_"
    sessionToken: text("session_token").notNull().unique(), // Secure random token
    userId: text("user_id").notNull(), // admin_users.id or client_users.id
    realm: text("realm", { enum: ["admin", "client"] }).notNull(), // Strict realm barrier
    clientId: text("client_id"), // Null for admin; client ID for client user
    sessionVersion: integer("session_version").notNull().default(1),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    expiresAt: integer("expires_at").notNull(), // epoch ms
    createdAt: integer("created_at").notNull(), // epoch ms
    lastActiveAt: integer("last_active_at").notNull(), // epoch ms
  },
  (table) => [
    index("idx_sessions_token").on(table.sessionToken),
    index("idx_sessions_user_realm").on(table.userId, table.realm),
    index("idx_sessions_expires").on(table.expiresAt),
  ],
);

export type SessionRow = typeof sessions.$inferSelect;
export type NewSessionRow = typeof sessions.$inferInsert;

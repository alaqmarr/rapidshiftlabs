import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core";

export const clientUsers = sqliteTable(
  "client_users",
  {
    id: text("id").primaryKey(), // ULID prefixed "usr_"
    clientId: text("client_id").notNull(), // References clients.id
    email: text("email").notNull().unique(),
    name: text("name").notNull(),
    role: text("role", { enum: ["client_admin", "client_member"] })
      .notNull()
      .default("client_member"),
    passwordHash: text("password_hash").notNull(), // Argon2id hash
    sessionVersion: integer("session_version").notNull().default(1), // Incremented for instant JWT revocation
    status: text("status", { enum: ["active", "invited", "suspended"] })
      .notNull()
      .default("active"),
    invitedAt: integer("invited_at"), // epoch ms
    lastLoginAt: integer("last_login_at"), // epoch ms
    createdAt: integer("created_at").notNull(), // epoch ms
    updatedAt: integer("updated_at").notNull(), // epoch ms
  },
  (table) => [
    index("idx_client_users_client").on(table.clientId),
    index("idx_client_users_email").on(table.email),
  ],
);

export type ClientUserRow = typeof clientUsers.$inferSelect;
export type NewClientUserRow = typeof clientUsers.$inferInsert;

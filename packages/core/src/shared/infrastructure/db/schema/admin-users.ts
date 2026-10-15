import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core";

export const adminUsers = sqliteTable(
  "admin_users",
  {
    id: text("id").primaryKey(), // ULID prefixed "adm_"
    email: text("email").notNull().unique(),
    name: text("name").notNull(),
    role: text("role", { enum: ["owner", "superadmin", "finance", "ops", "support"] })
      .notNull()
      .default("support"),
    supportLevel: integer("support_level"), // 1 | 2 | 3 | null
    passwordHash: text("password_hash").notNull(), // Argon2id hash
    totpSecretEnc: text("totp_secret_enc"), // AES-256-GCM encrypted base32 secret
    totpEnabled: integer("totp_enabled", { mode: "boolean" })
      .notNull()
      .default(false),
    status: text("status", { enum: ["active", "suspended", "invited"] })
      .notNull()
      .default("active"),
    sessionVersion: integer("session_version").notNull().default(1), // Incremented for instant JWT revocation
    lastLoginAt: integer("last_login_at"), // epoch ms
    createdAt: integer("created_at").notNull(), // epoch ms
    updatedAt: integer("updated_at").notNull(), // epoch ms
  },
  (table) => [
    index("idx_admin_users_email").on(table.email),
    index("idx_admin_users_role").on(table.role),
    index("idx_admin_users_status").on(table.status),
  ],
);

export type AdminUserRow = typeof adminUsers.$inferSelect;
export type NewAdminUserRow = typeof adminUsers.$inferInsert;

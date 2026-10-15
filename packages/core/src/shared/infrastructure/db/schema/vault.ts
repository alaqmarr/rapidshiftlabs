import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core";

export const vaultCredentialsTable = sqliteTable(
  "vault_credentials",
  {
    id: text("id").primaryKey(), // vlt_...
    clientId: text("client_id").notNull(),
    projectId: text("project_id"),
    name: text("name").notNull(),
    category: text("category", {
      enum: ["database", "smtp", "api_key", "server_ssh", "env_file", "other"],
    })
      .notNull()
      .default("other"),
    username: text("username"),
    encryptedValue: text("encrypted_value").notNull(), // AES-256-GCM envelope (iv:tag:ciphertext)
    metadata: text("metadata"), // JSON description, host, port, etc.
    expiresAt: integer("expires_at"),
    oneTimeReveal: integer("one_time_reveal", { mode: "boolean" }).notNull().default(false),
    revealedCount: integer("revealed_count").notNull().default(0),
    lastRevealedAt: integer("last_revealed_at"),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (table) => [
    index("idx_vault_credentials_client").on(table.clientId),
    index("idx_vault_credentials_project").on(table.projectId),
    index("idx_vault_credentials_category").on(table.category),
  ],
);

export const vaultCredentials = vaultCredentialsTable;

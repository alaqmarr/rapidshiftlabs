import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core";

/**
 * API Keys Table:
 * Stores hashed API credentials issued to clients for SDK and external integrations.
 * Plaintext secrets are NEVER stored in this table.
 */
export const apiKeys = sqliteTable(
  "api_keys",
  {
    id: text("id").primaryKey(), // ULID prefixed "key_"
    clientId: text("client_id").notNull(), // ULID prefixed "cli_"
    name: text("name").notNull(), // Friendly descriptive label
    keyPrefix: text("key_prefix").notNull(), // Fast lookup prefix (e.g. "rsk_live_a1b2c3d4")
    keyHash: text("key_hash").notNull(), // Hex-encoded SHA-256 hash of the complete raw secret key
    type: text("type", { enum: ["secret", "publishable"] })
      .notNull()
      .default("secret"),
    scopes: text("scopes").notNull().default("[]"), // JSON string array of permissions
    expiresAt: integer("expires_at"), // epoch ms | null
    lastUsedAt: integer("last_used_at"), // epoch ms | null
    revokedAt: integer("revoked_at"), // epoch ms | null
    createdAt: integer("created_at").notNull(), // epoch ms
    updatedAt: integer("updated_at").notNull(), // epoch ms
  },
  (table) => [
    index("idx_api_keys_key_prefix").on(table.keyPrefix),
    index("idx_api_keys_client_id").on(table.clientId),
    index("idx_api_keys_key_hash").on(table.keyHash),
  ],
);

export type ApiKeyRow = typeof apiKeys.$inferSelect;
export type NewApiKeyRow = typeof apiKeys.$inferInsert;

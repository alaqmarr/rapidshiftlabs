import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core";

export const embedTokensTable = sqliteTable(
  "embed_tokens",
  {
    id: text("id").primaryKey(), // emb_...
    clientId: text("client_id").notNull(),
    scopes: text("scopes").notNull(), // JSON array of allowed permissions/widgets e.g. ["billing:read", "process:restart"]
    allowedOrigins: text("allowed_origins"), // comma-separated or JSON array of allowed origins
    expiresAt: integer("expires_at").notNull(), // 15-min TTL epoch ms
    createdAt: integer("created_at").notNull(),
  },
  (table) => [
    index("idx_embed_tokens_client").on(table.clientId),
    index("idx_embed_tokens_expires").on(table.expiresAt),
  ],
);

export const embedTokens = embedTokensTable;

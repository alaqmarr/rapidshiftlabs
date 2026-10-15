import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

export const settings = sqliteTable("settings", {
  key: text("key").primaryKey(), // e.g. "company", "tax", "email", "numbering", "dunning"
  value: text("value").notNull(), // JSON stringified configuration object
  encrypted: integer("encrypted", { mode: "boolean" })
    .notNull()
    .default(false), // Indicates whether payload contains ciphertexts encrypted with MASTER_KEY
  updatedBy: text("updated_by"), // Actor ID of last editor
  createdAt: integer("created_at").notNull(), // epoch ms
  updatedAt: integer("updated_at").notNull(), // epoch ms
});

export type SettingRow = typeof settings.$inferSelect;
export type NewSettingRow = typeof settings.$inferInsert;

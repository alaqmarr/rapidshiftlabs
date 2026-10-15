import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core";

export const clients = sqliteTable(
  "clients",
  {
    id: text("id").primaryKey(), // ULID prefixed "cli_"
    name: text("name").notNull(), // Legal name
    slug: text("slug").notNull().unique(), // URL-safe identifier
    gstin: text("gstin"), // GST Identification Number
    pan: text("pan"), // Permanent Account Number
    billingMode: text("billing_mode", { enum: ["gst", "non_gst"] })
      .notNull()
      .default("non_gst"),
    currency: text("currency").notNull().default("INR"),
    timezone: text("timezone").notNull().default("Asia/Kolkata"),
    status: text("status", { enum: ["active", "inactive", "suspended"] })
      .notNull()
      .default("active"),
    addressLine1: text("address_line1"),
    addressLine2: text("address_line2"),
    city: text("city"),
    state: text("state"), // State name or code (used for intra-state vs inter-state GST)
    postalCode: text("postal_code"),
    country: text("country").notNull().default("India"),
    notes: text("notes"),
    githubRepo: text("github_repo"),
    githubBranch: text("github_branch").default("main"),
    createdAt: integer("created_at").notNull(), // epoch ms
    updatedAt: integer("updated_at").notNull(), // epoch ms
  },
  (table) => [
    index("idx_clients_slug").on(table.slug),
    index("idx_clients_status").on(table.status),
  ],
);

export const clientContacts = sqliteTable(
  "client_contacts",
  {
    id: text("id").primaryKey(), // ULID prefixed "cnt_"
    clientId: text("client_id").notNull(),
    name: text("name").notNull(),
    email: text("email").notNull(),
    phone: text("phone"),
    title: text("title"),
    isPrimary: integer("is_primary", { mode: "boolean" }).notNull().default(false),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (table) => [
    index("idx_client_contacts_client").on(table.clientId),
    index("idx_client_contacts_email").on(table.email),
  ],
);

export const projects = sqliteTable(
  "projects",
  {
    id: text("id").primaryKey(), // ULID prefixed "prj_"
    clientId: text("client_id").notNull(),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    description: text("description"),
    status: text("status", { enum: ["active", "archived"] }).notNull().default("active"),
    githubRepo: text("github_repo"),
    githubBranch: text("github_branch").default("main"),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (table) => [
    index("idx_projects_client").on(table.clientId),
    index("idx_projects_slug").on(table.clientId, table.slug),
  ],
);

export type ClientRow = typeof clients.$inferSelect;
export type NewClientRow = typeof clients.$inferInsert;

export type ClientContactRow = typeof clientContacts.$inferSelect;
export type NewClientContactRow = typeof clientContacts.$inferInsert;

export type ProjectRow = typeof projects.$inferSelect;
export type NewProjectRow = typeof projects.$inferInsert;

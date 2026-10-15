import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core";

export const releaseLinksTable = sqliteTable(
  "release_links",
  {
    id: text("id").primaryKey(), // rel_...
    clientId: text("client_id").notNull(),
    projectId: text("project_id"),
    name: text("name").notNull(),
    version: text("version").notNull(),
    environment: text("environment", {
      enum: ["beta", "staging", "prod"],
    })
      .notNull()
      .default("beta"),
    url: text("url").notNull(),
    status: text("status", {
      enum: ["active", "archived", "deprecated"],
    })
      .notNull()
      .default("active"),
    releaseNotes: text("release_notes"),
    password: text("password"),
    expiresAt: integer("expires_at"),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (table) => [
    index("idx_release_links_client").on(table.clientId),
    index("idx_release_links_project").on(table.projectId),
    index("idx_release_links_env").on(table.environment),
    index("idx_release_links_status").on(table.status),
  ],
);

export const releaseLinks = releaseLinksTable;

export const projectChangelogsTable = sqliteTable(
  "project_changelogs",
  {
    id: text("id").primaryKey(), // chg_...
    clientId: text("client_id").notNull(),
    projectId: text("project_id"),
    repo: text("repo").notNull(), // owner/repo
    commitSha: text("commit_sha").notNull(),
    shortSha: text("short_sha").notNull(),
    message: text("message").notNull(),
    title: text("title").notNull(), // Cleaned feature/fix summary
    description: text("description"), // Detailed notes / body
    type: text("type", {
      enum: ["feature", "fix", "performance", "security", "release", "chore"],
    })
      .notNull()
      .default("feature"),
    authorName: text("author_name").notNull(),
    authorAvatarUrl: text("author_avatar_url"),
    commitUrl: text("commit_url"),
    versionTag: text("version_tag"), // e.g. "v1.2.0"
    committedAt: integer("committed_at").notNull(), // epoch ms
    createdAt: integer("created_at").notNull(),
  },
  (table) => [
    index("idx_project_changelogs_client").on(table.clientId),
    index("idx_project_changelogs_type").on(table.type),
    index("idx_project_changelogs_committed").on(table.committedAt),
  ]
);

export const projectChangelogs = projectChangelogsTable;

export type ReleaseLinkRow = typeof releaseLinksTable.$inferSelect;
export type NewReleaseLinkRow = typeof releaseLinksTable.$inferInsert;

export type ProjectChangelogRow = typeof projectChangelogsTable.$inferSelect;
export type NewProjectChangelogRow = typeof projectChangelogsTable.$inferInsert;

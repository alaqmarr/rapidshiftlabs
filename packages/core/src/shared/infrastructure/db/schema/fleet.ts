import { sqliteTable, text, integer, index, uniqueIndex } from "drizzle-orm/sqlite-core";

export const servers = sqliteTable(
  "servers",
  {
    id: text("id").primaryKey(), // ULID prefixed "srv_"
    name: text("name").notNull(),
    host: text("host").notNull(),
    port: integer("port").notNull().default(22),
    username: text("username").notNull().default("ubuntu"),
    encryptedPrivateKey: text("encrypted_private_key").notNull(),
    keyPassphraseEnc: text("key_passphrase_enc"),
    hostFingerprint: text("host_fingerprint"),
    status: text("status", {
      enum: ["online", "offline", "unreachable", "degraded", "pending"],
    })
      .notNull()
      .default("pending"),
    lastCheckedAt: integer("last_checked_at"), // epoch ms
    errorMessage: text("error_message"),
    createdAt: integer("created_at").notNull(), // epoch ms
    updatedAt: integer("updated_at").notNull(), // epoch ms
  },
  (table) => [
    index("idx_servers_status").on(table.status),
    index("idx_servers_host").on(table.host),
  ],
);

export const pm2Processes = sqliteTable(
  "pm2_processes",
  {
    id: text("id").primaryKey(), // ULID prefixed "prc_"
    serverId: text("server_id").notNull(),
    pm2Id: integer("pm2_id").notNull(), // Numeric ID from PM2 (pm_id)
    name: text("name").notNull(),
    clientId: text("client_id"), // Nullable ULID "cli_"
    allowClientRestart: integer("allow_client_restart", { mode: "boolean" })
      .notNull()
      .default(false),
    restartCooldownSec: integer("restart_cooldown_sec").notNull().default(60),
    status: text("status", {
      enum: ["online", "stopping", "stopped", "launching", "errored", "one-launch-status"],
    })
      .notNull()
      .default("stopped"),
    cpu: integer("cpu").notNull().default(0), // CPU percentage or percent * 10
    memory: integer("memory").notNull().default(0), // Memory bytes
    restarts: integer("restarts").notNull().default(0),
    uptimeMs: integer("uptime_ms").default(0),
    lastDiscoveredAt: integer("last_discovered_at").notNull(), // epoch ms
    createdAt: integer("created_at").notNull(), // epoch ms
    updatedAt: integer("updated_at").notNull(), // epoch ms
  },
  (table) => [
    index("idx_pm2_processes_server").on(table.serverId),
    index("idx_pm2_processes_client").on(table.clientId),
    index("idx_pm2_processes_status").on(table.status),
    uniqueIndex("idx_pm2_processes_server_pm2id").on(table.serverId, table.pm2Id),
  ],
);

export const processActions = sqliteTable(
  "process_actions",
  {
    id: text("id").primaryKey(), // ULID prefixed "act_"
    processId: text("process_id").notNull(),
    clientId: text("client_id"), // Nullable, set when initiated by client
    action: text("action", { enum: ["restart", "reload", "logs", "stop"] }).notNull(),
    status: text("status", {
      enum: ["pending", "in_progress", "success", "failed"],
    })
      .notNull()
      .default("pending"),
    triggeredBy: text("triggered_by").notNull(), // Actor ID (adm_..., usr_..., or system)
    outputExcerpt: text("output_excerpt"),
    errorMessage: text("error_message"),
    createdAt: integer("created_at").notNull(), // epoch ms
  },
  (table) => [
    index("idx_process_actions_process").on(table.processId, table.createdAt),
    index("idx_process_actions_client").on(table.clientId, table.createdAt),
    index("idx_process_actions_created").on(table.createdAt),
  ],
);

export type ServerRow = typeof servers.$inferSelect;
export type NewServerRow = typeof servers.$inferInsert;

export type Pm2ProcessRow = typeof pm2Processes.$inferSelect;
export type NewPm2ProcessRow = typeof pm2Processes.$inferInsert;

export type ProcessActionRow = typeof processActions.$inferSelect;
export type NewProcessActionRow = typeof processActions.$inferInsert;

import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core";

export const serverMetrics = sqliteTable("server_metrics", {
  id: text("id").primaryKey(),
  serverId: text("server_id").notNull(),
  cpuPercent: integer("cpu_percent").notNull(),
  memoryUsedMb: integer("memory_used_mb").notNull(),
  timestamp: integer("timestamp").notNull(),
});

export const domainChecksTable = sqliteTable(
  "domain_checks",
  {
    id: text("id").primaryKey(),
    domainId: text("domain_id").notNull(),
    checkType: text("check_type", { enum: ["http", "ssl", "dns", "rdap"] }).notNull(),
    timestamp: integer("timestamp").notNull(),
    isSuccess: integer("is_success", { mode: "boolean" }).notNull(),
    latencyMs: integer("latency_ms"),
    statusCode: integer("status_code"),
    errorMessage: text("error_message"),
    detailsJson: text("details_json"),
  },
  (table) => [
    index("idx_domain_checks_domain_time").on(table.domainId, table.timestamp),
    index("idx_domain_checks_type_time").on(table.checkType, table.timestamp),
  ],
);

export const domainChecks = domainChecksTable;

export type DomainCheckRow = typeof domainChecksTable.$inferSelect;
export type NewDomainCheckRow = typeof domainChecksTable.$inferInsert;

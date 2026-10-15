import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core";
import type { CheckConfigurations } from "../../../../modules/monitoring/domain/value-objects/check-config.vo";

export const monitoredDomainsTable = sqliteTable(
  "monitored_domains",
  {
    id: text("id").primaryKey(), // dom_...
    clientId: text("client_id").notNull(),
    projectId: text("project_id"),
    name: text("name").notNull(),
    hostname: text("hostname").notNull(),
    targetUrl: text("target_url").notNull(),
    port: integer("port").notNull().default(443),
    config: text("config", { mode: "json" }).$type<CheckConfigurations>().notNull(),
    status: text("status", { enum: ["up", "degraded", "down", "paused", "pending"] })
      .notNull()
      .default("pending"),
    consecutiveFailures: integer("consecutive_failures").notNull().default(0),
    activeIncidentId: text("active_incident_id"),
    // Snapshot fields
    lastHttpCheckAt: integer("last_http_check_at"),
    lastHttpStatus: integer("last_http_status"),
    lastLatencyMs: integer("last_latency_ms"),
    lastHttpError: text("last_http_error"),
    lastSslCheckAt: integer("last_ssl_check_at"),
    sslStatus: text("ssl_status"),
    sslExpiresAt: integer("ssl_expires_at"),
    sslDaysRemaining: integer("ssl_days_remaining"),
    sslIssuer: text("ssl_issuer"),
    sslError: text("ssl_error"),
    lastDnsCheckAt: integer("last_dns_check_at"),
    dnsStatus: text("dns_status"),
    dnsDriftDetails: text("dns_drift_details"),
    lastRdapCheckAt: integer("last_rdap_check_at"),
    domainExpiresAt: integer("domain_expires_at"),
    domainRegistrar: text("domain_registrar"),
    resolvedIp: text("resolved_ip"),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (table) => [
    index("idx_monitored_domains_client").on(table.clientId),
    index("idx_monitored_domains_status").on(table.status),
    index("idx_monitored_domains_hostname").on(table.hostname),
    index("idx_monitored_domains_http_due").on(table.status, table.lastHttpCheckAt),
  ],
);

export const monitoredDomains = monitoredDomainsTable;

export const domainSnapshotsTable = sqliteTable(
  "domain_snapshots",
  {
    id: text("id").primaryKey(),
    domainId: text("domain_id").notNull(),
    sslIssuer: text("ssl_issuer"),
    sslValidTo: integer("ssl_valid_to"),
    sslSanJson: text("ssl_san_json"),
    sslStatus: text("ssl_status"),
    dnsRecordsJson: text("dns_records_json"),
    dnsStatus: text("dns_status"),
    rdapExpiresAt: integer("rdap_expires_at"),
    rdapRegistrar: text("rdap_registrar"),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (table) => [
    index("idx_domain_snapshots_domain").on(table.domainId),
  ],
);

export const domainSnapshots = domainSnapshotsTable;

export const incidentsTable = sqliteTable(
  "incidents",
  {
    id: text("id").primaryKey(), // inc_...
    domainId: text("domain_id").notNull(),
    clientId: text("client_id"),
    type: text("type"),
    status: text("status", { enum: ["open", "acknowledged", "resolved"] })
      .notNull()
      .default("open"),
    severity: text("severity", { enum: ["critical", "warning", "info"] }).default("critical"),
    title: text("title"),
    reason: text("reason"),
    failureCount: integer("failure_count").notNull().default(0),
    startedAt: integer("started_at"),
    openedAt: integer("opened_at"),
    resolvedAt: integer("resolved_at"),
    durationSeconds: integer("duration_seconds"),
    linkedTicketId: text("linked_ticket_id"),
    notifiedAt: integer("notified_at"),
    createdAt: integer("created_at"),
    updatedAt: integer("updated_at"),
  },
  (table) => [
    index("idx_incidents_domain_status").on(table.domainId, table.status),
    index("idx_incidents_client_status").on(table.clientId, table.status),
    index("idx_incidents_started").on(table.startedAt),
  ],
);

export const incidents = incidentsTable;

export const statusPagesTable = sqliteTable(
  "status_pages",
  {
    id: text("id").primaryKey(), // stp_...
    clientId: text("client_id").notNull(),
    slug: text("slug").notNull().unique(),
    title: text("title").notNull(),
    description: text("description"),
    isPublic: integer("is_public", { mode: "boolean" }).notNull().default(true),
    domainIdsJson: text("domain_ids_json"),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (table) => [
    index("idx_status_pages_client").on(table.clientId),
    index("idx_status_pages_slug").on(table.slug),
  ],
);

export const statusPages = statusPagesTable;

export type MonitoredDomainRow = typeof monitoredDomainsTable.$inferSelect;
export type NewMonitoredDomainRow = typeof monitoredDomainsTable.$inferInsert;

export type DomainSnapshotRow = typeof domainSnapshotsTable.$inferSelect;
export type NewDomainSnapshotRow = typeof domainSnapshotsTable.$inferInsert;

export type IncidentRow = typeof incidentsTable.$inferSelect;
export type NewIncidentRow = typeof incidentsTable.$inferInsert;

export type StatusPageRow = typeof statusPagesTable.$inferSelect;
export type NewStatusPageRow = typeof statusPagesTable.$inferInsert;

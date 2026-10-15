import { sqliteTable, text, integer, index, primaryKey } from "drizzle-orm/sqlite-core";

export const rawEventsTable = sqliteTable(
  "raw_events",
  {
    id: text("id").primaryKey(), // evt_...
    clientId: text("client_id").notNull(),
    eventType: text("event_type").notNull(), // pageview, event, vitals, error
    visitorHash: text("visitor_hash"),
    sessionId: text("session_id"),
    path: text("path"),
    referrer: text("referrer"),
    utmSource: text("utm_source"),
    utmMedium: text("utm_medium"),
    utmCampaign: text("utm_campaign"),
    browser: text("browser"),
    os: text("os"),
    device: text("device"),
    country: text("country"),
    metricName: text("metric_name"),
    metricValue: integer("metric_value"),
    metricRating: text("metric_rating"), // good, needs-improvement, poor
    payload: text("payload"),
    timestamp: integer("timestamp").notNull(),
    createdAt: integer("created_at").notNull(),
  },
  (table) => [
    index("idx_raw_events_client_time").on(table.clientId, table.timestamp),
    index("idx_raw_events_client_type").on(table.clientId, table.eventType),
    index("idx_raw_events_visitor").on(table.clientId, table.visitorHash),
  ],
);

export const rawEvents = rawEventsTable;

export const hourlyRollupsTable = sqliteTable(
  "hourly_rollups",
  {
    clientId: text("client_id").notNull(),
    eventName: text("event_name").notNull(),
    hourEpoch: integer("hour_epoch").notNull(), // epoch ms rounded to start of hour
    count: integer("count").notNull(),
    uniqueVisitors: integer("unique_visitors").notNull(),
    metadata: text("metadata"), // JSON string with top paths, referrers, vitals breakdown
  },
  (table) => [
    primaryKey({ columns: [table.clientId, table.eventName, table.hourEpoch] }),
    index("idx_hourly_rollups_client_time").on(table.clientId, table.hourEpoch),
  ],
);

export const hourlyRollups = hourlyRollupsTable;

export const dailyRollupsTable = sqliteTable(
  "daily_rollups",
  {
    clientId: text("client_id").notNull(),
    eventName: text("event_name").notNull(),
    dayEpoch: integer("day_epoch").notNull(), // epoch ms rounded to start of UTC day
    count: integer("count").notNull(),
    uniqueVisitors: integer("unique_visitors").notNull(),
    metadata: text("metadata"), // JSON string
  },
  (table) => [
    primaryKey({ columns: [table.clientId, table.eventName, table.dayEpoch] }),
    index("idx_daily_rollups_client_time").on(table.clientId, table.dayEpoch),
  ],
);

export const dailyRollups = dailyRollupsTable;

export const analyticsOffloadConfigsTable = sqliteTable(
  "analytics_offload_configs",
  {
    clientId: text("client_id").primaryKey(),
    endpointUrl: text("endpoint_url").notNull(),
    secret: text("secret").notNull(), // secret used for HMAC-SHA256 signature
    enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
    lastExportedAt: integer("last_exported_at"),
    lastExportStatus: text("last_export_status"), // success, failed: <err>
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
);

export const analyticsOffloadConfigs = analyticsOffloadConfigsTable;

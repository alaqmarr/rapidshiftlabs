import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core";

export const ticketsTable = sqliteTable(
  "tickets",
  {
    id: text("id").primaryKey(), // tkt_...
    number: text("number").notNull().unique(), // e.g. TKT-000101
    clientId: text("client_id").notNull(),
    projectId: text("project_id"),
    category: text("category", {
      enum: ["bug", "outage", "change-request", "billing", "access", "question"],
    })
      .notNull()
      .default("question"),
    subject: text("subject").notNull(),
    priority: text("priority", { enum: ["P1", "P2", "P3", "P4"] })
      .notNull()
      .default("P3"),
    level: text("level", { enum: ["L1", "L2", "L3"] })
      .notNull()
      .default("L1"),
    status: text("status", {
      enum: [
        "open",
        "in_progress",
        "waiting_on_client",
        "resolved",
        "closed",
        "escalated",
      ],
    })
      .notNull()
      .default("open"),
    assigneeId: text("assignee_id"),
    assigneeName: text("assignee_name"),
    source: text("source", {
      enum: ["portal", "admin", "system", "email", "api"],
    })
      .notNull()
      .default("portal"),
    firstResponseDueAt: integer("first_response_due_at").notNull(),
    firstRespondedAt: integer("first_responded_at"),
    resolutionDueAt: integer("resolution_due_at").notNull(),
    resolvedAt: integer("resolved_at"),
    closedAt: integer("closed_at"),
    slaPausedAt: integer("sla_paused_at"),
    totalPausedMs: integer("total_paused_ms").notNull().default(0),
    slaBreached: integer("sla_breached", { mode: "boolean" }).notNull().default(false),
    linkedIncidentId: text("linked_incident_id"),
    linkedProcessId: text("linked_process_id"),
    csatRating: integer("csat_rating"), // 1 to 5
    csatFeedback: text("csat_feedback"),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (table) => [
    index("idx_tickets_client").on(table.clientId),
    index("idx_tickets_status").on(table.status),
    index("idx_tickets_priority").on(table.priority),
    index("idx_tickets_level").on(table.level),
    index("idx_tickets_first_response_due").on(table.firstResponseDueAt),
    index("idx_tickets_resolution_due").on(table.resolutionDueAt),
    index("idx_tickets_linked_incident").on(table.linkedIncidentId),
  ],
);

export const tickets = ticketsTable;

export const ticketMessagesTable = sqliteTable(
  "ticket_messages",
  {
    id: text("id").primaryKey(), // tkm_...
    ticketId: text("ticket_id").notNull(),
    authorId: text("author_id").notNull(),
    authorType: text("author_type", { enum: ["admin", "client", "system"] }).notNull(),
    authorName: text("author_name").notNull(),
    body: text("body").notNull(),
    isInternal: integer("is_internal", { mode: "boolean" }).notNull().default(false),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (table) => [
    index("idx_ticket_messages_ticket").on(table.ticketId),
    index("idx_ticket_messages_created").on(table.createdAt),
  ],
);

export const ticketMessages = ticketMessagesTable;

export const ticketAttachmentsTable = sqliteTable(
  "ticket_attachments",
  {
    id: text("id").primaryKey(), // att_...
    ticketId: text("ticket_id").notNull(),
    messageId: text("message_id"),
    filename: text("filename").notNull(),
    mimeType: text("mime_type").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    storagePath: text("storage_path").notNull(),
    uploadedBy: text("uploaded_by").notNull(),
    createdAt: integer("created_at").notNull(),
  },
  (table) => [
    index("idx_ticket_attachments_ticket").on(table.ticketId),
    index("idx_ticket_attachments_message").on(table.messageId),
  ],
);

export const ticketAttachments = ticketAttachmentsTable;

export const cannedRepliesTable = sqliteTable(
  "canned_replies",
  {
    id: text("id").primaryKey(), // cnr_...
    title: text("title").notNull(),
    category: text("category").notNull(),
    content: text("content").notNull(),
    shortcut: text("shortcut").notNull().unique(), // e.g. "!billing", "!access"
    createdAt: integer("created_at").notNull(),
  },
  (table) => [
    index("idx_canned_replies_category").on(table.category),
    index("idx_canned_replies_shortcut").on(table.shortcut),
  ],
);

export const cannedReplies = cannedRepliesTable;

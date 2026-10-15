if (!process.env.MASTER_KEY) {
  process.env.MASTER_KEY = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
}
if (!process.env.AUTH_SECRET) {
  process.env.AUTH_SECRET = "development-auth-secret-123456789";
}

import { getTableColumns, getTableName } from "drizzle-orm";
import { getRawClient, ensurePragmas } from "../shared/infrastructure/db/connection-factory";
import * as coreSchema from "../shared/infrastructure/db/schema/core";
import * as analyticsSchema from "../shared/infrastructure/db/schema/analytics";
import * as metricsSchema from "../shared/infrastructure/db/schema/metrics";

const STATEMENTS = [
  // 0. Base Core Tables
  `CREATE TABLE IF NOT EXISTS settings (
    key text PRIMARY KEY NOT NULL,
    value text NOT NULL,
    encrypted integer DEFAULT 0 NOT NULL,
    updated_by text,
    created_at integer NOT NULL,
    updated_at integer NOT NULL
  );`,

  `CREATE TABLE IF NOT EXISTS admin_users (
    id text PRIMARY KEY NOT NULL,
    email text NOT NULL UNIQUE,
    name text NOT NULL,
    role text DEFAULT 'support' NOT NULL,
    support_level integer,
    password_hash text NOT NULL,
    totp_secret_enc text,
    totp_enabled integer DEFAULT 0 NOT NULL,
    status text DEFAULT 'active' NOT NULL,
    session_version integer DEFAULT 1 NOT NULL,
    last_login_at integer,
    created_at integer NOT NULL,
    updated_at integer NOT NULL
  );`,

  `CREATE TABLE IF NOT EXISTS client_users (
    id text PRIMARY KEY NOT NULL,
    client_id text NOT NULL,
    email text NOT NULL UNIQUE,
    name text NOT NULL,
    role text DEFAULT 'client_member' NOT NULL,
    password_hash text NOT NULL,
    session_version integer DEFAULT 1 NOT NULL,
    status text DEFAULT 'active' NOT NULL,
    invited_at integer,
    last_login_at integer,
    created_at integer NOT NULL,
    updated_at integer NOT NULL
  );`,

  `CREATE TABLE IF NOT EXISTS sessions (
    id text PRIMARY KEY NOT NULL,
    session_token text NOT NULL UNIQUE,
    user_id text NOT NULL,
    realm text NOT NULL,
    client_id text,
    session_version integer DEFAULT 1 NOT NULL,
    ip_address text,
    user_agent text,
    expires_at integer NOT NULL,
    created_at integer NOT NULL,
    last_active_at integer NOT NULL
  );`,

  `CREATE TABLE IF NOT EXISTS outbox (
    id text PRIMARY KEY NOT NULL,
    type text NOT NULL,
    aggregate_type text NOT NULL,
    aggregate_id text NOT NULL,
    client_id text,
    payload text NOT NULL,
    occurred_at integer NOT NULL,
    status text DEFAULT 'pending' NOT NULL,
    attempts integer DEFAULT 0 NOT NULL,
    max_attempts integer DEFAULT 5 NOT NULL,
    next_retry_at integer,
    locked_at integer,
    locked_by text,
    processed_at integer,
    last_error text,
    created_at integer NOT NULL,
    updated_at integer NOT NULL
  );`,
  `CREATE INDEX IF NOT EXISTS idx_outbox_poll ON outbox (status, next_retry_at, occurred_at);`,
  `CREATE INDEX IF NOT EXISTS idx_outbox_aggregate ON outbox (aggregate_type, aggregate_id);`,
  `CREATE INDEX IF NOT EXISTS idx_outbox_client ON outbox (client_id, occurred_at);`,

  `CREATE TABLE IF NOT EXISTS audit_log (
    id text PRIMARY KEY NOT NULL,
    actor_id text NOT NULL,
    actor_type text DEFAULT 'system' NOT NULL,
    actor_email text,
    client_id text,
    action text NOT NULL,
    entity_type text NOT NULL,
    entity_id text NOT NULL,
    ip_address text,
    user_agent text,
    details text,
    timestamp integer NOT NULL
  );`,
  `CREATE INDEX IF NOT EXISTS idx_audit_client_time ON audit_log (client_id, timestamp);`,
  `CREATE INDEX IF NOT EXISTS idx_audit_actor_time ON audit_log (actor_id, timestamp);`,
  `CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_log (entity_type, entity_id);`,
  `CREATE INDEX IF NOT EXISTS idx_audit_timestamp ON audit_log (timestamp);`,

  // 1. clients
  `CREATE TABLE IF NOT EXISTS clients (
    id text PRIMARY KEY NOT NULL,
    name text NOT NULL,
    slug text NOT NULL UNIQUE,
    gstin text,
    pan text,
    billing_mode text DEFAULT 'non_gst' NOT NULL,
    currency text DEFAULT 'INR' NOT NULL,
    timezone text DEFAULT 'Asia/Kolkata' NOT NULL,
    status text DEFAULT 'active' NOT NULL,
    address_line1 text,
    address_line2 text,
    city text,
    state text,
    postal_code text,
    country text DEFAULT 'India' NOT NULL,
    notes text,
    github_repo text,
    github_branch text DEFAULT 'main',
    created_at integer NOT NULL,
    updated_at integer NOT NULL
  );`,
  `CREATE INDEX IF NOT EXISTS idx_clients_slug ON clients (slug);`,
  `CREATE INDEX IF NOT EXISTS idx_clients_status ON clients (status);`,

  // 2. client_contacts
  `CREATE TABLE IF NOT EXISTS client_contacts (
    id text PRIMARY KEY NOT NULL,
    client_id text NOT NULL,
    name text NOT NULL,
    email text NOT NULL,
    phone text,
    title text,
    is_primary integer DEFAULT 0 NOT NULL,
    created_at integer NOT NULL,
    updated_at integer NOT NULL
  );`,
  `CREATE INDEX IF NOT EXISTS idx_client_contacts_client ON client_contacts (client_id);`,
  `CREATE INDEX IF NOT EXISTS idx_client_contacts_email ON client_contacts (email);`,

  // 3. projects
  `CREATE TABLE IF NOT EXISTS projects (
    id text PRIMARY KEY NOT NULL,
    client_id text NOT NULL,
    name text NOT NULL,
    slug text NOT NULL,
    description text,
    status text DEFAULT 'active' NOT NULL,
    github_repo text,
    github_branch text DEFAULT 'main',
    created_at integer NOT NULL,
    updated_at integer NOT NULL
  );`,
  `CREATE INDEX IF NOT EXISTS idx_projects_client ON projects (client_id);`,
  `CREATE INDEX IF NOT EXISTS idx_projects_slug ON projects (client_id, slug);`,

  // 4. contracts
  `CREATE TABLE IF NOT EXISTS contracts (
    id text PRIMARY KEY NOT NULL,
    client_id text NOT NULL,
    code text NOT NULL UNIQUE,
    title text NOT NULL,
    status text DEFAULT 'draft' NOT NULL,
    amount_minor integer DEFAULT 0 NOT NULL,
    currency text DEFAULT 'INR' NOT NULL,
    billing_cycle text DEFAULT 'monthly' NOT NULL,
    interval_count integer DEFAULT 1 NOT NULL,
    anchor_day integer DEFAULT 1 NOT NULL,
    valid_from integer NOT NULL,
    valid_to integer NOT NULL,
    auto_renew integer DEFAULT 0 NOT NULL,
    grace_days integer DEFAULT 7 NOT NULL,
    payment_terms_days integer DEFAULT 15 NOT NULL,
    tax_profile text DEFAULT 'non_gst' NOT NULL,
    gst_rate_bps integer DEFAULT 1800 NOT NULL,
    notes text,
    created_at integer NOT NULL,
    updated_at integer NOT NULL
  );`,
  `CREATE INDEX IF NOT EXISTS idx_contracts_client ON contracts (client_id);`,
  `CREATE INDEX IF NOT EXISTS idx_contracts_status ON contracts (status);`,
  `CREATE INDEX IF NOT EXISTS idx_contracts_code ON contracts (code);`,

  // 5. contract_items
  `CREATE TABLE IF NOT EXISTS contract_items (
    id text PRIMARY KEY NOT NULL,
    contract_id text NOT NULL,
    description text NOT NULL,
    amount_minor integer DEFAULT 0 NOT NULL,
    quantity integer DEFAULT 1 NOT NULL,
    created_at integer NOT NULL,
    updated_at integer NOT NULL
  );`,
  `CREATE INDEX IF NOT EXISTS idx_contract_items_contract ON contract_items (contract_id);`,

  // 6. billing_periods
  `CREATE TABLE IF NOT EXISTS billing_periods (
    id text PRIMARY KEY NOT NULL,
    contract_id text NOT NULL,
    client_id text NOT NULL,
    period_number integer NOT NULL,
    period_start integer NOT NULL,
    period_end integer NOT NULL,
    due_date integer NOT NULL,
    amount_minor integer NOT NULL,
    currency text DEFAULT 'INR' NOT NULL,
    status text DEFAULT 'pending' NOT NULL,
    invoice_id text,
    created_at integer NOT NULL,
    updated_at integer NOT NULL
  );`,
  `CREATE INDEX IF NOT EXISTS idx_billing_periods_contract ON billing_periods (contract_id);`,
  `CREATE INDEX IF NOT EXISTS idx_billing_periods_client ON billing_periods (client_id);`,
  `CREATE INDEX IF NOT EXISTS idx_billing_periods_status ON billing_periods (status);`,
  `CREATE INDEX IF NOT EXISTS idx_billing_periods_due ON billing_periods (due_date);`,

  // 7. invoices
  `CREATE TABLE IF NOT EXISTS invoices (
    id text PRIMARY KEY NOT NULL,
    invoice_number text NOT NULL UNIQUE,
    billing_mode text DEFAULT 'non_gst' NOT NULL,
    client_id text NOT NULL,
    contract_id text,
    billing_period_id text,
    status text DEFAULT 'draft' NOT NULL,
    issue_date integer NOT NULL,
    due_date integer NOT NULL,
    currency text DEFAULT 'INR' NOT NULL,
    subtotal_minor integer DEFAULT 0 NOT NULL,
    cgst_rate_bps integer DEFAULT 0 NOT NULL,
    cgst_minor integer DEFAULT 0 NOT NULL,
    sgst_rate_bps integer DEFAULT 0 NOT NULL,
    sgst_minor integer DEFAULT 0 NOT NULL,
    igst_rate_bps integer DEFAULT 0 NOT NULL,
    igst_minor integer DEFAULT 0 NOT NULL,
    total_minor integer DEFAULT 0 NOT NULL,
    paid_minor integer DEFAULT 0 NOT NULL,
    balance_minor integer DEFAULT 0 NOT NULL,
    notes text,
    pdf_path text,
    issued_at integer,
    voided_at integer,
    created_at integer NOT NULL,
    updated_at integer NOT NULL
  );`,
  `CREATE INDEX IF NOT EXISTS idx_invoices_client ON invoices (client_id);`,
  `CREATE INDEX IF NOT EXISTS idx_invoices_contract ON invoices (contract_id);`,
  `CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoices (status);`,
  `CREATE INDEX IF NOT EXISTS idx_invoices_due ON invoices (due_date);`,
  `CREATE INDEX IF NOT EXISTS idx_invoices_number ON invoices (invoice_number);`,

  // 8. invoice_lines
  `CREATE TABLE IF NOT EXISTS invoice_lines (
    id text PRIMARY KEY NOT NULL,
    invoice_id text NOT NULL,
    description text NOT NULL,
    sac_code text DEFAULT '998311' NOT NULL,
    quantity integer DEFAULT 1 NOT NULL,
    unit_price_minor integer DEFAULT 0 NOT NULL,
    amount_minor integer DEFAULT 0 NOT NULL,
    created_at integer NOT NULL,
    updated_at integer NOT NULL
  );`,
  `CREATE INDEX IF NOT EXISTS idx_invoice_lines_invoice ON invoice_lines (invoice_id);`,

  // 9. payments
  `CREATE TABLE IF NOT EXISTS payments (
    id text PRIMARY KEY NOT NULL,
    invoice_id text NOT NULL,
    client_id text NOT NULL,
    amount_minor integer NOT NULL,
    currency text DEFAULT 'INR' NOT NULL,
    payment_date integer NOT NULL,
    method text DEFAULT 'upi' NOT NULL,
    reference text,
    notes text,
    recorded_by text,
    created_at integer NOT NULL
  );`,
  `CREATE INDEX IF NOT EXISTS idx_payments_invoice ON payments (invoice_id);`,
  `CREATE INDEX IF NOT EXISTS idx_payments_client ON payments (client_id);`,

  // 10. credit_notes
  `CREATE TABLE IF NOT EXISTS credit_notes (
    id text PRIMARY KEY NOT NULL,
    credit_note_number text NOT NULL UNIQUE,
    invoice_id text NOT NULL,
    client_id text NOT NULL,
    amount_minor integer NOT NULL,
    reason text NOT NULL,
    status text DEFAULT 'issued' NOT NULL,
    issued_at integer NOT NULL,
    created_at integer NOT NULL
  );`,
  `CREATE INDEX IF NOT EXISTS idx_credit_notes_invoice ON credit_notes (invoice_id);`,
  `CREATE INDEX IF NOT EXISTS idx_credit_notes_client ON credit_notes (client_id);`,

  // 11. monitored_domains
  `CREATE TABLE IF NOT EXISTS monitored_domains (
    id text PRIMARY KEY NOT NULL,
    client_id text NOT NULL,
    project_id text,
    name text NOT NULL,
    hostname text NOT NULL,
    target_url text NOT NULL,
    port integer DEFAULT 443 NOT NULL,
    config text NOT NULL,
    status text DEFAULT 'pending' NOT NULL,
    consecutive_failures integer DEFAULT 0 NOT NULL,
    active_incident_id text,
    last_http_check_at integer,
    last_http_status integer,
    last_latency_ms integer,
    last_http_error text,
    last_ssl_check_at integer,
    ssl_status text,
    ssl_expires_at integer,
    ssl_days_remaining integer,
    ssl_issuer text,
    ssl_error text,
    last_dns_check_at integer,
    dns_status text,
    dns_drift_details text,
    last_rdap_check_at integer,
    domain_expires_at integer,
    domain_registrar text,
    resolved_ip text,
    created_at integer NOT NULL,
    updated_at integer NOT NULL
  );`,
  `CREATE INDEX IF NOT EXISTS idx_monitored_domains_client ON monitored_domains (client_id);`,
  `CREATE INDEX IF NOT EXISTS idx_monitored_domains_status ON monitored_domains (status);`,
  `CREATE INDEX IF NOT EXISTS idx_monitored_domains_hostname ON monitored_domains (hostname);`,
  `CREATE INDEX IF NOT EXISTS idx_monitored_domains_http_due ON monitored_domains (status, last_http_check_at);`,

  // 12. domain_snapshots
  `CREATE TABLE IF NOT EXISTS domain_snapshots (
    id text PRIMARY KEY NOT NULL,
    domain_id text NOT NULL,
    ssl_issuer text,
    ssl_valid_to integer,
    ssl_san_json text,
    ssl_status text,
    dns_records_json text,
    dns_status text,
    rdap_expires_at integer,
    rdap_registrar text,
    created_at integer NOT NULL,
    updated_at integer NOT NULL
  );`,
  `CREATE INDEX IF NOT EXISTS idx_domain_snapshots_domain ON domain_snapshots (domain_id);`,

  // 13. incidents
  `CREATE TABLE IF NOT EXISTS incidents (
    id text PRIMARY KEY NOT NULL,
    domain_id text NOT NULL,
    client_id text,
    type text,
    status text DEFAULT 'open' NOT NULL,
    severity text DEFAULT 'critical',
    title text,
    reason text,
    failure_count integer DEFAULT 0 NOT NULL,
    started_at integer,
    opened_at integer,
    resolved_at integer,
    duration_seconds integer,
    linked_ticket_id text,
    notified_at integer,
    created_at integer,
    updated_at integer
  );`,
  `CREATE INDEX IF NOT EXISTS idx_incidents_domain_status ON incidents (domain_id, status);`,
  `CREATE INDEX IF NOT EXISTS idx_incidents_client_status ON incidents (client_id, status);`,
  `CREATE INDEX IF NOT EXISTS idx_incidents_started ON incidents (started_at);`,

  // 14. status_pages
  `CREATE TABLE IF NOT EXISTS status_pages (
    id text PRIMARY KEY NOT NULL,
    client_id text NOT NULL,
    slug text NOT NULL UNIQUE,
    title text NOT NULL,
    description text,
    is_public integer DEFAULT 1 NOT NULL,
    domain_ids_json text,
    created_at integer NOT NULL,
    updated_at integer NOT NULL
  );`,
  `CREATE INDEX IF NOT EXISTS idx_status_pages_client ON status_pages (client_id);`,
  `CREATE INDEX IF NOT EXISTS idx_status_pages_slug ON status_pages (slug);`,

  // 15. tickets
  `CREATE TABLE IF NOT EXISTS tickets (
    id text PRIMARY KEY NOT NULL,
    number text NOT NULL UNIQUE,
    client_id text NOT NULL,
    project_id text,
    category text NOT NULL DEFAULT 'question',
    subject text NOT NULL,
    priority text NOT NULL DEFAULT 'P3',
    level text NOT NULL DEFAULT 'L1',
    status text NOT NULL DEFAULT 'open',
    assignee_id text,
    assignee_name text,
    source text NOT NULL DEFAULT 'portal',
    first_response_due_at integer NOT NULL,
    first_responded_at integer,
    resolution_due_at integer NOT NULL,
    resolved_at integer,
    closed_at integer,
    sla_paused_at integer,
    total_paused_ms integer NOT NULL DEFAULT 0,
    sla_breached integer NOT NULL DEFAULT 0,
    linked_incident_id text,
    linked_process_id text,
    csat_rating integer,
    csat_feedback text,
    created_at integer NOT NULL,
    updated_at integer NOT NULL
  );`,
  `CREATE INDEX IF NOT EXISTS idx_tickets_client ON tickets (client_id);`,
  `CREATE INDEX IF NOT EXISTS idx_tickets_status ON tickets (status);`,
  `CREATE INDEX IF NOT EXISTS idx_tickets_priority ON tickets (priority);`,
  `CREATE INDEX IF NOT EXISTS idx_tickets_level ON tickets (level);`,
  `CREATE INDEX IF NOT EXISTS idx_tickets_first_response_due ON tickets (first_response_due_at);`,
  `CREATE INDEX IF NOT EXISTS idx_tickets_resolution_due ON tickets (resolution_due_at);`,
  `CREATE INDEX IF NOT EXISTS idx_tickets_linked_incident ON tickets (linked_incident_id);`,

  // 16. ticket_messages
  `CREATE TABLE IF NOT EXISTS ticket_messages (
    id text PRIMARY KEY NOT NULL,
    ticket_id text NOT NULL,
    author_id text NOT NULL,
    author_type text NOT NULL,
    author_name text NOT NULL,
    body text NOT NULL,
    is_internal integer NOT NULL DEFAULT 0,
    created_at integer NOT NULL,
    updated_at integer NOT NULL
  );`,
  `CREATE INDEX IF NOT EXISTS idx_ticket_messages_ticket ON ticket_messages (ticket_id);`,
  `CREATE INDEX IF NOT EXISTS idx_ticket_messages_created ON ticket_messages (created_at);`,

  // 17. ticket_attachments
  `CREATE TABLE IF NOT EXISTS ticket_attachments (
    id text PRIMARY KEY NOT NULL,
    ticket_id text NOT NULL,
    message_id text,
    filename text NOT NULL,
    mime_type text NOT NULL,
    size_bytes integer NOT NULL,
    storage_path text NOT NULL,
    uploaded_by text NOT NULL,
    created_at integer NOT NULL
  );`,
  `CREATE INDEX IF NOT EXISTS idx_ticket_attachments_ticket ON ticket_attachments (ticket_id);`,

  // 18. canned_replies
  `CREATE TABLE IF NOT EXISTS canned_replies (
    id text PRIMARY KEY NOT NULL,
    title text NOT NULL,
    category text NOT NULL,
    content text NOT NULL,
    shortcut text NOT NULL UNIQUE,
    created_at integer NOT NULL
  );`,
  `CREATE INDEX IF NOT EXISTS idx_canned_replies_shortcut ON canned_replies (shortcut);`,

  // 19. vault_credentials
  `CREATE TABLE IF NOT EXISTS vault_credentials (
    id text PRIMARY KEY NOT NULL,
    client_id text NOT NULL,
    project_id text,
    name text NOT NULL,
    category text NOT NULL DEFAULT 'other',
    username text,
    encrypted_value text NOT NULL,
    metadata text,
    expires_at integer,
    one_time_reveal integer NOT NULL DEFAULT 0,
    revealed_count integer NOT NULL DEFAULT 0,
    last_revealed_at integer,
    created_at integer NOT NULL,
    updated_at integer NOT NULL
  );`,
  `CREATE INDEX IF NOT EXISTS idx_vault_credentials_client ON vault_credentials (client_id);`,

  // 20. release_links
  `CREATE TABLE IF NOT EXISTS release_links (
    id text PRIMARY KEY NOT NULL,
    client_id text NOT NULL,
    project_id text,
    name text NOT NULL,
    version text NOT NULL,
    environment text NOT NULL DEFAULT 'beta',
    url text NOT NULL,
    status text NOT NULL DEFAULT 'active',
    release_notes text,
    password text,
    expires_at integer,
    created_at integer NOT NULL,
    updated_at integer NOT NULL
  );`,
  `CREATE INDEX IF NOT EXISTS idx_release_links_client ON release_links (client_id);`,

  // 20b. project_changelogs
  `CREATE TABLE IF NOT EXISTS project_changelogs (
    id text PRIMARY KEY NOT NULL,
    client_id text NOT NULL,
    project_id text,
    repo text NOT NULL,
    commit_sha text NOT NULL,
    short_sha text NOT NULL,
    message text NOT NULL,
    title text NOT NULL,
    description text,
    type text DEFAULT 'feature' NOT NULL,
    author_name text NOT NULL,
    author_avatar_url text,
    commit_url text,
    version_tag text,
    committed_at integer NOT NULL,
    created_at integer NOT NULL
  );`,
  `CREATE INDEX IF NOT EXISTS idx_project_changelogs_client ON project_changelogs (client_id);`,
  `CREATE INDEX IF NOT EXISTS idx_project_changelogs_type ON project_changelogs (type);`,
  `CREATE INDEX IF NOT EXISTS idx_project_changelogs_committed ON project_changelogs (committed_at);`,

  // 21. embed_tokens
  `CREATE TABLE IF NOT EXISTS embed_tokens (
    id text PRIMARY KEY NOT NULL,
    client_id text NOT NULL,
    scopes text NOT NULL,
    allowed_origins text,
    expires_at integer NOT NULL,
    created_at integer NOT NULL
  );`,
  `CREATE INDEX IF NOT EXISTS idx_embed_tokens_client ON embed_tokens (client_id);`,
  `CREATE INDEX IF NOT EXISTS idx_embed_tokens_expires ON embed_tokens (expires_at);`,

  // 22. servers
  `CREATE TABLE IF NOT EXISTS servers (
    id text PRIMARY KEY NOT NULL,
    name text NOT NULL,
    host text NOT NULL,
    port integer DEFAULT 22 NOT NULL,
    username text DEFAULT 'ubuntu' NOT NULL,
    encrypted_private_key text NOT NULL,
    key_passphrase_enc text,
    host_fingerprint text,
    status text DEFAULT 'pending' NOT NULL,
    last_checked_at integer,
    error_message text,
    created_at integer NOT NULL,
    updated_at integer NOT NULL
  );`,
  `CREATE INDEX IF NOT EXISTS idx_servers_status ON servers (status);`,
  `CREATE INDEX IF NOT EXISTS idx_servers_host ON servers (host);`,

  // 23. pm2_processes
  `CREATE TABLE IF NOT EXISTS pm2_processes (
    id text PRIMARY KEY NOT NULL,
    server_id text NOT NULL,
    pm2_id integer NOT NULL,
    name text NOT NULL,
    client_id text,
    allow_client_restart integer DEFAULT 0 NOT NULL,
    restart_cooldown_sec integer DEFAULT 60 NOT NULL,
    status text DEFAULT 'stopped' NOT NULL,
    cpu integer DEFAULT 0 NOT NULL,
    memory integer DEFAULT 0 NOT NULL,
    restarts integer DEFAULT 0 NOT NULL,
    uptime_ms integer DEFAULT 0,
    last_discovered_at integer NOT NULL,
    created_at integer NOT NULL,
    updated_at integer NOT NULL
  );`,
  `CREATE INDEX IF NOT EXISTS idx_pm2_processes_server ON pm2_processes (server_id);`,
  `CREATE INDEX IF NOT EXISTS idx_pm2_processes_client ON pm2_processes (client_id);`,
  `CREATE INDEX IF NOT EXISTS idx_pm2_processes_status ON pm2_processes (status);`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_pm2_processes_server_pm2id ON pm2_processes (server_id, pm2_id);`,

  // 24. process_actions
  `CREATE TABLE IF NOT EXISTS process_actions (
    id text PRIMARY KEY NOT NULL,
    process_id text NOT NULL,
    client_id text,
    action text NOT NULL,
    status text DEFAULT 'pending' NOT NULL,
    triggered_by text NOT NULL,
    output_excerpt text,
    error_message text,
    created_at integer NOT NULL
  );`,
  `CREATE INDEX IF NOT EXISTS idx_process_actions_process ON process_actions (process_id, created_at);`,
  `CREATE INDEX IF NOT EXISTS idx_process_actions_client ON process_actions (client_id, created_at);`,
  `CREATE INDEX IF NOT EXISTS idx_process_actions_created ON process_actions (created_at);`,

  // 25. entitlements
  `CREATE TABLE IF NOT EXISTS entitlements (
    id text PRIMARY KEY NOT NULL,
    client_id text NOT NULL UNIQUE,
    status text DEFAULT 'Active' NOT NULL,
    is_blocked integer DEFAULT 0 NOT NULL,
    reason text,
    override_mode text,
    override_valid_until integer,
    override_note text,
    override_set_by text,
    override_created_at integer,
    last_evaluated_at integer DEFAULT 0 NOT NULL,
    created_at integer NOT NULL,
    updated_at integer NOT NULL
  );`,
  `CREATE INDEX IF NOT EXISTS idx_entitlements_client_id ON entitlements (client_id);`,
  `CREATE INDEX IF NOT EXISTS idx_entitlements_status ON entitlements (status);`,
  `CREATE INDEX IF NOT EXISTS idx_entitlements_is_blocked ON entitlements (is_blocked);`,

  // 26. api_keys
  `CREATE TABLE IF NOT EXISTS api_keys (
    id text PRIMARY KEY NOT NULL,
    client_id text NOT NULL,
    name text NOT NULL,
    key_prefix text NOT NULL,
    key_hash text NOT NULL,
    type text DEFAULT 'secret' NOT NULL,
    scopes text DEFAULT '[]' NOT NULL,
    expires_at integer,
    last_used_at integer,
    revoked_at integer,
    created_at integer NOT NULL,
    updated_at integer NOT NULL
  );`,
  `CREATE INDEX IF NOT EXISTS idx_api_keys_key_prefix ON api_keys (key_prefix);`,
  `CREATE INDEX IF NOT EXISTS idx_api_keys_client_id ON api_keys (client_id);`,
  `CREATE INDEX IF NOT EXISTS idx_api_keys_key_hash ON api_keys (key_hash);`,
];

export const ANALYTICS_STATEMENTS: string[] = [
  `CREATE TABLE IF NOT EXISTS raw_events (
    id text PRIMARY KEY NOT NULL,
    client_id text NOT NULL,
    event_type text NOT NULL,
    visitor_hash text,
    session_id text,
    path text,
    referrer text,
    utm_source text,
    utm_medium text,
    utm_campaign text,
    browser text,
    os text,
    device text,
    country text,
    metric_name text,
    metric_value integer,
    metric_rating text,
    payload text,
    timestamp integer NOT NULL,
    created_at integer NOT NULL
  );`,
  `CREATE INDEX IF NOT EXISTS idx_raw_events_client_time ON raw_events (client_id, timestamp);`,
  `CREATE INDEX IF NOT EXISTS idx_raw_events_client_type ON raw_events (client_id, event_type);`,
  `CREATE TABLE IF NOT EXISTS hourly_rollups (
    client_id text NOT NULL,
    event_name text NOT NULL,
    hour_epoch integer NOT NULL,
    count integer NOT NULL,
    unique_visitors integer NOT NULL,
    metadata text,
    PRIMARY KEY (client_id, event_name, hour_epoch)
  );`,
  `CREATE INDEX IF NOT EXISTS idx_hourly_rollups_client_time ON hourly_rollups (client_id, hour_epoch);`,
  `CREATE TABLE IF NOT EXISTS daily_rollups (
    client_id text NOT NULL,
    event_name text NOT NULL,
    day_epoch integer NOT NULL,
    count integer NOT NULL,
    unique_visitors integer NOT NULL,
    metadata text,
    PRIMARY KEY (client_id, event_name, day_epoch)
  );`,
  `CREATE INDEX IF NOT EXISTS idx_daily_rollups_client_time ON daily_rollups (client_id, day_epoch);`,
  `CREATE TABLE IF NOT EXISTS analytics_offload_configs (
    client_id text PRIMARY KEY NOT NULL,
    endpoint_url text NOT NULL,
    secret text NOT NULL,
    enabled integer NOT NULL DEFAULT 1,
    last_exported_at integer,
    last_export_status text,
    created_at integer NOT NULL,
    updated_at integer NOT NULL
  );`,
];

/**
 * Automatically inspects all Drizzle table definitions in a schema module and
 * adds any missing columns to existing SQLite tables before indexes are created.
 */
async function syncDrizzleColumns(
  client: ReturnType<typeof getRawClient>,
  schemaMod: Record<string, any>
): Promise<void> {
  const seenTables = new Set<string>();

  for (const [, exportedVal] of Object.entries(schemaMod)) {
    if (!exportedVal || typeof exportedVal !== "object") continue;

    let tableName: string;
    try {
      tableName = getTableName(exportedVal as any);
    } catch {
      continue;
    }
    if (!tableName || seenTables.has(tableName)) continue;
    seenTables.add(tableName);

    try {
      const pragma = await client.execute(`PRAGMA table_info(${tableName})`);
      if (pragma.rows.length === 0) continue; // Table does not exist yet

      const existingCols = new Set(pragma.rows.map((r: any) => String(r.name || r[1])));
      const drizzleCols = getTableColumns(exportedVal as any);

      for (const [, colDef] of Object.entries(drizzleCols) as [string, any][]) {
        const sqlColName: string = colDef.name;
        if (!sqlColName || existingCols.has(sqlColName)) continue;

        const dataType = String(colDef.dataType || colDef.columnType || "string").toLowerCase();
        const sqlType =
          dataType.includes("number") || dataType.includes("int") || dataType.includes("boolean")
            ? "integer"
            : "text";

        let defaultClause = "";
        if (colDef.hasDefault && colDef.default !== undefined && colDef.default !== null) {
          if (typeof colDef.default === "boolean") {
            defaultClause = ` DEFAULT ${colDef.default ? 1 : 0}`;
          } else if (typeof colDef.default === "number") {
            defaultClause = ` DEFAULT ${colDef.default}`;
          } else if (typeof colDef.default === "string") {
            defaultClause = ` DEFAULT '${colDef.default.replace(/'/g, "''")}'`;
          }
        } else if (colDef.notNull) {
          defaultClause = sqlType === "integer" ? " DEFAULT 0" : " DEFAULT ''";
        }

        const notNullClause = colDef.notNull ? " NOT NULL" : "";
        const alterSql = `ALTER TABLE ${tableName} ADD COLUMN ${sqlColName} ${sqlType}${defaultClause}${notNullClause}`;
        await client.execute(alterSql);
        console.log(`[Migration] Auto-healed missing column: ${tableName}.${sqlColName}`);
      }
    } catch (err) {
      console.warn(`[Migration] Warning while syncing table ${tableName}:`, err);
    }
  }
}

/**
 * Repairs legacy outbox and audit_log tables that had old NOT NULL columns
 * (such as audit_log.actor_kind / resource_type or outbox.retry_count).
 */
async function repairLegacyCoreTables(client: ReturnType<typeof getRawClient>): Promise<void> {
  try {
    const auditInfo = await client.execute("PRAGMA table_info(audit_log)");
    if (auditInfo.rows.length > 0) {
      const cols = new Set(auditInfo.rows.map((r: any) => String(r.name || r[1])));
      if (cols.has("actor_kind") || !cols.has("actor_type") || !cols.has("entity_type")) {
        console.log("[Migration] Rebuilding legacy audit_log table to match current schema...");
        await client.execute(`CREATE TABLE IF NOT EXISTS audit_log_new (
          id text PRIMARY KEY NOT NULL,
          actor_id text NOT NULL,
          actor_type text DEFAULT 'system' NOT NULL,
          actor_email text,
          client_id text,
          action text NOT NULL,
          entity_type text NOT NULL,
          entity_id text NOT NULL,
          ip_address text,
          user_agent text,
          details text,
          timestamp integer NOT NULL
        )`);
        if (cols.has("actor_kind")) {
          await client.execute(`
            INSERT OR IGNORE INTO audit_log_new (
              id, actor_id, actor_type, client_id, action, entity_type, entity_id, ip_address, user_agent, details, timestamp
            )
            SELECT
              id,
              actor_id,
              CASE WHEN actor_kind IN ('admin', 'client', 'system', 'api_key') THEN actor_kind ELSE 'system' END,
              client_id,
              action,
              COALESCE(resource_type, 'system'),
              COALESCE(resource_id, 'system'),
              ip_address,
              user_agent,
              metadata,
              timestamp
            FROM audit_log
          `);
        }
        await client.execute("DROP TABLE audit_log");
        await client.execute("ALTER TABLE audit_log_new RENAME TO audit_log");
      }
    }
  } catch (err) {
    console.warn("[Migration] Warning repairing legacy audit_log:", err);
  }
}

async function executeStatementsSafely(
  client: ReturnType<typeof getRawClient>,
  statements: string[],
  schemaMod: Record<string, any>
): Promise<void> {
  const createTableStmts = statements.filter((s) => /^\s*CREATE\s+TABLE/i.test(s));
  const indexAndOtherStmts = statements.filter((s) => !/^\s*CREATE\s+TABLE/i.test(s));

  // 1. Create any tables that don't exist yet
  for (const sql of createTableStmts) {
    await client.execute(sql);
  }

  // 2. Sync all Drizzle columns on existing tables BEFORE creating indexes
  await syncDrizzleColumns(client, schemaMod);

  // 3. Create indexes (now guaranteed that all referenced columns exist)
  for (const sql of indexAndOtherStmts) {
    await client.execute(sql);
  }
}

export async function migrateCoreSchema(): Promise<void> {
  await ensurePragmas("core");
  const client = getRawClient("core");
  await repairLegacyCoreTables(client);
  await executeStatementsSafely(client, STATEMENTS, coreSchema);
}

export async function migrateAnalyticsSchema(): Promise<void> {
  await ensurePragmas("analytics");
  const client = getRawClient("analytics");
  await executeStatementsSafely(client, ANALYTICS_STATEMENTS, analyticsSchema);
}

export const METRICS_STATEMENTS: string[] = [
  `CREATE TABLE IF NOT EXISTS server_metrics (
    id text PRIMARY KEY NOT NULL,
    server_id text NOT NULL,
    cpu_percent integer NOT NULL,
    memory_used_mb integer NOT NULL,
    timestamp integer NOT NULL
  );`,
  `CREATE INDEX IF NOT EXISTS idx_server_metrics_server_time ON server_metrics (server_id, timestamp);`,

  `CREATE TABLE IF NOT EXISTS domain_checks (
    id text PRIMARY KEY NOT NULL,
    domain_id text NOT NULL,
    check_type text NOT NULL,
    timestamp integer NOT NULL,
    is_success integer NOT NULL,
    latency_ms integer,
    status_code integer,
    error_message text,
    details_json text
  );`,
  `CREATE INDEX IF NOT EXISTS idx_domain_checks_domain_time ON domain_checks (domain_id, timestamp);`,
  `CREATE INDEX IF NOT EXISTS idx_domain_checks_type_time ON domain_checks (check_type, timestamp);`,
];

export async function migrateMetricsSchema(): Promise<void> {
  await ensurePragmas("metrics");
  const client = getRawClient("metrics");
  await executeStatementsSafely(client, METRICS_STATEMENTS, metricsSchema);
}

export async function runMigrations(): Promise<void> {
  await migrateCoreSchema();
  await migrateAnalyticsSchema();
  await migrateMetricsSchema();
}

async function main() {
  console.log("[Migration] Applying core, analytics & metrics database migrations...");
  try {
    await runMigrations();
    console.log("[Migration] Core, analytics & metrics schema migrated successfully.");
  } catch (err) {
    console.error("[Migration] Migration failed:", err);
    process.exit(1);
  }
}

// If invoked directly
if (import.meta.url === `file://${process.argv[1]?.replace(/\\/g, "/")}` || process.argv[1]?.endsWith("migrate.ts")) {
  void main();
}



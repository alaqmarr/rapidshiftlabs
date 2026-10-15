import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@libsql/client";
import { setConfigForTests } from "../src/shared/config";
import { closeAllDatabases } from "../src/shared/infrastructure/db";
import {
  MonitoredDomain,
  Incident,
  GetPublicStatusPageUseCase,
  DrizzleMonitoredDomainRepository,
  DrizzleDomainCheckRepository,
  DrizzleIncidentRepository,
} from "../src/modules/monitoring";

const testMasterKey =
  "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
const testAuthSecret = "test-auth-secret-123456789";
process.env.MASTER_KEY = testMasterKey;
process.env.AUTH_SECRET = testAuthSecret;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe("Public Status Page Aggregation & Metrics Tests", () => {
  const testDataDir = path.join(__dirname, "temp_status_page_test");
  const coreDbPath = path.join(testDataDir, "core.db");
  const metricsDbPath = path.join(testDataDir, "metrics.db");

  let domainRepo: DrizzleMonitoredDomainRepository;
  let checkRepo: DrizzleDomainCheckRepository;
  let incidentRepo: DrizzleIncidentRepository;

  beforeAll(async () => {
    if (fs.existsSync(testDataDir)) {
      try {
        fs.rmSync(testDataDir, { recursive: true, force: true });
      } catch {}
    }
    fs.mkdirSync(testDataDir, { recursive: true });

    process.env.DATA_DIR = testDataDir;

    setConfigForTests({
      dataDir: testDataDir,
      MASTER_KEY: testMasterKey,
      AUTH_SECRET: testAuthSecret,
      dbPaths: {
        core: coreDbPath,
        analytics: path.join(testDataDir, "analytics.db"),
        metrics: metricsDbPath,
      },
    });

    const coreClient = createClient({ url: `file:${coreDbPath}` });
    await coreClient.execute("PRAGMA journal_mode = WAL;");
    await coreClient.execute(`
      CREATE TABLE IF NOT EXISTS clients (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        slug TEXT NOT NULL UNIQUE,
        gstin TEXT,
        pan TEXT,
        billing_mode TEXT NOT NULL DEFAULT 'non_gst',
        currency TEXT NOT NULL DEFAULT 'INR',
        timezone TEXT NOT NULL DEFAULT 'Asia/Kolkata',
        status TEXT NOT NULL DEFAULT 'active',
        address_line1 TEXT,
        address_line2 TEXT,
        city TEXT,
        state TEXT,
        postal_code TEXT,
        country TEXT NOT NULL DEFAULT 'India',
        notes TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
    `);
    await coreClient.execute(`
      CREATE TABLE IF NOT EXISTS monitored_domains (
        id TEXT PRIMARY KEY,
        client_id TEXT NOT NULL,
        project_id TEXT,
        name TEXT NOT NULL,
        hostname TEXT NOT NULL,
        target_url TEXT NOT NULL,
        port INTEGER NOT NULL DEFAULT 443,
        config TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        consecutive_failures INTEGER NOT NULL DEFAULT 0,
        active_incident_id TEXT,
        last_http_check_at INTEGER,
        last_http_status INTEGER,
        last_latency_ms INTEGER,
        last_http_error TEXT,
        last_ssl_check_at INTEGER,
        ssl_status TEXT,
        ssl_expires_at INTEGER,
        ssl_days_remaining INTEGER,
        ssl_issuer TEXT,
        ssl_error TEXT,
        last_dns_check_at INTEGER,
        dns_status TEXT,
        dns_drift_details TEXT,
        last_rdap_check_at INTEGER,
        domain_expires_at INTEGER,
        domain_registrar TEXT,
        resolved_ip TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
    `);
    await coreClient.execute(`
      CREATE TABLE IF NOT EXISTS incidents (
        id TEXT PRIMARY KEY,
        domain_id TEXT NOT NULL,
        client_id TEXT,
        type TEXT,
        status TEXT NOT NULL DEFAULT 'open',
        severity TEXT DEFAULT 'critical',
        title TEXT,
        reason TEXT,
        failure_count INTEGER NOT NULL DEFAULT 0,
        started_at INTEGER,
        opened_at INTEGER,
        resolved_at INTEGER,
        duration_seconds INTEGER,
        linked_ticket_id TEXT,
        notified_at INTEGER,
        created_at INTEGER,
        updated_at INTEGER
      );
    `);
    await coreClient.execute(`
      CREATE TABLE IF NOT EXISTS status_pages (
        id TEXT PRIMARY KEY,
        client_id TEXT NOT NULL,
        slug TEXT NOT NULL UNIQUE,
        title TEXT NOT NULL,
        description TEXT,
        is_public INTEGER NOT NULL DEFAULT 1,
        domain_ids_json TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
    `);
    await coreClient.execute(`
      CREATE TABLE IF NOT EXISTS outbox (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        aggregate_type TEXT NOT NULL,
        aggregate_id TEXT NOT NULL,
        client_id TEXT,
        payload TEXT NOT NULL,
        occurred_at INTEGER NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        attempts INTEGER NOT NULL DEFAULT 0,
        max_attempts INTEGER NOT NULL DEFAULT 5,
        next_retry_at INTEGER,
        locked_at INTEGER,
        locked_by TEXT,
        processed_at INTEGER,
        last_error TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
    `);

    const metricsClient = createClient({ url: `file:${metricsDbPath}` });
    await metricsClient.execute("PRAGMA journal_mode = WAL;");
    await metricsClient.execute(`
      CREATE TABLE IF NOT EXISTS domain_checks (
        id TEXT PRIMARY KEY,
        domain_id TEXT NOT NULL,
        check_type TEXT NOT NULL,
        timestamp INTEGER NOT NULL,
        is_success INTEGER NOT NULL,
        latency_ms INTEGER,
        status_code INTEGER,
        error_message TEXT,
        details_json TEXT
      );
    `);

    domainRepo = new DrizzleMonitoredDomainRepository();
    checkRepo = new DrizzleDomainCheckRepository();
    incidentRepo = new DrizzleIncidentRepository();
  });

  afterAll(async () => {
    await closeAllDatabases();
    try {
      if (fs.existsSync(testDataDir)) {
        fs.rmSync(testDataDir, { recursive: true, force: true });
      }
    } catch {}
  });

  it("returns null for non-existent client slug", async () => {
    const useCase = new GetPublicStatusPageUseCase(
      domainRepo,
      checkRepo,
      incidentRepo,
    );

    const result = await useCase.execute({ clientSlug: "non-existent-client" });
    expect(result).toBeNull();
  });

  it("aggregates domain metrics, health bars, and incidents for client status page", async () => {
    const clientId = "cli_status_acme";
    const clientSlug = "acme-corp";

    // Insert client into core db
    const coreClient = createClient({ url: `file:${coreDbPath}` });
    const now = Date.now();
    await coreClient.execute({
      sql: `INSERT INTO clients (id, name, slug, created_at, updated_at) VALUES (?, ?, ?, ?, ?)`,
      args: [clientId, "Acme Corporation", clientSlug, now, now],
    });

    // Create 2 domains for Acme
    const domain1 = MonitoredDomain.create({
      clientId,
      name: "API Gateway",
      hostname: "api.acme.com",
    });
    domain1.recordHttpSuccess({ statusCode: 200, latencyMs: 35 });
    domain1.recordSslCheckResult({ isValid: true, daysRemaining: 60 });
    await domainRepo.save(domain1);

    const domain2 = MonitoredDomain.create({
      clientId,
      name: "Web Portal",
      hostname: "app.acme.com",
    });
    domain2.recordHttpSuccess({ statusCode: 200, latencyMs: 40 });
    // Expiring SSL -> sets status to degraded
    domain2.recordSslCheckResult({ isValid: true, daysRemaining: 5 });
    await domainRepo.save(domain2);

    // Record check history in metrics.db for domain1
    for (let i = 0; i < 10; i++) {
      await checkRepo.recordCheck({
        domainId: domain1.id,
        checkType: "http",
        timestamp: now - i * 3600 * 1000,
        isSuccess: true,
        latencyMs: 30 + i,
        statusCode: 200,
      });
    }

    // Add 1 resolved past incident
    const pastIncident = Incident.create({
      domainId: domain1.id,
      clientId,
      type: "http",
      severity: "warning",
      reason: "504 Gateway Timeout during deployment",
      startedAt: now - 86400 * 1000 * 2,
    });
    pastIncident.resolve(now - 86400 * 1000 * 2 + 180 * 1000); // 3 minutes duration
    await incidentRepo.save(pastIncident);

    // Run use case
    const useCase = new GetPublicStatusPageUseCase(
      domainRepo,
      checkRepo,
      incidentRepo,
    );

    const statusData = await useCase.execute({ clientSlug });

    expect(statusData).not.toBeNull();
    expect(statusData?.client.id).toBe(clientId);
    expect(statusData?.client.name).toBe("Acme Corporation");
    expect(statusData?.client.slug).toBe(clientSlug);

    // One domain is degraded due to expiring SSL (5 days left)
    expect(statusData?.overallStatus).toBe("degraded");

    // Check domains list
    expect(statusData?.domains.length).toBe(2);
    const apiDomain = statusData?.domains.find((d) => d.id === domain1.id);
    expect(apiDomain?.name).toBe("API Gateway");
    expect(apiDomain?.hostname).toBe("api.acme.com");
    expect(apiDomain?.status).toBe("up");
    expect(apiDomain?.uptime24h).toBe(100);
    expect(apiDomain?.dailyHealthBars.length).toBe(90);

    const appDomain = statusData?.domains.find((d) => d.id === domain2.id);
    expect(appDomain?.status).toBe("degraded");
    expect(appDomain?.sslDaysRemaining).toBe(5);

    // Check incidents
    expect(statusData?.activeIncidents.length).toBe(0);
    expect(statusData?.recentIncidents.length).toBe(1);
    expect(statusData?.recentIncidents[0].domainName).toBe("API Gateway");
    expect(statusData?.recentIncidents[0].reason).toContain("504 Gateway Timeout");
    expect(statusData?.recentIncidents[0].durationSeconds).toBe(180);
  });

  it("computes overallStatus as outage when an active critical incident exists", async () => {
    const clientId = "cli_status_beta";
    const clientSlug = "beta-corp";

    const coreClient = createClient({ url: `file:${coreDbPath}` });
    const now = Date.now();
    await coreClient.execute({
      sql: `INSERT INTO clients (id, name, slug, created_at, updated_at) VALUES (?, ?, ?, ?, ?)`,
      args: [clientId, "Beta Corp", clientSlug, now, now],
    });

    const domain = MonitoredDomain.create({
      clientId,
      name: "Beta Core API",
      hostname: "core.beta.com",
    });
    // Threshold reached -> DOWN
    domain.recordHttpFailure({ statusCode: 500 });
    domain.recordHttpFailure({ statusCode: 500 });
    domain.recordHttpFailure({ statusCode: 500 });
    await domainRepo.save(domain);

    const incident = Incident.create({
      domainId: domain.id,
      clientId,
      type: "http",
      severity: "critical",
      reason: "500 Internal Server Error (Database down)",
      startedAt: now,
    });
    await incidentRepo.save(incident);

    const useCase = new GetPublicStatusPageUseCase(
      domainRepo,
      checkRepo,
      incidentRepo,
    );

    const statusData = await useCase.execute({ clientSlug });
    expect(statusData).not.toBeNull();
    expect(statusData?.overallStatus).toBe("outage");
    expect(statusData?.activeIncidents.length).toBe(1);
    expect(statusData?.activeIncidents[0].domainName).toBe("Beta Core API");
    expect(statusData?.activeIncidents[0].severity).toBe("critical");
  });
});

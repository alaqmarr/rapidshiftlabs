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
  ExecuteHttpCheckUseCase,
  DrizzleMonitoredDomainRepository,
  DrizzleDomainCheckRepository,
  DrizzleIncidentRepository,
  type HttpCheckerPort,
  type HttpCheckResult,
} from "../src/modules/monitoring";

const testMasterKey =
  "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
const testAuthSecret = "test-auth-secret-123456789";
process.env.MASTER_KEY = testMasterKey;
process.env.AUTH_SECRET = testAuthSecret;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe("Monitoring Incident Lifecycle & Threshold Tests", () => {
  const testDataDir = path.join(__dirname, "temp_monitoring_incidents_test");
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

    // Initialize core.db tables
    const coreClient = createClient({ url: `file:${coreDbPath}` });
    await coreClient.execute("PRAGMA journal_mode = WAL;");
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

    // Initialize metrics.db
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

  describe("Incident Aggregate Root", () => {
    it("creates an incident in open state and raises incident-opened event", () => {
      const startedAt = Date.now() - 5000;
      const incident = Incident.create({
        domainId: "dom_test_1",
        clientId: "cli_123",
        type: "http",
        severity: "critical",
        reason: "Connection refused (ECONNREFUSED)",
        failureCount: 3,
        startedAt,
      });

      expect(incident.id).toMatch(/^inc_/);
      expect(incident.domainId).toBe("dom_test_1");
      expect(incident.clientId).toBe("cli_123");
      expect(incident.status).toBe("open");
      expect(incident.severity).toBe("critical");
      expect(incident.reason).toBe("Connection refused (ECONNREFUSED)");
      expect(incident.failureCount).toBe(3);
      expect(incident.resolvedAt).toBeNull();
      expect(incident.durationSeconds).toBeNull();

      const events = incident.pullEvents();
      expect(events.length).toBe(1);
      expect(events[0].type).toBe("monitoring.incident.opened");
      expect(events[0].aggregateId).toBe(incident.id);
    });

    it("resolves an incident, computes duration in seconds, and raises incident-resolved event", () => {
      const startedAt = 1000000;
      const resolvedAt = startedAt + 120 * 1000; // 120 seconds later
      const incident = Incident.create({
        domainId: "dom_test_2",
        reason: "502 Bad Gateway",
        startedAt,
      });
      incident.pullEvents(); // clear initial event

      incident.resolve(resolvedAt);

      expect(incident.status).toBe("resolved");
      expect(incident.resolvedAt).toBe(resolvedAt);
      expect(incident.durationSeconds).toBe(120);

      const events = incident.pullEvents();
      expect(events.length).toBe(1);
      expect(events[0].type).toBe("monitoring.incident.resolved");
      expect(events[0].payload.durationSeconds).toBe(120);

      // Resolving again is a no-op
      incident.resolve(resolvedAt + 50);
      expect(incident.durationSeconds).toBe(120);
      expect(incident.pullEvents().length).toBe(0);
    });
  });

  describe("Consecutive Failure Threshold & Incident Triggering via UseCase", () => {
    it("does not create an incident on flapping failures below threshold", async () => {
      let isUp = true;
      let statusCode = 200;
      let errorMsg: string | null = null;

      const mockChecker: HttpCheckerPort = {
        async check(): Promise<HttpCheckResult> {
          return {
            url: "https://flapping.example.com",
            isUp,
            statusCode,
            latencyMs: 45,
            errorMessage: errorMsg,
            timestamp: Date.now(),
          };
        },
      };

      const domain = MonitoredDomain.create({
        clientId: "cli_flapping",
        name: "Flapping Domain",
        hostname: "flapping.example.com",
        config: {
          http: { consecutiveThreshold: 3 },
        },
      });
      await domainRepo.save(domain);

      const useCase = new ExecuteHttpCheckUseCase(
        domainRepo,
        checkRepo,
        mockChecker,
        incidentRepo,
      );

      // 1. Initial success -> UP
      const res1 = await useCase.execute({ domainId: domain.id });
      expect(res1.isUp).toBe(true);
      expect(res1.status).toBe("up");
      expect(res1.transition.becameDown).toBe(false);

      // 2. Failure 1 -> still UP (consecutiveFailures = 1)
      isUp = false;
      statusCode = 500;
      errorMsg = "Internal Server Error";
      const res2 = await useCase.execute({ domainId: domain.id });
      expect(res2.isUp).toBe(false);
      expect(res2.status).toBe("up");

      // Verify no incident was created
      let activeIncident = await incidentRepo.findActiveByDomainId(domain.id);
      expect(activeIncident).toBeNull();

      // 3. Flapping: Success recovers consecutiveFailures to 0!
      isUp = true;
      statusCode = 200;
      errorMsg = null;
      const res3 = await useCase.execute({ domainId: domain.id });
      expect(res3.isUp).toBe(true);
      expect(res3.status).toBe("up");

      const refreshed = await domainRepo.findById(domain.id);
      expect(refreshed?.consecutiveFailures).toBe(0);

      // 4. Failure 1 again -> still UP
      isUp = false;
      statusCode = 503;
      errorMsg = "Service Unavailable";
      const res4 = await useCase.execute({ domainId: domain.id });
      expect(res4.isUp).toBe(false);
      expect(res4.status).toBe("up");

      // Verify still no incident
      activeIncident = await incidentRepo.findActiveByDomainId(domain.id);
      expect(activeIncident).toBeNull();
    });

    it("triggers incident creation on consecutive-failure threshold breach and auto-resolves on recovery", async () => {
      let isUp = false;
      let statusCode = 500;
      let errorMsg = "Database Connection Timeout";

      const mockChecker: HttpCheckerPort = {
        async check(): Promise<HttpCheckResult> {
          return {
            url: "https://critical.example.com",
            isUp,
            statusCode,
            latencyMs: 120,
            errorMessage: errorMsg,
            timestamp: Date.now(),
          };
        },
      };

      const domain = MonitoredDomain.create({
        clientId: "cli_critical",
        name: "Critical Endpoint",
        hostname: "critical.example.com",
        config: {
          http: { consecutiveThreshold: 3 },
        },
      });
      // Mark initial UP
      domain.recordHttpSuccess({ statusCode: 200, latencyMs: 25 });
      await domainRepo.save(domain);

      const useCase = new ExecuteHttpCheckUseCase(
        domainRepo,
        checkRepo,
        mockChecker,
        incidentRepo,
      );

      // Failure 1 (count = 1) -> UP
      const f1 = await useCase.execute({ domainId: domain.id });
      expect(f1.status).toBe("up");
      expect(f1.transition.becameDown).toBe(false);

      // Failure 2 (count = 2) -> UP
      const f2 = await useCase.execute({ domainId: domain.id });
      expect(f2.status).toBe("up");
      expect(f2.transition.becameDown).toBe(false);

      // Failure 3 (count = 3 >= threshold) -> Transitions to DOWN & creates Incident!
      const f3 = await useCase.execute({ domainId: domain.id });
      expect(f3.status).toBe("down");
      expect(f3.transition.becameDown).toBe(true);
      expect(f3.incidentId).toBeDefined();

      // Verify incident is in incident repository
      const activeIncident = await incidentRepo.findActiveByDomainId(domain.id);
      expect(activeIncident).not.toBeNull();
      expect(activeIncident?.id).toBe(f3.incidentId);
      expect(activeIncident?.status).toBe("open");
      expect(activeIncident?.severity).toBe("critical");
      expect(activeIncident?.failureCount).toBe(3);
      expect(activeIncident?.reason).toBe("Database Connection Timeout");

      // Verify domain aggregate has activeIncidentId linked
      const domainAfterDown = await domainRepo.findById(domain.id);
      expect(domainAfterDown?.status).toBe("down");
      expect(domainAfterDown?.activeIncidentId).toBe(activeIncident?.id);

      // RECOVERY: Now endpoint comes back UP
      isUp = true;
      statusCode = 200;
      errorMsg = "";

      const recoveryCheck = await useCase.execute({ domainId: domain.id });
      expect(recoveryCheck.isUp).toBe(true);
      expect(recoveryCheck.status).toBe("up");
      expect(recoveryCheck.transition.recovered).toBe(true);

      // Verify active incident has been auto-resolved in repository
      const resolvedIncident = await incidentRepo.findById(activeIncident!.id);
      expect(resolvedIncident).not.toBeNull();
      expect(resolvedIncident?.status).toBe("resolved");
      expect(resolvedIncident?.resolvedAt).toBeDefined();
      expect(resolvedIncident?.durationSeconds).toBeGreaterThanOrEqual(0);

      // Verify activeIncident is no longer returned as active
      const noActive = await incidentRepo.findActiveByDomainId(domain.id);
      expect(noActive).toBeNull();

      // Verify domain aggregate activeIncidentId has been cleared to null
      const domainAfterRecovery = await domainRepo.findById(domain.id);
      expect(domainAfterRecovery?.status).toBe("up");
      expect(domainAfterRecovery?.activeIncidentId).toBeNull();
      expect(domainAfterRecovery?.consecutiveFailures).toBe(0);
    });
  });
});

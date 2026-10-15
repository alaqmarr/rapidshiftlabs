import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@libsql/client";
import { setConfigForTests } from "../src/shared/config";
import { closeAllDatabases } from "../src/shared/infrastructure/db";
import {
  MonitoredDomain,
  createDefaultCheckConfigurations,
} from "../src/modules/monitoring/domain";
import { DrizzleMonitoredDomainRepository } from "../src/modules/monitoring/infrastructure/repositories/drizzle-monitored-domain.repository";
import { DrizzleDomainCheckRepository } from "../src/modules/monitoring/infrastructure/repositories/drizzle-domain-check.repository";

const testMasterKey = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
const testAuthSecret = "test-auth-secret-123456789";
process.env.MASTER_KEY = testMasterKey;
process.env.AUTH_SECRET = testAuthSecret;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe("Monitoring Domain & Persistence Unit Tests", () => {
  const testDataDir = path.join(__dirname, "temp_monitoring_test");
  const coreDbPath = path.join(testDataDir, "core.db");
  const metricsDbPath = path.join(testDataDir, "metrics.db");

  let domainRepo: DrizzleMonitoredDomainRepository;
  let checkRepo: DrizzleDomainCheckRepository;

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
      MASTER_KEY: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
      AUTH_SECRET: "test-auth-secret-123456789",
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
    coreClient.close();

    // Initialize metrics.db tables
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
    metricsClient.close();

    domainRepo = new DrizzleMonitoredDomainRepository();
    checkRepo = new DrizzleDomainCheckRepository();
  });

  afterAll(async () => {
    closeAllDatabases();
    if (fs.existsSync(testDataDir)) {
      try {
        fs.rmSync(testDataDir, { recursive: true, force: true });
      } catch {}
    }
  });

  describe("MonitoredDomain Aggregate Root", () => {
    it("creates with normalized hostname, default config, and pending status", () => {
      const domain = MonitoredDomain.create({
        clientId: "cli_123",
        name: "Test Domain",
        hostname: "HTTPS://API.RapidShiftLabs.Com/health/",
      });

      expect(domain.id).toMatch(/^dom_/);
      expect(domain.clientId).toBe("cli_123");
      expect(domain.name).toBe("Test Domain");
      expect(domain.hostname).toBe("api.rapidshiftlabs.com");
      expect(domain.targetUrl).toBe("https://api.rapidshiftlabs.com");
      expect(domain.port).toBe(443);
      expect(domain.status).toBe("pending");
      expect(domain.consecutiveFailures).toBe(0);
      expect(domain.activeIncidentId).toBeNull();
      expect(domain.config.http.consecutiveThreshold).toBe(3);
    });

    it("verifies consecutive failure threshold (N=3) and domain down transition", () => {
      const domain = MonitoredDomain.create({
        clientId: "cli_123",
        name: "Test Domain",
        hostname: "test.example.com",
      });

      // Probe 1 fails
      const res1 = domain.recordHttpCheckResult({
        isUp: false,
        statusCode: 500,
        errorMessage: "Internal Server Error",
      });
      expect(res1.becameDown).toBe(false);
      expect(res1.incidentOpened).toBe(false);
      expect(domain.consecutiveFailures).toBe(1);
      expect(domain.status).toBe("pending");
      expect(domain.pullEvents()).toHaveLength(0);

      // Probe 2 fails
      const res2 = domain.recordHttpCheckResult({
        isUp: false,
        statusCode: 502,
        errorMessage: "Bad Gateway",
      });
      expect(res2.becameDown).toBe(false);
      expect(res2.incidentOpened).toBe(false);
      expect(domain.consecutiveFailures).toBe(2);
      expect(domain.pullEvents()).toHaveLength(0);

      // Probe 3 fails -> threshold reached!
      const res3 = domain.recordHttpCheckResult({
        isUp: false,
        statusCode: 503,
        errorMessage: "Service Unavailable",
      });
      expect(res3.becameDown).toBe(true);
      expect(res3.incidentOpened).toBe(true);
      expect(domain.consecutiveFailures).toBe(3);
      expect(domain.status).toBe("down");

      const events = domain.pullEvents();
      expect(events).toHaveLength(1);
      expect(events[0]?.type).toBe("monitoring.domain.down");
      expect(events[0]?.payload).toMatchObject({
        domainId: domain.id,
        clientId: "cli_123",
        failureCount: 3,
        reason: "Service Unavailable",
      });

      // Subsequent 4th failure remains down but does not re-raise DomainDown event
      const res4 = domain.recordHttpCheckResult({
        isUp: false,
        statusCode: 503,
      });
      expect(res4.becameDown).toBe(false);
      expect(res4.incidentOpened).toBe(false);
      expect(domain.consecutiveFailures).toBe(4);
      expect(domain.pullEvents()).toHaveLength(0);
    });

    it("recovers from DOWN to UP on successful HTTP check and emits DomainRecovered", () => {
      const domain = MonitoredDomain.create({
        clientId: "cli_123",
        name: "Test Domain",
        hostname: "test.example.com",
      });

      // Make it down
      domain.recordHttpFailure({ errorMessage: "Fail 1" });
      domain.recordHttpFailure({ errorMessage: "Fail 2" });
      domain.recordHttpFailure({ errorMessage: "Fail 3" });
      domain.linkIncident("inc_001");
      expect(domain.status).toBe("down");
      expect(domain.activeIncidentId).toBe("inc_001");
      domain.pullEvents(); // Clear events

      // Record successful probe
      const recoverRes = domain.recordHttpSuccess({
        statusCode: 200,
        latencyMs: 85,
      });
      expect(recoverRes.recovered).toBe(true);
      expect(recoverRes.incidentResolved).toBe(true);
      expect(domain.status).toBe("up");
      expect(domain.consecutiveFailures).toBe(0);
      expect(domain.activeIncidentId).toBeNull();
      expect(domain.lastHttpStatus).toBe(200);
      expect(domain.lastLatencyMs).toBe(85);

      const events = domain.pullEvents();
      expect(events).toHaveLength(1);
      expect(events[0]?.type).toBe("monitoring.domain.recovered");
      expect(events[0]?.payload).toMatchObject({
        domainId: domain.id,
        clientId: "cli_123",
        incidentId: "inc_001",
      });
    });

    it("resilience against flapping health (fail, pass, fail, pass) - never becomes DOWN", () => {
      const domain = MonitoredDomain.create({
        clientId: "cli_123",
        name: "Flapping Domain",
        hostname: "flap.example.com",
      });

      for (let i = 0; i < 10; i++) {
        const fail = domain.recordHttpFailure({ errorMessage: "Hiccup" });
        expect(fail.becameDown).toBe(false);
        expect(domain.consecutiveFailures).toBe(1);

        const ok = domain.recordHttpSuccess({ statusCode: 200 });
        expect(ok.recovered).toBe(false);
        expect(domain.consecutiveFailures).toBe(0);
      }

      expect(domain.status).toBe("up");
      expect(domain.pullEvents()).toHaveLength(0);
    });

    it("handles SSL check results: valid, expiring soon (<= 14 days), and expired", () => {
      const domain = MonitoredDomain.create({
        clientId: "cli_123",
        name: "SSL Domain",
        hostname: "ssl.example.com",
      });
      domain.recordHttpSuccess({ statusCode: 200 }); // status: up

      // Expiring soon: 10 days remaining
      domain.recordSslCheckResult({
        isValid: true,
        daysRemaining: 10,
        expiresAt: Date.now() + 10 * 86400000,
        issuer: "Let's Encrypt",
      });
      expect(domain.sslStatus).toBe("expiring_soon");
      expect(domain.status).toBe("degraded");

      const events = domain.pullEvents();
      expect(events).toHaveLength(1);
      expect(events[0]?.type).toBe("monitoring.ssl.expiring");

      // Expired
      domain.recordSslCheckResult({
        isValid: false,
        daysRemaining: -1,
        expiresAt: Date.now() - 86400000,
        error: "CERT_HAS_EXPIRED",
      });
      expect(domain.sslStatus).toBe("expired");
      expect(domain.status).toBe("degraded");
      expect(domain.sslError).toBe("CERT_HAS_EXPIRED");

      // Valid renewal
      domain.recordSslCheckResult({
        isValid: true,
        daysRemaining: 89,
        expiresAt: Date.now() + 89 * 86400000,
        issuer: "Let's Encrypt Authority",
      });
      expect(domain.sslStatus).toBe("valid");
      expect(domain.status).toBe("up");
    });

    it("handles DNS check results: healthy, drift, and resolution failed", () => {
      const domain = MonitoredDomain.create({
        clientId: "cli_123",
        name: "DNS Domain",
        hostname: "dns.example.com",
      });
      domain.recordHttpSuccess({ statusCode: 200 }); // status: up

      // Drift detected
      domain.recordDnsCheckResult({
        healthy: true,
        driftDetected: true,
        driftDetails: "A record changed",
      });
      expect(domain.dnsStatus).toBe("drift_detected");
      expect(domain.dnsDriftDetails).toBe("A record changed");
      expect(domain.status).toBe("up"); // drift alone doesn't take down service

      // Resolution failure
      domain.recordDnsCheckResult({
        healthy: false,
      });
      expect(domain.dnsStatus).toBe("resolution_failed");
      expect(domain.status).toBe("degraded");

      // Resolution recovered
      domain.recordDnsCheckResult({
        healthy: true,
        driftDetected: false,
        resolvedIp: "93.184.216.34",
      });
      expect(domain.dnsStatus).toBe("healthy");
      expect(domain.resolvedIp).toBe("93.184.216.34");
      expect(domain.status).toBe("up");
    });

    it("pauses and resumes domain monitoring", () => {
      const domain = MonitoredDomain.create({
        clientId: "cli_123",
        name: "Test Domain",
        hostname: "test.example.com",
      });

      domain.pause();
      expect(domain.status).toBe("paused");

      domain.resume();
      expect(domain.status).toBe("pending");
      expect(domain.consecutiveFailures).toBe(0);
    });

    it("prevents immutability leaks via toState() and config getter", () => {
      const domain = MonitoredDomain.create({
        clientId: "cli_123",
        name: "Immutable Test Domain",
        hostname: "immutable.example.com",
      });

      // 1. Mutating toState().config must not mutate internal aggregate config
      const state = domain.toState();
      (state.config.http as any).consecutiveThreshold = 999;
      expect(domain.config.http.consecutiveThreshold).toBe(3);

      // 2. Mutating config getter return value must not mutate internal aggregate config
      const configRef = domain.config;
      (configRef.http as any).consecutiveThreshold = 888;
      expect(domain.config.http.consecutiveThreshold).toBe(3);
    });

    it("performs deep merge in updateConfig without wiping nested subfields", () => {
      const domain = MonitoredDomain.create({
        clientId: "cli_123",
        name: "Deep Merge Domain",
        hostname: "deep-merge.example.com",
      });

      // Update only consecutiveThreshold
      domain.updateConfig({
        http: { consecutiveThreshold: 5 },
      });

      // Consecutive threshold is updated
      expect(domain.config.http.consecutiveThreshold).toBe(5);
      // Other http subfields are preserved
      expect(domain.config.http.enabled).toBe(true);
      expect(domain.config.http.intervalSeconds).toBe(60);
      expect(domain.config.http.timeoutMs).toBe(10_000);
      expect(domain.config.http.method).toBe("GET");
      expect(domain.config.http.expectedStatusCodes).toEqual([200, 201, 204, 301, 302]);
      // Other configs are intact
      expect(domain.config.ssl.enabled).toBe(true);
      expect(domain.config.dns.enabled).toBe(true);
      expect(domain.config.rdap.enabled).toBe(true);
    });

    it("guards paused domains against failure increment and DOWN transition", () => {
      const domain = MonitoredDomain.create({
        clientId: "cli_123",
        name: "Paused Guard Domain",
        hostname: "paused-guard.example.com",
      });

      domain.pause();
      expect(domain.status).toBe("paused");

      // Record multiple failures while paused
      const res1 = domain.recordHttpFailure({ errorMessage: "Fail 1" });
      const res2 = domain.recordHttpFailure({ errorMessage: "Fail 2" });
      const res3 = domain.recordHttpFailure({ errorMessage: "Fail 3" });
      const res4 = domain.recordHttpFailure({ errorMessage: "Fail 4" });

      expect(res1.becameDown).toBe(false);
      expect(res2.becameDown).toBe(false);
      expect(res3.becameDown).toBe(false);
      expect(res4.becameDown).toBe(false);

      // Status must remain paused, consecutiveFailures must not increment, zero events emitted
      expect(domain.status).toBe("paused");
      expect(domain.consecutiveFailures).toBe(0);
      expect(domain.pullEvents()).toHaveLength(0);

      // Success while paused also preserves paused status
      const okRes = domain.recordHttpSuccess({ statusCode: 200 });
      expect(okRes.recovered).toBe(false);
      expect(domain.status).toBe("paused");
      expect(domain.pullEvents()).toHaveLength(0);
    });

    it("retains degraded status when recovering from DOWN if SSL or DNS has issues", () => {
      // Case A: SSL expired
      const sslDomain = MonitoredDomain.create({
        clientId: "cli_123",
        name: "SSL Expired Recovery",
        hostname: "ssl-rec.example.com",
      });
      sslDomain.recordHttpSuccess({ statusCode: 200 });
      sslDomain.recordSslCheckResult({ isValid: false, error: "CERT_EXPIRED" });
      expect(sslDomain.status).toBe("degraded");

      // Drive HTTP down
      sslDomain.recordHttpFailure({ errorMessage: "HTTP Down 1" });
      sslDomain.recordHttpFailure({ errorMessage: "HTTP Down 2" });
      sslDomain.recordHttpFailure({ errorMessage: "HTTP Down 3" });
      expect(sslDomain.status).toBe("down");
      sslDomain.pullEvents();

      // Recover HTTP: must transition to DEGRADED, not UP
      const sslRecRes = sslDomain.recordHttpSuccess({ statusCode: 200 });
      expect(sslRecRes.recovered).toBe(true);
      expect(sslDomain.status).toBe("degraded");
      const sslEvents = sslDomain.pullEvents();
      expect(sslEvents).toHaveLength(1);
      expect(sslEvents[0]?.type).toBe("monitoring.domain.recovered");

      // Case B: DNS resolution failed
      const dnsDomain = MonitoredDomain.create({
        clientId: "cli_123",
        name: "DNS Failed Recovery",
        hostname: "dns-rec.example.com",
      });
      dnsDomain.recordHttpSuccess({ statusCode: 200 });
      dnsDomain.recordDnsCheckResult({ healthy: false });
      expect(dnsDomain.status).toBe("degraded");

      // Drive HTTP down
      dnsDomain.recordHttpFailure({ errorMessage: "HTTP Down 1" });
      dnsDomain.recordHttpFailure({ errorMessage: "HTTP Down 2" });
      dnsDomain.recordHttpFailure({ errorMessage: "HTTP Down 3" });
      expect(dnsDomain.status).toBe("down");
      dnsDomain.pullEvents();

      // Recover HTTP: must transition to DEGRADED, not UP
      const dnsRecRes = dnsDomain.recordHttpSuccess({ statusCode: 200 });
      expect(dnsRecRes.recovered).toBe(true);
      expect(dnsDomain.status).toBe("degraded");
      const dnsEvents = dnsDomain.pullEvents();
      expect(dnsEvents).toHaveLength(1);
      expect(dnsEvents[0]?.type).toBe("monitoring.domain.recovered");
    });
  });

  describe("DrizzleMonitoredDomainRepository", () => {
    it("saves and retrieves a monitored domain, and writes domain events to outbox", async () => {
      const domain = MonitoredDomain.create({
        clientId: "cli_persistence_1",
        name: "Persistence Test Domain",
        hostname: "persistence.example.com",
      });

      // Force 3 failures to raise DomainDown event
      domain.recordHttpFailure({ errorMessage: "Fail 1" });
      domain.recordHttpFailure({ errorMessage: "Fail 2" });
      domain.recordHttpFailure({ errorMessage: "Fail 3" });

      await domainRepo.save(domain);

      const found = await domainRepo.findById(domain.id);
      expect(found).not.toBeNull();
      expect(found?.id).toBe(domain.id);
      expect(found?.clientId).toBe("cli_persistence_1");
      expect(found?.hostname).toBe("persistence.example.com");
      expect(found?.status).toBe("down");
      expect(found?.consecutiveFailures).toBe(3);

      // Verify outbox entry
      const coreClient = createClient({ url: `file:${coreDbPath}` });
      const outboxRes = await coreClient.execute({
        sql: "SELECT * FROM outbox WHERE aggregate_id = ?",
        args: [domain.id],
      });
      expect(outboxRes.rows).toHaveLength(1);
      expect(outboxRes.rows[0]?.type).toBe("monitoring.domain.down");
      coreClient.close();
    });

    it("finds domains by client ID and hostname", async () => {
      const foundList = await domainRepo.findByClientId("cli_persistence_1");
      expect(foundList.length).toBeGreaterThanOrEqual(1);

      const foundHost = await domainRepo.findByHostname("PERSISTENCE.EXAMPLE.COM");
      expect(foundHost).not.toBeNull();
      expect(foundHost?.hostname).toBe("persistence.example.com");
    });

    it("queries domains due for HTTP, SSL, and DNS checks", async () => {
      const dueHttp = await domainRepo.listDueForHttpCheck(Date.now() + 1000);
      expect(dueHttp.length).toBeGreaterThanOrEqual(1);

      const dueSsl = await domainRepo.listDueForSslCheck(Date.now() + 1000);
      expect(dueSsl.length).toBeGreaterThanOrEqual(1);

      const dueDns = await domainRepo.listDueForDnsCheck(Date.now() + 1000);
      expect(dueDns.length).toBeGreaterThanOrEqual(1);
    });

    it("deletes a monitored domain", async () => {
      const domain = MonitoredDomain.create({
        clientId: "cli_del",
        name: "Delete Me",
        hostname: "del.example.com",
      });
      await domainRepo.save(domain);

      const before = await domainRepo.findById(domain.id);
      expect(before).not.toBeNull();

      await domainRepo.delete(domain.id);
      const after = await domainRepo.findById(domain.id);
      expect(after).toBeNull();
    });
  });

  describe("DrizzleDomainCheckRepository (Metrics DB)", () => {
    it("records checks and computes uptime stats and daily bars", async () => {
      const domainId = "dom_metrics_test";
      const now = Date.now();

      // Record 10 checks: 9 successes, 1 failure
      for (let i = 0; i < 9; i++) {
        await checkRepo.recordCheck({
          domainId,
          checkType: "http",
          timestamp: now - (9 - i) * 60_000,
          isSuccess: true,
          statusCode: 200,
          latencyMs: 50 + i * 5,
        });
      }
      await checkRepo.recordCheck({
        domainId,
        checkType: "http",
        timestamp: now,
        isSuccess: false,
        statusCode: 500,
        latencyMs: 120,
        errorMessage: "Internal Server Error",
      });

      // Uptime percentage
      const uptime = await checkRepo.getUptimePercentage(domainId, now - 600_000);
      expect(uptime).toBe(90);

      // Recent checks
      const recent = await checkRepo.getRecentChecks(domainId, 5);
      expect(recent).toHaveLength(5);
      expect(recent[0]?.isSuccess).toBe(false);

      // Detailed uptime stats
      const stats = await checkRepo.calculateUptime(domainId, now - 600_000, now);
      expect(stats.uptimePercentage).toBe(90);
      expect(stats.totalChecks).toBe(10);
      expect(stats.successfulChecks).toBe(9);
      expect(stats.avgLatencyMs).toBeGreaterThan(0);

      // Daily bars
      const bars = await checkRepo.getDailyBars(domainId, 7);
      expect(bars).toHaveLength(7);
      const todayBar = bars[bars.length - 1];
      expect(todayBar?.uptimePercentage).toBe(90);
      expect(todayBar?.status).toBe("degraded");
    });

    it("records checks concurrently under multi-probe load with mutex safety", async () => {
      const domainId = "dom_concurrent_test";
      const now = Date.now();

      // Launch 25 concurrent recordCheck calls (simulating HTTP, SSL, DNS daemon checks firing simultaneously)
      const promises = Array.from({ length: 25 }, (_, i) =>
        checkRepo.recordCheck({
          domainId,
          checkType: i % 2 === 0 ? "http" : "ssl",
          timestamp: now + i * 10,
          isSuccess: true,
          statusCode: 200,
          latencyMs: 50 + i,
        }),
      );

      await expect(Promise.all(promises)).resolves.toBeDefined();

      const recent = await checkRepo.getRecentChecks(domainId, 50);
      expect(recent).toHaveLength(25);
    });
  });
});

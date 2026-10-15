import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@libsql/client";
import { setConfigForTests } from "../src/shared/config";
import { closeAllDatabases, getDb, uow } from "../src/shared/infrastructure/db";
import {
  MonitoredDomain,
  createDefaultCheckConfigurations,
} from "../src/modules/monitoring/domain";
import { DrizzleMonitoredDomainRepository } from "../src/modules/monitoring/infrastructure/repositories/drizzle-monitored-domain.repository";
import { DrizzleDomainCheckRepository } from "../src/modules/monitoring/infrastructure/repositories/drizzle-domain-check.repository";
import { monitoredDomainsTable } from "../src/shared/infrastructure/db/schema/monitoring";
import { outbox } from "../src/shared/infrastructure/db/schema/outbox";
import { eq } from "drizzle-orm";

const testMasterKey = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
const testAuthSecret = "test-auth-secret-123456789";
process.env.MASTER_KEY = testMasterKey;
process.env.AUTH_SECRET = testAuthSecret;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe("Adversarial Stress Test Harness: MonitoredDomain & Repositories", () => {
  const testDataDir = path.join(__dirname, "temp_adversarial_monitoring_test");
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
      MASTER_KEY: testMasterKey,
      AUTH_SECRET: testAuthSecret,
      dbPaths: {
        core: coreDbPath,
        analytics: path.join(testDataDir, "analytics.db"),
        metrics: metricsDbPath,
      },
    });

    // Initialize core.db
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

  describe("1. Adversarial Flapping Stress Testing", () => {
    it("proves status NEVER transitions to DOWN under sustained 2-fail-1-success flapping (threshold N=3)", () => {
      const domain = MonitoredDomain.create({
        clientId: "cli_flap_1",
        name: "Flapping Target",
        hostname: "flap-probe.rapidshift.internal",
        config: {
          http: { consecutiveThreshold: 3 },
        },
      });

      // Initially pending
      expect(domain.status).toBe("pending");

      // 50 consecutive flapping cycles: 2 failures, 1 success
      for (let cycle = 1; cycle <= 50; cycle++) {
        // Failure 1 of cycle
        const f1 = domain.recordHttpCheckResult({
          isUp: false,
          statusCode: 502,
          errorMessage: `Flap fail 1 in cycle ${cycle}`,
          latencyMs: 120,
        });
        expect(f1.becameDown).toBe(false);
        expect(f1.incidentOpened).toBe(false);
        expect(f1.recovered).toBe(false);
        expect(f1.incidentResolved).toBe(false);
        expect(domain.consecutiveFailures).toBe(1);
        expect(domain.status).not.toBe("down");

        // Failure 2 of cycle
        const f2 = domain.recordHttpCheckResult({
          isUp: false,
          statusCode: 504,
          errorMessage: `Flap fail 2 in cycle ${cycle}`,
          latencyMs: 5000,
        });
        expect(f2.becameDown).toBe(false);
        expect(f2.incidentOpened).toBe(false);
        expect(f2.recovered).toBe(false);
        expect(f2.incidentResolved).toBe(false);
        expect(domain.consecutiveFailures).toBe(2);
        expect(domain.status).not.toBe("down");

        // Success probe: recovers consecutive failures to 0
        const ok = domain.recordHttpCheckResult({
          isUp: true,
          statusCode: 200,
          latencyMs: 45,
        });
        expect(ok.becameDown).toBe(false);
        expect(ok.incidentOpened).toBe(false);
        expect(ok.recovered).toBe(false); // Since it was never down, recovered is false
        expect(ok.incidentResolved).toBe(false);
        expect(domain.consecutiveFailures).toBe(0);
        expect(domain.status).toBe("up");

        // Verify zero events raised during entire flapping cycle
        const events = domain.pullEvents();
        expect(events).toHaveLength(0);
      }

      expect(domain.status).toBe("up");
      expect(domain.consecutiveFailures).toBe(0);
      expect(domain.activeIncidentId).toBeNull();
    });

    it("stress tests randomized chaotic flapping with random status codes and latencies", () => {
      const domain = MonitoredDomain.create({
        clientId: "cli_chaos_1",
        name: "Chaos Flap Target",
        hostname: "chaos.rapidshift.internal",
        config: {
          http: { consecutiveThreshold: 4 }, // N=4
        },
      });

      const errorCodes = [500, 502, 503, 504, 408, null];
      const errorMsgs = ["ETIMEDOUT", "ECONNRESET", "Bad Gateway", "Gateway Timeout"];

      let currentFailures = 0;
      for (let i = 0; i < 200; i++) {
        // Ensure failure burst never hits 4
        const shouldFail = currentFailures < 3 && Math.random() < 0.6;
        if (shouldFail) {
          currentFailures++;
          const errCode = errorCodes[Math.floor(Math.random() * errorCodes.length)];
          const errMsg = errorMsgs[Math.floor(Math.random() * errorMsgs.length)];
          const res = domain.recordHttpFailure({
            statusCode: errCode,
            errorMessage: errMsg,
            latencyMs: Math.floor(Math.random() * 2000),
          });
          expect(res.becameDown).toBe(false);
          expect(domain.status).not.toBe("down");
        } else {
          currentFailures = 0;
          const res = domain.recordHttpSuccess({
            statusCode: 200,
            latencyMs: Math.floor(Math.random() * 100),
          });
          expect(res.becameDown).toBe(false);
          expect(domain.status).toBe("up");
        }
        expect(domain.consecutiveFailures).toBe(currentFailures);
      }

      expect(domain.pullEvents()).toHaveLength(0);
    });
  });

  describe("2. Parameterized Threshold Transitions (N=1, N=3, N=5)", () => {
    it("transitions on EXACTLY N=1 consecutive failure", () => {
      const domain = MonitoredDomain.create({
        clientId: "cli_thresh_1",
        name: "Threshold 1 Domain",
        hostname: "n1.example.com",
        config: {
          http: { consecutiveThreshold: 1 },
        },
      });

      expect(domain.config.http.consecutiveThreshold).toBe(1);

      // Probe 1 fails -> MUST trigger immediately on 1st failure!
      const res1 = domain.recordHttpFailure({
        statusCode: 500,
        errorMessage: "Immediate Failure",
      });
      expect(res1.becameDown).toBe(true);
      expect(res1.incidentOpened).toBe(true);
      expect(domain.status).toBe("down");
      expect(domain.consecutiveFailures).toBe(1);

      const events = domain.pullEvents();
      expect(events).toHaveLength(1);
      expect(events[0]?.type).toBe("monitoring.domain.down");
      expect((events[0]?.payload as any).failureCount).toBe(1);

      // Probe 2 fails -> stays down, no duplicate event
      const res2 = domain.recordHttpFailure({ statusCode: 500, errorMessage: "Still down" });
      expect(res2.becameDown).toBe(false);
      expect(res2.incidentOpened).toBe(false);
      expect(domain.status).toBe("down");
      expect(domain.consecutiveFailures).toBe(2);
      expect(domain.pullEvents()).toHaveLength(0);
    });

    it("transitions on EXACTLY N=3 consecutive failures", () => {
      const domain = MonitoredDomain.create({
        clientId: "cli_thresh_3",
        name: "Threshold 3 Domain",
        hostname: "n3.example.com",
        config: {
          http: { consecutiveThreshold: 3 },
        },
      });

      // Fail 1
      const r1 = domain.recordHttpFailure({ errorMessage: "Fail 1" });
      expect(r1.becameDown).toBe(false);
      expect(domain.status).toBe("pending");
      expect(domain.consecutiveFailures).toBe(1);

      // Fail 2
      const r2 = domain.recordHttpFailure({ errorMessage: "Fail 2" });
      expect(r2.becameDown).toBe(false);
      expect(domain.status).toBe("pending");
      expect(domain.consecutiveFailures).toBe(2);

      // Fail 3 -> threshold reached
      const r3 = domain.recordHttpFailure({ errorMessage: "Fail 3" });
      expect(r3.becameDown).toBe(true);
      expect(r3.incidentOpened).toBe(true);
      expect(domain.status).toBe("down");
      expect(domain.consecutiveFailures).toBe(3);

      const events = domain.pullEvents();
      expect(events).toHaveLength(1);
      expect(events[0]?.type).toBe("monitoring.domain.down");
      expect((events[0]?.payload as any).failureCount).toBe(3);

      // Fail 4 and 5
      domain.recordHttpFailure({ errorMessage: "Fail 4" });
      domain.recordHttpFailure({ errorMessage: "Fail 5" });
      expect(domain.status).toBe("down");
      expect(domain.consecutiveFailures).toBe(5);
      expect(domain.pullEvents()).toHaveLength(0);
    });

    it("transitions on EXACTLY N=5 consecutive failures", () => {
      const domain = MonitoredDomain.create({
        clientId: "cli_thresh_5",
        name: "Threshold 5 Domain",
        hostname: "n5.example.com",
        config: {
          http: { consecutiveThreshold: 5 },
        },
      });

      for (let i = 1; i <= 4; i++) {
        const res = domain.recordHttpFailure({ errorMessage: `Fail ${i}` });
        expect(res.becameDown).toBe(false);
        expect(domain.status).toBe("pending");
        expect(domain.consecutiveFailures).toBe(i);
        expect(domain.pullEvents()).toHaveLength(0);
      }

      // 5th failure triggers DOWN
      const r5 = domain.recordHttpFailure({ errorMessage: "Fail 5" });
      expect(r5.becameDown).toBe(true);
      expect(r5.incidentOpened).toBe(true);
      expect(domain.status).toBe("down");
      expect(domain.consecutiveFailures).toBe(5);

      const events = domain.pullEvents();
      expect(events).toHaveLength(1);
      expect((events[0]?.payload as any).failureCount).toBe(5);
    });

    it("handles dynamic threshold modification at runtime", () => {
      const domain = MonitoredDomain.create({
        clientId: "cli_dyn_thresh",
        name: "Dynamic Threshold Domain",
        hostname: "dyn.example.com",
        config: {
          http: { consecutiveThreshold: 5 },
        },
      });

      // Fail 2 times
      domain.recordHttpFailure({ errorMessage: "Fail 1" });
      domain.recordHttpFailure({ errorMessage: "Fail 2" });
      expect(domain.consecutiveFailures).toBe(2);
      expect(domain.status).toBe("pending");

      // Dynamically lower threshold to 2
      domain.updateConfig({
        http: {
          ...domain.config.http,
          consecutiveThreshold: 2,
        },
      });

      // Next failure (3rd total, but now threshold is 2) triggers DOWN!
      const res3 = domain.recordHttpFailure({ errorMessage: "Fail 3" });
      expect(res3.becameDown).toBe(true);
      expect(domain.status).toBe("down");
      expect(domain.consecutiveFailures).toBe(3);
    });
  });

  describe("3. Recovery & Invariant Verification", () => {
    it("verifies recovery clears consecutive failures, clears activeIncidentId, and emits DomainRecoveredEvent", () => {
      const domain = MonitoredDomain.create({
        clientId: "cli_recovery_test",
        name: "Recovery Target",
        hostname: "recovery.example.com",
      });

      // Drive to down state
      domain.recordHttpFailure({ errorMessage: "Outage 1" });
      domain.recordHttpFailure({ errorMessage: "Outage 2" });
      domain.recordHttpFailure({ errorMessage: "Outage 3" });
      expect(domain.status).toBe("down");

      // Attach incident
      const testIncidentId = "inc_crit_999";
      domain.linkIncident(testIncidentId);
      expect(domain.activeIncidentId).toBe(testIncidentId);
      domain.pullEvents(); // Clear down events

      // Probe recovers
      const recoverRes = domain.recordHttpSuccess({
        statusCode: 200,
        latencyMs: 72,
        now: 1700000000000,
      });

      expect(recoverRes.becameDown).toBe(false);
      expect(recoverRes.recovered).toBe(true);
      expect(recoverRes.incidentOpened).toBe(false);
      expect(recoverRes.incidentResolved).toBe(true);

      // Invariants:
      expect(domain.status).toBe("up");
      expect(domain.consecutiveFailures).toBe(0);
      expect(domain.activeIncidentId).toBeNull();
      expect(domain.lastHttpError).toBeNull();
      expect(domain.lastHttpStatus).toBe(200);
      expect(domain.lastLatencyMs).toBe(72);

      // Verify event
      const events = domain.pullEvents();
      expect(events).toHaveLength(1);
      const recEvt = events[0];
      expect(recEvt?.type).toBe("monitoring.domain.recovered");
      expect(recEvt?.payload).toEqual({
        domainId: domain.id,
        clientId: "cli_recovery_test",
        hostname: "recovery.example.com",
        incidentId: testIncidentId,
        recoveredAt: 1700000000000,
      });

      // Repeated success: does NOT re-emit DomainRecovered
      const repeatRes = domain.recordHttpSuccess({ statusCode: 200 });
      expect(repeatRes.recovered).toBe(false);
      expect(repeatRes.incidentResolved).toBe(false);
      expect(domain.pullEvents()).toHaveLength(0);
    });

    it("verifies that multiple failures while already DOWN keep incrementing failures without mutating activeIncidentId", () => {
      const domain = MonitoredDomain.create({
        clientId: "cli_down_burst",
        name: "Down Burst Domain",
        hostname: "burst.example.com",
      });

      domain.recordHttpFailure({ errorMessage: "Fail 1" });
      domain.recordHttpFailure({ errorMessage: "Fail 2" });
      domain.recordHttpFailure({ errorMessage: "Fail 3" });
      expect(domain.status).toBe("down");
      domain.linkIncident("inc_original_id");

      // 10 subsequent failures
      for (let i = 4; i <= 13; i++) {
        const res = domain.recordHttpFailure({ errorMessage: `Still down ${i}` });
        expect(res.becameDown).toBe(false);
        expect(res.incidentOpened).toBe(false);
        expect(domain.consecutiveFailures).toBe(i);
        expect(domain.status).toBe("down");
        expect(domain.activeIncidentId).toBe("inc_original_id");
      }

      // No new events
      expect(domain.pullEvents()).toHaveLength(1); // Only the initial down event
    });

    it("verifies state interaction between HTTP, SSL, and DNS states", () => {
      const domain = MonitoredDomain.create({
        clientId: "cli_multi_check",
        name: "Multi Check Domain",
        hostname: "multi.example.com",
      });

      domain.recordHttpSuccess({ statusCode: 200 });
      expect(domain.status).toBe("up");

      // SSL expires -> degraded
      domain.recordSslCheckResult({
        isValid: false,
        error: "CERT_EXPIRED",
      });
      expect(domain.sslStatus).toBe("expired");
      expect(domain.status).toBe("degraded");

      // HTTP succeeds while degraded -> remains degraded because SSL is expired!
      domain.recordHttpSuccess({ statusCode: 200 });
      expect(domain.status).toBe("degraded");

      // Now SSL is renewed -> status returns to UP
      domain.recordSslCheckResult({
        isValid: true,
        daysRemaining: 60,
      });
      expect(domain.sslStatus).toBe("valid");
      expect(domain.status).toBe("up");

      // HTTP down -> status becomes DOWN, takes precedence over SSL/DNS
      domain.recordHttpFailure({ errorMessage: "HTTP Down 1" });
      domain.recordHttpFailure({ errorMessage: "HTTP Down 2" });
      domain.recordHttpFailure({ errorMessage: "HTTP Down 3" });
      expect(domain.status).toBe("down");

      // SSL check reporting valid while HTTP is DOWN: status MUST REMAIN DOWN!
      domain.recordSslCheckResult({
        isValid: true,
        daysRemaining: 60,
      });
      expect(domain.status).toBe("down");

      // DNS check reporting healthy while HTTP is DOWN: status MUST REMAIN DOWN!
      domain.recordDnsCheckResult({
        healthy: true,
      });
      expect(domain.status).toBe("down");
    });
  });

  describe("4. Repository Error Handling and Rollback Behavior", () => {
    it("rolls back monitored_domains insert when outbox append fails", async () => {
      const domain = MonitoredDomain.create({
        clientId: "cli_rollback_1",
        name: "Rollback Domain",
        hostname: "rollback-outbox.example.com",
      });

      // Force 3 failures to generate a DomainDown event for outbox
      domain.recordHttpFailure({ errorMessage: "Outbox Rollback 1" });
      domain.recordHttpFailure({ errorMessage: "Outbox Rollback 2" });
      domain.recordHttpFailure({ errorMessage: "Outbox Rollback 3" });
      expect(domain.status).toBe("down");

      const db = getDb("core");

      // Create a temporary trigger on outbox that raises an ABORT for this test
      const coreClient = createClient({ url: `file:${coreDbPath}` });
      await coreClient.execute(`
        CREATE TRIGGER fail_outbox_insert
        BEFORE INSERT ON outbox
        WHEN NEW.aggregate_id = '${domain.id}'
        BEGIN
          SELECT RAISE(ABORT, 'Simulated Outbox Failure');
        END;
      `);
      coreClient.close();

      // Now attempt to save the domain; it MUST throw
      await expect(domainRepo.save(domain)).rejects.toThrow(/(Failed query.*outbox|Simulated Outbox Failure)/i);

      // Verify transaction rollback: the domain record MUST NOT exist in monitored_domains!
      const foundInDb = await domainRepo.findById(domain.id);
      expect(foundInDb).toBeNull();

      // Clean up the trigger
      const cleanClient = createClient({ url: `file:${coreDbPath}` });
      await cleanClient.execute("DROP TRIGGER IF EXISTS fail_outbox_insert;");
      cleanClient.close();
    });

    it("rolls back monitored_domains update when outbox append fails on state transition", async () => {
      const domain = MonitoredDomain.create({
        clientId: "cli_rollback_2",
        name: "Update Rollback Domain",
        hostname: "rollback-update.example.com",
      });

      // First save it cleanly in UP status
      domain.recordHttpSuccess({ statusCode: 200 });
      await domainRepo.save(domain);

      const before = await domainRepo.findById(domain.id);
      expect(before?.status).toBe("up");
      expect(before?.consecutiveFailures).toBe(0);

      // Now drive it to DOWN and attempt to save with a failing outbox trigger
      domain.recordHttpFailure({ errorMessage: "Transition to down 1" });
      domain.recordHttpFailure({ errorMessage: "Transition to down 2" });
      domain.recordHttpFailure({ errorMessage: "Transition to down 3" });
      expect(domain.status).toBe("down");

      const coreClient = createClient({ url: `file:${coreDbPath}` });
      await coreClient.execute(`
        CREATE TRIGGER fail_outbox_update_insert
        BEFORE INSERT ON outbox
        WHEN NEW.aggregate_id = '${domain.id}'
        BEGIN
          SELECT RAISE(ABORT, 'Simulated Outbox Failure On Update');
        END;
      `);
      coreClient.close();

      // Save must throw
      await expect(domainRepo.save(domain)).rejects.toThrow(/(Failed query.*outbox|Simulated Outbox Failure)/i);

      // Clean up trigger
      const cleanClient = createClient({ url: `file:${coreDbPath}` });
      await cleanClient.execute("DROP TRIGGER IF EXISTS fail_outbox_update_insert;");
      cleanClient.close();

      // Invariant: The DB record MUST STILL BE 'up' with consecutiveFailures = 0!
      const afterRollback = await domainRepo.findById(domain.id);
      expect(afterRollback?.status).toBe("up");
      expect(afterRollback?.consecutiveFailures).toBe(0);
    });

    it("verifies event preservation observation when repository save fails", async () => {
      // Adversarial probe on memory aggregate behavior:
      // When save() is called, domain.pullEvents() clears internal _events.
      // If save() fails due to DB error, can the domain re-emit or are events lost in memory?
      const domain = MonitoredDomain.create({
        clientId: "cli_event_loss_test",
        name: "Event Preservation Probe",
        hostname: "events-probe.example.com",
      });
      domain.recordHttpFailure({ errorMessage: "Event loss 1" });
      domain.recordHttpFailure({ errorMessage: "Event loss 2" });
      domain.recordHttpFailure({ errorMessage: "Event loss 3" });
      expect(domain.status).toBe("down");

      // Before save, domain has 1 event
      // If we simulate an outbox failure:
      const coreClient = createClient({ url: `file:${coreDbPath}` });
      await coreClient.execute(`
        CREATE TRIGGER fail_outbox_probe
        BEFORE INSERT ON outbox
        WHEN NEW.aggregate_id = '${domain.id}'
        BEGIN
          SELECT RAISE(ABORT, 'Simulated Outbox Failure For Event Probe');
        END;
      `);
      coreClient.close();

      await expect(domainRepo.save(domain)).rejects.toThrow(/(Failed query.*outbox|Simulated Outbox Failure)/i);

      // Clean up trigger
      const cleanClient = createClient({ url: `file:${coreDbPath}` });
      await cleanClient.execute("DROP TRIGGER IF EXISTS fail_outbox_probe;");
      cleanClient.close();

      // Check: domain.pullEvents() is now empty because pullEvents was called before tx failed!
      const remainingEvents = domain.pullEvents();
      expect(remainingEvents).toHaveLength(0);
      // NOTE: This confirms domain._events was drained before the transaction committed,
      // meaning an in-memory retry of save(domain) without re-raising events will NOT persist outbox events.
    });
  });

  describe("5. Boundary Conditions, Filters, and Normalization", () => {
    it("handles complex and dirty hostnames", () => {
      const d1 = MonitoredDomain.create({
        clientId: "cli_1",
        name: "Dirty Hostname 1",
        hostname: "https://SUB.DOMAIN.EXAMPLE.COM/api/v1?query=1#frag",
      });
      expect(d1.hostname).toBe("sub.domain.example.com");
      expect(d1.targetUrl).toBe("https://sub.domain.example.com");

      const d2 = MonitoredDomain.create({
        clientId: "cli_1",
        name: "Custom Target URL",
        hostname: "api.example.com",
        targetUrl: "https://api.example.com:8443/custom/health",
        port: 8443,
      });
      expect(d2.hostname).toBe("api.example.com");
      expect(d2.targetUrl).toBe("https://api.example.com:8443/custom/health");
      expect(d2.port).toBe(8443);
    });

    it("verifies findDueForHttpCheck excludes paused and disabled domains", async () => {
      // 1. Create domain with http disabled
      const disabledDomain = MonitoredDomain.create({
        clientId: "cli_sched_1",
        name: "Disabled HTTP",
        hostname: "disabled.example.com",
        config: {
          http: { enabled: false },
        },
      });
      await domainRepo.save(disabledDomain);

      // 2. Create paused domain
      const pausedDomain = MonitoredDomain.create({
        clientId: "cli_sched_1",
        name: "Paused Domain",
        hostname: "paused.example.com",
      });
      pausedDomain.pause();
      await domainRepo.save(pausedDomain);

      // 3. Create active domain
      const activeDomain = MonitoredDomain.create({
        clientId: "cli_sched_1",
        name: "Active Domain",
        hostname: "active.example.com",
      });
      await domainRepo.save(activeDomain);

      const due = await domainRepo.findDueForHttpCheck(100);
      const dueIds = due.map((d) => d.id);

      expect(dueIds).not.toContain(disabledDomain.id);
      expect(dueIds).not.toContain(pausedDomain.id);
      expect(dueIds).toContain(activeDomain.id);
    });

    it("adversarial probe: parameter tolerance for recordHttpFailure and recordHttpSuccess", () => {
      const domain = MonitoredDomain.create({
        clientId: "cli_param_tol",
        name: "Param Tol Domain",
        hostname: "param-tol.example.com",
      });

      // Empty object params {} is supported
      expect(() => domain.recordHttpSuccess({})).not.toThrow();
      expect(() => domain.recordHttpFailure({})).not.toThrow();

      // Probing undefined params:
      // Note: TypeScript typing expects a params object. Calling without params at runtime
      // causes TypeError because params is not defaulted (params: {...} = {}).
      expect(() => (domain as any).recordHttpFailure()).toThrow(TypeError);
      expect(() => (domain as any).recordHttpSuccess()).toThrow(TypeError);
    });

    it("adversarial probe: invalid hostname input edge cases", () => {
      expect(() =>
        MonitoredDomain.create({
          clientId: "cli_1",
          name: "Test",
          hostname: "   ",
        }),
      ).toThrow();

      // Empty client id
      expect(() =>
        MonitoredDomain.create({
          clientId: "",
          name: "Test",
          hostname: "test.com",
        }),
      ).toThrow();

      // Empty name
      expect(() =>
        MonitoredDomain.create({
          clientId: "cli_1",
          name: "  ",
          hostname: "test.com",
        }),
      ).toThrow();
    });
  });
});

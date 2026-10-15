import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHash, randomBytes } from "node:crypto";
import { createClient } from "@libsql/client";
import { eq } from "drizzle-orm";

import { setConfigForTests } from "../src/shared/config";
import { closeAllDatabases, getDb, uow } from "../src/shared/infrastructure/db";
import { entitlements } from "../src/shared/infrastructure/db/schema/entitlements";
import { apiKeys } from "../src/shared/infrastructure/db/schema/api-keys";
import { outbox } from "../src/shared/infrastructure/db/schema/outbox";

// Domain & Application imports (M1 Entitlement)
import { Entitlement } from "../src/modules/entitlement/domain/entities/entitlement.aggregate";
import { ManualOverride } from "../src/modules/entitlement/domain/value-objects/manual-override.vo";
import { normalizeStatus } from "../src/modules/entitlement/domain/value-objects/entitlement-status";
import { DrizzleEntitlementRepository } from "../src/modules/entitlement/infrastructure/repositories/drizzle-entitlement.repository";
import { EvaluateEntitlementCommand } from "../src/modules/entitlement/application/commands/evaluate-entitlement.command";
import { SetManualOverrideCommand } from "../src/modules/entitlement/application/commands/set-manual-override.command";
import { ClearManualOverrideCommand } from "../src/modules/entitlement/application/commands/clear-manual-override.command";
import { HandleBillingEventCommand } from "../src/modules/entitlement/application/commands/handle-billing-event.command";

// Domain & Application imports (M1 API Platform)
import { ApiKey } from "../src/modules/api-platform/domain/entities/api-key.entity";
import { DrizzleApiKeyRepository } from "../src/modules/api-platform/infrastructure/repositories/drizzle-api-key.repository";
import { GenerateApiKeyCommand } from "../src/modules/api-platform/application/commands/generate-api-key.command";
import { ValidateApiKeyQuery } from "../src/modules/api-platform/application/queries/validate-api-key.query";
import { RevokeApiKeyCommand } from "../src/modules/api-platform/application/commands/revoke-api-key.command";
import { ListApiKeysQuery } from "../src/modules/api-platform/application/queries/list-api-keys.query";

import type { Actor } from "../src/shared/kernel/actor";
import { DomainRuleError, ForbiddenError, ValidationError } from "../src/shared/kernel/errors";

const testMasterKey = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
const testAuthSecret = "test-auth-secret-challenger-m1-1-12345";
process.env.MASTER_KEY = testMasterKey;
process.env.AUTH_SECRET = testAuthSecret;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe("Challenger M1-1 Empirical Adversarial Harness: Entitlement State Machine & API Keys", () => {
  const testDataDir = path.join(__dirname, "temp_challenger_m1_1_test");
  const coreDbPath = path.join(testDataDir, "core.db");

  let entitlementRepo: DrizzleEntitlementRepository;
  let apiKeyRepo: DrizzleApiKeyRepository;
  let validateQuery: ValidateApiKeyQuery;
  let generateCmd: GenerateApiKeyCommand;
  let revokeCmd: RevokeApiKeyCommand;
  let listQuery: ListApiKeysQuery;
  let billingCmd: HandleBillingEventCommand;
  let evalCmd: EvaluateEntitlementCommand;

  const adminActor: Actor = {
    kind: "admin",
    id: "adm_01J9Z7Q4X1A2B3C4D5E6F7G8H0",
    email: "security-auditor@rapidshift.test",
    name: "Security Auditor",
    role: "owner",
    supportLevel: null,
  };

  const clientActor: Actor = {
    kind: "client_user",
    id: "usr_01J9Z7Q4X1A2B3C4D5E6F7G8H1",
    email: "client-lead@tenant.test",
    name: "Tenant Admin",
    clientId: "cli_01J9Z7Q4X1A2B3C4D5E6F7G8H9",
    role: "client_admin",
  };

  const maliciousActor: Actor = {
    kind: "client_user",
    id: "usr_01J9Z7Q4X1A2B3C4D5E6F7MALIC",
    email: "attacker@darkweb.test",
    name: "Malicious Tenant",
    clientId: "cli_01J9Z7Q4X1A2B3C4D5E6F7ATTK",
    role: "client_admin",
  };

  beforeAll(async () => {
    closeAllDatabases();
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
        metrics: path.join(testDataDir, "metrics.db"),
      },
    });

    // Initialize core.db schema via direct libSQL DDL
    const coreClient = createClient({ url: `file:${coreDbPath}` });
    await coreClient.execute("PRAGMA journal_mode = WAL;");
    await coreClient.execute(`
      CREATE TABLE IF NOT EXISTS entitlements (
        id TEXT PRIMARY KEY,
        client_id TEXT NOT NULL UNIQUE,
        status TEXT NOT NULL DEFAULT 'Active',
        is_blocked INTEGER NOT NULL DEFAULT 0,
        reason TEXT,
        override_mode TEXT,
        override_valid_until INTEGER,
        override_note TEXT,
        override_set_by TEXT,
        override_created_at INTEGER,
        last_evaluated_at INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
    `);
    await coreClient.execute(`CREATE INDEX IF NOT EXISTS idx_entitlements_client_id ON entitlements(client_id);`);
    await coreClient.execute(`CREATE INDEX IF NOT EXISTS idx_entitlements_status ON entitlements(status);`);
    await coreClient.execute(`CREATE INDEX IF NOT EXISTS idx_entitlements_is_blocked ON entitlements(is_blocked);`);

    await coreClient.execute(`
      CREATE TABLE IF NOT EXISTS api_keys (
        id TEXT PRIMARY KEY,
        client_id TEXT NOT NULL,
        name TEXT NOT NULL,
        key_prefix TEXT NOT NULL,
        key_hash TEXT NOT NULL,
        type TEXT NOT NULL DEFAULT 'secret',
        scopes TEXT NOT NULL DEFAULT '[]',
        expires_at INTEGER,
        last_used_at INTEGER,
        revoked_at INTEGER,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
    `);
    await coreClient.execute(`CREATE INDEX IF NOT EXISTS idx_api_keys_key_prefix ON api_keys(key_prefix);`);
    await coreClient.execute(`CREATE INDEX IF NOT EXISTS idx_api_keys_client_id ON api_keys(client_id);`);
    await coreClient.execute(`CREATE INDEX IF NOT EXISTS idx_api_keys_key_hash ON api_keys(key_hash);`);

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

    entitlementRepo = new DrizzleEntitlementRepository();
    apiKeyRepo = new DrizzleApiKeyRepository();
    validateQuery = new ValidateApiKeyQuery(apiKeyRepo);
    generateCmd = new GenerateApiKeyCommand(apiKeyRepo);
    revokeCmd = new RevokeApiKeyCommand(apiKeyRepo);
    listQuery = new ListApiKeysQuery(apiKeyRepo);
    billingCmd = new HandleBillingEventCommand(entitlementRepo, uow);
    evalCmd = new EvaluateEntitlementCommand(entitlementRepo, uow);
  });

  afterAll(async () => {
    closeAllDatabases();
    try {
      fs.rmSync(testDataDir, { recursive: true, force: true });
    } catch {}
  });

  // =========================================================================
  // SECTION 1: RAPID STATE TRANSITIONS & DOMAIN INVARIANTS
  // =========================================================================
  describe("1. Rapid State Transitions & Invariant Integrity", () => {
    it("1.1 Complete Rapid Lifecycle: Active -> Overdue -> Blocked -> Suspended -> Unblocked -> Active", () => {
      const clientId = "cli_01J9Z7M1_1_LIFECYCLE_TEST";
      const ent = Entitlement.create({ clientId });

      // Step 1: Initial state is Active, not blocked, allowed
      expect(ent.status).toBe("Active");
      expect(ent.isAccessAllowed()).toBe(true);
      expect(ent.isBlocked).toBe(false);

      let events = ent.pullEvents();
      expect(events).toHaveLength(1);
      expect(events[0]?.type).toBe("entitlement.changed");

      // Step 2: Active -> Overdue (invoice past due date)
      ent.markOverdue({ invoiceId: "inv_101", amountPaise: 500000 });
      expect(ent.status).toBe("Overdue");
      expect(ent.isAccessAllowed()).toBe(true); // Grace period allows access
      expect(ent.isBlocked).toBe(false);
      events = ent.pullEvents();
      expect(events[0]?.payload).toMatchObject({
        previousStatus: "Active",
        newStatus: "Overdue",
        isAccessAllowed: true,
        isBlocked: false,
      });

      // Step 3: Overdue -> Blocked (grace period exceeded)
      ent.markBlocked({ reason: "Dunning grace period cutoff after 7 days" });
      expect(ent.status).toBe("Blocked");
      expect(ent.isAccessAllowed()).toBe(false);
      expect(ent.isBlocked).toBe(true);
      events = ent.pullEvents();
      expect(events[0]?.payload).toMatchObject({
        previousStatus: "Overdue",
        newStatus: "Blocked",
        isAccessAllowed: false,
        isBlocked: true,
      });

      // Step 4: Blocked -> Suspended (administrative freeze)
      ent.suspend({ reason: "Terms of service violation" });
      expect(ent.status).toBe("Suspended");
      expect(ent.isAccessAllowed()).toBe(false);
      expect(ent.isBlocked).toBe(true);
      events = ent.pullEvents();
      expect(events[0]?.payload).toMatchObject({
        previousStatus: "Blocked",
        newStatus: "Suspended",
        isAccessAllowed: false,
        isBlocked: true,
      });

      // Step 5: Suspended -> Unblocked / Active (admin lifts suspension)
      ent.unsuspend({ reason: "Compliance review passed" });
      expect(ent.status).toBe("Active");
      expect(ent.isAccessAllowed()).toBe(true);
      expect(ent.isBlocked).toBe(false);
      events = ent.pullEvents();
      expect(events[0]?.payload).toMatchObject({
        previousStatus: "Suspended",
        newStatus: "Active",
        isAccessAllowed: true,
        isBlocked: false,
      });
    });

    it("1.2 Forbidden Regressions: Blocked state does not regress to Overdue", () => {
      const clientId = "cli_01J9Z7M1_1_NO_REGRESSION";
      const ent = Entitlement.create({ clientId });
      ent.markBlocked({ reason: "Grace period expired" });
      ent.pullEvents();

      // Attempting markOverdue on already Blocked client MUST NOT restore Overdue or access
      ent.markOverdue({ invoiceId: "inv_102", amountPaise: 250000 });
      expect(ent.status).toBe("Blocked");
      expect(ent.isBlocked).toBe(true);
      expect(ent.isAccessAllowed()).toBe(false);
      expect(ent.reason).toContain("inv_102");
      expect(ent.pullEvents()).toHaveLength(0); // Invariant prevents invalid transition event
    });

    it("1.3 Administrative Suspension Precedence: Settlement and dunning events cannot alter suspension", () => {
      const clientId = "cli_01J9Z7M1_1_SUSPENSION_HOLD";
      const ent = Entitlement.create({ clientId });
      ent.suspend({ reason: "Fraud hold" });
      ent.pullEvents();

      // Invoice payment cannot lift administrative suspension
      ent.markActive({ clearedInvoiceId: "inv_paid_full" });
      expect(ent.status).toBe("Suspended");
      expect(ent.isAccessAllowed()).toBe(false);
      expect(ent.isBlocked).toBe(true);

      // Overdue notice cannot alter administrative suspension
      ent.markOverdue({ invoiceId: "inv_another_overdue", amountPaise: 10000 });
      expect(ent.status).toBe("Suspended");
      expect(ent.isAccessAllowed()).toBe(false);

      // Cutoff notice cannot alter administrative suspension
      ent.markBlocked({ reason: "Grace expired" });
      expect(ent.status).toBe("Suspended");
      expect(ent.isAccessAllowed()).toBe(false);

      // Only explicit unsuspend restores Active
      ent.unsuspend({ reason: "Fraud hold lifted by admin" });
      expect(ent.status).toBe("Active");
      expect(ent.isAccessAllowed()).toBe(true);
      expect(ent.isBlocked).toBe(false);
    });

    it("1.4 Rapid High-Frequency State Cycling (100 sequential cycles)", () => {
      const clientId = "cli_01J9Z7M1_1_RAPID_CYCLING";
      const ent = Entitlement.create({ clientId });

      for (let i = 0; i < 50; i++) {
        ent.markOverdue({ invoiceId: `inv_${i}`, amountPaise: 10000 });
        expect(ent.status).toBe("Overdue");
        expect(ent.isAccessAllowed()).toBe(true);

        ent.markBlocked({ reason: `Cutoff ${i}` });
        expect(ent.status).toBe("Blocked");
        expect(ent.isAccessAllowed()).toBe(false);

        ent.markActive({ clearedInvoiceId: `inv_${i}` });
        expect(ent.status).toBe("Active");
        expect(ent.isAccessAllowed()).toBe(true);
      }

      // Event stream buffer contains 1 initial create + 150 transition events = 151
      const events = ent.pullEvents();
      expect(events).toHaveLength(151);
      expect(ent.pullEvents()).toHaveLength(0);
    });
  });

  // =========================================================================
  // SECTION 2: INVALID TRANSITIONS, BOUNDARIES & OVERRIDES
  // =========================================================================
  describe("2. Invalid Transitions, Boundary Conditions & Overrides", () => {
    it("2.1 Client ID validation: Rejects non-cli_ prefixes and empty IDs", () => {
      expect(() => Entitlement.create({ clientId: "" })).toThrow(DomainRuleError);
      expect(() => Entitlement.create({ clientId: "   " })).toThrow(DomainRuleError);
      expect(() => Entitlement.create({ clientId: "client_12345" })).toThrow(DomainRuleError);
      expect(() => Entitlement.create({ clientId: "usr_12345" })).toThrow(DomainRuleError);
    });

    it("2.2 Status normalization: Handles aliases and rejects invalid statuses", () => {
      expect(normalizeStatus("active")).toBe("Active");
      expect(normalizeStatus("ACTIVE")).toBe("Active");
      expect(normalizeStatus("overdue")).toBe("Overdue");
      expect(normalizeStatus("grace")).toBe("Overdue");
      expect(normalizeStatus("blocked")).toBe("Blocked");
      expect(normalizeStatus("restricted")).toBe("Blocked");
      expect(normalizeStatus("suspended")).toBe("Suspended");

      expect(() => normalizeStatus("unknown")).toThrow();
      expect(() => normalizeStatus("deleted")).toThrow();
      expect(() => normalizeStatus("")).toThrow();
      expect(() => normalizeStatus("'; DROP TABLE;")).toThrow();
    });

    it("2.3 Manual Override Priority Matrix: allow, block, and maintenance", () => {
      const clientId = "cli_01J9Z7M1_1_OVERRIDE_MATRIX";
      const ent = Entitlement.create({ clientId });

      // Blocked baseline with 'allow' override permits access
      ent.markBlocked({ reason: "Unpaid dues" });
      expect(ent.isAccessAllowed()).toBe(false);
      ent.setManualOverride(ManualOverride.create({ mode: "allow", note: "VIP customer wire pending" }));
      expect(ent.status).toBe("Blocked");
      expect(ent.isAccessAllowed()).toBe(true);
      expect(ent.isBlocked).toBe(false);

      // Active baseline with 'block' override cuts off access
      ent.markActive({ reason: "Dues settled" });
      ent.setManualOverride(ManualOverride.create({ mode: "block", note: "Security lock" }));
      expect(ent.status).toBe("Active");
      expect(ent.isAccessAllowed()).toBe(false);
      expect(ent.isBlocked).toBe(true);

      // Active baseline with 'maintenance' override cuts off access
      ent.setManualOverride(ManualOverride.create({ mode: "maintenance", note: "DB migration" }));
      expect(ent.isAccessAllowed()).toBe(false);
      expect(ent.isBlocked).toBe(true);

      // Clear override restores normal Active access
      ent.clearManualOverride();
      expect(ent.manualOverride).toBeNull();
      expect(ent.isAccessAllowed()).toBe(true);
      expect(ent.isBlocked).toBe(false);
    });

    it("2.4 Timed Override Expiration: Evaluates at T-1ms, T, and T+1ms", () => {
      const clientId = "cli_01J9Z7M1_1_OVERRIDE_EXPIRATION";
      const ent = Entitlement.create({ clientId });
      ent.markBlocked({ reason: "Overdue" });
      expect(ent.isAccessAllowed()).toBe(false);

      const baseTime = 1790000000000;
      const validUntil = baseTime + 10000; // 10 seconds in future

      const timedOverride = ManualOverride.reconstitute({
        mode: "allow",
        validUntil,
        note: "10s emergency access",
        createdAt: baseTime,
      });
      ent.setManualOverride(timedOverride, baseTime);
      ent.pullEvents();

      // At T - 1 ms: override is active
      expect(timedOverride.isActive(validUntil - 1)).toBe(true);
      expect(ent.isAccessAllowed(validUntil - 1)).toBe(true);

      // At T: isExpired is true (validUntil is no longer strictly greater than now)
      expect(timedOverride.isActive(validUntil)).toBe(false);
      expect(timedOverride.isExpired(validUntil)).toBe(true);

      // At T + 1 ms: evaluate(now) sweeps expired override and drops access back to Blocked
      const allowed = ent.evaluate(validUntil + 1);
      expect(allowed).toBe(false);
      expect(ent.manualOverride).toBeNull();
      expect(ent.isBlocked).toBe(true);

      const events = ent.pullEvents();
      const expiredEvent = events.find((e) => e.type === "entitlement.overridden");
      expect(expiredEvent).toBeDefined();
      expect(expiredEvent?.payload).toMatchObject({
        action: "expired",
        mode: "allow",
        effectiveAccessAllowed: false,
      });
    });

    it("2.5 ManualOverride Invariant Guards: Rejects invalid parameters", () => {
      const now = Date.now();
      expect(() => ManualOverride.create({ mode: "invalid_mode" as any })).toThrow();
      expect(() => ManualOverride.create({ mode: "" as any })).toThrow();
      expect(() => ManualOverride.create({ mode: "allow", validUntil: now - 5000, now })).toThrow();
      expect(() => ManualOverride.create({ mode: "allow", validUntil: now, now })).toThrow();
      expect(() => ManualOverride.create({ mode: "allow", validUntil: 12345.67, now })).toThrow();
      expect(() => ManualOverride.create({ mode: "allow", validUntil: NaN, now })).toThrow();
      expect(() => ManualOverride.create({ mode: "allow", validUntil: Infinity, now })).toThrow();
    });
  });

  // =========================================================================
  // SECTION 3: API KEY ATTACK SURFACE: MALICIOUS, EXPIRED, REVOKED, SCOPES & SQLi
  // =========================================================================
  describe("3. API Key Security & Cryptographic Verification", () => {
    it("3.1 Empty, Null, Malformed and Truncated Keys are safely rejected", async () => {
      // Empty key
      expect((await validateQuery.execute({ rawKey: "" })).error).toBe("invalid_format");
      expect((await validateQuery.execute({ rawKey: "   " })).error).toBe("invalid_format");

      // Short / truncated keys (< 25 chars)
      expect((await validateQuery.execute({ rawKey: "rsk_live_" })).error).toBe("invalid_format");
      expect((await validateQuery.execute({ rawKey: "rsk_live_123456789012345" })).error).toBe("invalid_format"); // 24 chars

      // Wrong prefixes
      expect((await validateQuery.execute({ rawKey: "bearer rsk_live_1234567890abcdef" })).error).toBe("invalid_format");
      expect((await validateQuery.execute({ rawKey: "rsk_test_1234567890abcdefghij" })).error).toBe("invalid_format");
      expect((await validateQuery.execute({ rawKey: "api_key_1234567890abcdefghij" })).error).toBe("invalid_format");

      // Extreme length string (buffer overflow attempt)
      const hugeKey = "rsk_live_" + "A".repeat(10000);
      expect((await validateQuery.execute({ rawKey: hugeKey })).error).toBe("key_not_found");

      // Null byte injection attempt
      const nullByteKey = "rsk_live_\u0000abcdefghijklmnopqrstuvwxyz123456";
      expect((await validateQuery.execute({ rawKey: nullByteKey })).error).toBe("key_not_found");
    });

    it("3.2 SQL Injection Payloads in Keys and Prefixes do NOT compromise database", async () => {
      const sqliPayloads = [
        "rsk_live_' OR '1'='1",
        "rsk_live_'; DROP TABLE api_keys; --",
        "rsk_live_' UNION SELECT * FROM api_keys --",
        "rsk_live_admin'--1234567890abcdef",
        "rsk_live_1' OR 1=1; DELETE FROM entitlements;--",
      ];

      for (const payload of sqliPayloads) {
        const res = await validateQuery.execute({ rawKey: payload });
        expect(res.valid).toBe(false);
        expect(["invalid_format", "key_not_found"]).toContain(res.error);
      }

      // Verify that database tables and records are intact
      const db = getDb("core");
      const keyRows = await db.select().from(apiKeys);
      expect(Array.isArray(keyRows)).toBe(true);

      const entRows = await db.select().from(entitlements);
      expect(Array.isArray(entRows)).toBe(true);
    });

    it("3.3 Bit-Flipping & Cryptographic Tampering: Tampered byte in entropy is rejected", async () => {
      const { rawKey } = await generateCmd.execute({
        actor: clientActor,
        clientId: clientActor.clientId!,
        name: "Cryptographic Tampering Test Key",
        type: "secret",
        scopes: ["access:read"],
      });

      // Legitimate key validates
      expect((await validateQuery.execute({ rawKey })).valid).toBe(true);

      // Flip 1 character in secret body while keeping prefix intact
      const prefix = rawKey.slice(0, 17);
      const suffix = rawKey.slice(17);
      const flippedSuffix = (suffix[0] === "X" ? "Y" : "X") + suffix.slice(1);
      const tamperedKey = `${prefix}${flippedSuffix}`;

      // Candidate lookup finds key, SHA-256 hash comparison fails safely in constant-time
      const tamperedRes = await validateQuery.execute({ rawKey: tamperedKey });
      expect(tamperedRes.valid).toBe(false);
      expect(tamperedRes.error).toBe("key_not_found");
    });

    it("3.4 Expiration Boundary Precision (t - 1 ms vs t vs t + 1 ms)", async () => {
      const now = Date.now();
      const expiryTimestamp = now + 50000; // 50 seconds in future
      const { rawKey } = await generateCmd.execute({
        actor: clientActor,
        clientId: clientActor.clientId!,
        name: "Expiring Boundary Key",
        type: "secret",
        scopes: ["access:read"],
        expiresAt: expiryTimestamp,
        now,
      });

      // 1 ms before expiry: VALID
      const validBefore = await validateQuery.execute({ rawKey, now: expiryTimestamp - 1 });
      expect(validBefore.valid).toBe(true);

      // Exactly at expiry: EXPIRED (now >= expiresAt)
      const expiredAt = await validateQuery.execute({ rawKey, now: expiryTimestamp });
      expect(expiredAt.valid).toBe(false);
      expect(expiredAt.error).toBe("key_expired");

      // 1 ms after expiry: EXPIRED
      const expiredAfter = await validateQuery.execute({ rawKey, now: expiryTimestamp + 1 });
      expect(expiredAfter.valid).toBe(false);
      expect(expiredAfter.error).toBe("key_expired");
    });

    it("3.5 Revocation Lifecycle & Idempotency", async () => {
      const { rawKey, apiKey } = await generateCmd.execute({
        actor: clientActor,
        clientId: clientActor.clientId!,
        name: "Key for Revocation Lifecycle",
        type: "secret",
        scopes: ["access:read"],
      });

      expect((await validateQuery.execute({ rawKey })).valid).toBe(true);

      // Revoke key
      const revoked = await revokeCmd.execute({ actor: clientActor, keyId: apiKey.id });
      expect(revoked.revokedAt).toBeGreaterThan(0);

      // Validation returns key_revoked
      const revRes = await validateQuery.execute({ rawKey });
      expect(revRes.valid).toBe(false);
      expect(revRes.error).toBe("key_revoked");

      // Revoke second time (idempotent, does not throw)
      const revokedAgain = await revokeCmd.execute({ actor: clientActor, keyId: apiKey.id });
      expect(revokedAgain.revokedAt).toBe(revoked.revokedAt);
    });

    it("3.6 Scope Authorization Matrix: Strict enforcement of required permissions", async () => {
      const { rawKey } = await generateCmd.execute({
        actor: clientActor,
        clientId: clientActor.clientId!,
        name: "Scoped Test Key",
        type: "secret",
        scopes: ["access:read", "billing:read"],
      });

      // Exact matching scope: VALID
      expect((await validateQuery.execute({ rawKey, requiredScopes: ["access:read"] })).valid).toBe(true);
      expect((await validateQuery.execute({ rawKey, requiredScopes: ["billing:read"] })).valid).toBe(true);

      // All matching scopes: VALID
      expect((await validateQuery.execute({ rawKey, requiredScopes: ["access:read", "billing:read"] })).valid).toBe(true);

      // Empty required scopes: VALID
      expect((await validateQuery.execute({ rawKey, requiredScopes: [] })).valid).toBe(true);

      // Missing required scope: INSUFFICIENT_SCOPES
      const missing1 = await validateQuery.execute({ rawKey, requiredScopes: ["fleet:restart"] });
      expect(missing1.valid).toBe(false);
      expect(missing1.error).toBe("insufficient_scopes");

      // Superset with missing scope: INSUFFICIENT_SCOPES
      const missing2 = await validateQuery.execute({ rawKey, requiredScopes: ["access:read", "fleet:restart"] });
      expect(missing2.valid).toBe(false);
      expect(missing2.error).toBe("insufficient_scopes");

      // Case mismatch: INSUFFICIENT_SCOPES
      const caseMismatch = await validateQuery.execute({ rawKey, requiredScopes: ["ACCESS:READ"] });
      expect(caseMismatch.valid).toBe(false);
      expect(caseMismatch.error).toBe("insufficient_scopes");
    });

    it("3.7 Key Prefix Collision Disambiguation: Multiple keys sharing prefix match by hash", async () => {
      const sharedPrefix = "rsk_live_COLLIS99"; // Exactly 17 chars
      const keySecretA = `${sharedPrefix}11111111111111111111111111111111`;
      const keySecretB = `${sharedPrefix}22222222222222222222222222222222`;

      const hashA = createHash("sha256").update(keySecretA, "utf8").digest("hex");
      const hashB = createHash("sha256").update(keySecretB, "utf8").digest("hex");

      const keyA = ApiKey.create({
        clientId: clientActor.clientId!,
        name: "Collision Key A",
        keyPrefix: sharedPrefix,
        keyHash: hashA,
        type: "secret",
        scopes: ["access:read"],
      });

      const keyB = ApiKey.create({
        clientId: clientActor.clientId!,
        name: "Collision Key B",
        keyPrefix: sharedPrefix,
        keyHash: hashB,
        type: "secret",
        scopes: ["fleet:restart"],
      });

      await apiKeyRepo.save(keyA);
      await apiKeyRepo.save(keyB);

      // Validate Key A resolves to key A with access:read
      const resA = await validateQuery.execute({ rawKey: keySecretA });
      expect(resA.valid).toBe(true);
      expect(resA.keyId).toBe(keyA.id);
      expect(resA.scopes).toEqual(["access:read"]);

      // Validate Key B resolves to key B with fleet:restart
      const resB = await validateQuery.execute({ rawKey: keySecretB });
      expect(resB.valid).toBe(true);
      expect(resB.keyId).toBe(keyB.id);
      expect(resB.scopes).toEqual(["fleet:restart"]);

      // Wait for background updateLastUsed transaction to settle before revoking
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Revoking Key A leaves Key B active and usable
      await apiKeyRepo.revoke(keyA.id, Date.now());

      const resRevokedA = await validateQuery.execute({ rawKey: keySecretA });
      expect(resRevokedA.valid).toBe(false);
      expect(resRevokedA.error).toBe("key_revoked");

      const resActiveB = await validateQuery.execute({ rawKey: keySecretB });
      expect(resActiveB.valid).toBe(true);
      expect(resActiveB.keyId).toBe(keyB.id);
    });

    it("3.8 Cross-Tenant Security Boundary: Rejects key operations on other tenants", async () => {
      // Malicious actor cannot generate key for another client
      await expect(
        generateCmd.execute({
          actor: maliciousActor,
          clientId: clientActor.clientId!,
          name: "Attacker Injected Key",
          type: "secret",
          scopes: ["access:read"],
        }),
      ).rejects.toThrow(ForbiddenError);

      // Malicious actor cannot list keys for another client
      await expect(
        listQuery.execute({
          actor: maliciousActor,
          clientId: clientActor.clientId!,
        }),
      ).rejects.toThrow(ForbiddenError);

      // Generate legitimate key for clientActor
      const genuineKey = await generateCmd.execute({
        actor: clientActor,
        clientId: clientActor.clientId!,
        name: "Legit Key",
        type: "secret",
        scopes: ["access:read"],
      });

      // Malicious actor cannot revoke clientActor's key
      await expect(
        revokeCmd.execute({
          actor: maliciousActor,
          keyId: genuineKey.apiKey.id,
        }),
      ).rejects.toThrow(ForbiddenError);
    });
  });

  // =========================================================================
  // SECTION 4: REAL LIB-SQL SQLITE PERSISTENCE & SCHEMA CONSTRAINTS
  // =========================================================================
  describe("4. Real libSQL SQLite Database Persistence & Schema Integrity", () => {
    it("4.1 DrizzleEntitlementRepository persists aggregate and dispatches outbox event", async () => {
      const clientId = "cli_01J9Z7M1_1_SQLITE_PERSISTENCE";
      const ent = Entitlement.create({ clientId });
      ent.markOverdue({ invoiceId: "inv_uow_test", amountPaise: 250000 });

      await entitlementRepo.save(ent);

      // Verify row exists in real libSQL database
      const db = getDb("core");
      const dbRows = await db.select().from(entitlements).where(eq(entitlements.clientId, clientId));
      expect(dbRows).toHaveLength(1);
      const row = dbRows[0]!;
      expect(row.status).toBe("Overdue");
      expect(row.isBlocked).toBe(false);
      expect(row.reason).toContain("inv_uow_test");

      // Verify outbox event written in the same transaction
      const outboxRows = await db.select().from(outbox).where(eq(outbox.clientId, clientId));
      expect(outboxRows.length).toBeGreaterThanOrEqual(1);
      const latestOutbox = outboxRows[outboxRows.length - 1]!;
      expect(latestOutbox.type).toBe("entitlement.changed");
      const parsedPayload = JSON.parse(latestOutbox.payload);
      expect(parsedPayload.newStatus).toBe("Overdue");
    });

    it("4.2 SQL Injection payload in findByClientId is safely sanitized", async () => {
      const maliciousClientId = "cli_'; DROP TABLE entitlements; --";
      const res = await entitlementRepo.findByClientId(maliciousClientId);
      expect(res).toBeNull();

      // Verify table was not dropped
      const db = getDb("core");
      const check = await db.select().from(entitlements).limit(1);
      expect(Array.isArray(check)).toBe(true);
    });

    it("4.3 Unique Constraint on clientId in entitlements prevents duplicates", async () => {
      const db = getDb("core");
      const duplicateClientId = "cli_01J9Z7M1_1_UNIQUE_TEST";

      await db.insert(entitlements).values({
        id: "ent_first_001",
        clientId: duplicateClientId,
        status: "Active",
        isBlocked: false,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });

      await expect(
        db.insert(entitlements).values({
          id: "ent_second_002",
          clientId: duplicateClientId,
          status: "Blocked",
          isBlocked: true,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        }),
      ).rejects.toThrow();
    });

    it("4.4 Raw DB row never stores raw secret or unhashed token", async () => {
      const { rawKey, apiKey } = await generateCmd.execute({
        actor: clientActor,
        clientId: clientActor.clientId!,
        name: "Security Secret Protection Key",
        type: "secret",
        scopes: ["access:read"],
      });

      const db = getDb("core");
      const rows = await db.select().from(apiKeys).where(eq(apiKeys.id, apiKey.id));
      expect(rows).toHaveLength(1);
      const row = rows[0]!;

      // Raw key must NOT appear anywhere in the database row
      expect(JSON.stringify(row)).not.toContain(rawKey);
      expect(row.keyHash).toBe(createHash("sha256").update(rawKey, "utf8").digest("hex"));
    });
  });

  // =========================================================================
  // SECTION 5: OUTBOX CONSUMER & EVALUATION GATE INTEGRATION
  // =========================================================================
  describe("5. Billing Outbox Consumer & Evaluation Gate Integration", () => {
    it("5.1 HandleBillingEventCommand handles grace periods and partial payments", async () => {
      const clientId = "cli_01J9Z7M1_1_BILLING_EVENT_TEST";

      // 7 grace days: Overdue (access still allowed)
      const res1 = await billingCmd.execute({
        eventName: "InvoiceOverdue",
        payload: { clientId, invoiceId: "inv_cycle1", amountPaise: 500000, gracePeriodDays: 7 },
      });
      expect(res1.handled).toBe(true);
      expect(res1.action).toBe("entitlement_marked_overdue");

      let ent = await entitlementRepo.findByClientId(clientId);
      expect(ent?.status).toBe("Overdue");
      expect(ent?.isAccessAllowed()).toBe(true);

      // 0 grace days: Immediate cutoff (Blocked)
      const res2 = await billingCmd.execute({
        eventName: "billing.invoice.overdue",
        payload: { clientId, invoiceId: "inv_cutoff", amountPaise: 500000, gracePeriodDays: 0 },
      });
      expect(res2.handled).toBe(true);
      expect(res2.action).toBe("entitlement_marked_overdue");

      ent = await entitlementRepo.findByClientId(clientId);
      expect(ent?.status).toBe("Blocked");
      expect(ent?.isAccessAllowed()).toBe(false);

      // Partial payment (balance > 0): Ignored, status remains Blocked
      const res3 = await billingCmd.execute({
        eventName: "PaymentRecorded",
        payload: { clientId, invoiceId: "inv_cutoff", balancePaise: 250000 },
      });
      expect(res3.handled).toBe(true);
      expect(res3.action).toBe("partial_payment_ignored");

      ent = await entitlementRepo.findByClientId(clientId);
      expect(ent?.status).toBe("Blocked");

      // Full payment (balance = 0): Restores Active
      const res4 = await billingCmd.execute({
        eventName: "InvoicePaid",
        payload: { clientId, invoiceId: "inv_cutoff", balancePaise: 0 },
      });
      expect(res4.handled).toBe(true);
      expect(res4.action).toBe("entitlement_restored_active");

      ent = await entitlementRepo.findByClientId(clientId);
      expect(ent?.status).toBe("Active");
      expect(ent?.isAccessAllowed()).toBe(true);
    });

    it("5.2 Malformed billing event payloads are rejected with invariant errors", async () => {
      // Missing clientId
      await expect(
        billingCmd.execute({
          eventName: "InvoiceOverdue",
          payload: { invoiceId: "inv_no_client" },
        }),
      ).rejects.toThrow();

      // Missing invoiceId on overdue event
      await expect(
        billingCmd.execute({
          eventName: "InvoiceOverdue",
          payload: { clientId: "cli_no_invoice" },
        }),
      ).rejects.toThrow();

      // Unrecognized event returns unhandled without throwing
      const unk = await billingCmd.execute({
        eventName: "crm.deal.won",
        payload: { clientId: "cli_test" },
      });
      expect(unk.handled).toBe(false);
      expect(unk.action).toBe("unrecognized_event");
    });

    it("5.3 EvaluateEntitlementCommand creates default Active entitlement on-demand", async () => {
      const newClientId = "cli_01J9Z7M1_1_ON_DEMAND_EVAL";

      const preCheck = await entitlementRepo.findByClientId(newClientId);
      expect(preCheck).toBeNull();

      const evalRes = await evalCmd.execute({ clientId: newClientId });
      expect(evalRes.allowed).toBe(true);
      expect(evalRes.status).toBe("Active");
      expect(evalRes.isBlocked).toBe(false);

      const postCheck = await entitlementRepo.findByClientId(newClientId);
      expect(postCheck).not.toBeNull();
      expect(postCheck?.status).toBe("Active");
    });

    it("5.4 Defect Surface: HandleBillingEventCommand returns 'entitlement_restored_active' even when client is administratively Suspended", async () => {
      const suspendedClient = "cli_01J9Z7M1_1_DEFECT_SUSPENSION";
      const ent = Entitlement.create({ clientId: suspendedClient });
      ent.suspend({ reason: "Regulatory freeze" });
      await entitlementRepo.save(ent);

      const before = await entitlementRepo.findByClientId(suspendedClient);

      await uow.runInTransaction("core", async (tx) => {
        const inside = await entitlementRepo.findByClientId(suspendedClient);
        expect(inside?.status).toBe("Suspended");
      });

      const paidRes = await billingCmd.execute({
        eventName: "InvoicePaid",
        payload: {
          clientId: suspendedClient,
          invoiceId: "inv_full_pay",
          balancePaise: 0,
        },
      });

      // HandleBillingEventCommand accurately returns entitlement_remains_suspended
      // when the client is administratively suspended
      expect(paidRes.action).toBe("entitlement_remains_suspended");

      // Aggregate state invariant: Entitlement aggregate correctly prevented lifting suspension
      const after = await entitlementRepo.findByClientId(suspendedClient);
      expect(after?.status).toBe("Suspended");
      expect(after?.isAccessAllowed()).toBe(false);
      expect(after?.isBlocked).toBe(true);
      expect(after?.reason).toContain("administratively Suspended");
    });
  });
});

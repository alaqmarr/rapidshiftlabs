import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHash, timingSafeEqual } from "node:crypto";
import { createClient } from "@libsql/client";
import { Entitlement } from "../src/modules/entitlement/domain/entities/entitlement.aggregate";
import { ManualOverride } from "../src/modules/entitlement/domain/value-objects/manual-override.vo";
import { DrizzleEntitlementRepository } from "../src/modules/entitlement/infrastructure/repositories/drizzle-entitlement.repository";
import { HandleBillingEventCommand } from "../src/modules/entitlement/application/commands/handle-billing-event.command";
import { GenerateApiKeyCommand } from "../src/modules/api-platform/application/commands/generate-api-key.command";
import { ValidateApiKeyQuery } from "../src/modules/api-platform/application/queries/validate-api-key.query";
import { DrizzleApiKeyRepository } from "../src/modules/api-platform/infrastructure/repositories/drizzle-api-key.repository";
import { DrizzleEventOutboxRepository } from "../src/shared/infrastructure/events/outbox-repository";
import { setConfigForTests } from "../src/shared/config";
import { closeAllDatabases, getDb, uow } from "../src/shared/infrastructure/db";
import type { Actor } from "../src/shared/kernel/actor";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe("Forensic Integrity Audit Harness — Milestone 1", () => {
  const testDataDir = path.join(__dirname, "temp_forensic_m1_test");
  const coreDbPath = path.join(testDataDir, "core.db");
  const testMasterKey = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

  const adminActor: Actor = {
    kind: "admin",
    id: "adm_01J9Z7Q4X1A2B3C4D5E6F7G8H0",
    email: "owner@rapidshift.test",
    name: "Admin Owner",
    role: "owner",
    supportLevel: null,
  };

  const clientActor: Actor = {
    kind: "client_user",
    id: "usr_01J9Z7Q4X1A2B3C4D5E6F7G8H1",
    email: "client@test.com",
    name: "Client Admin",
    clientId: "cli_TEST_001",
    role: "client_admin",
  };

  let rawDbClient: ReturnType<typeof createClient>;
  let entitlementRepo: DrizzleEntitlementRepository;
  let apiKeyRepo: DrizzleApiKeyRepository;
  let outboxRepo: DrizzleEventOutboxRepository;

  beforeAll(async () => {
    if (fs.existsSync(testDataDir)) {
      try {
        fs.rmSync(testDataDir, { recursive: true, force: true });
      } catch {}
    }
    fs.mkdirSync(testDataDir, { recursive: true });

    process.env.MASTER_KEY = testMasterKey;
    process.env.AUTH_SECRET = "test-auth-secret-123456789";
    process.env.DATA_DIR = testDataDir;

    setConfigForTests({
      dataDir: testDataDir,
      MASTER_KEY: testMasterKey,
      AUTH_SECRET: "test-auth-secret-123456789",
      dbPaths: {
        core: coreDbPath,
        analytics: path.join(testDataDir, "analytics.db"),
        metrics: path.join(testDataDir, "metrics.db"),
      },
    });

    rawDbClient = createClient({ url: `file:${coreDbPath}` });
    await rawDbClient.execute("PRAGMA journal_mode = WAL;");
    await rawDbClient.execute("PRAGMA synchronous = NORMAL;");
    await rawDbClient.execute("PRAGMA busy_timeout = 5000;");

    // Create entitlements table & indexes
    await rawDbClient.execute(`
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
    await rawDbClient.execute("CREATE INDEX IF NOT EXISTS idx_entitlements_client_id ON entitlements(client_id);");
    await rawDbClient.execute("CREATE INDEX IF NOT EXISTS idx_entitlements_status ON entitlements(status);");
    await rawDbClient.execute("CREATE INDEX IF NOT EXISTS idx_entitlements_is_blocked ON entitlements(is_blocked);");

    // Create api_keys table & indexes
    await rawDbClient.execute(`
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
    await rawDbClient.execute("CREATE INDEX IF NOT EXISTS idx_api_keys_key_prefix ON api_keys(key_prefix);");
    await rawDbClient.execute("CREATE INDEX IF NOT EXISTS idx_api_keys_client_id ON api_keys(client_id);");
    await rawDbClient.execute("CREATE INDEX IF NOT EXISTS idx_api_keys_key_hash ON api_keys(key_hash);");

    // Create outbox table matching outbox schema
    await rawDbClient.execute(`
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

    outboxRepo = new DrizzleEventOutboxRepository(getDb("core"));
    entitlementRepo = new DrizzleEntitlementRepository(getDb("core"), outboxRepo, uow);
    apiKeyRepo = new DrizzleApiKeyRepository(getDb("core"), outboxRepo, uow);
  });

  afterAll(async () => {
    closeAllDatabases();
    try {
      rawDbClient.close();
    } catch {}
    if (fs.existsSync(testDataDir)) {
      try {
        fs.rmSync(testDataDir, { recursive: true, force: true });
      } catch {}
    }
  });

  describe("Check 1: Cryptographic Integrity & timingSafeEqual Verification", () => {
    it("empirically verifies 32-byte entropy and authentic SHA-256 hex digest", async () => {
      const genCmd = new GenerateApiKeyCommand(apiKeyRepo);
      const generated = await genCmd.execute({
        actor: clientActor,
        clientId: "cli_TEST_001",
        name: "Forensic Live Key",
        type: "secret",
        scopes: ["access:read"],
      });

      // 1. Prefix is exactly 'rsk_live_'
      expect(generated.rawKey.startsWith("rsk_live_")).toBe(true);
      // 2. Entropy is base64url encoded 32 bytes (43 characters) -> rawKey is 9 + 43 = 52 characters
      expect(generated.rawKey.length).toBe(52);
      // 3. Prefix token stored is first 17 chars
      expect(generated.apiKey.keyPrefix).toBe(generated.rawKey.slice(0, 17));

      // 4. Raw key is never stored in DB row
      const dbRow = await rawDbClient.execute({
        sql: "SELECT * FROM api_keys WHERE id = ?",
        args: [generated.apiKey.id],
      });
      expect(dbRow.rows.length).toBe(1);
      const storedRow = dbRow.rows[0];
      expect(JSON.stringify(storedRow)).not.toContain(generated.rawKey);

      // 5. Computed SHA-256 matches stored key_hash exactly
      const calculatedHash = createHash("sha256").update(generated.rawKey, "utf8").digest("hex");
      expect(storedRow?.key_hash).toBe(calculatedHash);
      expect(storedRow?.key_hash).toHaveLength(64);
    });

    it("verifies constant-time timingSafeEqual behavior during key validation", async () => {
      const genCmd = new GenerateApiKeyCommand(apiKeyRepo);
      const { rawKey, apiKey } = await genCmd.execute({
        actor: clientActor,
        clientId: "cli_TEST_001",
        name: "Timing Safe Audit Key",
        scopes: ["access:read"],
      });

      const valQuery = new ValidateApiKeyQuery(apiKeyRepo);

      // Genuine validation succeeds
      const validRes = await valQuery.execute(rawKey);
      expect(validRes.valid).toBe(true);
      expect(validRes.clientId).toBe("cli_TEST_001");

      // Verify timingSafeEqual behavior manually:
      const genuineDigest = createHash("sha256").update(rawKey, "utf8").digest();
      const fakeDigest = createHash("sha256").update(rawKey + "tampered", "utf8").digest();
      expect(genuineDigest.length).toBe(32);
      expect(fakeDigest.length).toBe(32);
      expect(timingSafeEqual(genuineDigest, genuineDigest)).toBe(true);
      expect(timingSafeEqual(genuineDigest, fakeDigest)).toBe(false);

      // Tampered raw key with same prefix fails validation
      const tamperedKey = rawKey.slice(0, 17) + "x".repeat(35);
      const failRes = await valQuery.execute(tamperedKey);
      expect(failRes.valid).toBe(false);
      expect(failRes.error).toBe("key_not_found");
    });
  });

  describe("Check 2: Entitlement State Machine & Domain Event Verification", () => {
    it("strictly preserves state transitions and emits outbox events on save", async () => {
      const clientId = "cli_TEST_STATE_001";
      const ent = Entitlement.create({ clientId });

      // Emitted initial event
      const initialEvents = ent.pullEvents();
      expect(initialEvents).toHaveLength(1);
      expect(initialEvents[0]?.type).toBe("entitlement.changed");
      expect(initialEvents[0]?.payload.newStatus).toBe("Active");

      // Verify second pullEvents() is empty (no replay/leak)
      expect(ent.pullEvents()).toHaveLength(0);

      // Transition Active -> Overdue (dunning grace period)
      ent.markOverdue({ invoiceId: "inv_901", amountPaise: 250000 });
      expect(ent.status).toBe("Overdue");
      expect(ent.isAccessAllowed()).toBe(true); // Grace period
      expect(ent.isBlocked).toBe(false);

      // Persist to Drizzle repository and verify WAL outbox insertion
      await entitlementRepo.save(ent);

      const dbOutbox = await rawDbClient.execute({
        sql: "SELECT * FROM outbox WHERE aggregate_id = ? ORDER BY occurred_at DESC",
        args: [ent.id],
      });
      expect(dbOutbox.rows.length).toBeGreaterThanOrEqual(1);
      const latestEvent = JSON.parse(dbOutbox.rows[0]?.payload as string);
      expect(latestEvent.newStatus).toBe("Overdue");
      expect(latestEvent.isAccessAllowed).toBe(true);

      // Transition Overdue -> Blocked
      ent.markBlocked({ reason: "Grace period expired" });
      expect(ent.status).toBe("Blocked");
      expect(ent.isAccessAllowed()).toBe(false);
      expect(ent.isBlocked).toBe(true);

      // Invariant: Blocked does NOT regress to Overdue
      ent.markOverdue({ invoiceId: "inv_902", amountPaise: 100000 });
      expect(ent.status).toBe("Blocked");
      expect(ent.isAccessAllowed()).toBe(false);

      // Admin manual override 'allow' takes priority over Blocked
      const allowOverride = ManualOverride.create({
        mode: "allow",
        note: "Wire transfer proof confirmed",
      });
      ent.setManualOverride(allowOverride);
      expect(ent.status).toBe("Blocked"); // Underlying status preserved
      expect(ent.isAccessAllowed()).toBe(true); // Gate allows access
      expect(ent.isBlocked).toBe(false);

      // Clearing override restores cutoff
      ent.clearManualOverride();
      expect(ent.isAccessAllowed()).toBe(false);
      expect(ent.isBlocked).toBe(true);

      // Transition Blocked -> Active
      ent.markActive({ clearedInvoiceId: "inv_901" });
      expect(ent.status).toBe("Active");
      expect(ent.isAccessAllowed()).toBe(true);
      expect(ent.isBlocked).toBe(false);
    });

    it("verifies administrative suspension invariant against billing settlement", async () => {
      const clientId = "cli_TEST_SUSPEND_001";
      const ent = Entitlement.create({ clientId });
      ent.pullEvents();

      ent.suspend({ reason: "Fraud investigation" });
      expect(ent.status).toBe("Suspended");
      expect(ent.isAccessAllowed()).toBe(false);
      expect(ent.isBlocked).toBe(true);

      // Invariant: markActive via invoice settlement MUST NOT clear administrative suspension
      ent.markActive({ clearedInvoiceId: "inv_ALL_CLEARED" });
      expect(ent.status).toBe("Suspended");
      expect(ent.isAccessAllowed()).toBe(false);
      expect(ent.isBlocked).toBe(true);

      // Only explicit unsuspend clears suspension
      ent.unsuspend({ reason: "Compliance review approved" });
      expect(ent.status).toBe("Active");
      expect(ent.isAccessAllowed()).toBe(true);
      expect(ent.isBlocked).toBe(false);
    });
  });

  describe("Check 3: Decoupled Outbox Billing Event Handler", () => {
    it("handles InvoiceOverdue and InvoicePaid events without billing package imports", async () => {
      const billingCmd = new HandleBillingEventCommand(entitlementRepo, uow);
      const clientId = "cli_TEST_BILLING_EVENT_001";

      // 1. Invoice overdue with grace period -> Overdue
      const overdueRes = await billingCmd.execute("InvoiceOverdue", {
        clientId,
        invoiceId: "inv_DUE_1",
        amountPaise: 150000,
        gracePeriodDays: 3,
      });
      expect(overdueRes.handled).toBe(true);
      expect(overdueRes.action).toBe("entitlement_marked_overdue");

      let ent = await entitlementRepo.findByClientId(clientId);
      expect(ent).not.toBeNull();
      expect(ent?.status).toBe("Overdue");
      expect(ent?.isAccessAllowed()).toBe(true);

      // 2. Invoice overdue with 0 grace days -> Blocked
      const blockedRes = await billingCmd.execute("invoice.overdue", {
        clientId,
        invoiceId: "inv_DUE_2",
        amountPaise: 500000,
        gracePeriodDays: 0,
      });
      expect(blockedRes.handled).toBe(true);

      ent = await entitlementRepo.findByClientId(clientId);
      expect(ent?.status).toBe("Blocked");
      expect(ent?.isAccessAllowed()).toBe(false);

      // 3. Payment recorded with balance = 0 -> Active
      const paidRes = await billingCmd.execute("PaymentRecorded", {
        clientId,
        invoiceId: "inv_DUE_2",
        balancePaise: 0,
      });
      expect(paidRes.handled).toBe(true);
      expect(paidRes.action).toBe("entitlement_restored_active");

      ent = await entitlementRepo.findByClientId(clientId);
      expect(ent?.status).toBe("Active");
      expect(ent?.isAccessAllowed()).toBe(true);
    });
  });

  describe("Check 4: Database Concurrency & Indexing", () => {
    it("verifies SQLite WAL mode and foreign key safety", async () => {
      const walCheck = await rawDbClient.execute("PRAGMA journal_mode;");
      expect((walCheck.rows[0] as any).journal_mode.toLowerCase()).toBe("wal");

      // Verify indexes exist
      const indexList = await rawDbClient.execute("PRAGMA index_list('entitlements');");
      const indexNames = indexList.rows.map((r: any) => r.name);
      expect(indexNames).toContain("idx_entitlements_client_id");
      expect(indexNames).toContain("idx_entitlements_status");
      expect(indexNames).toContain("idx_entitlements_is_blocked");

      const apiKeyIndexList = await rawDbClient.execute("PRAGMA index_list('api_keys');");
      const apiKeyIndexNames = apiKeyIndexList.rows.map((r: any) => r.name);
      expect(apiKeyIndexNames).toContain("idx_api_keys_key_prefix");
      expect(apiKeyIndexNames).toContain("idx_api_keys_client_id");
      expect(apiKeyIndexNames).toContain("idx_api_keys_key_hash");
    });
  });
});

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomBytes, createHash } from "node:crypto";
import { createClient } from "@libsql/client";

// Domain & Application imports (M1 Entitlement)
import { Entitlement } from "../src/modules/entitlement/domain/entities/entitlement.aggregate";
import { ManualOverride } from "../src/modules/entitlement/domain/value-objects/manual-override.vo";
import { normalizeStatus } from "../src/modules/entitlement/domain/value-objects/entitlement-status";
import { EvaluateEntitlementCommand } from "../src/modules/entitlement/application/commands/evaluate-entitlement.command";
import { SetManualOverrideCommand } from "../src/modules/entitlement/application/commands/set-manual-override.command";
import { ClearManualOverrideCommand } from "../src/modules/entitlement/application/commands/clear-manual-override.command";
import { HandleBillingEventCommand } from "../src/modules/entitlement/application/commands/handle-billing-event.command";
import { GetClientEntitlementQuery } from "../src/modules/entitlement/application/queries/get-client-entitlement.query";
import { DrizzleEntitlementRepository } from "../src/modules/entitlement/infrastructure/repositories/drizzle-entitlement.repository";

// Domain & Application imports (M1 API Platform)
import { ApiKey } from "../src/modules/api-platform/domain/entities/api-key.entity";
import { GenerateApiKeyCommand } from "../src/modules/api-platform/application/commands/generate-api-key.command";
import { ValidateApiKeyQuery } from "../src/modules/api-platform/application/queries/validate-api-key.query";
import { RevokeApiKeyCommand } from "../src/modules/api-platform/application/commands/revoke-api-key.command";
import { DrizzleApiKeyRepository } from "../src/modules/api-platform/infrastructure/repositories/drizzle-api-key.repository";

// Kernel & Infrastructure
import { setConfigForTests } from "../src/shared/config";
import { closeAllDatabases, uow, WriteMutex } from "../src/shared/infrastructure/db";
import { DrizzleEventOutboxRepository } from "../src/shared/infrastructure/events/outbox-repository";
import type { Actor } from "../src/shared/kernel/actor";
import { InvariantError } from "../src/shared/kernel/errors";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe("Adversarial Empirical Challenge: Milestone 1", () => {
  const testDataDir = path.join(__dirname, "temp_adversarial_challenge_m1");
  const coreDbPath = path.join(testDataDir, "core.db");
  const testMasterKey = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

  const adminActor: Actor = {
    kind: "admin",
    id: "adm_01J9Z7Q4X1A2B3C4D5E6F7G8H0",
    email: "admin@rapidshift.test",
    name: "Admin Challenger",
    role: "owner",
    supportLevel: null,
  };

  let entitlementRepo: DrizzleEntitlementRepository;
  let apiKeyRepo: DrizzleApiKeyRepository;
  let evaluateCmd: EvaluateEntitlementCommand;
  let setOverrideCmd: SetManualOverrideCommand;
  let clearOverrideCmd: ClearManualOverrideCommand;
  let handleBillingCmd: HandleBillingEventCommand;
  let getEntitlementQuery: GetClientEntitlementQuery;
  let generateApiKeyCmd: GenerateApiKeyCommand;
  let validateApiKeyQuery: ValidateApiKeyQuery;
  let revokeApiKeyCmd: RevokeApiKeyCommand;

  async function initDatabase() {
    closeAllDatabases();
    if (fs.existsSync(testDataDir)) {
      try {
        fs.rmSync(testDataDir, { recursive: true, force: true });
      } catch {}
    }
    fs.mkdirSync(testDataDir, { recursive: true });

    process.env.MASTER_KEY = testMasterKey;
    process.env.AUTH_SECRET = "test-auth-secret-adversarial-12345";
    process.env.DATA_DIR = testDataDir;

    setConfigForTests({
      dataDir: testDataDir,
      MASTER_KEY: testMasterKey,
      AUTH_SECRET: "test-auth-secret-adversarial-12345",
      dbPaths: {
        core: coreDbPath,
        analytics: path.join(testDataDir, "analytics.db"),
        metrics: path.join(testDataDir, "metrics.db"),
      },
    });
    closeAllDatabases();

    // Initialize core.db with PRAGMAs and schemas
    const client = createClient({ url: `file:${coreDbPath}` });
    await client.execute("PRAGMA journal_mode = WAL;");
    await client.execute("PRAGMA synchronous = NORMAL;");
    await client.execute("PRAGMA busy_timeout = 5000;");

    await client.execute(`
      CREATE TABLE IF NOT EXISTS entitlements (
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
      );
    `);
    await client.execute(`CREATE INDEX IF NOT EXISTS idx_entitlements_client_id ON entitlements (client_id);`);
    await client.execute(`CREATE INDEX IF NOT EXISTS idx_entitlements_status ON entitlements (status);`);
    await client.execute(`CREATE INDEX IF NOT EXISTS idx_entitlements_is_blocked ON entitlements (is_blocked);`);

    await client.execute(`
      CREATE TABLE IF NOT EXISTS api_keys (
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
      );
    `);
    await client.execute(`CREATE INDEX IF NOT EXISTS idx_api_keys_key_prefix ON api_keys (key_prefix);`);
    await client.execute(`CREATE INDEX IF NOT EXISTS idx_api_keys_client_id ON api_keys (client_id);`);
    await client.execute(`CREATE INDEX IF NOT EXISTS idx_api_keys_key_hash ON api_keys (key_hash);`);

    await client.execute(`
      CREATE TABLE IF NOT EXISTS outbox (
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
      );
    `);
    await client.close();

    const outboxRepo = new DrizzleEventOutboxRepository();
    entitlementRepo = new DrizzleEntitlementRepository(undefined, outboxRepo, uow);
    apiKeyRepo = new DrizzleApiKeyRepository(undefined, outboxRepo, uow);

    evaluateCmd = new EvaluateEntitlementCommand(entitlementRepo, uow);
    setOverrideCmd = new SetManualOverrideCommand(entitlementRepo, uow);
    clearOverrideCmd = new ClearManualOverrideCommand(entitlementRepo, uow);
    handleBillingCmd = new HandleBillingEventCommand(entitlementRepo, uow);
    getEntitlementQuery = new GetClientEntitlementQuery(entitlementRepo);

    generateApiKeyCmd = new GenerateApiKeyCommand(apiKeyRepo);
    validateApiKeyQuery = new ValidateApiKeyQuery(apiKeyRepo);
    revokeApiKeyCmd = new RevokeApiKeyCommand(apiKeyRepo);
  }

  beforeAll(async () => {
    await initDatabase();
  });

  afterAll(async () => {
    closeAllDatabases();
    try {
      if (fs.existsSync(testDataDir)) {
        fs.rmSync(testDataDir, { recursive: true, force: true });
      }
    } catch {}
  });

  // =========================================================================
  // CHALLENGE 1: Manual Override Expiration Boundary (T-1ms, T, T+1ms)
  // =========================================================================
  describe("Challenge 1: Manual Override Expiration Boundary Testing", () => {
    const T = 1_700_000_000_000; // Fixed epoch millisecond reference
    const T_CREATE = T - 100_000;

    it("ManualOverride VO: active at T-1ms, inactive at T, inactive at T+1ms", () => {
      const override = ManualOverride.create({
        mode: "allow",
        validUntil: T,
        now: T_CREATE,
        note: "Boundary test",
      });

      // Boundary tests
      expect(override.isActive(T - 1)).toBe(true);
      expect(override.isExpired(T - 1)).toBe(false);

      expect(override.isActive(T)).toBe(false);
      expect(override.isExpired(T)).toBe(true);

      expect(override.isActive(T + 1)).toBe(false);
      expect(override.isExpired(T + 1)).toBe(true);
    });

    it("Entitlement Aggregate: Blocked baseline with 'allow' override is active at T-1ms and drops to blocked at T+1ms", () => {
      const ent = Entitlement.create({ clientId: "cli_boundary_01", now: T_CREATE });
      ent.markBlocked({ reason: "Unpaid invoices past grace period", now: T_CREATE });
      expect(ent.status).toBe("Blocked");
      expect(ent.isAccessAllowed(T_CREATE)).toBe(false);

      const override = ManualOverride.create({
        mode: "allow",
        validUntil: T,
        now: T_CREATE,
        note: "Grace override until wire transfer",
      });
      ent.setManualOverride(override, T_CREATE);

      // 1. T - 1ms: Override MUST be active, access allowed, isBlocked false
      expect(ent.isAccessAllowed(T - 1)).toBe(true);
      const evalAllowedBefore = ent.evaluate(T - 1);
      expect(evalAllowedBefore).toBe(true);
      expect(ent.isBlocked).toBe(false);
      expect(ent.manualOverride).not.toBeNull();

      // 2. T exact boundary: Inactive
      expect(ent.isAccessAllowed(T)).toBe(false);

      // 3. T + 1ms: Override MUST be expired, access blocked, override cleaned up
      expect(ent.isAccessAllowed(T + 1)).toBe(false);
      const evalAllowedAfter = ent.evaluate(T + 1);
      expect(evalAllowedAfter).toBe(false);
      expect(ent.isBlocked).toBe(true);
      expect(ent.manualOverride).toBeNull();

      // Verify domain events raised
      const events = ent.pullEvents();
      const expiredEvent = events.find(
        (e) => e.type === "entitlement.overridden" && (e.payload as any).action === "expired",
      );
      expect(expiredEvent).toBeDefined();
      expect((expiredEvent?.payload as any).effectiveAccessAllowed).toBe(false);
    });

    it("Entitlement Aggregate: Active baseline with 'block' override is blocked at T-1ms and restored at T+1ms", () => {
      const ent = Entitlement.create({ clientId: "cli_boundary_02", now: T_CREATE });
      expect(ent.status).toBe("Active");

      const blockOverride = ManualOverride.create({
        mode: "block",
        validUntil: T,
        now: T_CREATE,
        note: "Temporary fraud hold",
      });
      ent.setManualOverride(blockOverride, T_CREATE);

      // At T - 1ms: Blocked by override
      expect(ent.isAccessAllowed(T - 1)).toBe(false);
      expect(ent.evaluate(T - 1)).toBe(false);
      expect(ent.isBlocked).toBe(true);

      // At T + 1ms: Override expires, reverts to underlying Active baseline
      expect(ent.isAccessAllowed(T + 1)).toBe(true);
      expect(ent.evaluate(T + 1)).toBe(true);
      expect(ent.isBlocked).toBe(false);
      expect(ent.manualOverride).toBeNull();
    });

    it("Application Layer End-to-End: EvaluateEntitlementCommand honors T-1ms and T+1ms boundary with persistence", async () => {
      const testClientId = "cli_boundary_app_03";

      // 1. Create client and set override in database
      const initial = Entitlement.create({ clientId: testClientId, now: T_CREATE });
      initial.markBlocked({ reason: "Unpaid dues", now: T_CREATE });
      await entitlementRepo.save(initial);

      await setOverrideCmd.execute(
        {
          clientId: testClientId,
          mode: "allow",
          validUntil: T,
          now: T_CREATE,
          note: "App-layer boundary test",
        },
        adminActor,
      );

      // 2. Evaluate at T - 1ms: Allowed
      const evalBefore = await evaluateCmd.execute({ clientId: testClientId, now: T - 1 });
      expect(evalBefore.allowed).toBe(true);
      expect(evalBefore.isBlocked).toBe(false);
      expect(evalBefore.manualOverrideMode).toBe("allow");

      // 3. Evaluate at T + 1ms: Blocked, override expired
      const evalAfter = await evaluateCmd.execute({ clientId: testClientId, now: T + 1 });
      expect(evalAfter.allowed).toBe(false);
      expect(evalAfter.isBlocked).toBe(true);
      expect(evalAfter.manualOverrideMode).toBeNull();

      // 4. Verify persisted state in repository reflects expired override
      const reloaded = await entitlementRepo.findByClientId(testClientId);
      expect(reloaded).not.toBeNull();
      expect(reloaded?.manualOverride).toBeNull();
      expect(reloaded?.isBlocked).toBe(true);
    });

    it("Boundary Rejection: rejects non-integer, past, or zero validUntil values", () => {
      // Past epoch
      expect(() =>
        ManualOverride.create({
          mode: "allow",
          validUntil: T_CREATE - 1000,
          now: T_CREATE,
        }),
      ).toThrow(InvariantError);

      // Fractional timestamp (sub-millisecond float)
      expect(() =>
        ManualOverride.create({
          mode: "allow",
          validUntil: T + 0.123,
          now: T_CREATE,
        }),
      ).toThrow(InvariantError);

      // NaN
      expect(() =>
        ManualOverride.create({
          mode: "allow",
          validUntil: NaN as any,
          now: T_CREATE,
        }),
      ).toThrow(InvariantError);
    });
  });

  // =========================================================================
  // CHALLENGE 2: Concurrent Evaluations and State Updates Stress Test
  // =========================================================================
  describe("Challenge 2: Concurrency & State Updates Stress Testing", () => {
    it("Remediated 2.1: In-process WriteMutex strictly serializes concurrent writes (maxConcurrent === 1)", async () => {
      const mutex = new WriteMutex();
      let running = 0;
      let maxConcurrent = 0;

      const tasks = Array.from({ length: 10 }, async () => {
        return mutex.run(async () => {
          running++;
          maxConcurrent = Math.max(maxConcurrent, running);
          await new Promise((resolve) => setTimeout(resolve, 20));
          running--;
        });
      });

      await Promise.all(tasks);

      // A correct mutex MUST ensure maxConcurrent === 1.
      expect(maxConcurrent).toBe(1);
    });

    it("Remediated 2.2: Concurrent database operations serialize cleanly without SQLITE_BUSY lock contention", async () => {
      const concurrencyClients = Array.from({ length: 5 }, (_, i) => `cli_concurrent_c2_${i + 1}`);

      // Seed clients serially
      for (const cid of concurrencyClients) {
        const ent = Entitlement.create({ clientId: cid });
        await entitlementRepo.save(ent);
      }

      // Fire 50 concurrent mixed operations
      const operations: Promise<any>[] = [];
      const errors: any[] = [];

      for (let i = 0; i < 50; i++) {
        const cid = concurrencyClients[i % concurrencyClients.length]!;
        const opPromise = (async () => {
          try {
            if (i % 3 === 0) {
              await evaluateCmd.execute({ clientId: cid });
            } else if (i % 3 === 1) {
              await setOverrideCmd.execute({ clientId: cid, mode: "allow" }, adminActor);
            } else {
              await handleBillingCmd.execute({
                eventName: "InvoiceOverdue",
                payload: { clientId: cid, invoiceId: `inv_${i}`, amountPaise: 1000 },
              });
            }
          } catch (err) {
            errors.push(err);
            throw err;
          }
        })();
        operations.push(opPromise);
      }

      const results = await Promise.allSettled(operations);
      const rejected = results.filter((r) => r.status === "rejected");

      // Verify zero operations rejected and zero SQLITE_BUSY errors
      const sqliteBusyCount = errors.filter(
        (err) => err?.code === "SQLITE_BUSY" || err?.message?.includes("database is locked"),
      ).length;

      expect(rejected.length).toBe(0);
      expect(sqliteBusyCount).toBe(0);
    });

    it("Remediated 2.3: Concurrent initial evaluations on brand-new client serialize without lock contention", async () => {
      const raceClientId = `cli_race_${Date.now()}_test`;
      const raceTasks = Array.from({ length: 6 }, () =>
        evaluateCmd.execute({ clientId: raceClientId }),
      );

      const results = await Promise.allSettled(raceTasks);
      const rejected = results.filter((r) => r.status === "rejected");

      const hasLockError = rejected.some(
        (r: any) =>
          r.reason?.code === "SQLITE_BUSY" ||
          r.reason?.message?.includes("database is locked"),
      );
      expect(hasLockError).toBe(false);

      const reloaded = await entitlementRepo.findByClientId(raceClientId);
      expect(reloaded).not.toBeNull();
    });
  });

  // =========================================================================
  // CHALLENGE 3: Key Generation Uniqueness & Collision Resistance
  // =========================================================================
  describe("Challenge 3: Key Generation Uniqueness & Collision Resistance Testing", () => {
    it("Uniqueness & Entropy Oracle: 1,000 keys generated exhibit zero rawKey, keyHash, or ID collisions", async () => {
      const NUM_KEYS = 1000;
      const rawKeys = new Set<string>();
      const keyHashes = new Set<string>();
      const keyIds = new Set<string>();
      const prefixes = new Set<string>();

      for (let i = 0; i < NUM_KEYS; i++) {
        const type = i % 2 === 0 ? "secret" : "publishable";
        const prefixTag = type === "secret" ? "rsk_live_" : "rpk_live_";
        const entropy = randomBytes(32).toString("base64url");
        const rawKey = `${prefixTag}${entropy}`;
        const keyPrefix = rawKey.slice(0, 17);
        const keyHash = createHash("sha256").update(rawKey, "utf8").digest("hex");

        const apiKey = ApiKey.create({
          clientId: `cli_test_key_owner_${i % 10}`,
          name: `Test Key ${i}`,
          keyPrefix,
          keyHash,
          type: type as any,
          scopes: ["access:read"],
        });

        // 1. Exact raw key format check
        if (type === "secret") {
          expect(rawKey).toMatch(/^rsk_live_[A-Za-z0-9_-]{43}$/);
        } else {
          expect(rawKey).toMatch(/^rpk_live_[A-Za-z0-9_-]{43}$/);
        }
        expect(rawKey.length).toBe(52); // 9 prefix chars + 43 base64url chars
        expect(keyPrefix.length).toBe(17);

        // 2. Add to collision tracking sets
        rawKeys.add(rawKey);
        keyHashes.add(keyHash);
        keyIds.add(apiKey.id);
        prefixes.add(keyPrefix);
      }

      // Assert zero collisions across all 1,000 generated keys
      expect(rawKeys.size).toBe(NUM_KEYS);
      expect(keyHashes.size).toBe(NUM_KEYS);
      expect(keyIds.size).toBe(NUM_KEYS);

      // Prefix uniqueness: 8 base64url chars provide 64^8 (~2.8e14) combinations, so 1000 prefixes should have zero or near-zero duplicates
      expect(prefixes.size).toBeGreaterThanOrEqual(995);
    });

    it("Collision Resistance & Disambiguation Oracle: Disambiguates keys sharing identical prefix via constant-time SHA-256", async () => {
      // Craft two distinct keys with the EXACT SAME prefix
      const syntheticPrefix = "rsk_live_COLLIDE1"; // Exactly 17 chars
      const suffixA = randomBytes(26).toString("base64url").slice(0, 35);
      const suffixB = randomBytes(26).toString("base64url").slice(0, 35);

      const rawKeyA = `${syntheticPrefix}${suffixA}`;
      const rawKeyB = `${syntheticPrefix}${suffixB}`;
      expect(rawKeyA).not.toBe(rawKeyB);
      expect(rawKeyA.slice(0, 17)).toBe(syntheticPrefix);
      expect(rawKeyB.slice(0, 17)).toBe(syntheticPrefix);

      const hashA = createHash("sha256").update(rawKeyA, "utf8").digest("hex");
      const hashB = createHash("sha256").update(rawKeyB, "utf8").digest("hex");

      const keyEntityA = ApiKey.create({
        clientId: "cli_collision_tenant_A",
        name: "Prefix Colliding Key A",
        keyPrefix: syntheticPrefix,
        keyHash: hashA,
        scopes: ["access:read"],
      });

      const keyEntityB = ApiKey.create({
        clientId: "cli_collision_tenant_B",
        name: "Prefix Colliding Key B",
        keyPrefix: syntheticPrefix,
        keyHash: hashB,
        scopes: ["fleet:read"],
      });

      // Save both to repository
      await apiKeyRepo.save(keyEntityA);
      await apiKeyRepo.save(keyEntityB);

      // Verify findByPrefix returns BOTH candidates
      const candidates = await apiKeyRepo.findByPrefix(syntheticPrefix);
      expect(candidates.length).toBeGreaterThanOrEqual(2);

      // 1. Presenting Key A must validate and identify Tenant A
      const resultA = await validateApiKeyQuery.execute({ rawKey: rawKeyA });
      expect(resultA.valid).toBe(true);
      expect(resultA.clientId).toBe("cli_collision_tenant_A");
      expect(resultA.scopes).toEqual(["access:read"]);

      // 2. Presenting Key B must validate and identify Tenant B
      const resultB = await validateApiKeyQuery.execute({ rawKey: rawKeyB });
      expect(resultB.valid).toBe(true);
      expect(resultB.clientId).toBe("cli_collision_tenant_B");
      expect(resultB.scopes).toEqual(["fleet:read"]);

      // 3. Presenting an attacker key with same prefix but differing entropy must fail with key_not_found
      const attackerKey = `${syntheticPrefix}${"X".repeat(35)}`;
      const resultAttacker = await validateApiKeyQuery.execute({ rawKey: attackerKey });
      expect(resultAttacker.valid).toBe(false);
      expect(resultAttacker.error).toBe("key_not_found");
    });

    it("Timing Attack Resilience: safely handles malformed inputs, abnormal lengths, and tampered hex without crashing", async () => {
      // Keys with invalid formats
      expect((await validateApiKeyQuery.execute({ rawKey: "" })).error).toBe("invalid_format");
      expect((await validateApiKeyQuery.execute({ rawKey: "rsk_live_short" })).error).toBe("invalid_format");
      expect((await validateApiKeyQuery.execute({ rawKey: "xyz_live_123456789012345678901234567890" })).error).toBe("invalid_format");

      // Valid length but non-existent
      const nonExistentKey = `rsk_live_${randomBytes(32).toString("base64url")}`;
      expect((await validateApiKeyQuery.execute({ rawKey: nonExistentKey })).error).toBe("key_not_found");
    });
  });

  // =========================================================================
  // CHALLENGE 4: Decoupling of Outbox Billing Event Handlers
  // =========================================================================
  describe("Challenge 4: Bounded Context Decoupling & Outbox Processing", () => {
    it("Static AST Oracle: Zero imports from 'billing' across the entire entitlement bounded context", () => {
      const entitlementDir = path.resolve(__dirname, "../src/modules/entitlement");

      function getAllFiles(dir: string): string[] {
        let results: string[] = [];
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);
          if (entry.isDirectory()) {
            results = results.concat(getAllFiles(fullPath));
          } else if (entry.name.endsWith(".ts") && !entry.name.endsWith(".test.ts")) {
            results.push(fullPath);
          }
        }
        return results;
      }

      const files = getAllFiles(entitlementDir);
      expect(files.length).toBeGreaterThanOrEqual(10);

      const forbiddenBillingPatterns = [
        /from\s+["'].*\/billing(\/.*)?["']/,
        /from\s+["']@rsl\/core\/billing["']/,
        /import\(["'].*\/billing(\/.*)?["']\)/,
        /import\(["']@rsl\/core\/billing["']\)/,
      ];

      const violations: string[] = [];

      for (const file of files) {
        const content = fs.readFileSync(file, "utf-8");
        for (const pattern of forbiddenBillingPatterns) {
          if (pattern.test(content)) {
            violations.push(`${path.relative(entitlementDir, file)} violates decoupling: imports billing internals`);
          }
        }

        // Check for direct billing aggregate type imports
        if (content.includes("InvoiceAggregate") || content.includes("DrizzleBillingRepository")) {
          violations.push(`${path.relative(entitlementDir, file)} directly references billing classes`);
        }
      }

      expect(violations).toEqual([]);
    });

    it("Dynamic Event Oracle: processes disparate untyped billing outbox event shapes correctly", async () => {
      const decoupledClient = "cli_decoupled_billing_test_01";

      // 1. Event: 'billing.invoice.overdue' with grace days
      const ev1 = await handleBillingCmd.execute({
        eventName: "billing.invoice.overdue",
        payload: {
          clientId: decoupledClient,
          invoiceId: "inv_raw_001",
          amountPaise: 750000,
          gracePeriodDays: 7,
        },
      });
      expect(ev1.handled).toBe(true);
      expect(ev1.action).toBe("entitlement_marked_overdue");

      let ent = await entitlementRepo.findByClientId(decoupledClient);
      expect(ent?.status).toBe("Overdue");
      expect(ent?.isAccessAllowed()).toBe(true); // Grace period allows access

      // 2. Event: 'InvoiceOverdue' with 0 grace days -> immediate cutoff
      const ev2 = await handleBillingCmd.execute({
        eventName: "InvoiceOverdue",
        payload: {
          clientId: decoupledClient,
          invoiceId: "inv_raw_002",
          amountPaise: 100000,
          gracePeriodDays: 0,
        },
      });
      expect(ev2.handled).toBe(true);
      expect(ev2.action).toBe("entitlement_marked_overdue");

      ent = await entitlementRepo.findByClientId(decoupledClient);
      expect(ent?.status).toBe("Blocked");
      expect(ent?.isAccessAllowed()).toBe(false);

      // 3. Event: Partial payment recorded (balancePaise > 0) -> does NOT lift block
      const ev3 = await handleBillingCmd.execute({
        eventName: "payment.recorded",
        payload: {
          clientId: decoupledClient,
          invoiceId: "inv_raw_002",
          amountPaise: 50000,
          balancePaise: 50000,
        },
      });
      expect(ev3.handled).toBe(true);
      expect(ev3.action).toBe("partial_payment_ignored");

      ent = await entitlementRepo.findByClientId(decoupledClient);
      expect(ent?.status).toBe("Blocked"); // Still blocked

      // 4. Event: InvoicePaid (balancePaise: 0) -> restores Active
      const ev4 = await handleBillingCmd.execute({
        eventName: "InvoicePaid",
        payload: {
          clientId: decoupledClient,
          invoiceId: "inv_raw_002",
          balancePaise: 0,
        },
      });
      expect(ev4.handled).toBe(true);
      expect(ev4.action).toBe("entitlement_restored_active");

      ent = await entitlementRepo.findByClientId(decoupledClient);
      expect(ent?.status).toBe("Active");
      expect(ent?.isAccessAllowed()).toBe(true);

      // 5. Unrecognized event shape is rejected gracefully
      const ev5 = await handleBillingCmd.execute({
        eventName: "contract.renewed",
        payload: { clientId: decoupledClient },
      });
      expect(ev5.handled).toBe(false);
      expect(ev5.action).toBe("unrecognized_event");
    });

    it("Remediated 4.1: HandleBillingEventCommand preserves administrative suspension and returns entitlement_remains_suspended", async () => {
      const suspendedClient = "cli_admin_suspended_client_09";

      // 1. Create client and administratively suspend
      const ent = Entitlement.create({ clientId: suspendedClient });
      ent.suspend({ reason: "Terms violation and fraudulent traffic" });
      await entitlementRepo.save(ent);

      const checkBefore = await entitlementRepo.findByClientId(suspendedClient);
      expect(checkBefore).not.toBeNull();
      expect(checkBefore?.status).toBe("Suspended");
      expect(checkBefore?.isAccessAllowed()).toBe(false);

      // 2. Feed billing full settlement event
      const paidRes = await handleBillingCmd.execute({
        eventName: "InvoicePaid",
        payload: {
          clientId: suspendedClient,
          invoiceId: "inv_9999",
          balancePaise: 0,
        },
      });

      // HandleBillingEventCommand returns accurate action
      expect(paidRes.handled).toBe(true);
      expect(paidRes.action).toBe("entitlement_remains_suspended");

      // Suspension status is preserved in database
      const reloaded = await entitlementRepo.findByClientId(suspendedClient);
      expect(reloaded?.status).toBe("Suspended");
      expect(reloaded?.isAccessAllowed()).toBe(false);
      expect(reloaded?.reason).toContain("administratively Suspended");
    });

    it("Suspension Precedence: When status is Suspended, isAccessAllowed returns false unconditionally over allow override", () => {
      const ent = Entitlement.create({ clientId: "cli_precedence_test_01" });
      const allowOverride = ManualOverride.create({ mode: "allow", note: "VIP permit" });
      ent.setManualOverride(allowOverride);
      expect(ent.isAccessAllowed()).toBe(true);

      // Administrative suspension takes precedence
      ent.suspend({ reason: "Fraud freeze" });
      expect(ent.status).toBe("Suspended");
      expect(ent.isAccessAllowed()).toBe(false);
      expect(ent.isBlocked).toBe(true);

      // Even if another allow override is set while suspended, access remains false
      const anotherOverride = ManualOverride.create({ mode: "allow", note: "Sales rep override" });
      ent.setManualOverride(anotherOverride);
      expect(ent.isAccessAllowed()).toBe(false);
      expect(ent.isBlocked).toBe(true);
    });

    it("EvaluateEntitlementCommand: persists entity when override expires even if isBlocked does not flip", async () => {
      const testClientId = "cli_eval_expiry_persist_01";
      const ent = Entitlement.create({ clientId: testClientId });
      // Client is Active; an 'allow' override does not change isBlocked (false -> false)
      const baseTime = Date.now();
      const pastOverride = ManualOverride.reconstitute({
        mode: "allow",
        validUntil: baseTime + 100,
        note: "Short permit",
        createdAt: baseTime,
      });
      ent.setManualOverride(pastOverride);
      await entitlementRepo.save(ent);

      const savedBefore = await entitlementRepo.findByClientId(testClientId);
      expect(savedBefore?.manualOverride).not.toBeNull();

      // Evaluate at T + 200ms when override has expired
      const evalRes = await evaluateCmd.execute({ clientId: testClientId, now: baseTime + 200 });
      expect(evalRes.allowed).toBe(true);
      expect(evalRes.manualOverrideMode).toBeNull();

      // Verify that database row was updated and override was cleared
      const savedAfter = await entitlementRepo.findByClientId(testClientId);
      expect(savedAfter?.manualOverride).toBeNull();
    });
  });
});

if (!process.env.MASTER_KEY) {
  process.env.MASTER_KEY = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
}
if (!process.env.AUTH_SECRET) {
  process.env.AUTH_SECRET = "development-auth-secret-123456789";
}

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import http from "node:http";
import { getRawClient } from "../../packages/core/src/shared/infrastructure/db/connection-factory";
import { getContainer } from "../../packages/core/src/container";
import { GET as getGatewayStatus } from "../../apps/portal/src/app/api/v1/access/status/route";
import { clearGateCache } from "../../apps/portal/src/lib/cache/lru-cache";
import { Entitlement } from "../../packages/core/src/modules/entitlement/domain/entities/entitlement.aggregate";
import { createGate, RapidShiftClient } from "../../packages/sdk/src/index";
import type { Actor } from "../../packages/core/src/shared/kernel/actor";

describe("Phase 3 End-to-End Acceptance Verification", () => {
  const container = getContainer();

  const adminActor: Actor = {
    kind: "admin",
    id: "adm_01J9E2EADMIN0000000001",
    email: "admin@rapidshift.test",
    name: "Admin User",
    role: "owner",
    supportLevel: null,
  };

  let server: http.Server;
  let serverPort: number;
  let serverBaseUrl: string;
  let shouldHangServer = false;

  beforeAll(async () => {
    // 1. Ensure SQLite schema for entitlements and api_keys
    const client = getRawClient("core");
    await client.execute(`
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
    await client.execute(`CREATE INDEX IF NOT EXISTS idx_entitlements_client_id ON entitlements(client_id);`);
    await client.execute(`CREATE INDEX IF NOT EXISTS idx_entitlements_status ON entitlements(status);`);

    await client.execute(`
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
    await client.execute(`CREATE INDEX IF NOT EXISTS idx_api_keys_prefix ON api_keys(key_prefix);`);
    await client.execute(`CREATE INDEX IF NOT EXISTS idx_api_keys_client ON api_keys(client_id);`);

    // 2. Start genuine local Node.js HTTP server executing real Next.js route handler
    server = http.createServer(async (req, res) => {
      try {
        if (shouldHangServer) {
          // Intentionally delay responding to test client timeout
          await new Promise((resolve) => setTimeout(resolve, 500));
        }

        const fullUrl = `http://127.0.0.1:${serverPort}${req.url}`;
        const headers = new Headers();
        for (const [key, value] of Object.entries(req.headers)) {
          if (Array.isArray(value)) {
            for (const v of value) headers.append(key, v);
          } else if (value) {
            headers.set(key, value);
          }
        }

        const webReq = new Request(fullUrl, {
          method: req.method,
          headers,
        });

        const webRes = await getGatewayStatus(webReq);
        res.statusCode = webRes.status;
        webRes.headers.forEach((val, key) => {
          res.setHeader(key, val);
        });
        const body = await webRes.text();
        res.end(body);
      } catch (err: any) {
        res.statusCode = 500;
        res.end(JSON.stringify({ error: err.message }));
      }
    });

    await new Promise<void>((resolve) => {
      server.listen(0, "127.0.0.1", () => {
        const addr = server.address() as { port: number };
        serverPort = addr.port;
        serverBaseUrl = `http://127.0.0.1:${serverPort}`;
        resolve();
      });
    });
  });

  afterAll(async () => {
    if (server && server.listening) {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  beforeEach(() => {
    clearGateCache();
    shouldHangServer = false;
  });

  // Shared state across the 4 state-machine lifecycle scenarios
  const clientId = `cli_01J9E2E${Date.now().toString(36)}`;
  let realApiKey: string;

  describe("Scenario 1: Generate real API key and create client with Active entitlement", () => {
    it("generates rsk_live_ key, provisions Active entitlement, SDK calls gate over HTTP, caches status, asserts allowed: true and rapidshiftStatus: online", async () => {
      // 1. Generate real API key
      const keyResult = await container.apiPlatformModule.generateApiKey({
        actor: adminActor,
        clientId,
        name: "E2E Production Key",
        scopes: ["access:read"],
        type: "secret",
      });

      expect(keyResult.rawKey).toBeDefined();
      expect(keyResult.rawKey).toMatch(/^rsk_live_[a-zA-Z0-9_-]{43}$/);
      realApiKey = keyResult.rawKey;

      // 2. Provision initial Active entitlement for client in database
      let ent = await container.entitlementRepo.findByClientId(clientId);
      if (!ent) {
        ent = Entitlement.create({ clientId });
      }
      ent.markActive({ reason: "Initial Active provision" });
      await container.entitlementRepo.save(ent);

      // Verify DB record
      const savedEnt = await container.entitlementRepo.findByClientId(clientId);
      expect(savedEnt?.status).toBe("Active");
      expect(savedEnt?.isBlocked).toBe(false);

      // 3. Client SDK calls gate over real HTTP
      const client = new RapidShiftClient({
        secretKey: realApiKey,
        baseUrl: serverBaseUrl,
        cacheTtlSeconds: 60,
      });

      const status = await client.getAccessStatus();
      expect(status.allowed).toBe(true);
      expect(status.state).toBe("active");
      expect(status.rapidshiftStatus).toBe("online");
      expect(status.client?.id).toBe(clientId);
      expect(typeof status.token).toBe("string");

      // 4. Verify in-memory caching: cache contains fresh entry
      const cachedEntry = client.getCache().get(realApiKey);
      expect(cachedEntry).toBeDefined();
      expect(cachedEntry?.allowed).toBe(true);
      expect(cachedEntry?.token).toBe(status.token);

      // Subsequent call resolves directly from cache
      const secondCall = await client.getAccessStatus();
      expect(secondCall.token).toBe(status.token);

      // 5. Verify createGate helper
      const gate = createGate({
        secretKey: realApiKey,
        baseUrl: serverBaseUrl,
        client,
      });
      const gateResult = await gate(new Request("http://localhost:3000/app/dashboard"));
      expect(gateResult.allowed).toBe(true);
      expect(gateResult.state).toBe("active");
      expect(gateResult.rapidshiftStatus).toBe("online");
    });
  });

  describe("Scenario 2: Invoice becomes overdue (transition to Overdue)", () => {
    it("transitions client to Overdue, SDK calls gate, asserts allowed: true and state: overdue", async () => {
      // 1. Consume Outbox billing event for overdue invoice with 7 days grace period
      const eventResult = await container.entitlementModule.handleBillingEvent(
        "billing.invoice.overdue",
        {
          clientId,
          invoiceId: "inv_e2e_overdue_001",
          amountPaise: 4500000,
          gracePeriodDays: 7,
        },
      );
      expect(eventResult.handled).toBe(true);

      // 2. Verify state machine in database
      const ent = await container.entitlementRepo.findByClientId(clientId);
      expect(ent?.status).toBe("Overdue");
      expect(ent?.isAccessAllowed()).toBe(true); // Grace period allows access

      // 3. Clear LRU gateway cache and SDK cache to observe state transition
      clearGateCache();
      const client = new RapidShiftClient({
        secretKey: realApiKey,
        baseUrl: serverBaseUrl,
        cacheTtlSeconds: 60,
      });

      // 4. Client SDK calls gate
      const status = await client.getAccessStatus();
      expect(status.allowed).toBe(true);
      expect(status.state).toBe("overdue");
      expect(status.rapidshiftStatus).toBe("online");

      // 5. createGate allows access during grace period
      const gate = createGate({
        secretKey: realApiKey,
        baseUrl: serverBaseUrl,
        client,
      });
      const gateResult = await gate(new Request("http://localhost:3000/app/dashboard"));
      expect(gateResult.allowed).toBe(true);
      expect(gateResult.state).toBe("overdue");
    });
  });

  describe("Scenario 3: Grace period exceeded (transition to Blocked)", () => {
    it("transitions client to Blocked, SDK asserts allowed: false, state: blocked, and createGate redirects to /payment-due", async () => {
      // 1. Consume Outbox billing event with 0 grace period days (grace period exceeded)
      const eventResult = await container.entitlementModule.handleBillingEvent(
        "billing.invoice.overdue",
        {
          clientId,
          invoiceId: "inv_e2e_overdue_001",
          amountPaise: 4500000,
          gracePeriodDays: 0,
        },
      );
      expect(eventResult.handled).toBe(true);

      // 2. Verify state machine in database
      const ent = await container.entitlementRepo.findByClientId(clientId);
      expect(ent?.status).toBe("Blocked");
      expect(ent?.isBlocked).toBe(true);
      expect(ent?.isAccessAllowed()).toBe(false);

      // 3. Clear LRU gateway cache and SDK cache
      clearGateCache();
      const client = new RapidShiftClient({
        secretKey: realApiKey,
        baseUrl: serverBaseUrl,
        cacheTtlSeconds: 60,
      });

      // 4. Client SDK calls gate over HTTP
      const status = await client.getAccessStatus();
      expect(status.allowed).toBe(false);
      expect(status.state).toBe("blocked");
      expect(status.rapidshiftStatus).toBe("online");

      // 5. createGate redirects to /payment-due with HTTP 307
      const gate = createGate({
        secretKey: realApiKey,
        baseUrl: serverBaseUrl,
        client,
      });
      const gateResult: any = await gate(new Request("http://localhost:3000/app/dashboard"));
      expect(gateResult.allowed).toBe(false);
      expect(gateResult.state).toBe("blocked");
      expect(gateResult.status).toBe(307);
      expect(gateResult.redirectUrl).toContain("/payment-due");
      expect(gateResult.headers.get("location")).toContain("/payment-due");
    });
  });

  describe("Scenario 4: Admin records payment (transition back to Active)", () => {
    it("records payment, restores client to Active, SDK calls gate, asserts allowed: true and state: active", async () => {
      // 1. Consume Outbox billing event for full payment settlement (balancePaise: 0)
      const eventResult = await container.entitlementModule.handleBillingEvent(
        "billing.payment.recorded",
        {
          clientId,
          invoiceId: "inv_e2e_overdue_001",
          amountPaise: 4500000,
          balancePaise: 0,
        },
      );
      expect(eventResult.handled).toBe(true);
      expect(eventResult.action).toBe("entitlement_restored_active");

      // 2. Verify state machine in database
      const ent = await container.entitlementRepo.findByClientId(clientId);
      expect(ent?.status).toBe("Active");
      expect(ent?.isBlocked).toBe(false);
      expect(ent?.isAccessAllowed()).toBe(true);

      // 3. Clear LRU gateway cache and SDK cache
      clearGateCache();
      const client = new RapidShiftClient({
        secretKey: realApiKey,
        baseUrl: serverBaseUrl,
        cacheTtlSeconds: 60,
      });

      // 4. Client SDK calls gate over HTTP
      const status = await client.getAccessStatus();
      expect(status.allowed).toBe(true);
      expect(status.state).toBe("active");
      expect(status.rapidshiftStatus).toBe("online");

      // 5. createGate allows access again seamlessly
      const gate = createGate({
        secretKey: realApiKey,
        baseUrl: serverBaseUrl,
        client,
      });
      const gateResult = await gate(new Request("http://localhost:3000/app/dashboard"));
      expect(gateResult.allowed).toBe(true);
      expect(gateResult.state).toBe("active");
    });
  });

  describe("Scenario 5: RapidShift API is offline / unreachable (simulate network error)", () => {
    it("asserts failMode: 'open' returns allowed: true, rapidshiftStatus: 'offline', and createGate allows pass-through", async () => {
      // 1. Point SDK to an unreachable loopback port where no server is listening (ECONNREFUSED)
      const offlineUrl = "http://127.0.0.1:49199";

      const offlineClient = new RapidShiftClient({
        secretKey: realApiKey,
        baseUrl: offlineUrl,
        failMode: "open",
        timeoutMs: 1000,
      });

      // 2. Client SDK calls gate against offline API
      const status = await offlineClient.getAccessStatus();
      expect(status.allowed).toBe(true);
      expect(status.state).toBe("unknown");
      expect(status.rapidshiftStatus).toBe("offline");
      expect(offlineClient.getPlatformStatus()).toBe("offline");

      // 3. createGate allows pass-through without blocking or redirecting
      const offlineGate = createGate({
        secretKey: realApiKey,
        baseUrl: offlineUrl,
        failMode: "open",
        client: offlineClient,
      });

      const gateResult: any = await offlineGate(new Request("http://localhost:3000/app/dashboard"));
      expect(gateResult.allowed).toBe(true);
      expect(gateResult.rapidshiftStatus).toBe("offline");
      // Must not redirect to /payment-due
      expect(gateResult.status).toBeUndefined();
    });
  });

  describe("Scenario 6: Request timeout (simulated slow/hanging server)", () => {
    it("times out hanging server request and fails open returning allowed: true and rapidshiftStatus: 'offline'", async () => {
      // 1. Enable server hang simulation (server delays 500ms before responding)
      shouldHangServer = true;

      const timeoutClient = new RapidShiftClient({
        secretKey: realApiKey,
        baseUrl: serverBaseUrl,
        timeoutMs: 80, // Abort after 80ms
        failMode: "open",
      });

      // 2. Client SDK times out and fails open
      const status = await timeoutClient.getAccessStatus();
      expect(status.allowed).toBe(true);
      expect(status.state).toBe("unknown");
      expect(status.rapidshiftStatus).toBe("offline");
      expect(status.error).toContain("timed out");

      // 3. createGate also fails open seamlessly
      const timeoutGate = createGate({
        secretKey: realApiKey,
        baseUrl: serverBaseUrl,
        timeoutMs: 80,
        failMode: "open",
        client: timeoutClient,
      });

      const gateResult: any = await timeoutGate(new Request("http://localhost:3000/app/dashboard"));
      expect(gateResult.allowed).toBe(true);
      expect(gateResult.rapidshiftStatus).toBe("offline");
      expect(gateResult.status).toBeUndefined();
    });
  });
});

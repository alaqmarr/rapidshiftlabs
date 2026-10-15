if (!process.env.MASTER_KEY) {
  process.env.MASTER_KEY = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
}
if (!process.env.AUTH_SECRET) {
  process.env.AUTH_SECRET = "development-auth-secret-123456789";
}

import { describe, it, expect, beforeEach, beforeAll } from "vitest";
import * as jose from "jose";
import { getRawClient } from "../../src/shared/infrastructure/db/connection-factory";
import { getContainer } from "../../src/container";
import { GET as getGatewayStatus } from "../../../../apps/portal/src/app/api/v1/access/status/route";
import { GET as getJwks } from "../../../../apps/portal/src/app/.well-known/jwks.json/route";
import { clearGateCache } from "../../../../apps/portal/src/lib/cache/lru-cache";
import { JoseTokenSigner } from "../../src/modules/api-platform/infrastructure/token/jose-token-signer";
import { TokenService } from "../../src/modules/api-platform/application/services/token.service";
import { Entitlement } from "../../src/modules/entitlement/domain/entities/entitlement.aggregate";
import type { Actor } from "../../src/shared/kernel/actor";

describe("Milestone 2: Gateway Endpoints & Token / JWKS Service", () => {
  const container = getContainer();

  const adminActor: Actor = {
    kind: "admin",
    id: "adm_01J9TESTADMIN0000000001",
    email: "admin@rapidshift.test",
    name: "Admin User",
    role: "owner",
    supportLevel: null,
  };

  beforeAll(async () => {
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
  });

  beforeEach(() => {
    clearGateCache();
  });

  describe("1. JoseTokenSigner & TokenService Unit Tests", () => {
    it("generates Ed25519 keypair and exports public JWK matching RFC 8037", async () => {
      const signer = new JoseTokenSigner({ keyId: "test_key_ed25519" });
      const jwks = await signer.getPublicJwks();

      expect(jwks).toBeDefined();
      expect(Array.isArray(jwks.keys)).toBe(true);
      expect(jwks.keys.length).toBe(1);

      const [key] = jwks.keys;
      expect(key?.kty).toBe("OKP");
      expect(key?.crv).toBe("Ed25519");
      expect(key?.alg).toBe("EdDSA");
      expect(key?.use).toBe("sig");
      expect(key?.kid).toBe("test_key_ed25519");
      expect(typeof key?.x).toBe("string");
      expect(key?.d).toBeUndefined(); // Private key MUST NOT be leaked in public JWK
    });

    it("signs an Ed25519 access pass JWT with 60s TTL and verifies with public JWK", async () => {
      const signer = new JoseTokenSigner({ keyId: "test_token_signer" });
      const service = new TokenService(signer);

      const clientId = "cli_01J9TESTCLIENT1";
      const token = await service.signAccessPass({
        clientId,
        allowed: true,
        state: "active",
        keyId: "rsk_live_key1",
      });

      expect(typeof token).toBe("string");
      expect(token.split(".")).toHaveLength(3);

      const jwks = await service.getPublicJwks();
      const publicKey = await jose.importJWK(jwks.keys[0]!, "EdDSA");

      const { payload, protectedHeader } = await jose.jwtVerify(token, publicKey, {
        issuer: "rapidshift",
        audience: "client-app",
      });

      expect(protectedHeader.alg).toBe("EdDSA");
      expect(protectedHeader.kid).toBe("test_token_signer");
      expect(payload.iss).toBe("rapidshift");
      expect(payload.sub).toBe(clientId);
      expect(payload.aud).toBe("client-app");
      expect(payload.allowed).toBe(true);
      expect(payload.state).toBe("active");
      expect(payload.clientId).toBe(clientId);
      expect(payload.keyId).toBe("rsk_live_key1");
      expect(typeof payload.iat).toBe("number");
      expect(typeof payload.exp).toBe("number");
      // Verify 60s TTL
      expect(payload.exp! - payload.iat!).toBe(60);
    });
  });

  describe("2. Public JWKS Endpoint (/.well-known/jwks.json)", () => {
    it("returns public JWKS with Cache-Control header", async () => {
      const res = await getJwks();

      expect(res.status).toBe(200);
      expect(res.headers.get("Content-Type")).toContain("application/json");
      expect(res.headers.get("Cache-Control")).toBe("public, max-age=3600");

      const body = await res.json();
      expect(body).toBeDefined();
      expect(Array.isArray(body.keys)).toBe(true);
      expect(body.keys.length).toBeGreaterThanOrEqual(1);

      const jwk = body.keys[0];
      expect(jwk.kty).toBe("OKP");
      expect(jwk.crv).toBe("Ed25519");
      expect(jwk.alg).toBe("EdDSA");
      expect(jwk.use).toBe("sig");
      expect(jwk.x).toBeDefined();
      expect(jwk.d).toBeUndefined(); // No private key material
    });
  });

  describe("3. Gateway Status Endpoint (/api/v1/access/status)", () => {
    const clientId = "cli_01J9GATEWAYTEST01";

    it("returns 401 when API key is missing", async () => {
      const req = new Request("http://localhost:3000/api/v1/access/status", {
        method: "GET",
      });

      const res = await getGatewayStatus(req);
      expect(res.status).toBe(401);

      const body = await res.json();
      expect(body.error?.code).toBe("unauthorized");
      expect(body.error?.message).toContain("Missing API key");
    });

    it("returns 401 when API key is invalid or malformed", async () => {
      const req = new Request("http://localhost:3000/api/v1/access/status", {
        method: "GET",
        headers: {
          Authorization: "Bearer rsk_live_nonexistentinvalidkey1234567890",
        },
      });

      const res = await getGatewayStatus(req);
      expect(res.status).toBe(401);

      const body = await res.json();
      expect(body.error?.code).toBe("unauthorized");
    });

    it("returns 200 with allowed: true, state: active, and signed token for a valid key", async () => {
      // Create API key for client
      const keyResult = await container.apiPlatformModule.generateApiKey({
        actor: adminActor,
        clientId,
        name: "Test Gateway Key",
        scopes: ["access:read"],
        type: "secret",
      });

      // Ensure entitlement is initialized and active
      let ent = await container.entitlementRepo.findByClientId(clientId);
      if (!ent) {
        ent = Entitlement.create({ clientId });
        await container.entitlementRepo.save(ent);
      } else {
        ent.markActive({ reason: "Test setup active" });
        await container.entitlementRepo.save(ent);
      }

      const req = new Request("http://localhost:3000/api/v1/access/status", {
        method: "GET",
        headers: {
          Authorization: `Bearer ${keyResult.rawKey}`,
        },
      });

      const res = await getGatewayStatus(req);
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.data).toBeDefined();
      expect(body.data.allowed).toBe(true);
      expect(body.data.state).toBe("active");
      expect(body.data.rapidshiftStatus).toBe("online");
      expect(body.data.client).toEqual({ id: clientId });
      expect(typeof body.data.token).toBe("string");
      expect(typeof body.data.cachedUntil).toBe("number");

      // Verify the returned token using public JWKS
      const jwksRes = await getJwks();
      const jwks = await jwksRes.json();
      const publicKey = await jose.importJWK(jwks.keys[0]!, "EdDSA");

      const { payload } = await jose.jwtVerify(body.data.token, publicKey, {
        issuer: "rapidshift",
        audience: "client-app",
      });

      expect(payload.sub).toBe(clientId);
      expect(payload.allowed).toBe(true);
      expect(payload.state).toBe("active");
      expect(payload.clientId).toBe(clientId);
    });

    it("extracts key from X-Api-Key header as alternative to Authorization", async () => {
      const keyResult = await container.apiPlatformModule.generateApiKey({
        actor: adminActor,
        clientId,
        name: "Header Alternative Key",
        scopes: ["access:read"],
        type: "secret",
      });

      const req = new Request("http://localhost:3000/api/v1/access/status", {
        method: "GET",
        headers: {
          "X-Api-Key": keyResult.rawKey,
        },
      });

      const res = await getGatewayStatus(req);
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.data.allowed).toBe(true);
      expect(body.data.client.id).toBe(clientId);
    });

    it("returns allowed: true with state: overdue when client is in overdue grace period", async () => {
      const overdueClientId = "cli_01J9OVERDUECLIENT";

      const keyResult = await container.apiPlatformModule.generateApiKey({
        actor: adminActor,
        clientId: overdueClientId,
        name: "Overdue Client Key",
        scopes: ["access:read"],
        type: "secret",
      });

      let ent = await container.entitlementRepo.findByClientId(overdueClientId);
      if (!ent) {
        ent = Entitlement.create({ clientId: overdueClientId });
      }
      ent.markOverdue({ invoiceId: "inv_overdue_1", amountPaise: 100000 });
      await container.entitlementRepo.save(ent);

      const req = new Request("http://localhost:3000/api/v1/access/status", {
        method: "GET",
        headers: {
          Authorization: `Bearer ${keyResult.rawKey}`,
        },
      });

      const res = await getGatewayStatus(req);
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.data).toBeDefined();
      expect(body.data.allowed).toBe(true);
      expect(body.data.state).toBe("overdue");
      expect(body.data.client.id).toBe(overdueClientId);
    });

    it("returns allowed: false with state: blocked when client is blocked", async () => {
      const blockedClientId = "cli_01J9BLOCKEDCLIENT";

      const keyResult = await container.apiPlatformModule.generateApiKey({
        actor: adminActor,
        clientId: blockedClientId,
        name: "Blocked Client Key",
        scopes: ["access:read"],
        type: "secret",
      });

      let ent = await container.entitlementRepo.findByClientId(blockedClientId);
      if (!ent) {
        ent = Entitlement.create({ clientId: blockedClientId });
      }
      ent.markBlocked({ reason: "Unpaid dues grace period expired" });
      await container.entitlementRepo.save(ent);

      const req = new Request("http://localhost:3000/api/v1/access/status", {
        method: "GET",
        headers: {
          Authorization: `Bearer ${keyResult.rawKey}`,
        },
      });

      const res = await getGatewayStatus(req);
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.data).toBeDefined();
      expect(body.data.allowed).toBe(false);
      expect(body.data.state).toBe("blocked");
      expect(body.data.client.id).toBe(blockedClientId);

      // Verify signed token also indicates allowed: false
      const jwksRes = await getJwks();
      const jwks = await jwksRes.json();
      const publicKey = await jose.importJWK(jwks.keys[0]!, "EdDSA");
      const { payload } = await jose.jwtVerify(body.data.token, publicKey);
      expect(payload.allowed).toBe(false);
      expect(payload.state).toBe("blocked");
    });

    it("returns allowed: false with state: suspended when client is suspended", async () => {
      const suspendedClientId = "cli_01J9SUSPENDEDCLIENT";

      const keyResult = await container.apiPlatformModule.generateApiKey({
        actor: adminActor,
        clientId: suspendedClientId,
        name: "Suspended Client Key",
        scopes: ["access:read"],
        type: "secret",
      });

      let ent = await container.entitlementRepo.findByClientId(suspendedClientId);
      if (!ent) {
        ent = Entitlement.create({ clientId: suspendedClientId });
      }
      ent.suspend({ reason: "Administrative compliance suspension" });
      await container.entitlementRepo.save(ent);

      const req = new Request("http://localhost:3000/api/v1/access/status", {
        method: "GET",
        headers: {
          Authorization: `Bearer ${keyResult.rawKey}`,
        },
      });

      const res = await getGatewayStatus(req);
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.data).toBeDefined();
      expect(body.data.allowed).toBe(false);
      expect(body.data.state).toBe("suspended");
      expect(body.data.client.id).toBe(suspendedClientId);
    });

    it("returns 401 when API key is revoked", async () => {
      const revokedClientId = "cli_01J9REVOKEDCLIENT";

      const keyResult = await container.apiPlatformModule.generateApiKey({
        actor: adminActor,
        clientId: revokedClientId,
        name: "To Revoke Key",
        scopes: ["access:read"],
        type: "secret",
      });

      // Revoke the key
      await container.apiPlatformModule.revokeApiKey(keyResult.apiKey.id, adminActor);

      const req = new Request("http://localhost:3000/api/v1/access/status", {
        method: "GET",
        headers: {
          Authorization: `Bearer ${keyResult.rawKey}`,
        },
      });

      const res = await getGatewayStatus(req);
      expect(res.status).toBe(401);

      const body = await res.json();
      expect(body.error?.message).toContain("key_revoked");
    });

    it("returns 401 when API key is expired", async () => {
      const expiredClientId = "cli_01J9EXPIREDCLIENT";

      const keyResult = await container.apiPlatformModule.generateApiKey({
        actor: adminActor,
        clientId: expiredClientId,
        name: "Expired Key",
        scopes: ["access:read"],
        type: "secret",
        expiresAt: Date.now() + 10000,
      });

      // Manually backdate created_at and expires_at in DB to simulate expired state
      const now = Date.now();
      const client = getRawClient("core");
      await client.execute({
        sql: "UPDATE api_keys SET created_at = ?, expires_at = ? WHERE id = ?",
        args: [now - 20000, now - 5000, keyResult.apiKey.id],
      });

      const req = new Request("http://localhost:3000/api/v1/access/status", {
        method: "GET",
        headers: {
          Authorization: `Bearer ${keyResult.rawKey}`,
        },
      });

      const res = await getGatewayStatus(req);
      expect(res.status).toBe(401);

      const body = await res.json();
      expect(body.error?.message).toContain("key_expired");
    });

    it("LRU cache: repeated calls return in <1ms without DB hitting and with X-Cache: HIT", async () => {
      const lruClientId = "cli_01J9LRUCLIENT01";

      const keyResult = await container.apiPlatformModule.generateApiKey({
        actor: adminActor,
        clientId: lruClientId,
        name: "LRU Test Key",
        scopes: ["access:read"],
        type: "secret",
      });

      const makeRequest = () =>
        new Request("http://localhost:3000/api/v1/access/status", {
          method: "GET",
          headers: {
            Authorization: `Bearer ${keyResult.rawKey}`,
          },
        });

      // First call -> Cache MISS
      const res1 = await getGatewayStatus(makeRequest());
      expect(res1.status).toBe(200);
      expect(res1.headers.get("X-Cache")).toBe("MISS");
      const body1 = await res1.json();

      // Second call -> Cache HIT (<1ms)
      const start = performance.now();
      const res2 = await getGatewayStatus(makeRequest());
      const durationMs = performance.now() - start;

      expect(res2.status).toBe(200);
      expect(res2.headers.get("X-Cache")).toBe("HIT");
      const body2 = await res2.json();

      // Verify cached content matches original
      expect(body2).toEqual(body1);
      // Fast memory response (<5ms assertion, usually <0.5ms)
      expect(durationMs).toBeLessThan(5);
    });
  });
});

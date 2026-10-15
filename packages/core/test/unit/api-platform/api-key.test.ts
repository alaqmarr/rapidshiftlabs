import { describe, it, expect, beforeEach } from "vitest";
import { createHash } from "node:crypto";
import { ApiKey } from "../../../src/modules/api-platform/domain/entities/api-key.entity";
import { GenerateApiKeyCommand } from "../../../src/modules/api-platform/application/commands/generate-api-key.command";
import { ValidateApiKeyQuery } from "../../../src/modules/api-platform/application/queries/validate-api-key.query";
import { RevokeApiKeyCommand } from "../../../src/modules/api-platform/application/commands/revoke-api-key.command";
import { ListApiKeysQuery } from "../../../src/modules/api-platform/application/queries/list-api-keys.query";
import type { IApiKeyRepository, FindApiKeysOptions } from "../../../src/modules/api-platform/domain/repositories/api-key-repository.port";
import type { Actor } from "../../../src/shared/kernel/actor";
import { DomainRuleError, ForbiddenError, NotFoundError, ValidationError } from "../../../src/shared/kernel/errors";

class InMemoryApiKeyRepository implements IApiKeyRepository {
  private readonly store = new Map<string, ApiKey>();

  async findById(id: string): Promise<ApiKey | null> {
    return this.store.get(id) ?? null;
  }

  async findByPrefix(keyPrefix: string): Promise<ApiKey[]> {
    return Array.from(this.store.values()).filter((k) => k.keyPrefix === keyPrefix);
  }

  async findActiveByPrefix(keyPrefix: string): Promise<ApiKey[]> {
    return Array.from(this.store.values()).filter(
      (k) => k.keyPrefix === keyPrefix && !k.isRevoked(),
    );
  }

  async findByClientId(clientId: string, options?: FindApiKeysOptions): Promise<ApiKey[]> {
    return Array.from(this.store.values()).filter((k) => {
      if (k.clientId !== clientId) return false;
      if (!options?.includeRevoked && k.isRevoked()) return false;
      return true;
    });
  }

  async save(apiKey: ApiKey): Promise<void> {
    this.store.set(apiKey.id, apiKey);
  }

  async create(apiKey: ApiKey): Promise<void> {
    await this.save(apiKey);
  }

  async update(apiKey: ApiKey): Promise<void> {
    await this.save(apiKey);
  }

  async updateLastUsed(id: string, lastUsedAt: number): Promise<void> {
    const key = this.store.get(id);
    if (key) {
      key.recordUsage(lastUsedAt);
    }
  }

  async revoke(id: string, revokedAt: number): Promise<void> {
    const key = this.store.get(id);
    if (key) {
      key.revoke(revokedAt);
    }
  }
}

describe("API Key Management & Cryptographic Security (Milestone 1)", () => {
  const CLIENT_ID = "cli_01J9Z7Q4X1A2B3C4D5E6F7G8H9";
  const OTHER_CLIENT_ID = "cli_01J9Z7Q4X1A2B3C4D5E6F7G8Z9";

  const adminActor: Actor = {
    kind: "admin",
    id: "adm_01J9Z7Q4X1A2B3C4D5E6F7G8H0",
    email: "ops@rapidshift.test",
    name: "Admin Ops",
    role: "ops",
    supportLevel: null,
  };

  const clientActor: Actor = {
    kind: "client_user",
    id: "usr_01J9Z7Q4X1A2B3C4D5E6F7G8H1",
    email: "client@test.com",
    name: "Client Admin",
    clientId: CLIENT_ID,
    role: "client_admin",
  };

  let repo: InMemoryApiKeyRepository;

  beforeEach(() => {
    repo = new InMemoryApiKeyRepository();
  });

  describe("1. Key Generation & Prefixes", () => {
    it("generates secret API key with 'rsk_live_' prefix, 32-byte entropy, and SHA-256 hash", async () => {
      const generateCmd = new GenerateApiKeyCommand(repo);
      const res = await generateCmd.execute({
        actor: clientActor,
        clientId: CLIENT_ID,
        name: "Production Proxy Key",
        type: "secret",
        scopes: ["access:read", "billing:read"],
      });

      expect(res.rawKey).toMatch(/^rsk_live_[A-Za-z0-9_-]{43}$/);
      expect(res.apiKey.id).toMatch(/^key_/);
      expect(res.apiKey.clientId).toBe(CLIENT_ID);
      expect(res.apiKey.name).toBe("Production Proxy Key");
      expect(res.apiKey.type).toBe("secret");
      expect(res.apiKey.scopes).toEqual(["access:read", "billing:read"]);
      expect(res.apiKey.keyPrefix).toBe(res.rawKey.slice(0, 17));
      expect(res.apiKey.revokedAt).toBeNull();
      expect(res.apiKey.lastUsedAt).toBeNull();

      // Entity stored in repository holds ONLY hash, NOT plaintext
      const stored = await repo.findById(res.apiKey.id);
      expect(stored).not.toBeNull();
      expect((stored as any).rawKey).toBeUndefined();
      expect(stored?.keyHash).toMatch(/^[0-9a-f]{64}$/);

      const expectedHash = createHash("sha256").update(res.rawKey, "utf8").digest("hex");
      expect(stored?.keyHash).toBe(expectedHash);
    });

    it("generates publishable key with 'rpk_live_' prefix", async () => {
      const generateCmd = new GenerateApiKeyCommand(repo);
      const res = await generateCmd.execute({
        actor: clientActor,
        clientId: CLIENT_ID,
        name: "Embed Public Key",
        type: "publishable",
        scopes: ["embeds:create"],
      });

      expect(res.rawKey).toMatch(/^rpk_live_[A-Za-z0-9_-]{43}$/);
      expect(res.apiKey.type).toBe("publishable");
      expect(res.apiKey.keyPrefix).toBe(res.rawKey.slice(0, 17));
    });

    it("rejects invalid scopes or invalid parameters", async () => {
      const generateCmd = new GenerateApiKeyCommand(repo);

      await expect(
        generateCmd.execute({
          actor: clientActor,
          clientId: CLIENT_ID,
          name: "",
          scopes: ["access:read"],
        }),
      ).rejects.toThrow(ValidationError);

      await expect(
        generateCmd.execute({
          actor: clientActor,
          clientId: CLIENT_ID,
          name: "Test",
          scopes: ["invalid:scope" as any],
        }),
      ).rejects.toThrow(ValidationError);
    });
  });

  describe("2. Key Validation & Constant-Time Verification", () => {
    it("validates a genuine raw key returning tenant id, scopes, and key id", async () => {
      const generateCmd = new GenerateApiKeyCommand(repo);
      const { rawKey, apiKey } = await generateCmd.execute({
        actor: clientActor,
        clientId: CLIENT_ID,
        name: "Gate Verification Key",
        type: "secret",
        scopes: ["access:read", "fleet:read"],
      });

      const validateQuery = new ValidateApiKeyQuery(repo);
      const valRes = await validateQuery.execute({ rawKey });

      expect(valRes.valid).toBe(true);
      expect(valRes.clientId).toBe(CLIENT_ID);
      expect(valRes.scopes).toEqual(["access:read", "fleet:read"]);
      expect(valRes.keyId).toBe(apiKey.id);
      expect(valRes.keyType).toBe("secret");
    });

    it("fails validation for tampered or mismatched key", async () => {
      const generateCmd = new GenerateApiKeyCommand(repo);
      const { rawKey } = await generateCmd.execute({
        actor: clientActor,
        clientId: CLIENT_ID,
        name: "Gate Key",
        type: "secret",
        scopes: ["access:read"],
      });

      // Tamper key by changing the last character
      const tampered = rawKey.slice(0, -1) + (rawKey.endsWith("a") ? "b" : "a");

      const validateQuery = new ValidateApiKeyQuery(repo);
      const valRes = await validateQuery.execute({ rawKey: tampered });

      expect(valRes.valid).toBe(false);
      expect(valRes.error).toBe("key_not_found");
    });

    it("fails validation for malformed strings or invalid prefix", async () => {
      const validateQuery = new ValidateApiKeyQuery(repo);

      expect((await validateQuery.execute({ rawKey: "not_a_valid_key" })).error).toBe("invalid_format");
      expect((await validateQuery.execute({ rawKey: "rsk_live_short" })).error).toBe("invalid_format");
      expect((await validateQuery.execute({ rawKey: "" })).error).toBe("invalid_format");
    });
  });

  describe("3. Scopes, Expiration, and Revocation", () => {
    it("verifies required scopes against key permissions", async () => {
      const generateCmd = new GenerateApiKeyCommand(repo);
      const { rawKey } = await generateCmd.execute({
        actor: clientActor,
        clientId: CLIENT_ID,
        name: "Scoped Key",
        scopes: ["access:read"],
      });

      const validateQuery = new ValidateApiKeyQuery(repo);

      // Key possesses required scope
      const pass = await validateQuery.execute({ rawKey, requiredScopes: ["access:read"] });
      expect(pass.valid).toBe(true);

      // Key lacks required scope
      const fail = await validateQuery.execute({ rawKey, requiredScopes: ["fleet:restart"] });
      expect(fail.valid).toBe(false);
      expect(fail.error).toBe("insufficient_scopes");
    });

    it("rejects expired API key", async () => {
      const generateCmd = new GenerateApiKeyCommand(repo);
      const futureExpiry = Date.now() + 10000;
      const { rawKey } = await generateCmd.execute({
        actor: clientActor,
        clientId: CLIENT_ID,
        name: "Expiring Key",
        scopes: ["access:read"],
        expiresAt: futureExpiry,
      });

      const validateQuery = new ValidateApiKeyQuery(repo);

      // Valid before expiry
      const beforeExpiry = await validateQuery.execute({ rawKey, now: futureExpiry - 5000 });
      expect(beforeExpiry.valid).toBe(true);

      // Invalid after expiry
      const afterExpiry = await validateQuery.execute({ rawKey, now: futureExpiry + 1000 });
      expect(afterExpiry.valid).toBe(false);
      expect(afterExpiry.error).toBe("key_expired");
    });

    it("revokes API key and forbids subsequent access", async () => {
      const generateCmd = new GenerateApiKeyCommand(repo);
      const { rawKey, apiKey } = await generateCmd.execute({
        actor: clientActor,
        clientId: CLIENT_ID,
        name: "Key To Revoke",
        scopes: ["access:read"],
      });

      const revokeCmd = new RevokeApiKeyCommand(repo);
      const revokedDTO = await revokeCmd.execute({ actor: clientActor, keyId: apiKey.id });
      expect(revokedDTO.revokedAt).not.toBeNull();

      const validateQuery = new ValidateApiKeyQuery(repo);
      const valRes = await validateQuery.execute({ rawKey });
      expect(valRes.valid).toBe(false);
      expect(valRes.error).toBe("key_revoked");
    });
  });

  describe("4. Tenant Boundaries & Query Operations", () => {
    it("ListApiKeysQuery returns sanitized keys without secret leak", async () => {
      const generateCmd = new GenerateApiKeyCommand(repo);
      await generateCmd.execute({
        actor: clientActor,
        clientId: CLIENT_ID,
        name: "Key 1",
        scopes: ["access:read"],
      });
      await generateCmd.execute({
        actor: clientActor,
        clientId: CLIENT_ID,
        name: "Key 2",
        scopes: ["billing:read"],
      });

      const listQuery = new ListApiKeysQuery(repo);
      const keys = await listQuery.execute({ actor: clientActor, clientId: CLIENT_ID });

      expect(keys).toHaveLength(2);
      expect(keys[0]?.clientId).toBe(CLIENT_ID);
      expect((keys[0] as any).keyHash).toBeUndefined();
      expect((keys[0] as any).rawKey).toBeUndefined();
    });

    it("enforces tenant boundary on key creation, revocation, and listing", async () => {
      const generateCmd = new GenerateApiKeyCommand(repo);
      const revokeCmd = new RevokeApiKeyCommand(repo);
      const listQuery = new ListApiKeysQuery(repo);

      // Client actor cannot generate key for another client
      await expect(
        generateCmd.execute({
          actor: clientActor,
          clientId: OTHER_CLIENT_ID,
          name: "Attacker Key",
          scopes: ["access:read"],
        }),
      ).rejects.toThrow(ForbiddenError);

      // Client actor cannot list another client's keys
      await expect(
        listQuery.execute({ actor: clientActor, clientId: OTHER_CLIENT_ID }),
      ).rejects.toThrow(ForbiddenError);

      // Admin can generate and list across tenants
      const adminKey = await generateCmd.execute({
        actor: adminActor,
        clientId: OTHER_CLIENT_ID,
        name: "Admin Generated Key",
        scopes: ["access:read"],
      });
      expect(adminKey.apiKey.clientId).toBe(OTHER_CLIENT_ID);

      // Client cannot revoke other tenant's key
      await expect(
        revokeCmd.execute({ actor: clientActor, keyId: adminKey.apiKey.id }),
      ).rejects.toThrow(ForbiddenError);
    });
  });
});

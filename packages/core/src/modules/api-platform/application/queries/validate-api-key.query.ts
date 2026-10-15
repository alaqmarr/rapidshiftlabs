import { createHash, timingSafeEqual } from "node:crypto";
import type { IApiKeyRepository } from "../../domain/repositories/api-key-repository.port";
import type { ApiKeyType } from "../../domain/value-objects/api-key-type";
import type { ApiKey } from "../../domain/entities/api-key.entity";

export interface ValidateApiKeyInput {
  rawKey: string;
  requiredScopes?: string[];
  now?: number;
}

export interface ValidateApiKeyResult {
  valid: boolean;
  clientId?: string;
  scopes?: string[];
  keyId?: string;
  keyType?: ApiKeyType;
  error?: "invalid_format" | "key_not_found" | "key_revoked" | "key_expired" | "insufficient_scopes";
}

export class ValidateApiKeyQuery {
  private static readonly pendingUpdates = new Set<string>();

  constructor(private readonly apiKeyRepo: IApiKeyRepository) {}

  async execute(
    inputOrRawKey: string | ValidateApiKeyInput,
    maybeRequiredScopes?: string[],
    maybeNow?: number,
  ): Promise<ValidateApiKeyResult> {
    let rawKey: string;
    let requiredScopes: string[] | undefined;
    let now: number;

    if (typeof inputOrRawKey === "string") {
      rawKey = inputOrRawKey;
      requiredScopes = maybeRequiredScopes;
      now = maybeNow ?? Date.now();
    } else {
      rawKey = inputOrRawKey.rawKey;
      requiredScopes = inputOrRawKey.requiredScopes;
      now = inputOrRawKey.now ?? Date.now();
    }

    const trimmedKey = rawKey?.trim();
    if (!trimmedKey || (!trimmedKey.startsWith("rsk_live_") && !trimmedKey.startsWith("rpk_live_"))) {
      return { valid: false, error: "invalid_format" };
    }
    if (trimmedKey.length < 25) {
      return { valid: false, error: "invalid_format" };
    }

    const keyPrefix = trimmedKey.slice(0, 17);
    const candidates = await this.apiKeyRepo.findByPrefix(keyPrefix);

    if (candidates.length === 0) {
      return { valid: false, error: "key_not_found" };
    }

    // Compute SHA-256 hex digest
    const computedHashHex = createHash("sha256").update(trimmedKey, "utf8").digest("hex");
    const computedBuf = Buffer.from(computedHashHex, "hex");

    let matchedKey: ApiKey | null = null;

    // Constant-time candidate comparison
    for (const candidate of candidates) {
      const candidateBuf = Buffer.from(candidate.keyHash, "hex");
      if (candidateBuf.length === 32 && computedBuf.length === 32 && timingSafeEqual(computedBuf, candidateBuf)) {
        matchedKey = candidate;
        break;
      }
    }

    if (!matchedKey) {
      return { valid: false, error: "key_not_found" };
    }

    // Check revocation and expiration
    if (matchedKey.isRevoked()) {
      return { valid: false, error: "key_revoked" };
    }

    if (matchedKey.isExpired(now)) {
      return { valid: false, error: "key_expired" };
    }

    // Check required scopes
    if (requiredScopes && requiredScopes.length > 0) {
      if (!matchedKey.hasAllScopes(requiredScopes)) {
        return { valid: false, error: "insufficient_scopes" };
      }
    }

    // Record last used timestamp safely in background without lock contention
    matchedKey.recordUsage(now);
    if (!ValidateApiKeyQuery.pendingUpdates.has(matchedKey.id)) {
      ValidateApiKeyQuery.pendingUpdates.add(matchedKey.id);
      this.apiKeyRepo
        .updateLastUsed(matchedKey.id, now)
        .catch(() => {})
        .finally(() => {
          ValidateApiKeyQuery.pendingUpdates.delete(matchedKey.id);
        });
    }

    return {
      valid: true,
      clientId: matchedKey.clientId,
      scopes: [...matchedKey.scopes],
      keyId: matchedKey.id,
      keyType: matchedKey.type,
    };
  }
}

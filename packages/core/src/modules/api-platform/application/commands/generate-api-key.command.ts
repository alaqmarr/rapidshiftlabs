import { randomBytes, createHash } from "node:crypto";
import { assertCan, assertTenant, type Actor, API_KEY_SCOPES } from "../../../../shared/kernel/actor";
import { ValidationError } from "../../../../shared/kernel/errors";
import { ApiKey } from "../../domain/entities/api-key.entity";
import type { ApiKeyType } from "../../domain/value-objects/api-key-type";
import type { IApiKeyRepository } from "../../domain/repositories/api-key-repository.port";
import type { ApiKeyDTO } from "../dtos/api-key.dto";

export interface GenerateApiKeyInput {
  actor?: Actor;
  clientId: string;
  name: string;
  type?: ApiKeyType;
  scopes: string[];
  expiresAt?: number | null;
  now?: number;
}

export interface GenerateApiKeyResult {
  apiKey: ApiKeyDTO;
  rawKey: string;
}

export class GenerateApiKeyCommand {
  constructor(private readonly apiKeyRepo: IApiKeyRepository) {}

  async execute(
    input: GenerateApiKeyInput,
    explicitActor?: Actor,
  ): Promise<GenerateApiKeyResult> {
    const actor = input.actor ?? explicitActor!;
    assertCan(actor, "apikeys:write");
    assertTenant(actor, input.clientId);

    const trimmedName = input.name?.trim();
    if (!trimmedName || trimmedName.length > 100) {
      throw new ValidationError("API key name must be between 1 and 100 characters");
    }

    const type: ApiKeyType = input.type ?? "secret";
    if (!["secret", "publishable"].includes(type)) {
      throw new ValidationError("API key type must be 'secret' or 'publishable'");
    }

    if (!Array.isArray(input.scopes) || input.scopes.length === 0) {
      throw new ValidationError("At least one scope must be provided");
    }

    for (const scope of input.scopes) {
      if (!API_KEY_SCOPES.includes(scope as any)) {
        throw new ValidationError(`Invalid scope '${scope}'`);
      }
    }

    const now = input.now ?? Date.now();
    if (input.expiresAt !== undefined && input.expiresAt !== null) {
      if (input.expiresAt <= now) {
        throw new ValidationError("expiresAt must be in the future");
      }
    }

    // Cryptographically secure generation (32 random bytes)
    const prefixTag = type === "secret" ? "rsk_live_" : "rpk_live_";
    const entropy = randomBytes(32).toString("base64url");
    const rawKey = `${prefixTag}${entropy}`;
    const keyPrefix = rawKey.slice(0, 17);
    const keyHash = createHash("sha256").update(rawKey, "utf8").digest("hex");

    const apiKey = ApiKey.create({
      clientId: input.clientId,
      name: trimmedName,
      keyPrefix,
      keyHash,
      type,
      scopes: input.scopes,
      expiresAt: input.expiresAt ?? null,
      now,
    });

    await this.apiKeyRepo.save(apiKey);

    return {
      apiKey: {
        id: apiKey.id,
        clientId: apiKey.clientId,
        name: apiKey.name,
        keyPrefix: apiKey.keyPrefix,
        type: apiKey.type,
        scopes: [...apiKey.scopes],
        expiresAt: apiKey.expiresAt,
        lastUsedAt: apiKey.lastUsedAt,
        revokedAt: apiKey.revokedAt,
        createdAt: apiKey.createdAt,
        updatedAt: apiKey.updatedAt,
      },
      rawKey,
    };
  }
}

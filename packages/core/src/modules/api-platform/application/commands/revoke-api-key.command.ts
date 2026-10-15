import { assertCan, assertTenant, type Actor } from "../../../../shared/kernel/actor";
import { NotFoundError } from "../../../../shared/kernel/errors";
import type { IApiKeyRepository } from "../../domain/repositories/api-key-repository.port";
import type { ApiKeyDTO } from "../dtos/api-key.dto";

export interface RevokeApiKeyInput {
  actor?: Actor;
  keyId: string;
  clientId?: string;
  now?: number;
}

export class RevokeApiKeyCommand {
  constructor(private readonly apiKeyRepo: IApiKeyRepository) {}

  async execute(
    inputOrKeyId: string | RevokeApiKeyInput,
    maybeActor?: Actor,
  ): Promise<ApiKeyDTO> {
    const keyId = typeof inputOrKeyId === "string" ? inputOrKeyId : inputOrKeyId.keyId;
    const actor = typeof inputOrKeyId === "string" ? maybeActor! : inputOrKeyId.actor!;
    const now = typeof inputOrKeyId === "string" ? Date.now() : (inputOrKeyId.now ?? Date.now());

    assertCan(actor, "apikeys:write");

    const key = await this.apiKeyRepo.findById(keyId);
    if (!key) {
      throw new NotFoundError("API key not found", keyId);
    }

    assertTenant(actor, key.clientId);

    if (key.isRevoked()) {
      return {
        id: key.id,
        clientId: key.clientId,
        name: key.name,
        keyPrefix: key.keyPrefix,
        type: key.type,
        scopes: [...key.scopes],
        expiresAt: key.expiresAt,
        lastUsedAt: key.lastUsedAt,
        revokedAt: key.revokedAt,
        createdAt: key.createdAt,
        updatedAt: key.updatedAt,
      };
    }

    key.revoke(now);
    await this.apiKeyRepo.save(key);

    return {
      id: key.id,
      clientId: key.clientId,
      name: key.name,
      keyPrefix: key.keyPrefix,
      type: key.type,
      scopes: [...key.scopes],
      expiresAt: key.expiresAt,
      lastUsedAt: key.lastUsedAt,
      revokedAt: key.revokedAt,
      createdAt: key.createdAt,
      updatedAt: key.updatedAt,
    };
  }
}

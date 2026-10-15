import { assertCan, assertTenant, type Actor } from "../../../../shared/kernel/actor";
import type { IApiKeyRepository } from "../../domain/repositories/api-key-repository.port";
import type { ApiKeyDTO } from "../dtos/api-key.dto";

export interface ListApiKeysInput {
  actor?: Actor;
  clientId: string;
  includeRevoked?: boolean;
}

export class ListApiKeysQuery {
  constructor(private readonly apiKeyRepo: IApiKeyRepository) {}

  async execute(
    inputOrClientId: string | ListApiKeysInput,
    maybeActor?: Actor,
  ): Promise<ApiKeyDTO[]> {
    const clientId = typeof inputOrClientId === "string" ? inputOrClientId : inputOrClientId.clientId;
    const actor = typeof inputOrClientId === "string" ? maybeActor! : inputOrClientId.actor!;
    const includeRevoked = typeof inputOrClientId === "string" ? false : (inputOrClientId.includeRevoked ?? false);

    assertCan(actor, "apikeys:read");
    assertTenant(actor, clientId);

    const keys = await this.apiKeyRepo.findByClientId(clientId, {
      includeRevoked,
    });

    return keys.map((key) => ({
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
    }));
  }
}

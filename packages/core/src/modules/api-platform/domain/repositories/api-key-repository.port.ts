import type { ApiKey } from "../entities/api-key.entity";

export interface FindApiKeysOptions {
  includeRevoked?: boolean;
}

export interface IApiKeyRepository {
  findById(id: string): Promise<ApiKey | null>;
  findByPrefix(keyPrefix: string): Promise<ApiKey[]>;
  findByClientId(clientId: string, options?: FindApiKeysOptions): Promise<ApiKey[]>;
  findActiveByPrefix(keyPrefix: string): Promise<ApiKey[]>;
  save(apiKey: ApiKey, tx?: any): Promise<void>;
  create(apiKey: ApiKey): Promise<void>;
  update(apiKey: ApiKey): Promise<void>;
  updateLastUsed(id: string, lastUsedAt: number): Promise<void>;
  revoke(id: string, revokedAt: number): Promise<void>;
}

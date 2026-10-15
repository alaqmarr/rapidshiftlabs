import type { ApiKeyType } from "../../domain/value-objects/api-key-type";

export interface ApiKeyDTO {
  id: string;
  clientId: string;
  name: string;
  keyPrefix: string;
  type: ApiKeyType;
  scopes: string[];
  expiresAt: number | null;
  lastUsedAt: number | null;
  revokedAt: number | null;
  createdAt: number;
  updatedAt: number;
}

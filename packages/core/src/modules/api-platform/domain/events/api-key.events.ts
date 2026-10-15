import { createEvent, type DomainEvent } from "../../../../shared/kernel/domain-event";
import { type ApiKeyType } from "../value-objects/api-key-type";

export type ApiKeyCreatedPayload = {
  keyId: string;
  clientId: string;
  name: string;
  keyPrefix: string;
  type: ApiKeyType;
  scopes: string[];
  occurredAt: number;
};

export type ApiKeyRevokedPayload = {
  keyId: string;
  clientId: string;
  revokedAt: number;
  occurredAt: number;
};

export function createApiKeyCreatedEvent(params: {
  keyId: string;
  clientId: string;
  name: string;
  keyPrefix: string;
  type: ApiKeyType;
  scopes: string[];
  now?: number;
}): DomainEvent<"api_key.created", ApiKeyCreatedPayload> {
  const occurredAt = params.now ?? Date.now();
  return createEvent("api_key.created", {
    aggregateType: "api_key",
    aggregateId: params.keyId,
    clientId: params.clientId,
    payload: {
      keyId: params.keyId,
      clientId: params.clientId,
      name: params.name,
      keyPrefix: params.keyPrefix,
      type: params.type,
      scopes: params.scopes,
      occurredAt,
    },
  });
}

export function createApiKeyRevokedEvent(params: {
  keyId: string;
  clientId: string;
  revokedAt: number;
  now?: number;
}): DomainEvent<"api_key.revoked", ApiKeyRevokedPayload> {
  const occurredAt = params.now ?? Date.now();
  return createEvent("api_key.revoked", {
    aggregateType: "api_key",
    aggregateId: params.keyId,
    clientId: params.clientId,
    payload: {
      keyId: params.keyId,
      clientId: params.clientId,
      revokedAt: params.revokedAt,
      occurredAt,
    },
  });
}

import { AggregateRoot } from "../../../../shared/kernel/domain-event";
import { newId, ID_PREFIX } from "../../../../shared/kernel/id";
import { DomainRuleError } from "../../../../shared/kernel/errors";
import type { ApiKeyType } from "../value-objects/api-key-type";
import { createApiKeyCreatedEvent, createApiKeyRevokedEvent } from "../events/api-key.events";

export interface ApiKeyProps {
  id: string;                      // ULID prefixed "key_"
  clientId: string;                // ULID prefixed "cli_"
  name: string;                    // Human-readable key name
  keyPrefix: string;               // Prefix lookup token (e.g. "rsk_live_a1b2c3d4")
  keyHash: string;                 // SHA-256 hex digest (64 lowercase hex characters)
  type: ApiKeyType;                // 'secret' | 'publishable'
  scopes: string[];                // Permissions
  expiresAt: number | null;        // UTC epoch ms timestamp or null
  lastUsedAt: number | null;       // UTC epoch ms timestamp or null
  revokedAt: number | null;        // UTC epoch ms timestamp or null
  createdAt: number;               // UTC epoch ms timestamp
  updatedAt: number;               // UTC epoch ms timestamp
}

export class ApiKey extends AggregateRoot<ApiKeyProps> {
  private constructor(props: ApiKeyProps) {
    super(props);
    this.validateInvariants();
  }

  private validateInvariants(): void {
    if (!this.props.id || !this.props.id.startsWith("key_")) {
      throw new DomainRuleError("invalid_id", "ApiKey ID must start with 'key_'");
    }
    if (!this.props.clientId || !this.props.clientId.startsWith("cli_")) {
      throw new DomainRuleError("invalid_client_id", "ApiKey clientId must start with 'cli_'");
    }
    if (!this.props.name || this.props.name.trim().length === 0) {
      throw new DomainRuleError("invalid_name", "ApiKey name cannot be empty");
    }
    if (this.props.name.trim().length > 100) {
      throw new DomainRuleError("invalid_name", "ApiKey name cannot exceed 100 characters");
    }
    if (!["secret", "publishable"].includes(this.props.type)) {
      throw new DomainRuleError("invalid_type", "ApiKey type must be 'secret' or 'publishable'");
    }
    if (!/^[0-9a-f]{64}$/.test(this.props.keyHash)) {
      throw new DomainRuleError("invalid_hash", "ApiKey keyHash must be a 64-character SHA-256 hex string");
    }
    if (!Array.isArray(this.props.scopes) || this.props.scopes.length === 0) {
      throw new DomainRuleError("invalid_scopes", "ApiKey must contain at least one scope");
    }
    if (this.props.expiresAt !== null && this.props.expiresAt <= this.props.createdAt) {
      throw new DomainRuleError("invalid_expiration", "ApiKey expiresAt must be after createdAt");
    }
  }

  public static create(params: {
    clientId: string;
    name: string;
    keyPrefix: string;
    keyHash: string;
    type?: ApiKeyType;
    scopes: string[];
    expiresAt?: number | null;
    now?: number;
  }): ApiKey {
    const timestamp = params.now ?? Date.now();
    const id = newId(ID_PREFIX.apiKey);
    const keyType = params.type ?? "secret";

    const key = new ApiKey({
      id,
      clientId: params.clientId,
      name: params.name.trim(),
      keyPrefix: params.keyPrefix,
      keyHash: params.keyHash.toLowerCase(),
      type: keyType,
      scopes: [...params.scopes],
      expiresAt: params.expiresAt ?? null,
      lastUsedAt: null,
      revokedAt: null,
      createdAt: timestamp,
      updatedAt: timestamp,
    });

    key.raise(
      createApiKeyCreatedEvent({
        keyId: id,
        clientId: params.clientId,
        name: key.name,
        keyPrefix: key.keyPrefix,
        type: keyType,
        scopes: key.scopes as string[],
        now: timestamp,
      }),
    );

    return key;
  }

  public static reconstitute(props: ApiKeyProps): ApiKey {
    return new ApiKey({
      ...props,
      keyHash: props.keyHash.toLowerCase(),
      scopes: [...props.scopes],
    });
  }

  // Getters
  public get id(): string { return this.props.id; }
  public get clientId(): string { return this.props.clientId; }
  public get name(): string { return this.props.name; }
  public get keyPrefix(): string { return this.props.keyPrefix; }
  public get keyHash(): string { return this.props.keyHash; }
  public get type(): ApiKeyType { return this.props.type; }
  public get scopes(): readonly string[] { return this.props.scopes; }
  public get expiresAt(): number | null { return this.props.expiresAt; }
  public get lastUsedAt(): number | null { return this.props.lastUsedAt; }
  public get revokedAt(): number | null { return this.props.revokedAt; }
  public get createdAt(): number { return this.props.createdAt; }
  public get updatedAt(): number { return this.props.updatedAt; }

  // State queries
  public isRevoked(): boolean {
    return this.props.revokedAt !== null;
  }

  public isExpired(now: number = Date.now()): boolean {
    return this.props.expiresAt !== null && now >= this.props.expiresAt;
  }

  public isActive(now: number = Date.now()): boolean {
    return !this.isRevoked() && !this.isExpired(now);
  }

  public isValid(now: number = Date.now()): boolean {
    return this.isActive(now);
  }

  public hasScope(scope: string): boolean {
    return this.props.scopes.includes(scope);
  }

  public hasAllScopes(requiredScopes: string[]): boolean {
    return requiredScopes.every((scope) => this.props.scopes.includes(scope));
  }

  // State transitions
  public revoke(at: number = Date.now()): void {
    if (this.props.revokedAt !== null) {
      return; // Idempotent revocation
    }
    this.props.revokedAt = at;
    this.props.updatedAt = at;

    this.raise(
      createApiKeyRevokedEvent({
        keyId: this.props.id,
        clientId: this.props.clientId,
        revokedAt: at,
        now: at,
      }),
    );
  }

  public recordUsage(at: number = Date.now()): void {
    this.props.lastUsedAt = at;
    this.props.updatedAt = at;
  }
}

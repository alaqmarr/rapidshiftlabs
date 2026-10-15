export type AccessPassState = "active" | "overdue" | "blocked" | "suspended";

export interface AccessPassClaims {
  clientId: string;
  allowed: boolean;
  state: AccessPassState;
  keyId?: string;
  clientName?: string;
  metadata?: Record<string, unknown>;
}

export interface JWK {
  kty?: string;
  crv?: string;
  x?: string;
  y?: string;
  kid?: string;
  alg?: string;
  use?: string;
  [key: string]: unknown;
}

export interface JWKS {
  keys: JWK[];
}

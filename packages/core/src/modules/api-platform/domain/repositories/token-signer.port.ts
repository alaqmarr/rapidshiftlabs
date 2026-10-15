import type { AccessPassClaims, JWKS } from "../value-objects/token-claims";

export interface ITokenSigner {
  signAccessPass(claims: AccessPassClaims): Promise<string>;
  getPublicJwks(): Promise<JWKS>;
  getKeyId(): string;
}

import type { ITokenSigner } from "../../domain/repositories/token-signer.port";
import type { AccessPassClaims, JWKS } from "../../domain/value-objects/token-claims";

export class TokenService {
  constructor(private readonly signer: ITokenSigner) {}

  getKeyId(): string {
    return this.signer.getKeyId();
  }

  async signAccessPass(claims: AccessPassClaims): Promise<string> {
    return this.signer.signAccessPass(claims);
  }

  async getPublicJwks(): Promise<JWKS> {
    return this.signer.getPublicJwks();
  }
}

import * as jose from "jose";
import type { ITokenSigner } from "../../domain/repositories/token-signer.port";
import type { AccessPassClaims, JWK, JWKS } from "../../domain/value-objects/token-claims";

export type KeyLike = CryptoKey | Uint8Array;

export interface JoseTokenSignerOptions {
  keyId?: string;
  privateKey?: KeyLike;
  publicKey?: KeyLike;
}

interface KeyPairState {
  privateKey: KeyLike;
  publicKey: KeyLike;
  publicJwk: JWK;
  keyId: string;
}

export class JoseTokenSigner implements ITokenSigner {
  private static sharedState: KeyPairState | null = null;
  private static initPromise: Promise<KeyPairState> | null = null;

  private keyId: string;
  private privateKey?: KeyLike;
  private publicKey?: KeyLike;
  private publicJwk?: JWK;

  constructor(options?: JoseTokenSignerOptions) {
    this.keyId = options?.keyId || "rsl_ed25519_key_1";
    if (options?.privateKey && options?.publicKey) {
      this.privateKey = options.privateKey;
      this.publicKey = options.publicKey;
    }
  }

  static resetSharedKeyPairForTests(): void {
    JoseTokenSigner.sharedState = null;
    JoseTokenSigner.initPromise = null;
  }

  private static async getOrCreateSharedState(defaultKeyId: string): Promise<KeyPairState> {
    if (JoseTokenSigner.sharedState) {
      return JoseTokenSigner.sharedState;
    }

    if (!JoseTokenSigner.initPromise) {
      JoseTokenSigner.initPromise = (async () => {
        const { publicKey, privateKey } = await jose.generateKeyPair("EdDSA", {
          crv: "Ed25519",
          extractable: true,
        });

        const rawJwk = await jose.exportJWK(publicKey);
        const publicJwk: JWK = {
          ...rawJwk,
          kty: rawJwk.kty ?? "OKP",
          kid: defaultKeyId,
          alg: "EdDSA",
          use: "sig",
        };

        const state: KeyPairState = {
          privateKey,
          publicKey,
          publicJwk,
          keyId: defaultKeyId,
        };

        JoseTokenSigner.sharedState = state;
        return state;
      })();
    }

    return JoseTokenSigner.initPromise;
  }

  private async ensureInitialized(): Promise<void> {
    if (this.privateKey && this.publicKey && this.publicJwk) {
      return;
    }

    if (this.privateKey && this.publicKey) {
      const rawJwk = await jose.exportJWK(this.publicKey);
      this.publicJwk = {
        ...rawJwk,
        kty: rawJwk.kty ?? "OKP",
        kid: this.keyId,
        alg: "EdDSA",
        use: "sig",
      };
      return;
    }

    const state = await JoseTokenSigner.getOrCreateSharedState(this.keyId);
    this.privateKey = state.privateKey;
    this.publicKey = state.publicKey;
    this.publicJwk = {
      ...state.publicJwk,
      kid: this.keyId,
    };
  }

  getKeyId(): string {
    return this.keyId;
  }

  async signAccessPass(claims: AccessPassClaims): Promise<string> {
    await this.ensureInitialized();

    const nowSec = Math.floor(Date.now() / 1000);
    const expSec = nowSec + 60; // 60 seconds TTL

    const payload = {
      allowed: claims.allowed,
      state: claims.state,
      keyId: claims.keyId ?? this.keyId,
      clientId: claims.clientId,
      ...(claims.clientName ? { clientName: claims.clientName } : {}),
      ...(claims.metadata ?? {}),
    };

    return new jose.SignJWT(payload)
      .setProtectedHeader({ alg: "EdDSA", kid: this.keyId, typ: "JWT" })
      .setIssuer("rapidshift")
      .setSubject(claims.clientId)
      .setAudience("client-app")
      .setIssuedAt(nowSec)
      .setExpirationTime(expSec)
      .sign(this.privateKey!);
  }

  async getPublicJwks(): Promise<JWKS> {
    await this.ensureInitialized();
    return {
      keys: [this.publicJwk!],
    };
  }
}

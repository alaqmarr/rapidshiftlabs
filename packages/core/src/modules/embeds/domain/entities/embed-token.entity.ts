import { newId } from "../../../../shared/kernel/id";
import type { Permission } from "../../../../shared/kernel/actor";

export interface EmbedTokenProps {
  id: string; // emb_...
  clientId: string;
  scopes: Permission[];
  allowedOrigins: string[];
  expiresAt: number; // 15 min TTL
  createdAt: number;
}

export class EmbedToken {
  constructor(public readonly props: EmbedTokenProps) {}

  public static create(params: {
    id?: string;
    clientId: string;
    scopes: Permission[];
    allowedOrigins?: string[];
    ttlMs?: number; // default 15 minutes = 900,000 ms
    createdAt?: number;
  }): EmbedToken {
    const now = params.createdAt ?? Date.now();
    const ttl = params.ttlMs ?? 15 * 60 * 1000;
    return new EmbedToken({
      id: params.id ?? newId("emb"),
      clientId: params.clientId,
      scopes: params.scopes,
      allowedOrigins: params.allowedOrigins ?? [],
      expiresAt: now + ttl,
      createdAt: now,
    });
  }

  public get id(): string {
    return this.props.id;
  }
  public get clientId(): string {
    return this.props.clientId;
  }
  public get scopes(): Permission[] {
    return this.props.scopes;
  }
  public get allowedOrigins(): string[] {
    return this.props.allowedOrigins;
  }
  public get expiresAt(): number {
    return this.props.expiresAt;
  }

  public isExpired(now: number = Date.now()): boolean {
    return now > this.props.expiresAt;
  }

  public allowsOrigin(origin?: string): boolean {
    if (!origin || this.props.allowedOrigins.length === 0) return true;
    return this.props.allowedOrigins.some((ao) => {
      if (ao === "*") return true;
      try {
        const oUrl = new URL(origin);
        const aUrl = new URL(ao);
        return oUrl.origin === aUrl.origin;
      } catch {
        return ao === origin;
      }
    });
  }

  public hasScope(scope: Permission): boolean {
    return this.props.scopes.includes(scope);
  }
}

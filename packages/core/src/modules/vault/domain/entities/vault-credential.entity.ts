import { newId } from "../../../../shared/kernel/id";

export type VaultCategory =
  | "database"
  | "smtp"
  | "api_key"
  | "server_ssh"
  | "env_file"
  | "other";

export interface VaultCredentialProps {
  id: string;
  clientId: string;
  projectId?: string | null;
  name: string;
  category: VaultCategory;
  username?: string | null;
  encryptedValue: string; // AES-256-GCM envelope
  metadata?: string | null;
  expiresAt?: number | null;
  oneTimeReveal: boolean;
  revealedCount: number;
  lastRevealedAt?: number | null;
  createdAt: number;
  updatedAt: number;
}

export class VaultCredential {
  constructor(public readonly props: VaultCredentialProps) {}

  public static create(params: {
    id?: string;
    clientId: string;
    projectId?: string | null;
    name: string;
    category?: VaultCategory;
    username?: string | null;
    encryptedValue: string;
    metadata?: string | null;
    expiresAt?: number | null;
    oneTimeReveal?: boolean;
    createdAt?: number;
  }): VaultCredential {
    const now = params.createdAt ?? Date.now();
    return new VaultCredential({
      id: params.id ?? newId("vlt"),
      clientId: params.clientId,
      projectId: params.projectId ?? null,
      name: params.name,
      category: params.category ?? "other",
      username: params.username ?? null,
      encryptedValue: params.encryptedValue,
      metadata: params.metadata ?? null,
      expiresAt: params.expiresAt ?? null,
      oneTimeReveal: params.oneTimeReveal ?? false,
      revealedCount: 0,
      lastRevealedAt: null,
      createdAt: now,
      updatedAt: now,
    });
  }

  public get id(): string {
    return this.props.id;
  }
  public get clientId(): string {
    return this.props.clientId;
  }
  public get name(): string {
    return this.props.name;
  }
  public get category(): VaultCategory {
    return this.props.category;
  }
  public get encryptedValue(): string {
    return this.props.encryptedValue;
  }
  public get oneTimeReveal(): boolean {
    return this.props.oneTimeReveal;
  }
  public get revealedCount(): number {
    return this.props.revealedCount;
  }
  public get expiresAt(): number | null | undefined {
    return this.props.expiresAt;
  }

  public isExpired(now: number = Date.now()): boolean {
    if (this.props.expiresAt && now > this.props.expiresAt) return true;
    if (this.props.oneTimeReveal && this.props.revealedCount >= 1) return true;
    return false;
  }

  public recordReveal(now: number = Date.now()): void {
    this.props.revealedCount++;
    this.props.lastRevealedAt = now;
    this.props.updatedAt = now;
    if (this.props.oneTimeReveal) {
      // Once revealed, mark expired immediately
      this.props.expiresAt = now;
    }
  }
}

import { newId } from "../../../../shared/kernel/id";
import type { AdminRole } from "../../../../shared/kernel/actor";
import { Email } from "../value-objects/email.vo";
import { Password } from "../value-objects/password.vo";

export type AdminUserStatus = "active" | "suspended" | "invited";

export interface AdminUserProps {
  id: string;
  email: Email;
  name: string;
  password: Password;
  role: AdminRole;
  supportLevel: 1 | 2 | 3 | null;
  status: AdminUserStatus;
  totpSecretEnc: string | null;
  totpEnabled: boolean;
  sessionVersion: number;
  lastLoginAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export class AdminUser {
  private constructor(private readonly props: AdminUserProps) {}

  public static create(params: {
    email: Email;
    name: string;
    password: Password;
    role: AdminRole;
    supportLevel?: 1 | 2 | 3 | null;
    status?: AdminUserStatus;
  }): AdminUser {
    const now = new Date();
    return new AdminUser({
      id: newId("adm"),
      email: params.email,
      name: params.name.trim(),
      password: params.password,
      role: params.role,
      supportLevel: params.supportLevel ?? null,
      status: params.status ?? "active",
      totpSecretEnc: null,
      totpEnabled: false,
      sessionVersion: 1,
      lastLoginAt: null,
      createdAt: now,
      updatedAt: now,
    });
  }

  public static reconstitute(props: AdminUserProps): AdminUser {
    return new AdminUser(props);
  }

  public get id(): string { return this.props.id; }
  public get email(): Email { return this.props.email; }
  public get name(): string { return this.props.name; }
  public get password(): Password { return this.props.password; }
  public get role(): AdminRole { return this.props.role; }
  public get supportLevel(): 1 | 2 | 3 | null { return this.props.supportLevel; }
  public get status(): AdminUserStatus { return this.props.status; }
  public get totpSecretEnc(): string | null { return this.props.totpSecretEnc; }
  public get totpEnabled(): boolean { return this.props.totpEnabled; }
  public get sessionVersion(): number { return this.props.sessionVersion; }
  public get lastLoginAt(): Date | null { return this.props.lastLoginAt; }
  public get createdAt(): Date { return this.props.createdAt; }
  public get updatedAt(): Date { return this.props.updatedAt; }

  public recordLogin(at = new Date()): void {
    this.props.lastLoginAt = at;
    this.props.updatedAt = at;
  }

  public updateProfile(params: {
    name?: string;
    role?: AdminRole;
    supportLevel?: 1 | 2 | 3 | null;
  }): void {
    if (params.name !== undefined) this.props.name = params.name.trim();
    if (params.role !== undefined) this.props.role = params.role;
    if (params.supportLevel !== undefined) this.props.supportLevel = params.supportLevel;
    this.props.updatedAt = new Date();
  }

  public updatePassword(password: Password): void {
    this.props.password = password;
    this.props.sessionVersion += 1;
    this.props.updatedAt = new Date();
  }

  public suspend(): void {
    this.props.status = "suspended";
    this.props.sessionVersion += 1; // Instant revocation of all active sessions
    this.props.updatedAt = new Date();
  }

  public activate(): void {
    this.props.status = "active";
    this.props.updatedAt = new Date();
  }

  public setTotp(secretEnc: string): void {
    this.props.totpSecretEnc = secretEnc;
    this.props.totpEnabled = true;
    this.props.updatedAt = new Date();
  }

  public disableTotp(): void {
    this.props.totpSecretEnc = null;
    this.props.totpEnabled = false;
    this.props.updatedAt = new Date();
  }

  public incrementSessionVersion(): number {
    this.props.sessionVersion += 1;
    this.props.updatedAt = new Date();
    return this.props.sessionVersion;
  }

  public toState() {
    return {
      id: this.id,
      email: this.email.value,
      name: this.name,
      role: this.role,
      supportLevel: this.supportLevel,
      status: this.status,
      totpEnabled: this.totpEnabled,
      sessionVersion: this.sessionVersion,
      lastLoginAt: this.lastLoginAt ? this.lastLoginAt.getTime() : null,
      createdAt: this.createdAt.getTime(),
      updatedAt: this.updatedAt.getTime(),
    };
  }
}

import { newId } from "../../../../shared/kernel/id";
import type { ClientRole } from "../../../../shared/kernel/actor";
import { Email } from "../value-objects/email.vo";
import { Password } from "../value-objects/password.vo";

export type ClientUserStatus = "active" | "invited" | "suspended";

export interface ClientUserProps {
  id: string;
  clientId: string;
  email: Email;
  name: string;
  password: Password;
  role: ClientRole;
  sessionVersion: number;
  status: ClientUserStatus;
  invitedAt: Date | null;
  lastLoginAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export class ClientUser {
  private constructor(private readonly props: ClientUserProps) {}

  public static create(params: {
    clientId: string;
    email: Email;
    name: string;
    password: Password;
    role?: ClientRole;
  }): ClientUser {
    const now = new Date();
    return new ClientUser({
      id: newId("usr"),
      clientId: params.clientId,
      email: params.email,
      name: params.name.trim(),
      password: params.password,
      role: params.role ?? "client_member",
      sessionVersion: 1,
      status: "active",
      invitedAt: null,
      lastLoginAt: null,
      createdAt: now,
      updatedAt: now,
    });
  }

  public static reconstitute(props: ClientUserProps): ClientUser {
    return new ClientUser(props);
  }

  public get id(): string { return this.props.id; }
  public get clientId(): string { return this.props.clientId; }
  public get email(): Email { return this.props.email; }
  public get name(): string { return this.props.name; }
  public get password(): Password { return this.props.password; }
  public get role(): ClientRole { return this.props.role; }
  public get sessionVersion(): number { return this.props.sessionVersion; }
  public get status(): ClientUserStatus { return this.props.status; }
  public get isActive(): boolean { return this.props.status === "active"; }
  public get invitedAt(): Date | null { return this.props.invitedAt; }
  public get lastLoginAt(): Date | null { return this.props.lastLoginAt; }
  public get createdAt(): Date { return this.props.createdAt; }
  public get updatedAt(): Date { return this.props.updatedAt; }

  public recordLogin(at = new Date()): void {
    this.props.lastLoginAt = at;
    this.props.updatedAt = at;
  }

  public suspend(): void {
    this.props.status = "suspended";
    this.props.updatedAt = new Date();
  }

  public activate(): void {
    this.props.status = "active";
    this.props.updatedAt = new Date();
  }

  public updatePassword(password: Password): void {
    this.props.password = password;
    this.props.sessionVersion += 1;
    this.props.updatedAt = new Date();
  }

  public updateProfile(params: { name?: string; role?: ClientRole }): void {
    if (params.name) this.props.name = params.name.trim();
    if (params.role) this.props.role = params.role;
    this.props.updatedAt = new Date();
  }

  public incrementSessionVersion(): number {
    this.props.sessionVersion += 1;
    this.props.updatedAt = new Date();
    return this.props.sessionVersion;
  }
}

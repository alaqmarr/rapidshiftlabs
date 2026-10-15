export type ServerStatus = "online" | "offline" | "unreachable" | "degraded" | "pending";

export interface ServerProps {
  id: string;
  name: string;
  host: string;
  port: number;
  username: string;
  encryptedPrivateKey: string;
  keyPassphraseEnc: string | null;
  hostFingerprint: string | null;
  status: ServerStatus;
  lastCheckedAt: Date | null;
  errorMessage: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export class Server {
  private constructor(private readonly props: ServerProps) {}

  static reconstitute(props: ServerProps): Server {
    return new Server(props);
  }

  static create(params: {
    id: string;
    name: string;
    host: string;
    port?: number;
    username?: string;
    encryptedPrivateKey: string;
    keyPassphraseEnc?: string | null;
    hostFingerprint?: string | null;
  }): Server {
    const now = new Date();
    return new Server({
      id: params.id,
      name: params.name.trim(),
      host: params.host.trim(),
      port: params.port ?? 22,
      username: params.username?.trim() || "ubuntu",
      encryptedPrivateKey: params.encryptedPrivateKey,
      keyPassphraseEnc: params.keyPassphraseEnc ?? null,
      hostFingerprint: params.hostFingerprint?.trim() || null,
      status: "pending",
      lastCheckedAt: null,
      errorMessage: null,
      createdAt: now,
      updatedAt: now,
    });
  }

  get id(): string {
    return this.props.id;
  }
  get name(): string {
    return this.props.name;
  }
  get host(): string {
    return this.props.host;
  }
  get port(): number {
    return this.props.port;
  }
  get username(): string {
    return this.props.username;
  }
  get encryptedPrivateKey(): string {
    return this.props.encryptedPrivateKey;
  }
  get keyPassphraseEnc(): string | null {
    return this.props.keyPassphraseEnc;
  }
  get hostFingerprint(): string | null {
    return this.props.hostFingerprint;
  }
  get status(): ServerStatus {
    return this.props.status;
  }
  get lastCheckedAt(): Date | null {
    return this.props.lastCheckedAt;
  }
  get errorMessage(): string | null {
    return this.props.errorMessage;
  }
  get createdAt(): Date {
    return this.props.createdAt;
  }
  get updatedAt(): Date {
    return this.props.updatedAt;
  }

  updateStatus(status: ServerStatus, errorMessage: string | null = null): void {
    this.props.status = status;
    this.props.errorMessage = errorMessage;
    this.props.lastCheckedAt = new Date();
    this.props.updatedAt = new Date();
  }

  updateDetails(params: {
    name?: string;
    host?: string;
    port?: number;
    username?: string;
    hostFingerprint?: string | null;
  }): void {
    if (params.name !== undefined) this.props.name = params.name.trim();
    if (params.host !== undefined) this.props.host = params.host.trim();
    if (params.port !== undefined) this.props.port = params.port;
    if (params.username !== undefined) this.props.username = params.username.trim();
    if (params.hostFingerprint !== undefined) {
      this.props.hostFingerprint = params.hostFingerprint ? params.hostFingerprint.trim() : null;
    }
    this.props.updatedAt = new Date();
  }

  updateCredentials(encryptedPrivateKey: string, keyPassphraseEnc: string | null = null): void {
    this.props.encryptedPrivateKey = encryptedPrivateKey;
    this.props.keyPassphraseEnc = keyPassphraseEnc;
    this.props.updatedAt = new Date();
  }

  toSnapshot(): ServerProps {
    return { ...this.props };
  }
}

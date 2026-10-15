export type ProcessStatus =
  | "online"
  | "stopping"
  | "stopped"
  | "launching"
  | "errored"
  | "one-launch-status"
  | "unknown";

export interface Pm2ProcessProps {
  id: string;
  serverId: string;
  pm2Id: number;
  name: string;
  clientId: string | null;
  allowClientRestart: boolean;
  restartCooldownSec: number;
  status: ProcessStatus;
  cpu: number;
  memory: number;
  restarts: number;
  uptimeMs: number;
  lastDiscoveredAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

export class Pm2Process {
  private constructor(private readonly props: Pm2ProcessProps) {}

  static reconstitute(props: Pm2ProcessProps): Pm2Process {
    return new Pm2Process(props);
  }

  static create(params: {
    id: string;
    serverId: string;
    pm2Id: number;
    name: string;
    clientId?: string | null;
    allowClientRestart?: boolean;
    restartCooldownSec?: number;
    status?: ProcessStatus;
    cpu?: number;
    memory?: number;
    restarts?: number;
    uptimeMs?: number;
  }): Pm2Process {
    const now = new Date();
    return new Pm2Process({
      id: params.id,
      serverId: params.serverId,
      pm2Id: params.pm2Id,
      name: params.name.trim(),
      clientId: params.clientId ?? null,
      allowClientRestart: params.allowClientRestart ?? false,
      restartCooldownSec: params.restartCooldownSec ?? 60,
      status: params.status ?? "stopped",
      cpu: params.cpu ?? 0,
      memory: params.memory ?? 0,
      restarts: params.restarts ?? 0,
      uptimeMs: params.uptimeMs ?? 0,
      lastDiscoveredAt: now,
      createdAt: now,
      updatedAt: now,
    });
  }

  get id(): string {
    return this.props.id;
  }
  get serverId(): string {
    return this.props.serverId;
  }
  get pm2Id(): number {
    return this.props.pm2Id;
  }
  get name(): string {
    return this.props.name;
  }
  get clientId(): string | null {
    return this.props.clientId;
  }
  get allowClientRestart(): boolean {
    return this.props.allowClientRestart;
  }
  get restartCooldownSec(): number {
    return this.props.restartCooldownSec;
  }
  get status(): ProcessStatus {
    return this.props.status;
  }
  get cpu(): number {
    return this.props.cpu;
  }
  get memory(): number {
    return this.props.memory;
  }
  get restarts(): number {
    return this.props.restarts;
  }
  get uptimeMs(): number {
    return this.props.uptimeMs;
  }
  get lastDiscoveredAt(): Date {
    return this.props.lastDiscoveredAt;
  }
  get createdAt(): Date {
    return this.props.createdAt;
  }
  get updatedAt(): Date {
    return this.props.updatedAt;
  }

  mapToClient(clientId: string | null, allowRestart = false, cooldownSec = 60): void {
    this.props.clientId = clientId;
    this.props.allowClientRestart = allowRestart;
    this.props.restartCooldownSec = cooldownSec;
    this.props.updatedAt = new Date();
  }

  updateMetrics(params: {
    name?: string;
    status: ProcessStatus;
    cpu: number;
    memory: number;
    restarts: number;
    uptimeMs: number;
  }): void {
    if (params.name) this.props.name = params.name.trim();
    this.props.status = params.status;
    this.props.cpu = params.cpu;
    this.props.memory = params.memory;
    this.props.restarts = params.restarts;
    this.props.uptimeMs = params.uptimeMs;
    this.props.lastDiscoveredAt = new Date();
    this.props.updatedAt = new Date();
  }

  toSnapshot(): Pm2ProcessProps {
    return { ...this.props };
  }
}

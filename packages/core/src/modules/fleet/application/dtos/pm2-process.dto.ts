import type { ProcessStatus } from "../../domain/entities/pm2-process.entity";

export interface Pm2ProcessDTO {
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
  lastDiscoveredAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface MapProcessToClientInput {
  processId: string;
  clientId: string | null;
  allowClientRestart?: boolean;
  restartCooldownSec?: number;
}

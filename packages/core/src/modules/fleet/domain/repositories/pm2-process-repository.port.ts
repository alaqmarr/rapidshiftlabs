import type { Pm2Process } from "../entities/pm2-process.entity";

export interface DiscoveredProcessData {
  pm2Id: number;
  name: string;
  status: string;
  cpu: number;
  memory: number;
  restarts: number;
  uptimeMs: number;
}

export interface Pm2ProcessRepository {
  findById(id: string): Promise<Pm2Process | null>;
  findByServerAndPm2Id(serverId: string, pm2Id: number): Promise<Pm2Process | null>;
  listByServerId(serverId: string): Promise<Pm2Process[]>;
  listByClientId(clientId: string): Promise<Pm2Process[]>;
  listAll(): Promise<Pm2Process[]>;
  save(process: Pm2Process): Promise<void>;
  syncDiscoveredProcesses(
    serverId: string,
    discovered: DiscoveredProcessData[]
  ): Promise<Pm2Process[]>;
  delete(id: string): Promise<void>;
}

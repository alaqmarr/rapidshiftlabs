import type { ServerStatus } from "../../domain/entities/server.entity";

export interface ServerDTO {
  id: string;
  name: string;
  host: string;
  port: number;
  username: string;
  hostFingerprint: string | null;
  status: ServerStatus;
  lastCheckedAt: string | null;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface RegisterServerInput {
  name: string;
  host: string;
  port?: number;
  username?: string;
  privateKey: string;
  keyPassphrase?: string | null;
  hostFingerprint?: string | null;
}

export interface ServerStatsDTO {
  serverId: string;
  serverName: string;
  host: string;
  port: number;
  username: string;
  status: ServerStatus;
  // CPU
  cpuUsagePercent: number;
  cpuCores: number;
  load1: number;
  load5: number;
  load15: number;
  activeThreads: number;
  totalThreads: number;
  // Memory
  memoryTotalMb: number;
  memoryUsedMb: number;
  memoryFreeMb: number;
  memoryAvailableMb: number;
  memoryUsagePercent: number;
  swapTotalMb: number;
  swapUsedMb: number;
  // Disk
  diskTotalGb: number;
  diskUsedGb: number;
  diskFreeGb: number;
  diskUsagePercent: number;
  diskMount: string;
  // OS & Kernel
  osPrettyName: string;
  kernelVersion: string;
  architecture: string;
  uptimeSeconds: number;
  uptimeFormatted: string;
  // PM2 Process Summary
  pm2ProcessCount: number;
  pm2OnlineCount: number;
  pm2TotalMemoryMb: number;
  pm2TotalCpuPercent: number;
  // Metadata
  collectedAt: number;
  recentMetrics?: Array<{
    cpuPercent: number;
    memoryUsedMb: number;
    timestamp: number;
  }>;
}


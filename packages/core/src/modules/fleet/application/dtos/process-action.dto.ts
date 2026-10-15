import type { ProcessActionType, ProcessActionStatus } from "../../domain/entities/process-action.entity";

export interface ProcessActionDTO {
  id: string;
  processId: string;
  clientId: string | null;
  action: ProcessActionType;
  status: ProcessActionStatus;
  triggeredBy: string;
  outputExcerpt: string | null;
  errorMessage: string | null;
  createdAt: string;
}

export interface RestartProcessResultDTO {
  success: boolean;
  message: string;
  actionId: string;
}

export interface RestartProcessOptions {
  timeoutMs?: number;
}

export interface GetProcessLogsOptions {
  lines?: number;
  timeoutMs?: number;
}

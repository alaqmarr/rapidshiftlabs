import type { ProcessAction } from "../entities/process-action.entity";

export interface ProcessActionRepository {
  save(action: ProcessAction): Promise<void>;
  findById(id: string): Promise<ProcessAction | null>;
  findLastSuccessfulRestart(processId: string): Promise<ProcessAction | null>;
  listRecentByProcess(processId: string, limit?: number): Promise<ProcessAction[]>;
}

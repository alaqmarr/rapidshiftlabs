import { DrizzleAuditRepository } from "./infrastructure/drizzle-audit.repository";
import { AuditRecord, type AuditRecordProps } from "./domain/audit-record";

export * from "./domain/audit-record";
export * from "./infrastructure/drizzle-audit.repository";

export class AuditModule {
  public readonly repo: DrizzleAuditRepository;

  constructor(repo?: DrizzleAuditRepository) {
    this.repo = repo ?? new DrizzleAuditRepository();
  }

  async log(params: Omit<AuditRecordProps, "id" | "timestamp"> & { timestamp?: number }): Promise<AuditRecord> {
    const record = AuditRecord.create(params);
    await this.repo.log(record);
    return record;
  }

  async listRecent(limit = 100) {
    return this.repo.listRecent(limit);
  }

  async listByClient(clientId: string, limit = 100) {
    return this.repo.listByClient(clientId, limit);
  }
}

let instance: AuditModule | null = null;

export function getAuditModule(): AuditModule {
  if (!instance) {
    instance = new AuditModule();
  }
  return instance;
}

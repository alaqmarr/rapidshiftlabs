import { desc, eq } from "drizzle-orm";
import type { LibSQLDatabase } from "drizzle-orm/libsql";
import { getDb, uow } from "../../../shared/infrastructure/db";
import { auditLog } from "../../../shared/infrastructure/db/schema/audit-log";
import { AuditRecord } from "../domain/audit-record";

export class DrizzleAuditRepository {
  constructor(private readonly db: LibSQLDatabase<any> = getDb("core")) {}

  async log(record: AuditRecord): Promise<void> {
    await uow.runInTransaction("core", async (tx) => {
      await tx.insert(auditLog).values({
        id: record.id,
        actorId: record.actorId,
        actorType: record.actorType,
        actorEmail: record.actorEmail ?? null,
        clientId: record.clientId ?? null,
        action: record.action,
        entityType: record.entityType,
        entityId: record.entityId,
        ipAddress: record.ipAddress ?? null,
        userAgent: record.userAgent ?? null,
        details: record.details ?? null,
        timestamp: record.timestamp,
      });
    });
  }

  async listRecent(limit = 100): Promise<AuditRecord[]> {
    const rows = await this.db
      .select()
      .from(auditLog)
      .orderBy(desc(auditLog.timestamp))
      .limit(limit);

    return rows.map((r) =>
      AuditRecord.reconstitute({
        id: r.id,
        actorId: r.actorId,
        actorType: r.actorType,
        actorEmail: r.actorEmail,
        clientId: r.clientId,
        action: r.action,
        entityType: r.entityType,
        entityId: r.entityId,
        ipAddress: r.ipAddress,
        userAgent: r.userAgent,
        details: r.details,
        timestamp: r.timestamp,
      }),
    );
  }

  async listByClient(clientId: string, limit = 100): Promise<AuditRecord[]> {
    const rows = await this.db
      .select()
      .from(auditLog)
      .where(eq(auditLog.clientId, clientId))
      .orderBy(desc(auditLog.timestamp))
      .limit(limit);

    return rows.map((r) =>
      AuditRecord.reconstitute({
        id: r.id,
        actorId: r.actorId,
        actorType: r.actorType,
        actorEmail: r.actorEmail,
        clientId: r.clientId,
        action: r.action,
        entityType: r.entityType,
        entityId: r.entityId,
        ipAddress: r.ipAddress,
        userAgent: r.userAgent,
        details: r.details,
        timestamp: r.timestamp,
      }),
    );
  }
}

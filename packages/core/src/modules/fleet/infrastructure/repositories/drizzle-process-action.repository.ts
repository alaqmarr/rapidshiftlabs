import { and, desc, eq } from "drizzle-orm";
import type { LibSQLDatabase } from "drizzle-orm/libsql";
import { getDb, uow, type IUnitOfWork } from "../../../../shared/infrastructure/db";
import { processActions, type ProcessActionRow } from "../../../../shared/infrastructure/db/schema/fleet";
import type { ProcessActionRepository } from "../../domain/repositories/process-action-repository.port";
import {
  ProcessAction,
  type ProcessActionType,
  type ProcessActionStatus,
} from "../../domain/entities/process-action.entity";

export class DrizzleProcessActionRepository implements ProcessActionRepository {
  constructor(
    private readonly db: LibSQLDatabase<any> = getDb("core"),
    private readonly unitOfWork: IUnitOfWork = uow
  ) {}

  async save(action: ProcessAction): Promise<void> {
    await this.unitOfWork.runInTransaction("core", async (tx) => {
      const existing = await tx
        .select({ id: processActions.id })
        .from(processActions)
        .where(eq(processActions.id, action.id))
        .limit(1);

      if (existing.length > 0) {
        await tx
          .update(processActions)
          .set({
            status: action.status as any,
            outputExcerpt: action.outputExcerpt,
            errorMessage: action.errorMessage,
          })
          .where(eq(processActions.id, action.id));
      } else {
        await tx.insert(processActions).values({
          id: action.id,
          processId: action.processId,
          clientId: action.clientId,
          action: action.action as any,
          status: action.status as any,
          triggeredBy: action.triggeredBy,
          outputExcerpt: action.outputExcerpt,
          errorMessage: action.errorMessage,
          createdAt: action.createdAt.getTime(),
        });
      }
    });
  }

  async findById(id: string): Promise<ProcessAction | null> {
    const rows = await this.db
      .select()
      .from(processActions)
      .where(eq(processActions.id, id))
      .limit(1);

    return rows[0] ? this.mapToEntity(rows[0]) : null;
  }

  async findLastSuccessfulRestart(processId: string): Promise<ProcessAction | null> {
    const rows = await this.db
      .select()
      .from(processActions)
      .where(
        and(
          eq(processActions.processId, processId),
          eq(processActions.action, "restart"),
          eq(processActions.status, "success")
        )
      )
      .orderBy(desc(processActions.createdAt))
      .limit(1);

    return rows[0] ? this.mapToEntity(rows[0]) : null;
  }

  async listRecentByProcess(processId: string, limit = 20): Promise<ProcessAction[]> {
    const rows = await this.db
      .select()
      .from(processActions)
      .where(eq(processActions.processId, processId))
      .orderBy(desc(processActions.createdAt))
      .limit(limit);

    return rows.map((r) => this.mapToEntity(r));
  }

  private mapToEntity(row: ProcessActionRow): ProcessAction {
    return ProcessAction.reconstitute({
      id: row.id,
      processId: row.processId,
      clientId: row.clientId,
      action: row.action as ProcessActionType,
      status: row.status as ProcessActionStatus,
      triggeredBy: row.triggeredBy,
      outputExcerpt: row.outputExcerpt,
      errorMessage: row.errorMessage,
      createdAt: new Date(row.createdAt),
    });
  }
}

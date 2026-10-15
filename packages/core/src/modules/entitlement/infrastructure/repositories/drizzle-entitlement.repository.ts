import { eq } from "drizzle-orm";
import type { LibSQLDatabase } from "drizzle-orm/libsql";
import { getDb, uow, type IUnitOfWork } from "../../../../shared/infrastructure/db";
import { entitlements, type EntitlementRow } from "../../../../shared/infrastructure/db/schema/entitlements";
import { DrizzleEventOutboxRepository, type EventOutboxRepository } from "../../../../shared/infrastructure/events/outbox-repository";
import { Entitlement } from "../../domain/entities/entitlement.aggregate";
import type { IEntitlementRepository } from "../../domain/repositories/entitlement-repository.port";

export class DrizzleEntitlementRepository implements IEntitlementRepository {
  constructor(
    private readonly db: LibSQLDatabase<any> = getDb("core"),
    private readonly outboxRepo: EventOutboxRepository = new DrizzleEventOutboxRepository(),
    private readonly uowInstance: IUnitOfWork = uow,
  ) {}

  async findById(id: string, tx?: any): Promise<Entitlement | null> {
    const conn = tx ?? this.db;
    const rows = await conn
      .select()
      .from(entitlements)
      .where(eq(entitlements.id, id))
      .limit(1);

    const row = rows[0];
    return row ? this.mapToEntity(row) : null;
  }

  async findByClientId(clientId: string, tx?: any): Promise<Entitlement | null> {
    const conn = tx ?? this.db;
    const rows = await conn
      .select()
      .from(entitlements)
      .where(eq(entitlements.clientId, clientId))
      .limit(1);

    const row = rows[0];
    return row ? this.mapToEntity(row) : null;
  }

  async save(entitlement: Entitlement, externalTx?: any): Promise<void> {
    const executeInTx = async (tx: any) => {
      const state = entitlement.toState();
      const existing = await tx
        .select({ id: entitlements.id })
        .from(entitlements)
        .where(eq(entitlements.clientId, state.clientId))
        .limit(1);

      if (existing.length > 0) {
        await tx
          .update(entitlements)
          .set({
            status: state.status,
            isBlocked: state.isBlocked,
            reason: state.reason,
            overrideMode: state.manualOverride?.mode ?? null,
            overrideValidUntil: state.manualOverride?.validUntil ?? null,
            overrideNote: state.manualOverride?.note ?? null,
            overrideSetBy: state.manualOverride?.setBy ?? null,
            overrideCreatedAt: state.manualOverride?.createdAt ?? null,
            lastEvaluatedAt: state.lastEvaluatedAt,
            updatedAt: state.updatedAt,
          })
          .where(eq(entitlements.clientId, state.clientId));
      } else {
        await tx.insert(entitlements).values({
          id: state.id,
          clientId: state.clientId,
          status: state.status,
          isBlocked: state.isBlocked,
          reason: state.reason,
          overrideMode: state.manualOverride?.mode ?? null,
          overrideValidUntil: state.manualOverride?.validUntil ?? null,
          overrideNote: state.manualOverride?.note ?? null,
          overrideSetBy: state.manualOverride?.setBy ?? null,
          overrideCreatedAt: state.manualOverride?.createdAt ?? null,
          lastEvaluatedAt: state.lastEvaluatedAt,
          createdAt: state.createdAt,
          updatedAt: state.updatedAt,
        });
      }

      // Atomically dispatch raised domain events to transactional outbox
      const events = entitlement.pullEvents();
      if (events.length > 0) {
        await this.outboxRepo.append(events, tx);
      }
    };

    if (externalTx) {
      await executeInTx(externalTx);
    } else {
      await this.uowInstance.runInTransaction("core", async (tx) => {
        await executeInTx(tx);
      });
    }
  }

  async listBlocked(limit = 100): Promise<Entitlement[]> {
    const rows = await this.db
      .select()
      .from(entitlements)
      .where(eq(entitlements.isBlocked, true))
      .limit(limit);

    return rows.map((r) => this.mapToEntity(r));
  }

  async listAll(options?: { status?: string; limit?: number; offset?: number }): Promise<Entitlement[]> {
    let query = this.db.select().from(entitlements);
    if (options?.status) {
      query = query.where(eq(entitlements.status, options.status as any)) as any;
    }
    if (options?.limit) {
      query = query.limit(options.limit) as any;
    }
    if (options?.offset) {
      query = query.offset(options.offset) as any;
    }

    const rows = await query;
    return rows.map((r) => this.mapToEntity(r));
  }

  private mapToEntity(row: EntitlementRow): Entitlement {
    return Entitlement.reconstitute({
      id: row.id,
      clientId: row.clientId,
      status: row.status,
      isBlocked: Boolean(row.isBlocked),
      reason: row.reason,
      manualOverride: row.overrideMode
        ? {
            mode: row.overrideMode as any,
            validUntil: row.overrideValidUntil,
            note: row.overrideNote,
            setBy: row.overrideSetBy,
            createdAt: row.overrideCreatedAt ?? row.updatedAt,
          }
        : null,
      lastEvaluatedAt: row.lastEvaluatedAt,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    });
  }
}

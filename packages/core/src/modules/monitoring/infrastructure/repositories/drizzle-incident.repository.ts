import { eq, and, ne, desc } from "drizzle-orm";
import type { LibSQLDatabase } from "drizzle-orm/libsql";
import { getDb, uow } from "../../../../shared/infrastructure/db";
import {
  incidentsTable,
  type IncidentRow,
} from "../../../../shared/infrastructure/db/schema/monitoring";
import { outbox } from "../../../../shared/infrastructure/db/schema/outbox";
import type { IncidentRepositoryPort } from "../../domain/ports/incident-repo.port";
import {
  Incident,
  type IncidentProps,
} from "../../domain/entities/incident.entity";

export class DrizzleIncidentRepository implements IncidentRepositoryPort {
  constructor(private readonly db: LibSQLDatabase<any> = getDb("core")) {}

  async findById(id: string): Promise<Incident | null> {
    const rows = await this.db
      .select()
      .from(incidentsTable)
      .where(eq(incidentsTable.id, id))
      .limit(1);

    const row = rows[0];
    if (!row) return null;
    return this.mapToEntity(row);
  }

  async findActiveByDomainId(domainId: string): Promise<Incident | null> {
    const rows = await this.db
      .select()
      .from(incidentsTable)
      .where(
        and(
          eq(incidentsTable.domainId, domainId),
          ne(incidentsTable.status, "resolved"),
        ),
      )
      .orderBy(desc(incidentsTable.startedAt))
      .limit(1);

    const row = rows[0];
    if (!row) return null;
    return this.mapToEntity(row);
  }

  async findActiveByClientId(clientId: string): Promise<Incident[]> {
    const rows = await this.db
      .select()
      .from(incidentsTable)
      .where(
        and(
          eq(incidentsTable.clientId, clientId),
          ne(incidentsTable.status, "resolved"),
        ),
      )
      .orderBy(desc(incidentsTable.startedAt));

    return rows.map((r) => this.mapToEntity(r));
  }

  async findRecentByClientId(clientId: string, limit = 10): Promise<Incident[]> {
    const rows = await this.db
      .select()
      .from(incidentsTable)
      .where(
        and(
          eq(incidentsTable.clientId, clientId),
          eq(incidentsTable.status, "resolved"),
        ),
      )
      .orderBy(desc(incidentsTable.startedAt))
      .limit(limit);

    return rows.map((r) => this.mapToEntity(r));
  }

  async save(incident: Incident): Promise<void> {
    await uow.runInTransaction("core", async (tx) => {
      const state = incident.toState();
      const existing = await tx
        .select({ id: incidentsTable.id })
        .from(incidentsTable)
        .where(eq(incidentsTable.id, state.id))
        .limit(1);

      const values = {
        id: state.id,
        domainId: state.domainId,
        clientId: state.clientId,
        type: state.type,
        status: state.status,
        severity: state.severity,
        title: state.title,
        reason: state.reason,
        failureCount: state.failureCount,
        startedAt: state.startedAt,
        openedAt: state.openedAt,
        resolvedAt: state.resolvedAt,
        durationSeconds: state.durationSeconds,
        linkedTicketId: state.linkedTicketId,
        notifiedAt: state.notifiedAt,
        createdAt: state.createdAt,
        updatedAt: state.updatedAt,
      };

      if (existing.length > 0) {
        await tx
          .update(incidentsTable)
          .set(values)
          .where(eq(incidentsTable.id, state.id));
      } else {
        await tx.insert(incidentsTable).values(values);
      }

      // Flush domain events to outbox
      const events = incident.pullEvents();
      if (events.length > 0) {
        const outboxRows = events.map((event) => ({
          id: event.id,
          type: event.type,
          aggregateType: event.aggregateType,
          aggregateId: event.aggregateId,
          clientId: event.clientId ?? null,
          payload: JSON.stringify(event.payload),
          occurredAt: event.occurredAt,
          status: "pending" as const,
          attempts: 0,
          maxAttempts: 5,
          nextRetryAt: event.occurredAt,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        }));
        await tx.insert(outbox).values(outboxRows);
      }
    });
  }

  private mapToEntity(row: IncidentRow): Incident {
    const props: IncidentProps = {
      id: row.id,
      domainId: row.domainId,
      clientId: row.clientId ?? null,
      type: (row.type ?? "http") as any,
      status: row.status as any,
      severity: (row.severity ?? "critical") as any,
      title: row.title ?? null,
      reason: row.reason ?? "",
      failureCount: row.failureCount ?? 0,
      startedAt: row.startedAt ?? row.createdAt ?? Date.now(),
      openedAt: row.openedAt ?? row.startedAt ?? null,
      resolvedAt: row.resolvedAt ?? null,
      durationSeconds: row.durationSeconds ?? null,
      linkedTicketId: row.linkedTicketId ?? null,
      notifiedAt: row.notifiedAt ?? null,
      createdAt: row.createdAt ?? Date.now(),
      updatedAt: row.updatedAt ?? Date.now(),
    };

    return Incident.reconstitute(props);
  }
}

import { eq, and, inArray, isNull, lte, desc, asc, count as sqlCount } from "drizzle-orm";
import type { LibSQLDatabase } from "drizzle-orm/libsql";
import { getDb, uow, type IUnitOfWork } from "../../../../shared/infrastructure/db";
import {
  ticketsTable,
  ticketMessagesTable,
  cannedRepliesTable,
} from "../../../../shared/infrastructure/db/schema/support";
import {
  DrizzleEventOutboxRepository,
  type EventOutboxRepository,
} from "../../../../shared/infrastructure/events/outbox-repository";
import type { ITicketRepository, TicketFilter } from "../../domain/ports/ticket-repository.port";
import { Ticket, type TicketProps } from "../../domain/entities/ticket.entity";
import { TicketMessage } from "../../domain/entities/ticket-message.entity";
import { CannedReply } from "../../domain/entities/canned-reply.entity";

export class DrizzleTicketRepository implements ITicketRepository {
  constructor(
    private readonly db: LibSQLDatabase<any> = getDb("core"),
    private readonly outboxRepo: EventOutboxRepository = new DrizzleEventOutboxRepository(),
    private readonly uowInstance: IUnitOfWork = uow,
  ) {}

  async save(ticket: Ticket): Promise<void> {
    const state = ticket.toState();

    await this.uowInstance.runInTransaction("core", async (tx) => {
      const existing = await tx
        .select()
        .from(ticketsTable)
        .where(eq(ticketsTable.id, state.id))
        .limit(1);

      if (existing.length > 0) {
        await tx
          .update(ticketsTable)
          .set({
            clientId: state.clientId,
            projectId: state.projectId,
            category: state.category,
            subject: state.subject,
            priority: state.priority,
            level: state.level,
            status: state.status,
            assigneeId: state.assigneeId,
            assigneeName: state.assigneeName,
            source: state.source,
            firstResponseDueAt: state.firstResponseDueAt,
            firstRespondedAt: state.firstRespondedAt,
            resolutionDueAt: state.resolutionDueAt,
            resolvedAt: state.resolvedAt,
            closedAt: state.closedAt,
            slaPausedAt: state.slaPausedAt,
            totalPausedMs: state.totalPausedMs,
            slaBreached: state.slaBreached,
            linkedIncidentId: state.linkedIncidentId,
            linkedProcessId: state.linkedProcessId,
            csatRating: state.csatRating,
            csatFeedback: state.csatFeedback,
            updatedAt: state.updatedAt,
          })
          .where(eq(ticketsTable.id, state.id));
      } else {
        await tx.insert(ticketsTable).values({
          id: state.id,
          number: state.number,
          clientId: state.clientId,
          projectId: state.projectId,
          category: state.category,
          subject: state.subject,
          priority: state.priority,
          level: state.level,
          status: state.status,
          assigneeId: state.assigneeId,
          assigneeName: state.assigneeName,
          source: state.source,
          firstResponseDueAt: state.firstResponseDueAt,
          firstRespondedAt: state.firstRespondedAt,
          resolutionDueAt: state.resolutionDueAt,
          resolvedAt: state.resolvedAt,
          closedAt: state.closedAt,
          slaPausedAt: state.slaPausedAt,
          totalPausedMs: state.totalPausedMs,
          slaBreached: state.slaBreached,
          linkedIncidentId: state.linkedIncidentId,
          linkedProcessId: state.linkedProcessId,
          csatRating: state.csatRating,
          csatFeedback: state.csatFeedback,
          createdAt: state.createdAt,
          updatedAt: state.updatedAt,
        });
      }

      const events = ticket.pullEvents();
      if (events.length > 0) {
        await this.outboxRepo.append(events, tx);
      }
    });
  }

  async findById(id: string): Promise<Ticket | null> {
    const rows = await this.db
      .select()
      .from(ticketsTable)
      .where(eq(ticketsTable.id, id))
      .limit(1);

    const row = rows[0];
    if (!row) return null;
    return this.mapToEntity(row);
  }

  async findByNumber(number: string): Promise<Ticket | null> {
    const rows = await this.db
      .select()
      .from(ticketsTable)
      .where(eq(ticketsTable.number, number))
      .limit(1);

    const row = rows[0];
    if (!row) return null;
    return this.mapToEntity(row);
  }

  async findByLinkedIncidentId(incidentId: string): Promise<Ticket | null> {
    const rows = await this.db
      .select()
      .from(ticketsTable)
      .where(eq(ticketsTable.linkedIncidentId, incidentId))
      .limit(1);

    const row = rows[0];
    if (!row) return null;
    return this.mapToEntity(row);
  }

  async findTicketsDueForEscalation(now: number): Promise<Ticket[]> {
    const rows = await this.db
      .select()
      .from(ticketsTable)
      .where(
        inArray(ticketsTable.status, ["open", "in_progress", "waiting_on_client", "escalated"]),
      );

    const candidates = rows.map((r) => this.mapToEntity(r));
    return candidates.filter((ticket) => {
      if (ticket.status === "waiting_on_client") return false; // SLA paused
      if (ticket.status === "resolved" || ticket.status === "closed" || ticket.resolvedAt) return false;
      if (ticket.level === "L3") return false; // Capped at L3

      // L1: Breached response or resolution advances to L2
      if (ticket.level === "L1") {
        if (!ticket.firstRespondedAt && now > ticket.firstResponseDueAt) return true;
        if (now > ticket.resolutionDueAt) return true;
      }

      // L2: Breached resolution advances to L3
      if (ticket.level === "L2") {
        if (now > ticket.resolutionDueAt) {
          // If already at L2, allow escalation to L3 once resolution is breached.
          // Require at least 60s cooldown from previous update to avoid instant double-jump in the same tick.
          const cooldownMs = 60_000;
          return now - ticket.updatedAt >= cooldownMs;
        }
      }

      return false;
    });
  }

  async list(filter?: TicketFilter): Promise<Ticket[]> {
    const conditions = this.buildFilterConditions(filter);

    let query = this.db
      .select()
      .from(ticketsTable)
      .orderBy(desc(ticketsTable.createdAt));

    if (conditions.length > 0) {
      query = (query as any).where(and(...conditions));
    }

    if (filter?.limit) {
      query = (query as any).limit(filter.limit);
    }
    if (filter?.offset) {
      query = (query as any).offset(filter.offset);
    }

    const rows = await query;
    return rows.map((r) => this.mapToEntity(r));
  }

  async count(filter?: TicketFilter): Promise<number> {
    const conditions = this.buildFilterConditions(filter);

    let query = this.db.select({ value: sqlCount() }).from(ticketsTable);

    if (conditions.length > 0) {
      query = (query as any).where(and(...conditions));
    }

    const res = await query;
    return res[0]?.value ?? 0;
  }

  async saveMessage(message: TicketMessage): Promise<void> {
    const p = message.props;
    await this.db.insert(ticketMessagesTable).values({
      id: p.id,
      ticketId: p.ticketId,
      authorId: p.authorId,
      authorType: p.authorType,
      authorName: p.authorName,
      body: p.body,
      isInternal: p.isInternal,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
    });
  }

  async listMessages(ticketId: string, includeInternal = true): Promise<TicketMessage[]> {
    let query = this.db
      .select()
      .from(ticketMessagesTable)
      .where(
        includeInternal
          ? eq(ticketMessagesTable.ticketId, ticketId)
          : and(
              eq(ticketMessagesTable.ticketId, ticketId),
              eq(ticketMessagesTable.isInternal, false),
            ),
      )
      .orderBy(asc(ticketMessagesTable.createdAt));

    const rows = await query;
    return rows.map(
      (r) =>
        new TicketMessage({
          id: r.id,
          ticketId: r.ticketId,
          authorId: r.authorId,
          authorType: r.authorType as "admin" | "client" | "system",
          authorName: r.authorName,
          body: r.body,
          isInternal: Boolean(r.isInternal),
          createdAt: r.createdAt,
          updatedAt: r.updatedAt,
        }),
    );
  }

  async saveCannedReply(reply: CannedReply): Promise<void> {
    const p = reply.props;
    await this.db.insert(cannedRepliesTable).values({
      id: p.id,
      title: p.title,
      category: p.category,
      content: p.content,
      shortcut: p.shortcut,
      createdAt: p.createdAt,
    });
  }

  async listCannedReplies(category?: string): Promise<CannedReply[]> {
    let query = this.db.select().from(cannedRepliesTable).orderBy(asc(cannedRepliesTable.title));

    if (category) {
      query = (query as any).where(eq(cannedRepliesTable.category, category));
    }

    const rows = await query;
    return rows.map(
      (r) =>
        new CannedReply({
          id: r.id,
          title: r.title,
          category: r.category,
          content: r.content,
          shortcut: r.shortcut,
          createdAt: r.createdAt,
        }),
    );
  }

  async deleteCannedReply(id: string): Promise<void> {
    await this.db.delete(cannedRepliesTable).where(eq(cannedRepliesTable.id, id));
  }

  private buildFilterConditions(filter?: TicketFilter) {
    const conditions: any[] = [];
    if (!filter) return conditions;

    if (filter.clientId) {
      conditions.push(eq(ticketsTable.clientId, filter.clientId));
    }
    if (filter.projectId) {
      conditions.push(eq(ticketsTable.projectId, filter.projectId));
    }
    if (filter.status) {
      if (Array.isArray(filter.status)) {
        conditions.push(inArray(ticketsTable.status, filter.status));
      } else {
        conditions.push(eq(ticketsTable.status, filter.status));
      }
    }
    if (filter.priority) {
      if (Array.isArray(filter.priority)) {
        conditions.push(inArray(ticketsTable.priority, filter.priority));
      } else {
        conditions.push(eq(ticketsTable.priority, filter.priority));
      }
    }
    if (filter.level) {
      conditions.push(eq(ticketsTable.level, filter.level));
    }
    if (filter.assigneeId) {
      conditions.push(eq(ticketsTable.assigneeId, filter.assigneeId));
    }

    return conditions;
  }

  private mapToEntity(row: any): Ticket {
    const props: TicketProps = {
      id: row.id,
      number: row.number,
      clientId: row.clientId,
      projectId: row.projectId,
      category: row.category,
      subject: row.subject,
      priority: row.priority,
      level: row.level,
      status: row.status,
      assigneeId: row.assigneeId,
      assigneeName: row.assigneeName,
      source: row.source,
      firstResponseDueAt: row.firstResponseDueAt,
      firstRespondedAt: row.firstRespondedAt,
      resolutionDueAt: row.resolutionDueAt,
      resolvedAt: row.resolvedAt,
      closedAt: row.closedAt,
      slaPausedAt: row.slaPausedAt,
      totalPausedMs: row.totalPausedMs ?? 0,
      slaBreached: Boolean(row.slaBreached),
      linkedIncidentId: row.linkedIncidentId,
      linkedProcessId: row.linkedProcessId,
      csatRating: row.csatRating,
      csatFeedback: row.csatFeedback,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
    return Ticket.reconstitute(props);
  }
}

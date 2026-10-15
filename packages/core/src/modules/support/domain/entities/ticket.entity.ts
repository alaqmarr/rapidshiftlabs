import { AggregateRoot, createEvent } from "../../../../shared/kernel/domain-event";
import { newId } from "../../../../shared/kernel/id";

export type TicketCategory =
  | "bug"
  | "outage"
  | "change-request"
  | "billing"
  | "access"
  | "question";

export type TicketPriority = "P1" | "P2" | "P3" | "P4";
export type TicketLevel = "L1" | "L2" | "L3";
export type TicketStatus =
  | "open"
  | "in_progress"
  | "waiting_on_client"
  | "resolved"
  | "closed"
  | "escalated";

export type TicketSource = "portal" | "admin" | "system" | "email" | "api";

export const SLA_POLICIES: Record<
  TicketPriority,
  { firstResponseMs: number; resolutionMs: number }
> = {
  P1: { firstResponseMs: 15 * 60 * 1000, resolutionMs: 4 * 60 * 60 * 1000 }, // 15m / 4h
  P2: { firstResponseMs: 60 * 60 * 1000, resolutionMs: 8 * 60 * 60 * 1000 }, // 1h / 8h
  P3: { firstResponseMs: 4 * 60 * 60 * 1000, resolutionMs: 24 * 60 * 60 * 1000 }, // 4h / 24h
  P4: { firstResponseMs: 24 * 60 * 60 * 1000, resolutionMs: 72 * 60 * 60 * 1000 }, // 24h / 72h
};

export interface TicketProps {
  id: string;
  number: string;
  clientId: string;
  projectId?: string | null;
  category: TicketCategory;
  subject: string;
  priority: TicketPriority;
  level: TicketLevel;
  status: TicketStatus;
  assigneeId?: string | null;
  assigneeName?: string | null;
  source: TicketSource;
  firstResponseDueAt: number;
  firstRespondedAt?: number | null;
  resolutionDueAt: number;
  resolvedAt?: number | null;
  closedAt?: number | null;
  slaPausedAt?: number | null;
  totalPausedMs: number;
  slaBreached: boolean;
  linkedIncidentId?: string | null;
  linkedProcessId?: string | null;
  csatRating?: number | null;
  csatFeedback?: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface CreateTicketParams {
  id?: string;
  number?: string;
  clientId: string;
  projectId?: string | null;
  category?: TicketCategory;
  subject: string;
  priority?: TicketPriority;
  source?: TicketSource;
  assigneeId?: string | null;
  assigneeName?: string | null;
  linkedIncidentId?: string | null;
  linkedProcessId?: string | null;
  createdAt?: number;
}

export class Ticket extends AggregateRoot<TicketProps> {
  public static create(params: CreateTicketParams): Ticket {
    const now = params.createdAt ?? Date.now();
    const priority = params.priority ?? "P3";
    const sla = SLA_POLICIES[priority];
    const id = params.id ?? newId("tkt");
    const number =
      params.number ?? `TKT-${Math.floor(100000 + Math.random() * 900000)}`;

    const props: TicketProps = {
      id,
      number,
      clientId: params.clientId,
      projectId: params.projectId ?? null,
      category: params.category ?? "question",
      subject: params.subject,
      priority,
      level: "L1",
      status: "open",
      assigneeId: params.assigneeId ?? null,
      assigneeName: params.assigneeName ?? null,
      source: params.source ?? "portal",
      firstResponseDueAt: now + sla.firstResponseMs,
      firstRespondedAt: null,
      resolutionDueAt: now + sla.resolutionMs,
      resolvedAt: null,
      closedAt: null,
      slaPausedAt: null,
      totalPausedMs: 0,
      slaBreached: false,
      linkedIncidentId: params.linkedIncidentId ?? null,
      linkedProcessId: params.linkedProcessId ?? null,
      csatRating: null,
      csatFeedback: null,
      createdAt: now,
      updatedAt: now,
    };

    const ticket = new Ticket(props);
    ticket.raise(
      createEvent("TicketCreated", {
        aggregateType: "Ticket",
        aggregateId: id,
        clientId: props.clientId,
        payload: {
          ticketId: id,
          number,
          clientId: props.clientId,
          projectId: props.projectId,
          subject: props.subject,
          priority: props.priority,
          level: props.level,
        },
      }),
    );

    return ticket;
  }

  public static reconstitute(props: TicketProps): Ticket {
    return new Ticket(props);
  }

  public get id(): string {
    return this.props.id;
  }
  public get number(): string {
    return this.props.number;
  }
  public get clientId(): string {
    return this.props.clientId;
  }
  public get subject(): string {
    return this.props.subject;
  }
  public get category(): TicketCategory {
    return this.props.category;
  }
  public get priority(): TicketPriority {
    return this.props.priority;
  }
  public get level(): TicketLevel {
    return this.props.level;
  }
  public get status(): TicketStatus {
    return this.props.status;
  }
  public get firstResponseDueAt(): number {
    return this.props.firstResponseDueAt;
  }
  public get firstRespondedAt(): number | null | undefined {
    return this.props.firstRespondedAt;
  }
  public get resolutionDueAt(): number {
    return this.props.resolutionDueAt;
  }
  public get resolvedAt(): number | null | undefined {
    return this.props.resolvedAt;
  }
  public get isSlaBreached(): boolean {
    return this.props.slaBreached;
  }
  public get slaBreached(): boolean {
    return this.props.slaBreached;
  }
  public get slaPausedAt(): number | null | undefined {
    return this.props.slaPausedAt;
  }
  public get totalPausedMs(): number {
    return this.props.totalPausedMs;
  }
  public get csatRating(): number | null | undefined {
    return this.props.csatRating;
  }
  public get csatFeedback(): string | null | undefined {
    return this.props.csatFeedback;
  }
  public get createdAt(): number {
    return this.props.createdAt;
  }
  public get updatedAt(): number {
    return this.props.updatedAt;
  }

  public recordFirstResponse(respondedAt: number = Date.now()): void {
    if (!this.props.firstRespondedAt) {
      this.props.firstRespondedAt = respondedAt;
      this.props.updatedAt = respondedAt;
      if (this.props.status === "open") {
        this.props.status = "in_progress";
      }
    }
  }

  public updateStatus(
    newStatus: TicketStatus,
    now: number = Date.now(),
    reason?: string,
  ): void {
    const oldStatus = this.props.status;
    if (oldStatus === newStatus) return;

    // Handle SLA pause transition
    if (newStatus === "waiting_on_client" && oldStatus !== "waiting_on_client") {
      this.props.slaPausedAt = now;
    } else if (
      oldStatus === "waiting_on_client" &&
      newStatus !== "waiting_on_client" &&
      this.props.slaPausedAt
    ) {
      const pausedDelta = Math.max(0, now - this.props.slaPausedAt);
      this.props.totalPausedMs += pausedDelta;
      this.props.slaPausedAt = null;
      // Adjust due dates forward by pausedDelta
      this.props.firstResponseDueAt += pausedDelta;
      this.props.resolutionDueAt += pausedDelta;
    }

    if (newStatus === "resolved") {
      this.props.resolvedAt = now;
    } else if (newStatus === "closed") {
      this.props.closedAt = now;
      if (!this.props.resolvedAt) this.props.resolvedAt = now;
    } else if (oldStatus === "resolved" && (newStatus === "open" || newStatus === "in_progress")) {
      // Reopened
      this.props.resolvedAt = null;
    }

    this.props.status = newStatus;
    this.props.updatedAt = now;

    this.raise(
      createEvent("TicketStatusChanged", {
        aggregateType: "Ticket",
        aggregateId: this.id,
        clientId: this.clientId,
        payload: {
          ticketId: this.id,
          clientId: this.clientId,
          oldStatus,
          newStatus,
          reason,
        },
      }),
    );
  }

  public escalate(
    reason: string,
    triggeredBy: "system" | "staff" | "client",
    targetLevel?: TicketLevel,
    now: number = Date.now(),
  ): void {
    const fromLevel = this.props.level;
    let toLevel: TicketLevel = targetLevel ?? fromLevel;

    if (!targetLevel) {
      if (fromLevel === "L1") toLevel = "L2";
      else if (fromLevel === "L2") toLevel = "L3";
      else toLevel = "L3";
    }

    this.props.level = toLevel;
    this.props.status = "escalated";
    this.props.updatedAt = now;

    this.raise(
      createEvent("TicketEscalated", {
        aggregateType: "Ticket",
        aggregateId: this.id,
        clientId: this.clientId,
        payload: {
          ticketId: this.id,
          clientId: this.clientId,
          fromLevel,
          toLevel,
          reason,
          triggeredBy,
        },
      }),
    );
  }

  public checkAndMarkSlaBreach(now: number = Date.now()): boolean {
    if (this.props.status === "resolved" || this.props.status === "closed") {
      return false;
    }

    let breached = false;
    let breachType: "first_response" | "resolution" = "resolution";
    let dueAt = this.props.resolutionDueAt;

    // Check first response breach
    if (!this.props.firstRespondedAt && now > this.props.firstResponseDueAt) {
      breached = true;
      breachType = "first_response";
      dueAt = this.props.firstResponseDueAt;
    } else if (!this.props.resolvedAt && now > this.props.resolutionDueAt) {
      breached = true;
      breachType = "resolution";
      dueAt = this.props.resolutionDueAt;
    }

    if (breached && !this.props.slaBreached) {
      this.props.slaBreached = true;
      this.props.updatedAt = now;
      this.raise(
        createEvent("SlaBreached", {
          aggregateType: "Ticket",
          aggregateId: this.id,
          clientId: this.clientId,
          payload: {
            ticketId: this.id,
            clientId: this.clientId,
            priority: this.props.priority,
            level: this.props.level,
            breachType,
            dueAt,
          },
        }),
      );
      return true;
    }

    return false;
  }

  public submitCsat(rating: number, feedback?: string, now: number = Date.now()): void {
    if (rating < 1 || rating > 5) {
      throw new Error("CSAT rating must be between 1 and 5");
    }
    this.props.csatRating = rating;
    this.props.csatFeedback = feedback ?? null;
    this.props.updatedAt = now;
  }

  public assign(assigneeId: string | null, assigneeName: string | null, now: number = Date.now()): void {
    this.props.assigneeId = assigneeId;
    this.props.assigneeName = assigneeName;
    this.props.updatedAt = now;
  }
}

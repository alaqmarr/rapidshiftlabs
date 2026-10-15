import { AggregateRoot } from "../../../../shared/kernel/domain-event";
import { newId } from "../../../../shared/kernel/id";
import { invariant } from "../../../../shared/kernel/errors";
import { createIncidentOpenedEvent } from "../events/incident-opened.event";
import { createIncidentResolvedEvent } from "../events/incident-resolved.event";

export type IncidentType = "http" | "ssl" | "dns";
export type IncidentStatus = "open" | "acknowledged" | "resolved";
export type IncidentSeverity = "critical" | "warning" | "info";

export interface IncidentProps {
  id: string; // inc_...
  domainId: string;
  clientId: string | null;
  type: IncidentType;
  status: IncidentStatus;
  severity: IncidentSeverity;
  title: string | null;
  reason: string;
  failureCount: number;
  startedAt: number;
  openedAt: number | null;
  resolvedAt: number | null;
  durationSeconds: number | null;
  linkedTicketId: string | null;
  notifiedAt: number | null;
  createdAt: number;
  updatedAt: number;
}

export class Incident extends AggregateRoot<IncidentProps> {
  private constructor(props: IncidentProps) {
    super(props);
  }

  public static create(params: {
    domainId: string;
    clientId?: string | null;
    type?: IncidentType;
    severity?: IncidentSeverity;
    title?: string | null;
    reason: string;
    failureCount?: number;
    startedAt?: number;
  }): Incident {
    invariant(params.domainId, "missing_domain_id", "Domain ID is required for incident");
    invariant(params.reason?.trim(), "missing_reason", "Reason is required for incident");

    const now = Date.now();
    const startedAt = params.startedAt ?? now;
    const id = newId("inc");
    const type: IncidentType = params.type ?? "http";
    const severity: IncidentSeverity = params.severity ?? "critical";
    const failureCount = params.failureCount ?? 1;
    const title = params.title?.trim() || `${type.toUpperCase()} failure on domain`;

    const incident = new Incident({
      id,
      domainId: params.domainId,
      clientId: params.clientId ?? null,
      type,
      status: "open",
      severity,
      title,
      reason: params.reason.trim(),
      failureCount,
      startedAt,
      openedAt: startedAt,
      resolvedAt: null,
      durationSeconds: null,
      linkedTicketId: null,
      notifiedAt: null,
      createdAt: now,
      updatedAt: now,
    });

    incident.raise(
      createIncidentOpenedEvent({
        incidentId: id,
        domainId: params.domainId,
        clientId: params.clientId ?? null,
        type,
        severity,
        reason: params.reason.trim(),
        failureCount,
        startedAt,
      }),
    );

    return incident;
  }

  public static reconstitute(props: IncidentProps): Incident {
    return new Incident({ ...props });
  }

  public override toState(): Readonly<IncidentProps> {
    return Object.freeze({ ...this.props });
  }

  // Getters
  public get id(): string { return this.props.id; }
  public get domainId(): string { return this.props.domainId; }
  public get clientId(): string | null { return this.props.clientId; }
  public get type(): IncidentType { return this.props.type; }
  public get status(): IncidentStatus { return this.props.status; }
  public get severity(): IncidentSeverity { return this.props.severity; }
  public get title(): string | null { return this.props.title; }
  public get reason(): string { return this.props.reason; }
  public get failureCount(): number { return this.props.failureCount; }
  public get startedAt(): number { return this.props.startedAt; }
  public get openedAt(): number | null { return this.props.openedAt; }
  public get resolvedAt(): number | null { return this.props.resolvedAt; }
  public get durationSeconds(): number | null { return this.props.durationSeconds; }
  public get linkedTicketId(): string | null { return this.props.linkedTicketId; }
  public get notifiedAt(): number | null { return this.props.notifiedAt; }
  public get createdAt(): number { return this.props.createdAt; }
  public get updatedAt(): number { return this.props.updatedAt; }

  // Lifecycle methods
  public resolve(timestamp?: number): void {
    if (this.props.status === "resolved") {
      return;
    }

    const at = timestamp ?? Date.now();
    const duration = Math.max(0, Math.floor((at - this.props.startedAt) / 1000));

    this.props.status = "resolved";
    this.props.resolvedAt = at;
    this.props.durationSeconds = duration;
    this.props.updatedAt = at;

    this.raise(
      createIncidentResolvedEvent({
        incidentId: this.props.id,
        domainId: this.props.domainId,
        clientId: this.props.clientId,
        startedAt: this.props.startedAt,
        resolvedAt: at,
        durationSeconds: duration,
      }),
    );
  }

  public acknowledge(): void {
    if (this.props.status !== "open") {
      return;
    }
    this.props.status = "acknowledged";
    this.props.updatedAt = Date.now();
  }

  public linkTicket(ticketId: string): void {
    this.props.linkedTicketId = ticketId;
    this.props.updatedAt = Date.now();
  }

  public markNotified(): void {
    this.props.notifiedAt = Date.now();
    this.props.updatedAt = Date.now();
  }
}

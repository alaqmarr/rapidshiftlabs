import { createEvent, type DomainEvent } from "../../../../shared/kernel/domain-event";

export interface IncidentResolvedPayload extends Record<string, unknown> {
  incidentId: string;
  domainId: string;
  clientId: string | null;
  startedAt: number;
  resolvedAt: number;
  durationSeconds: number;
}

export type IncidentResolvedEvent = DomainEvent<"monitoring.incident.resolved", IncidentResolvedPayload>;

export function createIncidentResolvedEvent(input: {
  incidentId: string;
  domainId: string;
  clientId?: string | null;
  startedAt: number;
  resolvedAt?: number;
  durationSeconds: number;
}): IncidentResolvedEvent {
  return createEvent("monitoring.incident.resolved", {
    aggregateType: "Incident",
    aggregateId: input.incidentId,
    clientId: input.clientId ?? null,
    payload: {
      incidentId: input.incidentId,
      domainId: input.domainId,
      clientId: input.clientId ?? null,
      startedAt: input.startedAt,
      resolvedAt: input.resolvedAt ?? Date.now(),
      durationSeconds: input.durationSeconds,
    },
  });
}

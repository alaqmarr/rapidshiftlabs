import { createEvent, type DomainEvent } from "../../../../shared/kernel/domain-event";

export interface IncidentOpenedPayload extends Record<string, unknown> {
  incidentId: string;
  domainId: string;
  clientId: string | null;
  type: string;
  severity: string;
  reason: string;
  failureCount: number;
  startedAt: number;
}

export type IncidentOpenedEvent = DomainEvent<"monitoring.incident.opened", IncidentOpenedPayload>;

export function createIncidentOpenedEvent(input: {
  incidentId: string;
  domainId: string;
  clientId?: string | null;
  type: string;
  severity: string;
  reason: string;
  failureCount: number;
  startedAt?: number;
}): IncidentOpenedEvent {
  return createEvent("monitoring.incident.opened", {
    aggregateType: "Incident",
    aggregateId: input.incidentId,
    clientId: input.clientId ?? null,
    payload: {
      incidentId: input.incidentId,
      domainId: input.domainId,
      clientId: input.clientId ?? null,
      type: input.type,
      severity: input.severity,
      reason: input.reason,
      failureCount: input.failureCount,
      startedAt: input.startedAt ?? Date.now(),
    },
  });
}

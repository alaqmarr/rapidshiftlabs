import { createEvent, type DomainEvent } from "../../../../shared/kernel/domain-event";

export interface DomainDownPayload extends Record<string, unknown> {
  domainId: string;
  clientId: string;
  hostname: string;
  failureCount: number;
  reason: string;
  startedAt: number;
  incidentId: string | null;
}

export type DomainDownEvent = DomainEvent<"monitoring.domain.down", DomainDownPayload>;

export function createDomainDownEvent(input: {
  domainId: string;
  clientId: string;
  hostname: string;
  failureCount: number;
  reason: string;
  startedAt?: number;
  incidentId?: string | null;
}): DomainDownEvent {
  return createEvent("monitoring.domain.down", {
    aggregateType: "MonitoredDomain",
    aggregateId: input.domainId,
    clientId: input.clientId,
    payload: {
      domainId: input.domainId,
      clientId: input.clientId,
      hostname: input.hostname,
      failureCount: input.failureCount,
      reason: input.reason,
      startedAt: input.startedAt ?? Date.now(),
      incidentId: input.incidentId ?? null,
    },
  });
}

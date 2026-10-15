import { createEvent, type DomainEvent } from "../../../../shared/kernel/domain-event";

export interface DomainRecoveredPayload extends Record<string, unknown> {
  domainId: string;
  clientId: string;
  hostname: string;
  recoveredAt: number;
  incidentId: string | null;
}

export type DomainRecoveredEvent = DomainEvent<"monitoring.domain.recovered", DomainRecoveredPayload>;

export function createDomainRecoveredEvent(input: {
  domainId: string;
  clientId: string;
  hostname: string;
  recoveredAt?: number;
  incidentId?: string | null;
}): DomainRecoveredEvent {
  return createEvent("monitoring.domain.recovered", {
    aggregateType: "MonitoredDomain",
    aggregateId: input.domainId,
    clientId: input.clientId,
    payload: {
      domainId: input.domainId,
      clientId: input.clientId,
      hostname: input.hostname,
      recoveredAt: input.recoveredAt ?? Date.now(),
      incidentId: input.incidentId ?? null,
    },
  });
}

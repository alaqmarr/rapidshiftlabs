import { createEvent, type DomainEvent } from "../../../../shared/kernel/domain-event";

export interface SslExpiringPayload extends Record<string, unknown> {
  domainId: string;
  clientId: string;
  hostname: string;
  daysRemaining: number;
  expiresAt: number;
  issuer: string | null;
}

export type SslExpiringEvent = DomainEvent<"monitoring.ssl.expiring", SslExpiringPayload>;

export function createSslExpiringEvent(input: {
  domainId: string;
  clientId: string;
  hostname: string;
  daysRemaining: number;
  expiresAt: number;
  issuer?: string | null;
}): SslExpiringEvent {
  return createEvent("monitoring.ssl.expiring", {
    aggregateType: "MonitoredDomain",
    aggregateId: input.domainId,
    clientId: input.clientId,
    payload: {
      domainId: input.domainId,
      clientId: input.clientId,
      hostname: input.hostname,
      daysRemaining: input.daysRemaining,
      expiresAt: input.expiresAt,
      issuer: input.issuer ?? null,
    },
  });
}

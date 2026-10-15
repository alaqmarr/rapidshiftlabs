import { createEvent, type DomainEvent } from "../../../../shared/kernel/domain-event";

export type EntitlementOverriddenPayload = {
  entitlementId: string;
  clientId: string;
  action: "set" | "cleared" | "expired";
  mode: "allow" | "block" | "maintenance" | null;
  validUntil: number | null;
  note: string | null;
  effectiveAccessAllowed: boolean;
  setByActorId?: string | null;
  occurredAt: number;
};

export function createEntitlementOverriddenEvent(params: {
  entitlementId: string;
  clientId: string;
  action: "set" | "cleared" | "expired";
  mode: "allow" | "block" | "maintenance" | null;
  validUntil: number | null;
  note: string | null;
  effectiveAccessAllowed: boolean;
  setByActorId?: string | null;
  now?: number;
}): DomainEvent<"entitlement.overridden", EntitlementOverriddenPayload> {
  const occurredAt = params.now ?? Date.now();
  return createEvent("entitlement.overridden", {
    aggregateType: "entitlement",
    aggregateId: params.entitlementId,
    clientId: params.clientId,
    payload: {
      entitlementId: params.entitlementId,
      clientId: params.clientId,
      action: params.action,
      mode: params.mode,
      validUntil: params.validUntil,
      note: params.note,
      effectiveAccessAllowed: params.effectiveAccessAllowed,
      setByActorId: params.setByActorId ?? null,
      occurredAt,
    },
  });
}

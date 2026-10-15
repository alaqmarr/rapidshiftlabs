import { createEvent, type DomainEvent } from "../../../../shared/kernel/domain-event";
import { type EntitlementStatus } from "../value-objects/entitlement-status";

export type EntitlementChangedPayload = {
  entitlementId: string;
  clientId: string;
  previousStatus: EntitlementStatus;
  newStatus: EntitlementStatus;
  isBlocked: boolean;
  isAccessAllowed: boolean;
  reason: string | null;
  hasActiveOverride: boolean;
  overrideMode: "allow" | "block" | "maintenance" | null;
  occurredAt: number;
};

export function createEntitlementChangedEvent(params: {
  entitlementId: string;
  clientId: string;
  previousStatus: EntitlementStatus;
  newStatus: EntitlementStatus;
  isBlocked: boolean;
  isAccessAllowed: boolean;
  reason: string | null;
  hasActiveOverride: boolean;
  overrideMode: "allow" | "block" | "maintenance" | null;
  now?: number;
}): DomainEvent<"entitlement.changed", EntitlementChangedPayload> {
  const occurredAt = params.now ?? Date.now();
  return createEvent("entitlement.changed", {
    aggregateType: "entitlement",
    aggregateId: params.entitlementId,
    clientId: params.clientId,
    payload: {
      entitlementId: params.entitlementId,
      clientId: params.clientId,
      previousStatus: params.previousStatus,
      newStatus: params.newStatus,
      isBlocked: params.isBlocked,
      isAccessAllowed: params.isAccessAllowed,
      reason: params.reason,
      hasActiveOverride: params.hasActiveOverride,
      overrideMode: params.overrideMode,
      occurredAt,
    },
  });
}

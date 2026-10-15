import { type EntitlementStatus } from "../../domain/value-objects/entitlement-status";
import { type OverrideMode } from "../../domain/value-objects/manual-override.vo";

export interface ClientEntitlementDTO {
  id: string;
  clientId: string;
  status: EntitlementStatus;
  isBlocked: boolean;
  isAccessAllowed: boolean;
  reason: string | null;
  manualOverride: {
    mode: OverrideMode;
    validUntil: number | null;
    note: string | null;
    isActive: boolean;
  } | null;
  lastEvaluatedAt: number;
  createdAt: number;
  updatedAt: number;
  tierStatus?: "allowed" | "grace_period" | "restricted" | "blocked";
  daysOverdue?: number;
  graceDaysRemaining?: number;
  amountDuePaise?: number;
  restrictedPrefixes?: string[];
  warningMessage?: string;
}

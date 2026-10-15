export const ENTITLEMENT_STATUS = {
  Active: "Active",
  Overdue: "Overdue",
  Blocked: "Blocked",
  Suspended: "Suspended",
} as const;

export type EntitlementStatus =
  (typeof ENTITLEMENT_STATUS)[keyof typeof ENTITLEMENT_STATUS];

export const VALID_STATUSES: readonly EntitlementStatus[] = Object.values(ENTITLEMENT_STATUS);

export type TieredGateStatus = "allowed" | "grace_period" | "restricted" | "blocked";

/**
 * Normalizes input status (case-insensitive and alias-aware)
 * Supports test fixture aliases ('grace' -> 'Overdue', 'restricted' -> 'Blocked')
 */
export function normalizeStatus(input: string): EntitlementStatus {
  const lower = input.toLowerCase().trim();
  switch (lower) {
    case "active":
    case "allowed":
      return "Active";
    case "overdue":
    case "grace":
    case "grace_period":
      return "Overdue";
    case "blocked":
    case "restricted":
      return "Blocked";
    case "suspended":
      return "Suspended";
    default:
      throw new Error(`Invalid entitlement status: '${input}'`);
  }
}

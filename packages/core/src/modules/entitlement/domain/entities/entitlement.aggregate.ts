import { AggregateRoot } from "../../../../shared/kernel/domain-event";
import { ulid } from "../../../../shared/kernel/id";
import { invariant } from "../../../../shared/kernel/errors";
import { EntitlementStatus, TieredGateStatus, normalizeStatus } from "../value-objects/entitlement-status";
import { ManualOverride, type ManualOverrideProps } from "../value-objects/manual-override.vo";
import { createEntitlementChangedEvent } from "../events/entitlement-changed.event";
import { createEntitlementOverriddenEvent } from "../events/entitlement-overridden.event";

export interface EntitlementProps {
  id: string;                                    // Prefixed 'ent_'
  clientId: string;                              // Prefixed 'cli_'
  status: EntitlementStatus;                     // 'Active' | 'Overdue' | 'Blocked' | 'Suspended'
  isBlocked: boolean;                            // Materialized access cutoff flag
  reason: string | null;                         // Explanation for current state
  manualOverride: ManualOverride | null;         // VO or null
  lastEvaluatedAt: number;                       // Epoch ms
  createdAt: number;                             // Epoch ms
  updatedAt: number;                             // Epoch ms
  overdueSince?: number | null;                  // Epoch ms
  amountDuePaise?: number | null;                // Outstanding dues in paise
  daysOverdue?: number | null;                   // Explicit days overdue
}

export class Entitlement extends AggregateRoot<EntitlementProps> {
  private constructor(props: EntitlementProps) {
    super(props);
  }

  // --- Factory Methods ---

  static create(input: { clientId: string; now?: number }): Entitlement {
    invariant(
      Boolean(input.clientId && input.clientId.startsWith("cli_")),
      "invalid_client_id",
      "Client ID must be a non-empty string prefixed with 'cli_'",
    );

    const now = input.now ?? Date.now();
    const id = `ent_${ulid(now)}`;

    const props: EntitlementProps = {
      id,
      clientId: input.clientId,
      status: "Active",
      isBlocked: false,
      reason: null,
      manualOverride: null,
      lastEvaluatedAt: now,
      createdAt: now,
      updatedAt: now,
    };

    const aggregate = new Entitlement(props);
    aggregate.raise(
      createEntitlementChangedEvent({
        entitlementId: id,
        clientId: input.clientId,
        previousStatus: "Active",
        newStatus: "Active",
        isBlocked: false,
        isAccessAllowed: true,
        reason: "Initial entitlement created",
        hasActiveOverride: false,
        overrideMode: null,
        now,
      }),
    );

    return aggregate;
  }

  static reconstitute(props: {
    id: string;
    clientId: string;
    status: string;
    isBlocked: boolean;
    reason: string | null;
    manualOverride: ManualOverrideProps | null;
    lastEvaluatedAt: number;
    createdAt: number;
    updatedAt: number;
    overdueSince?: number | null;
    amountDuePaise?: number | null;
    daysOverdue?: number | null;
  }): Entitlement {
    return new Entitlement({
      id: props.id,
      clientId: props.clientId,
      status: normalizeStatus(props.status),
      isBlocked: props.isBlocked,
      reason: props.reason,
      manualOverride: props.manualOverride ? ManualOverride.reconstitute(props.manualOverride) : null,
      lastEvaluatedAt: props.lastEvaluatedAt,
      createdAt: props.createdAt,
      updatedAt: props.updatedAt,
      overdueSince: props.overdueSince ?? null,
      amountDuePaise: props.amountDuePaise ?? null,
      daysOverdue: props.daysOverdue ?? null,
    });
  }

  // --- Getters ---

  get id(): string { return this.props.id; }
  get clientId(): string { return this.props.clientId; }
  get status(): EntitlementStatus { return this.props.status; }
  get isBlocked(): boolean { return this.props.isBlocked; }
  get reason(): string | null { return this.props.reason; }
  get manualOverride(): ManualOverride | null { return this.props.manualOverride; }
  get lastEvaluatedAt(): number { return this.props.lastEvaluatedAt; }
  get createdAt(): number { return this.props.createdAt; }
  get updatedAt(): number { return this.props.updatedAt; }
  get overdueSince(): number | null | undefined { return this.props.overdueSince; }
  get amountDuePaise(): number | null | undefined { return this.props.amountDuePaise; }
  get daysOverdue(): number | null | undefined { return this.props.daysOverdue; }

  // --- Core Evaluation Engine ---

  /**
   * Calculates days overdue based on explicit daysOverdue, overdueSince epoch ms, or defaults to 1 when status is Overdue.
   */
  getDaysOverdue(now: number = Date.now()): number {
    if (this.props.daysOverdue != null && this.props.daysOverdue > 0) {
      return this.props.daysOverdue;
    }
    if (this.props.overdueSince != null) {
      const elapsedMs = Math.max(0, now - this.props.overdueSince);
      return Math.floor(elapsedMs / (24 * 60 * 60 * 1000)) + 1;
    }
    if (this.props.status === "Overdue") {
      return 1;
    }
    return 0;
  }

  /**
   * Computes the 3-stage tiered access status:
   * - Stage 1 (Days 1–3 Overdue: Grace Period): "grace_period"
   * - Stage 2 (Days 4–7 Overdue: Restricted Mode): "restricted"
   * - Stage 3 (Day 8+ Overdue or Suspended/Blocked): "blocked"
   * - Active: "allowed"
   */
  getTieredStatus(params?: { now?: number; daysOverdue?: number }): TieredGateStatus {
    const now = params?.now ?? Date.now();

    // 1. Suspension unconditionally blocks
    if (this.props.status === "Suspended") {
      return "blocked";
    }

    // 2. Active manual override takes precedence
    if (this.props.manualOverride && this.props.manualOverride.isActive(now)) {
      switch (this.props.manualOverride.mode) {
        case "allow":
          return "allowed";
        case "block":
        case "maintenance":
          return "blocked";
      }
    }

    // 3. Underlying status evaluation
    switch (this.props.status) {
      case "Active":
        return "allowed";
      case "Blocked":
        return "blocked";
      case "Overdue": {
        const days = params?.daysOverdue ?? this.getDaysOverdue(now);
        if (days <= 3) {
          return "grace_period";
        }
        if (days <= 7) {
          return "restricted";
        }
        return "blocked";
      }
      default:
        return "blocked";
    }
  }

  /**
   * Computes full tiered access details matching the Smart Control Plane blueprint.
   */
  computeTieredDetails(params?: { now?: number; daysOverdue?: number; amountDuePaise?: number }): {
    status: TieredGateStatus;
    allowed: boolean;
    daysOverdue?: number;
    graceDaysRemaining?: number;
    amountDuePaise?: number;
    restrictedPrefixes?: string[];
    warningMessage?: string;
  } {
    const now = params?.now ?? Date.now();
    const days = params?.daysOverdue ?? this.getDaysOverdue(now);
    const amount = params?.amountDuePaise ?? this.props.amountDuePaise ?? undefined;
    const tier = this.getTieredStatus({ now, daysOverdue: days });

    if (tier === "grace_period") {
      const graceDaysRemaining = Math.max(0, 3 - days);
      return {
        status: "grace_period",
        allowed: true,
        daysOverdue: days,
        graceDaysRemaining,
        amountDuePaise: amount,
        warningMessage: `Payment overdue by ${days} day${days === 1 ? "" : "s"}. Grace period active: ${graceDaysRemaining} day${graceDaysRemaining === 1 ? "" : "s"} remaining.`,
      };
    }

    if (tier === "restricted") {
      return {
        status: "restricted",
        allowed: true,
        daysOverdue: days,
        amountDuePaise: amount,
        restrictedPrefixes: ["/admin", "/api/admin"],
        warningMessage: `Account in restricted mode (${days} days overdue). Administrative routes are blocked pending payment.`,
      };
    }

    if (tier === "blocked") {
      return {
        status: "blocked",
        allowed: false,
        daysOverdue: this.props.status === "Overdue" ? days : undefined,
        amountDuePaise: amount,
        warningMessage:
          this.props.status === "Suspended"
            ? "Account is administratively suspended."
            : "Account access is blocked due to unpaid overdue invoices.",
      };
    }

    return {
      status: "allowed",
      allowed: true,
    };
  }

  /**
   * Evaluates if access through the gate is allowed.
   * In 3-stage gating:
   * - "allowed": true
   * - "grace_period": true
   * - "restricted": true (public routes allowed; admin paths gated by SDK)
   * - "blocked": false
   */
  isAccessAllowed(now: number = Date.now()): boolean {
    return this.getTieredStatus({ now }) !== "blocked";
  }

  /**
   * Periodic evaluation tick:
   * - Checks and cleans up expired manual overrides
   * - Materializes isBlocked = !isAccessAllowed(now)
   * - Raises events if state changed
   */
  evaluate(now: number = Date.now(), daysOverdue?: number): boolean {
    let stateChanged = false;
    const prevBlocked = this.props.isBlocked;

    // Check expired override
    if (this.props.manualOverride && this.props.manualOverride.isExpired(now)) {
      const expiredMode = this.props.manualOverride.mode;
      this.props.manualOverride = null;
      stateChanged = true;

      this.raise(
        createEntitlementOverriddenEvent({
          entitlementId: this.props.id,
          clientId: this.props.clientId,
          action: "expired",
          mode: expiredMode,
          validUntil: null,
          note: "Override period expired",
          effectiveAccessAllowed: this.isAccessAllowed(now),
          now,
        }),
      );
    }

    const allowed = this.getTieredStatus({ now, daysOverdue }) !== "blocked";
    const newBlocked = !allowed;

    if (prevBlocked !== newBlocked) {
      this.props.isBlocked = newBlocked;
      stateChanged = true;

      this.raise(
        createEntitlementChangedEvent({
          entitlementId: this.props.id,
          clientId: this.props.clientId,
          previousStatus: this.props.status,
          newStatus: this.props.status,
          isBlocked: newBlocked,
          isAccessAllowed: allowed,
          reason: this.props.reason,
          hasActiveOverride: this.props.manualOverride !== null,
          overrideMode: this.props.manualOverride?.mode ?? null,
          now,
        }),
      );
    }

    this.props.lastEvaluatedAt = now;
    if (stateChanged) {
      this.props.updatedAt = now;
    }

    return allowed;
  }

  // --- State Transitions ---

  /**
   * Transition: Active -> Overdue (Invoice Overdue)
   */
  markOverdue(params: {
    invoiceId: string;
    amountPaise: number;
    reason?: string;
    now?: number;
    dueDate?: number;
    daysOverdue?: number;
  }): void {
    const now = params.now ?? Date.now();

    // Invariant: Administrative suspension takes precedence
    if (this.props.status === "Suspended") {
      this.props.reason = params.reason ?? `Invoice ${params.invoiceId} overdue while suspended`;
      this.props.updatedAt = now;
      return;
    }

    // Invariant: Already Blocked does not regress to Overdue
    if (this.props.status === "Blocked") {
      this.props.reason = params.reason ?? `Additional invoice ${params.invoiceId} overdue`;
      this.props.updatedAt = now;
      return;
    }

    const previousStatus = this.props.status;
    this.props.status = "Overdue";
    this.props.reason = params.reason ?? `Invoice ${params.invoiceId} overdue (amount: ₹${(params.amountPaise / 100).toFixed(2)})`;
    this.props.overdueSince = params.dueDate ?? (this.props.overdueSince ?? now);
    if (params.daysOverdue != null) {
      this.props.daysOverdue = params.daysOverdue;
    }
    this.props.amountDuePaise = params.amountPaise;
    this.props.isBlocked = !this.isAccessAllowed(now);
    this.props.lastEvaluatedAt = now;
    this.props.updatedAt = now;

    this.raise(
      createEntitlementChangedEvent({
        entitlementId: this.props.id,
        clientId: this.props.clientId,
        previousStatus,
        newStatus: "Overdue",
        isBlocked: this.props.isBlocked,
        isAccessAllowed: !this.props.isBlocked,
        reason: this.props.reason,
        hasActiveOverride: this.props.manualOverride !== null,
        overrideMode: this.props.manualOverride?.mode ?? null,
        now,
      }),
    );
  }

  /**
   * Transition: Overdue -> Blocked (Grace period exceeded / dues threshold breached)
   */
  markBlocked(params: {
    reason: string;
    now?: number;
  }): void {
    const now = params.now ?? Date.now();

    // Invariant: Suspended remains Suspended
    if (this.props.status === "Suspended") {
      this.props.reason = params.reason;
      this.props.updatedAt = now;
      return;
    }

    const previousStatus = this.props.status;
    this.props.status = "Blocked";
    this.props.reason = params.reason;
    this.props.isBlocked = !this.isAccessAllowed(now);
    this.props.lastEvaluatedAt = now;
    this.props.updatedAt = now;

    this.raise(
      createEntitlementChangedEvent({
        entitlementId: this.props.id,
        clientId: this.props.clientId,
        previousStatus,
        newStatus: "Blocked",
        isBlocked: this.props.isBlocked,
        isAccessAllowed: !this.props.isBlocked,
        reason: this.props.reason,
        hasActiveOverride: this.props.manualOverride !== null,
        overrideMode: this.props.manualOverride?.mode ?? null,
        now,
      }),
    );
  }

  /**
   * Transition: Overdue / Blocked -> Active (Invoices paid / dues cleared)
   */
  markActive(params: {
    clearedInvoiceId?: string;
    reason?: string;
    now?: number;
  }): void {
    const now = params.now ?? Date.now();

    // Invariant: Admin suspension CANNOT be lifted by billing settlement alone
    if (this.props.status === "Suspended") {
      this.props.reason = `Dues cleared for ${params.clearedInvoiceId ?? "invoice"}, but client remains administratively Suspended`;
      this.props.updatedAt = now;
      return;
    }

    const previousStatus = this.props.status;
    this.props.status = "Active";
    this.props.reason = params.reason ?? (params.clearedInvoiceId ? `Dues cleared by payment of ${params.clearedInvoiceId}` : null);
    this.props.overdueSince = null;
    this.props.daysOverdue = null;
    this.props.amountDuePaise = null;
    this.props.isBlocked = !this.isAccessAllowed(now);
    this.props.lastEvaluatedAt = now;
    this.props.updatedAt = now;

    this.raise(
      createEntitlementChangedEvent({
        entitlementId: this.props.id,
        clientId: this.props.clientId,
        previousStatus,
        newStatus: "Active",
        isBlocked: this.props.isBlocked,
        isAccessAllowed: !this.props.isBlocked,
        reason: this.props.reason,
        hasActiveOverride: this.props.manualOverride !== null,
        overrideMode: this.props.manualOverride?.mode ?? null,
        now,
      }),
    );
  }

  /**
   * Transition: Active / Overdue / Blocked -> Suspended (Admin force block)
   */
  suspend(params: {
    reason: string;
    actorId?: string;
    now?: number;
  }): void {
    const now = params.now ?? Date.now();
    const previousStatus = this.props.status;

    this.props.status = "Suspended";
    this.props.reason = params.reason;
    this.props.isBlocked = !this.isAccessAllowed(now);
    this.props.lastEvaluatedAt = now;
    this.props.updatedAt = now;

    this.raise(
      createEntitlementChangedEvent({
        entitlementId: this.props.id,
        clientId: this.props.clientId,
        previousStatus,
        newStatus: "Suspended",
        isBlocked: this.props.isBlocked,
        isAccessAllowed: !this.props.isBlocked,
        reason: this.props.reason,
        hasActiveOverride: this.props.manualOverride !== null,
        overrideMode: this.props.manualOverride?.mode ?? null,
        now,
      }),
    );
  }

  /**
   * Transition: Suspended -> Active (Admin override or unblock)
   */
  unsuspend(params: {
    reason?: string;
    actorId?: string;
    now?: number;
  }): void {
    const now = params.now ?? Date.now();
    const previousStatus = this.props.status;

    this.props.status = "Active";
    this.props.reason = params.reason ?? "Admin lifted suspension";
    this.props.isBlocked = !this.isAccessAllowed(now);
    this.props.lastEvaluatedAt = now;
    this.props.updatedAt = now;

    this.raise(
      createEntitlementChangedEvent({
        entitlementId: this.props.id,
        clientId: this.props.clientId,
        previousStatus,
        newStatus: "Active",
        isBlocked: this.props.isBlocked,
        isAccessAllowed: !this.props.isBlocked,
        reason: this.props.reason,
        hasActiveOverride: this.props.manualOverride !== null,
        overrideMode: this.props.manualOverride?.mode ?? null,
        now,
      }),
    );
  }

  // --- Manual Override Commands ---

  setManualOverride(override: ManualOverride, now: number = Date.now()): void {
    this.props.manualOverride = override;
    const prevBlocked = this.props.isBlocked;
    this.props.isBlocked = !this.isAccessAllowed(now);
    this.props.lastEvaluatedAt = now;
    this.props.updatedAt = now;

    this.raise(
      createEntitlementOverriddenEvent({
        entitlementId: this.props.id,
        clientId: this.props.clientId,
        action: "set",
        mode: override.mode,
        validUntil: override.validUntil,
        note: override.note,
        effectiveAccessAllowed: !this.props.isBlocked,
        setByActorId: override.setBy,
        now,
      }),
    );

    if (prevBlocked !== this.props.isBlocked) {
      this.raise(
        createEntitlementChangedEvent({
          entitlementId: this.props.id,
          clientId: this.props.clientId,
          previousStatus: this.props.status,
          newStatus: this.props.status,
          isBlocked: this.props.isBlocked,
          isAccessAllowed: !this.props.isBlocked,
          reason: `Override '${override.mode}' applied: ${override.note ?? "no note"}`,
          hasActiveOverride: true,
          overrideMode: override.mode,
          now,
        }),
      );
    }
  }

  clearManualOverride(now: number = Date.now()): void {
    if (!this.props.manualOverride) return;

    const previousMode = this.props.manualOverride.mode;
    this.props.manualOverride = null;
    const prevBlocked = this.props.isBlocked;
    this.props.isBlocked = !this.isAccessAllowed(now);
    this.props.lastEvaluatedAt = now;
    this.props.updatedAt = now;

    this.raise(
      createEntitlementOverriddenEvent({
        entitlementId: this.props.id,
        clientId: this.props.clientId,
        action: "cleared",
        mode: previousMode,
        validUntil: null,
        note: "Manual override explicitly cleared",
        effectiveAccessAllowed: !this.props.isBlocked,
        now,
      }),
    );

    if (prevBlocked !== this.props.isBlocked) {
      this.raise(
        createEntitlementChangedEvent({
          entitlementId: this.props.id,
          clientId: this.props.clientId,
          previousStatus: this.props.status,
          newStatus: this.props.status,
          isBlocked: this.props.isBlocked,
          isAccessAllowed: !this.props.isBlocked,
          reason: this.props.reason,
          hasActiveOverride: false,
          overrideMode: null,
          now,
        }),
      );
    }
  }
}

import { describe, it, expect, beforeEach } from "vitest";
import { Entitlement } from "../../../src/modules/entitlement/domain/entities/entitlement.aggregate";
import { ManualOverride } from "../../../src/modules/entitlement/domain/value-objects/manual-override.vo";
import { normalizeStatus } from "../../../src/modules/entitlement/domain/value-objects/entitlement-status";
import { GetClientEntitlementQuery } from "../../../src/modules/entitlement/application/queries/get-client-entitlement.query";
import { EvaluateEntitlementCommand } from "../../../src/modules/entitlement/application/commands/evaluate-entitlement.command";
import { SetManualOverrideCommand } from "../../../src/modules/entitlement/application/commands/set-manual-override.command";
import { ClearManualOverrideCommand } from "../../../src/modules/entitlement/application/commands/clear-manual-override.command";
import { HandleBillingEventCommand } from "../../../src/modules/entitlement/application/commands/handle-billing-event.command";
import type { IEntitlementRepository } from "../../../src/modules/entitlement/domain/repositories/entitlement-repository.port";
import type { Actor } from "../../../src/shared/kernel/actor";
import { DomainRuleError, ForbiddenError, NotFoundError } from "../../../src/shared/kernel/errors";

class InMemoryEntitlementRepository implements IEntitlementRepository {
  private readonly store = new Map<string, Entitlement>();

  async findById(id: string): Promise<Entitlement | null> {
    for (const ent of this.store.values()) {
      if (ent.id === id) return ent;
    }
    return null;
  }

  async findByClientId(clientId: string): Promise<Entitlement | null> {
    return this.store.get(clientId) ?? null;
  }

  async save(entitlement: Entitlement): Promise<void> {
    this.store.set(entitlement.clientId, entitlement);
  }

  async listBlocked(): Promise<Entitlement[]> {
    return Array.from(this.store.values()).filter((e) => e.isBlocked);
  }
}

describe("Entitlement State Machine & Access Evaluation (Milestone 1)", () => {
  const CLIENT_ID = "cli_01J9Z7Q4X1A2B3C4D5E6F7G8H9";
  const OTHER_CLIENT_ID = "cli_01J9Z7Q4X1A2B3C4D5E6F7G8Z9";

  const adminActor: Actor = {
    kind: "admin",
    id: "adm_01J9Z7Q4X1A2B3C4D5E6F7G8H0",
    email: "owner@rapidshift.test",
    name: "Admin Owner",
    role: "owner",
    supportLevel: null,
  };

  const clientActor: Actor = {
    kind: "client_user",
    id: "usr_01J9Z7Q4X1A2B3C4D5E6F7G8H1",
    email: "client@test.com",
    name: "Client Admin",
    clientId: CLIENT_ID,
    role: "client_admin",
  };

  describe("1. Aggregate Creation & Status Normalization", () => {
    it("creates entitlement in Active status with access allowed", () => {
      const ent = Entitlement.create({ clientId: CLIENT_ID });
      expect(ent.id).toMatch(/^ent_/);
      expect(ent.clientId).toBe(CLIENT_ID);
      expect(ent.status).toBe("Active");
      expect(ent.isBlocked).toBe(false);
      expect(ent.isAccessAllowed()).toBe(true);
      expect(ent.reason).toBeNull();
      expect(ent.manualOverride).toBeNull();

      const events = ent.pullEvents();
      expect(events).toHaveLength(1);
      expect(events[0]?.type).toBe("entitlement.changed");
      expect(events[0]?.payload).toMatchObject({
        newStatus: "Active",
        isBlocked: false,
        isAccessAllowed: true,
      });
    });

    it("rejects creation with client ID not prefixed with cli_", () => {
      expect(() => Entitlement.create({ clientId: "bad_client_123" })).toThrow(DomainRuleError);
    });

    it("normalizes status aliases correctly", () => {
      expect(normalizeStatus("active")).toBe("Active");
      expect(normalizeStatus("overdue")).toBe("Overdue");
      expect(normalizeStatus("grace")).toBe("Overdue");
      expect(normalizeStatus("blocked")).toBe("Blocked");
      expect(normalizeStatus("restricted")).toBe("Blocked");
      expect(normalizeStatus("suspended")).toBe("Suspended");
      expect(() => normalizeStatus("unknown")).toThrow();
    });
  });

  describe("2. State Machine Transitions", () => {
    it("Active -> Overdue: invoice past due date maintains access during grace period", () => {
      const ent = Entitlement.create({ clientId: CLIENT_ID });
      ent.pullEvents();

      ent.markOverdue({ invoiceId: "inv_101", amountPaise: 500000 });
      expect(ent.status).toBe("Overdue");
      expect(ent.isAccessAllowed()).toBe(true);
      expect(ent.isBlocked).toBe(false);
      expect(ent.reason).toContain("inv_101");

      const events = ent.pullEvents();
      expect(events).toHaveLength(1);
      expect(events[0]?.type).toBe("entitlement.changed");
      expect(events[0]?.payload).toMatchObject({
        previousStatus: "Active",
        newStatus: "Overdue",
        isAccessAllowed: true,
        isBlocked: false,
      });
    });

    it("Overdue -> Blocked: grace period exceeded cuts off access", () => {
      const ent = Entitlement.create({ clientId: CLIENT_ID });
      ent.markOverdue({ invoiceId: "inv_101", amountPaise: 500000 });
      ent.pullEvents();

      ent.markBlocked({ reason: "Grace period expired after 7 days" });
      expect(ent.status).toBe("Blocked");
      expect(ent.isAccessAllowed()).toBe(false);
      expect(ent.isBlocked).toBe(true);

      const events = ent.pullEvents();
      expect(events).toHaveLength(1);
      expect(events[0]?.payload).toMatchObject({
        previousStatus: "Overdue",
        newStatus: "Blocked",
        isAccessAllowed: false,
        isBlocked: true,
      });
    });

    it("Blocked does not regress to Overdue if additional invoice becomes overdue", () => {
      const ent = Entitlement.create({ clientId: CLIENT_ID });
      ent.markBlocked({ reason: "Dues overdue past cutoff" });
      ent.pullEvents();

      ent.markOverdue({ invoiceId: "inv_102", amountPaise: 250000 });
      expect(ent.status).toBe("Blocked");
      expect(ent.isAccessAllowed()).toBe(false);
      expect(ent.isBlocked).toBe(true);
      expect(ent.pullEvents()).toHaveLength(0);
    });

    it("Blocked -> Active: dues settlement restores active state and access", () => {
      const ent = Entitlement.create({ clientId: CLIENT_ID });
      ent.markBlocked({ reason: "Dues past cutoff" });
      ent.pullEvents();

      ent.markActive({ clearedInvoiceId: "inv_101" });
      expect(ent.status).toBe("Active");
      expect(ent.isAccessAllowed()).toBe(true);
      expect(ent.isBlocked).toBe(false);

      const events = ent.pullEvents();
      expect(events).toHaveLength(1);
      expect(events[0]?.payload).toMatchObject({
        previousStatus: "Blocked",
        newStatus: "Active",
        isAccessAllowed: true,
        isBlocked: false,
      });
    });

    it("Administrative Suspension: overrides billing and cannot be cleared by invoice settlement", () => {
      const ent = Entitlement.create({ clientId: CLIENT_ID });
      ent.suspend({ reason: "Compliance breach / Terms violation" });
      expect(ent.status).toBe("Suspended");
      expect(ent.isAccessAllowed()).toBe(false);
      expect(ent.isBlocked).toBe(true);

      // Attempting to mark active via invoice payment MUST NOT lift admin suspension
      ent.markActive({ clearedInvoiceId: "inv_101" });
      expect(ent.status).toBe("Suspended");
      expect(ent.isAccessAllowed()).toBe(false);
      expect(ent.isBlocked).toBe(true);

      // Subsequent overdue notices also do not alter Suspended status
      ent.markOverdue({ invoiceId: "inv_102", amountPaise: 10000 });
      expect(ent.status).toBe("Suspended");
      expect(ent.isAccessAllowed()).toBe(false);

      // Only explicit unsuspend restores Active state
      ent.unsuspend({ reason: "Compliance review passed" });
      expect(ent.status).toBe("Active");
      expect(ent.isAccessAllowed()).toBe(true);
      expect(ent.isBlocked).toBe(false);
    });
  });

  describe("3. Manual Overrides Evaluation Matrix", () => {
    it("Admin 'allow' override permits access even when state is Blocked", () => {
      const ent = Entitlement.create({ clientId: CLIENT_ID });
      ent.markBlocked({ reason: "Grace period expired" });
      expect(ent.isAccessAllowed()).toBe(false);

      const override = ManualOverride.create({
        mode: "allow",
        note: "Customer payment promised by wire",
      });
      ent.setManualOverride(override);

      expect(ent.status).toBe("Blocked"); // Underlying state preserved
      expect(ent.isAccessAllowed()).toBe(true); // Gate permits access
      expect(ent.isBlocked).toBe(false);
    });

    it("Admin 'block' override cuts off access even when state is Active", () => {
      const ent = Entitlement.create({ clientId: CLIENT_ID });
      expect(ent.isAccessAllowed()).toBe(true);

      const override = ManualOverride.create({
        mode: "block",
        note: "Account executive placed manual freeze",
      });
      ent.setManualOverride(override);

      expect(ent.status).toBe("Active");
      expect(ent.isAccessAllowed()).toBe(false);
      expect(ent.isBlocked).toBe(true);
    });

    it("Admin 'maintenance' override blocks normal access", () => {
      const ent = Entitlement.create({ clientId: CLIENT_ID });
      const override = ManualOverride.create({
        mode: "maintenance",
        note: "Database migration in progress",
      });
      ent.setManualOverride(override);

      expect(ent.isAccessAllowed()).toBe(false);
      expect(ent.isBlocked).toBe(true);
    });

    it("Timed override automatically expires during evaluate() tick", () => {
      const ent = Entitlement.create({ clientId: CLIENT_ID });
      ent.markBlocked({ reason: "Unpaid dues" });

      const pastTimestamp = Date.now() - 5000;
      const expiredOverride = ManualOverride.reconstitute({
        mode: "allow",
        validUntil: pastTimestamp,
        note: "Temporary 24h grace expired",
        createdAt: pastTimestamp - 86400000,
      });
      ent.setManualOverride(expiredOverride);

      // Immediate check notes that override has expired
      expect(ent.isAccessAllowed()).toBe(false);

      // Running evaluate() sweeps the expired override
      const allowed = ent.evaluate(Date.now());
      expect(allowed).toBe(false);
      expect(ent.manualOverride).toBeNull();
      expect(ent.isBlocked).toBe(true);
    });

    it("Clearing manual override restores baseline state access", () => {
      const ent = Entitlement.create({ clientId: CLIENT_ID });
      const override = ManualOverride.create({ mode: "block", note: "Freeze" });
      ent.setManualOverride(override);
      expect(ent.isAccessAllowed()).toBe(false);

      ent.clearManualOverride();
      expect(ent.manualOverride).toBeNull();
      expect(ent.isAccessAllowed()).toBe(true);
      expect(ent.isBlocked).toBe(false);
    });
  });

  describe("4. Application Commands, Queries & Billing Integration", () => {
    let repo: InMemoryEntitlementRepository;
    let mockUow: any;

    beforeEach(() => {
      repo = new InMemoryEntitlementRepository();
      mockUow = {
        runInTransaction: async (_dbName: string, fn: any) => fn({}),
      };
    });

    it("GetClientEntitlementQuery retrieves entitlement with tenant isolation", async () => {
      const query = new GetClientEntitlementQuery(repo);

      // Client actor accessing own client
      const res = await query.execute({ clientId: CLIENT_ID, actor: clientActor });
      expect(res.clientId).toBe(CLIENT_ID);
      expect(res.status).toBe("Active");
      expect(res.isAccessAllowed).toBe(true);

      // Client actor attempting cross-tenant access MUST throw ForbiddenError
      await expect(query.execute({ clientId: OTHER_CLIENT_ID, actor: clientActor })).rejects.toThrow(ForbiddenError);
    });

    it("EvaluateEntitlementCommand evaluates gate status and sweeps expired overrides", async () => {
      const cmd = new EvaluateEntitlementCommand(repo, mockUow);
      const evalRes = await cmd.execute({ clientId: CLIENT_ID });

      expect(evalRes.allowed).toBe(true);
      expect(evalRes.status).toBe("Active");
      expect(evalRes.isBlocked).toBe(false);
    });

    it("SetManualOverrideCommand and ClearManualOverrideCommand enforce permissions", async () => {
      const setCmd = new SetManualOverrideCommand(repo, mockUow);
      const clearCmd = new ClearManualOverrideCommand(repo, mockUow);

      // Client actor lacks 'entitlement:override' permission
      await expect(
        setCmd.execute({ clientId: CLIENT_ID, mode: "block", actor: clientActor }),
      ).rejects.toThrow(ForbiddenError);

      // Admin actor succeeds
      const overrideRes = await setCmd.execute({ clientId: CLIENT_ID, mode: "block", actor: adminActor });
      expect(overrideRes.manualOverride?.mode).toBe("block");
      expect(overrideRes.isAccessAllowed).toBe(false);

      // Clear override
      const clearedRes = await clearCmd.execute({ clientId: CLIENT_ID, actor: adminActor });
      expect(clearedRes.manualOverride).toBeNull();
      expect(clearedRes.isAccessAllowed).toBe(true);
    });

    it("HandleBillingEventCommand marks entitlement overdue or restored", async () => {
      const billingCmd = new HandleBillingEventCommand(repo, mockUow);

      // Overdue invoice event with grace days
      const overdueRes = await billingCmd.execute({
        eventName: "InvoiceOverdue",
        payload: {
          clientId: CLIENT_ID,
          invoiceId: "inv_99",
          amountPaise: 400000,
          gracePeriodDays: 5,
        },
      });
      expect(overdueRes.handled).toBe(true);
      expect(overdueRes.action).toBe("entitlement_marked_overdue");

      let ent = await repo.findByClientId(CLIENT_ID);
      expect(ent?.status).toBe("Overdue");
      expect(ent?.isAccessAllowed()).toBe(true);

      // Overdue invoice with 0 grace days marks blocked immediately
      await billingCmd.execute({
        eventName: "billing.invoice.overdue",
        payload: {
          clientId: CLIENT_ID,
          invoiceId: "inv_100",
          amountPaise: 50000,
          gracePeriodDays: 0,
        },
      });
      ent = await repo.findByClientId(CLIENT_ID);
      expect(ent?.status).toBe("Blocked");
      expect(ent?.isAccessAllowed()).toBe(false);

      // Payment recorded settling balance restores Active
      const paidRes = await billingCmd.execute({
        eventName: "InvoicePaid",
        payload: {
          clientId: CLIENT_ID,
          invoiceId: "inv_100",
          balancePaise: 0,
        },
      });
      expect(paidRes.handled).toBe(true);
      expect(paidRes.action).toBe("entitlement_restored_active");

      ent = await repo.findByClientId(CLIENT_ID);
      expect(ent?.status).toBe("Active");
      expect(ent?.isAccessAllowed()).toBe(true);
    });
  });

  describe("5. Smart 3-Stage Tiered Access Gating (Pillar 4)", () => {
    it("Stage 1 (Days 1–3 Overdue: Grace Period): status is grace_period, access allowed, graceDaysRemaining calculated", () => {
      const ent = Entitlement.create({ clientId: CLIENT_ID });
      ent.markOverdue({ invoiceId: "inv_stage1", amountPaise: 250000, daysOverdue: 1 });

      expect(ent.status).toBe("Overdue");
      expect(ent.getTieredStatus()).toBe("grace_period");
      expect(ent.isAccessAllowed()).toBe(true);

      const details1 = ent.computeTieredDetails({ daysOverdue: 1 });
      expect(details1.status).toBe("grace_period");
      expect(details1.allowed).toBe(true);
      expect(details1.daysOverdue).toBe(1);
      expect(details1.graceDaysRemaining).toBe(2);
      expect(details1.amountDuePaise).toBe(250000);
      expect(details1.warningMessage).toContain("Grace period active: 2 days remaining");

      const details2 = ent.computeTieredDetails({ daysOverdue: 2 });
      expect(details2.status).toBe("grace_period");
      expect(details2.graceDaysRemaining).toBe(1);

      const details3 = ent.computeTieredDetails({ daysOverdue: 3 });
      expect(details3.status).toBe("grace_period");
      expect(details3.graceDaysRemaining).toBe(0);
    });

    it("Stage 2 (Days 4–7 Overdue: Restricted Mode): status is restricted, public access allowed, admin restricted", () => {
      const ent = Entitlement.create({ clientId: CLIENT_ID });
      ent.markOverdue({ invoiceId: "inv_stage2", amountPaise: 400000, daysOverdue: 5 });

      expect(ent.status).toBe("Overdue");
      expect(ent.getTieredStatus()).toBe("restricted");
      expect(ent.isAccessAllowed()).toBe(true);

      const details = ent.computeTieredDetails({ daysOverdue: 5 });
      expect(details.status).toBe("restricted");
      expect(details.allowed).toBe(true);
      expect(details.daysOverdue).toBe(5);
      expect(details.restrictedPrefixes).toEqual(["/admin", "/api/admin"]);
      expect(details.warningMessage).toContain("restricted mode (5 days overdue)");
    });

    it("Stage 3 (Day 8+ Overdue: Strict Gate): status is blocked, access cut off", () => {
      const ent = Entitlement.create({ clientId: CLIENT_ID });
      ent.markOverdue({ invoiceId: "inv_stage3", amountPaise: 600000, daysOverdue: 8 });

      expect(ent.status).toBe("Overdue");
      expect(ent.getTieredStatus()).toBe("blocked");
      expect(ent.isAccessAllowed()).toBe(false);

      const details = ent.computeTieredDetails({ daysOverdue: 8 });
      expect(details.status).toBe("blocked");
      expect(details.allowed).toBe(false);
      expect(details.daysOverdue).toBe(8);
      expect(details.warningMessage).toContain("Account access is blocked");
    });

    it("EvaluateEntitlementCommand computes tiered status accurately across stages", async () => {
      const repo = new InMemoryEntitlementRepository();
      const mockUow = { runInTransaction: async (_dbName: string, fn: any) => fn({}) };
      const cmd = new EvaluateEntitlementCommand(repo, mockUow);

      // Active
      const activeRes = await cmd.execute({ clientId: CLIENT_ID });
      expect(activeRes.tierStatus).toBe("allowed");
      expect(activeRes.allowed).toBe(true);

      // Grace period (Day 2)
      let ent = await repo.findByClientId(CLIENT_ID);
      ent!.markOverdue({ invoiceId: "inv_eval", amountPaise: 150000 });
      await repo.save(ent!);

      const graceRes = await cmd.execute({ clientId: CLIENT_ID, daysOverdue: 2 });
      expect(graceRes.tierStatus).toBe("grace_period");
      expect(graceRes.allowed).toBe(true);
      expect(graceRes.graceDaysRemaining).toBe(1);
      expect(graceRes.amountDuePaise).toBe(150000);

      // Restricted (Day 6)
      const restrictedRes = await cmd.execute({ clientId: CLIENT_ID, daysOverdue: 6 });
      expect(restrictedRes.tierStatus).toBe("restricted");
      expect(restrictedRes.allowed).toBe(true);
      expect(restrictedRes.restrictedPrefixes).toEqual(["/admin", "/api/admin"]);

      // Blocked (Day 10)
      const blockedRes = await cmd.execute({ clientId: CLIENT_ID, daysOverdue: 10 });
      expect(blockedRes.tierStatus).toBe("blocked");
      expect(blockedRes.allowed).toBe(false);

      // Administrative suspension always strictly blocks
      ent = await repo.findByClientId(CLIENT_ID);
      ent!.suspend({ reason: "Regulatory freeze" });
      await repo.save(ent!);

      const suspendedRes = await cmd.execute({ clientId: CLIENT_ID, daysOverdue: 1 });
      expect(suspendedRes.tierStatus).toBe("blocked");
      expect(suspendedRes.allowed).toBe(false);
    });
  });
});

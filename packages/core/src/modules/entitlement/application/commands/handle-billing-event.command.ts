import { type IEntitlementRepository } from "../../domain/repositories/entitlement-repository.port";
import { Entitlement } from "../../domain/entities/entitlement.aggregate";
import { uow, type IUnitOfWork } from "../../../../shared/infrastructure/db";
import { invariant } from "../../../../shared/kernel/errors";
import type {
  BillingInvoiceOverduePayload,
  BillingPaymentRecordedPayload,
} from "../dto/billing-event-payload.dto";

export class HandleBillingEventCommand {
  constructor(
    private readonly repo: IEntitlementRepository,
    private readonly uowInstance: IUnitOfWork = uow,
  ) {}

  async execute(
    eventNameOrParams: string | { eventName: string; payload: Record<string, unknown> },
    maybePayload?: Record<string, unknown>,
  ): Promise<{ handled: boolean; action: string }> {
    const eventName = typeof eventNameOrParams === "string" ? eventNameOrParams : eventNameOrParams.eventName;
    const payload = typeof eventNameOrParams === "string" ? (maybePayload ?? {}) : eventNameOrParams.payload;

    // Normalize event name across legacy & domain conventions
    const normalizedName = eventName.toLowerCase().replace(/^(billing\.)/, "");

    if (normalizedName === "invoiceoverdue" || normalizedName === "invoice.overdue") {
      const p = payload as unknown as BillingInvoiceOverduePayload;
      invariant(Boolean(p.clientId && p.invoiceId), "invalid_payload", "InvoiceOverdue requires clientId and invoiceId");

      await this.uowInstance.runInTransaction("core", async (tx) => {
        let ent = await this.repo.findByClientId(p.clientId, tx);
        if (!ent) {
          ent = Entitlement.create({ clientId: p.clientId });
        }

        if (p.gracePeriodDays === 0) {
          ent.markBlocked({
            reason: `Invoice ${p.invoiceId} overdue (0 grace days permitted)`,
          });
        } else {
          ent.markOverdue({
            invoiceId: p.invoiceId,
            amountPaise: p.amountPaise ?? 0,
            dueDate: p.dueDate,
            reason: `Invoice ${p.invoiceId} is past due date`,
          });
        }

        await this.repo.save(ent, tx);
      });

      return { handled: true, action: "entitlement_marked_overdue" };
    }

    if (
      normalizedName === "invoicepaid" ||
      normalizedName === "invoice.paid" ||
      normalizedName === "paymentrecorded" ||
      normalizedName === "payment.recorded"
    ) {
      const p = payload as unknown as BillingPaymentRecordedPayload;
      invariant(Boolean(p.clientId), "invalid_payload", "Payment event requires clientId");

      // Dues cleared if balancePaise is 0 or undefined (for InvoicePaid event)
      const duesCleared = p.balancePaise === undefined || p.balancePaise === 0;

      if (duesCleared) {
        let action = "entitlement_restored_active";
        await this.uowInstance.runInTransaction("core", async (tx) => {
          let ent = await this.repo.findByClientId(p.clientId, tx);
          if (!ent) {
            ent = Entitlement.create({ clientId: p.clientId });
          }

          if (ent.status === "Suspended") {
            action = "entitlement_remains_suspended";
            ent.markActive({
              clearedInvoiceId: p.invoiceId,
              reason: `Dues settled by invoice payment ${p.invoiceId ?? ""}, but client remains Suspended`,
            });
            await this.repo.save(ent, tx);
          } else {
            ent.markActive({
              clearedInvoiceId: p.invoiceId,
              reason: `Dues settled by invoice payment ${p.invoiceId ?? ""}`,
            });
            await this.repo.save(ent, tx);
          }
        });

        return { handled: true, action };
      }

      return { handled: true, action: "partial_payment_ignored" };
    }

    return { handled: false, action: "unrecognized_event" };
  }
}

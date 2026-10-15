import { type Actor, assertCan, assertTenant } from "../../../../shared/kernel/actor";
import { type IEntitlementRepository } from "../../domain/repositories/entitlement-repository.port";
import { Entitlement } from "../../domain/entities/entitlement.aggregate";
import { type ClientEntitlementDTO } from "../dto/client-entitlement.dto";

export class GetClientEntitlementQuery {
  constructor(private readonly repo: IEntitlementRepository) {}

  async execute(
    clientIdOrParams: string | { clientId: string; actor: Actor },
    maybeActor?: Actor,
  ): Promise<ClientEntitlementDTO> {
    const clientId = typeof clientIdOrParams === "string" ? clientIdOrParams : clientIdOrParams.clientId;
    const actor = typeof clientIdOrParams === "string" ? maybeActor! : clientIdOrParams.actor;

    assertCan(actor, "access:read");
    assertTenant(actor, clientId);

    let ent = await this.repo.findByClientId(clientId);
    if (!ent) {
      ent = Entitlement.create({ clientId });
      await this.repo.save(ent);
    }

    const now = Date.now();
    ent.evaluate(now);
    const tiered = ent.computeTieredDetails({ now });

    return {
      id: ent.id,
      clientId: ent.clientId,
      status: ent.status,
      isBlocked: ent.isBlocked,
      isAccessAllowed: ent.isAccessAllowed(now),
      reason: ent.reason,
      manualOverride: ent.manualOverride
        ? {
            mode: ent.manualOverride.mode,
            validUntil: ent.manualOverride.validUntil,
            note: ent.manualOverride.note,
            isActive: ent.manualOverride.isActive(now),
          }
        : null,
      lastEvaluatedAt: ent.lastEvaluatedAt,
      createdAt: ent.createdAt,
      updatedAt: ent.updatedAt,
      tierStatus: tiered.status,
      daysOverdue: tiered.daysOverdue,
      graceDaysRemaining: tiered.graceDaysRemaining,
      amountDuePaise: tiered.amountDuePaise,
      restrictedPrefixes: tiered.restrictedPrefixes,
      warningMessage: tiered.warningMessage,
    };
  }
}

import { type Actor, assertCan } from "../../../../shared/kernel/actor";
import { type IEntitlementRepository } from "../../domain/repositories/entitlement-repository.port";
import { uow, type IUnitOfWork } from "../../../../shared/infrastructure/db";
import { NotFoundError } from "../../../../shared/kernel/errors";
import { type ClientEntitlementDTO } from "../dto/client-entitlement.dto";
import { type Entitlement } from "../../domain/entities/entitlement.aggregate";

export class ClearManualOverrideCommand {
  constructor(
    private readonly repo: IEntitlementRepository,
    private readonly uowInstance: IUnitOfWork = uow,
  ) {}

  async execute(
    clientIdOrParams: string | { clientId: string; actor: Actor; now?: number },
    maybeActor?: Actor,
    maybeNow?: number,
  ): Promise<ClientEntitlementDTO> {
    const clientId = typeof clientIdOrParams === "string" ? clientIdOrParams : clientIdOrParams.clientId;
    const actor = typeof clientIdOrParams === "string" ? maybeActor! : clientIdOrParams.actor;
    const now = typeof clientIdOrParams === "string" ? (maybeNow ?? Date.now()) : (clientIdOrParams.now ?? Date.now());

    assertCan(actor, "entitlement:override");

    let updatedEnt!: Entitlement;

    await this.uowInstance.runInTransaction("core", async (tx) => {
      const ent = await this.repo.findByClientId(clientId);
      if (!ent) {
        throw new NotFoundError("Entitlement", clientId);
      }

      ent.clearManualOverride(now);
      await this.repo.save(ent, tx);
      updatedEnt = ent;
    });

    return {
      id: updatedEnt.id,
      clientId: updatedEnt.clientId,
      status: updatedEnt.status,
      isBlocked: updatedEnt.isBlocked,
      isAccessAllowed: updatedEnt.isAccessAllowed(now),
      reason: updatedEnt.reason,
      manualOverride: null,
      lastEvaluatedAt: updatedEnt.lastEvaluatedAt,
      createdAt: updatedEnt.createdAt,
      updatedAt: updatedEnt.updatedAt,
    };
  }
}

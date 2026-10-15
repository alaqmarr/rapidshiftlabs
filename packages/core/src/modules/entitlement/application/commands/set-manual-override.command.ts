import { type Actor, assertCan, actorId } from "../../../../shared/kernel/actor";
import { type IEntitlementRepository } from "../../domain/repositories/entitlement-repository.port";
import { ManualOverride, type OverrideMode } from "../../domain/value-objects/manual-override.vo";
import { Entitlement } from "../../domain/entities/entitlement.aggregate";
import { uow, type IUnitOfWork } from "../../../../shared/infrastructure/db";
import { type ClientEntitlementDTO } from "../dto/client-entitlement.dto";

export interface SetManualOverrideInput {
  clientId: string;
  mode: OverrideMode;
  validUntil?: number | null;
  note?: string | null;
  actor?: Actor;
  now?: number;
}

export class SetManualOverrideCommand {
  constructor(
    private readonly repo: IEntitlementRepository,
    private readonly uowInstance: IUnitOfWork = uow,
  ) {}

  async execute(
    input: SetManualOverrideInput,
    explicitActor?: Actor,
  ): Promise<ClientEntitlementDTO> {
    const actor = input.actor ?? explicitActor!;
    assertCan(actor, "entitlement:override");

    const now = input.now ?? Date.now();
    const override = ManualOverride.create({
      mode: input.mode,
      validUntil: input.validUntil,
      note: input.note,
      setBy: actorId(actor),
      now,
    });

    let updatedEnt!: Entitlement;

    await this.uowInstance.runInTransaction("core", async (tx) => {
      let ent = await this.repo.findByClientId(input.clientId);
      if (!ent) {
        ent = Entitlement.create({ clientId: input.clientId, now });
      }

      ent.setManualOverride(override, now);
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
      manualOverride: {
        mode: override.mode,
        validUntil: override.validUntil,
        note: override.note,
        isActive: override.isActive(now),
      },
      lastEvaluatedAt: updatedEnt.lastEvaluatedAt,
      createdAt: updatedEnt.createdAt,
      updatedAt: updatedEnt.updatedAt,
    };
  }
}

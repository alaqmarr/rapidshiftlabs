import { type Actor, assertCan } from "../../../../shared/kernel/actor";
import { type IEntitlementRepository } from "../../domain/repositories/entitlement-repository.port";
import { Entitlement } from "../../domain/entities/entitlement.aggregate";
import { uow, type IUnitOfWork } from "../../../../shared/infrastructure/db";

export interface GateEvaluationResult {
  allowed: boolean;
  status: string;
  isBlocked: boolean;
  reason: string | null;
  manualOverrideMode: string | null;
  tierStatus: "allowed" | "grace_period" | "restricted" | "blocked";
  daysOverdue?: number;
  graceDaysRemaining?: number;
  amountDuePaise?: number;
  restrictedPrefixes?: string[];
  warningMessage?: string;
}

export class EvaluateEntitlementCommand {
  constructor(
    private readonly repo: IEntitlementRepository,
    private readonly uowInstance: IUnitOfWork = uow,
  ) {}

  async execute(
    clientIdOrParams:
      | string
      | {
          clientId: string;
          actor?: Actor;
          now?: number;
          daysOverdue?: number;
          amountDuePaise?: number;
        },
    maybeNow?: number,
  ): Promise<GateEvaluationResult> {
    let clientId: string;
    let actor: Actor | undefined;
    let now: number;
    let daysOverdue: number | undefined;
    let amountDuePaise: number | undefined;

    if (typeof clientIdOrParams === "string") {
      clientId = clientIdOrParams;
      now = maybeNow ?? Date.now();
    } else {
      clientId = clientIdOrParams.clientId;
      actor = clientIdOrParams.actor;
      now = clientIdOrParams.now ?? Date.now();
      daysOverdue = clientIdOrParams.daysOverdue;
      amountDuePaise = clientIdOrParams.amountDuePaise;
    }

    if (actor) {
      assertCan(actor, "access:read");
    }

    let ent = await this.repo.findByClientId(clientId);
    if (!ent) {
      ent = Entitlement.create({ clientId, now });
      await this.repo.save(ent);
    }

    const prevBlocked = ent.isBlocked;
    const hadOverride = ent.manualOverride !== null;
    const allowed = ent.evaluate(now, daysOverdue);
    const overrideExpired = hadOverride && ent.manualOverride === null;

    if (prevBlocked !== ent.isBlocked || overrideExpired) {
      await this.uowInstance.runInTransaction("core", async (tx) => {
        await this.repo.save(ent!, tx);
      });
    }

    const tiered = ent.computeTieredDetails({ now, daysOverdue, amountDuePaise });

    return {
      allowed,
      status: ent.status,
      isBlocked: ent.isBlocked,
      reason: ent.reason,
      manualOverrideMode: ent.manualOverride?.mode ?? null,
      tierStatus: tiered.status,
      daysOverdue: tiered.daysOverdue,
      graceDaysRemaining: tiered.graceDaysRemaining,
      amountDuePaise: tiered.amountDuePaise,
      restrictedPrefixes: tiered.restrictedPrefixes,
      warningMessage: tiered.warningMessage,
    };
  }
}

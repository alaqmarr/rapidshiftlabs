import { DrizzleEntitlementRepository } from "./infrastructure/repositories/drizzle-entitlement.repository";
import { DrizzleEventOutboxRepository } from "../../shared/infrastructure/events/outbox-repository";
import { uow, type IUnitOfWork } from "../../shared/infrastructure/db";
import { GetClientEntitlementQuery } from "./application/queries/get-client-entitlement.query";
import { EvaluateEntitlementCommand } from "./application/commands/evaluate-entitlement.command";
import { SetManualOverrideCommand, type SetManualOverrideInput } from "./application/commands/set-manual-override.command";
import { ClearManualOverrideCommand } from "./application/commands/clear-manual-override.command";
import { HandleBillingEventCommand } from "./application/commands/handle-billing-event.command";
import type { IEntitlementRepository } from "./domain/repositories/entitlement-repository.port";
import type { Actor } from "../../shared/kernel/actor";

export * from "./domain/entities/entitlement.aggregate";
export * from "./domain/value-objects/entitlement-status";
export * from "./domain/value-objects/manual-override.vo";
export * from "./domain/events/entitlement-changed.event";
export * from "./domain/events/entitlement-overridden.event";
export * from "./domain/repositories/entitlement-repository.port";
export * from "./application/dto/client-entitlement.dto";
export * from "./application/dto/billing-event-payload.dto";
export * from "./application/queries/get-client-entitlement.query";
export * from "./application/commands/evaluate-entitlement.command";
export * from "./application/commands/set-manual-override.command";
export * from "./application/commands/clear-manual-override.command";
export * from "./application/commands/handle-billing-event.command";
export * from "./infrastructure/repositories/drizzle-entitlement.repository";

export class EntitlementModule {
  public readonly repo: IEntitlementRepository;
  public readonly getClientEntitlementQuery: GetClientEntitlementQuery;
  public readonly evaluateEntitlementCommand: EvaluateEntitlementCommand;
  public readonly setManualOverrideCommand: SetManualOverrideCommand;
  public readonly clearManualOverrideCommand: ClearManualOverrideCommand;
  public readonly handleBillingEventCommand: HandleBillingEventCommand;

  constructor(
    repo?: IEntitlementRepository,
    outboxRepo?: DrizzleEventOutboxRepository,
    unitOfWork?: IUnitOfWork,
  ) {
    const activeOutbox = outboxRepo ?? new DrizzleEventOutboxRepository();
    const activeUow = unitOfWork ?? uow;
    this.repo = repo ?? new DrizzleEntitlementRepository(undefined, activeOutbox, activeUow);

    this.getClientEntitlementQuery = new GetClientEntitlementQuery(this.repo);
    this.evaluateEntitlementCommand = new EvaluateEntitlementCommand(this.repo, activeUow);
    this.setManualOverrideCommand = new SetManualOverrideCommand(this.repo, activeUow);
    this.clearManualOverrideCommand = new ClearManualOverrideCommand(this.repo, activeUow);
    this.handleBillingEventCommand = new HandleBillingEventCommand(this.repo, activeUow);
  }

  async getStatus(clientId: string, actor: Actor) {
    return this.getClientEntitlementQuery.execute(clientId, actor);
  }

  async evaluate(
    clientId: string,
    nowOrParams?: number | { now?: number; daysOverdue?: number; amountDuePaise?: number; actor?: Actor },
    maybeNow?: number,
  ) {
    if (typeof nowOrParams === "number") {
      return this.evaluateEntitlementCommand.execute(clientId, nowOrParams);
    }
    if (nowOrParams && typeof nowOrParams === "object") {
      return this.evaluateEntitlementCommand.execute({
        clientId,
        ...nowOrParams,
      });
    }
    return this.evaluateEntitlementCommand.execute(clientId, maybeNow);
  }

  async setOverride(input: SetManualOverrideInput, actor?: Actor) {
    return this.setManualOverrideCommand.execute(input, actor);
  }

  async clearOverride(clientId: string, actor: Actor, now?: number) {
    return this.clearManualOverrideCommand.execute(clientId, actor, now);
  }

  async handleBillingEvent(eventName: string, payload: Record<string, unknown>) {
    return this.handleBillingEventCommand.execute(eventName, payload);
  }
}

let instance: EntitlementModule | null = null;

export function getEntitlementModule(): EntitlementModule {
  if (!instance) {
    instance = new EntitlementModule();
  }
  return instance;
}

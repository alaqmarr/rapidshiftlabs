import type {
  IAnalyticsRepository,
  AnalyticsOffloadConfig,
} from "../../domain/ports/analytics-repository.port";
import { type Actor, assertCan, scopeClientId } from "../../../../shared/kernel/actor";
import { BadRequestError } from "../../../../shared/kernel/errors";
import type { AnalyticsEvent } from "../../domain/entities/analytics-event.entity";

export class ExportAnalyticsUseCase {
  constructor(private readonly repo: IAnalyticsRepository) {}

  async execute(
    clientId: string | null | undefined,
    fromEpoch: number,
    toEpoch: number,
    limit = 1000,
    actor: Actor,
  ): Promise<AnalyticsEvent[]> {
    assertCan(actor, "analytics:read");
    const targetClientId = scopeClientId(actor, clientId);
    if (!targetClientId) {
      throw new BadRequestError("Client ID is required to export analytics");
    }

    return this.repo.exportEvents(targetClientId, fromEpoch, toEpoch, limit);
  }
}

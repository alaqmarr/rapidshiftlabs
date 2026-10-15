import type {
  IAnalyticsRepository,
  TimeseriesPoint,
} from "../../domain/ports/analytics-repository.port";
import { type Actor, assertCan, scopeClientId } from "../../../../shared/kernel/actor";
import { BadRequestError } from "../../../../shared/kernel/errors";

export class GetTimeseriesUseCase {
  constructor(private readonly repo: IAnalyticsRepository) {}

  async execute(
    clientId: string | null | undefined,
    fromEpoch: number,
    toEpoch: number,
    interval: "hour" | "day" = "day",
    actor: Actor,
  ): Promise<TimeseriesPoint[]> {
    assertCan(actor, "analytics:read");
    const targetClientId = scopeClientId(actor, clientId);
    if (!targetClientId) {
      throw new BadRequestError("Client ID is required to query analytics");
    }

    return this.repo.getTimeseries(targetClientId, fromEpoch, toEpoch, interval);
  }
}

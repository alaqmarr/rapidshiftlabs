import type {
  IAnalyticsRepository,
  WebVitalSummary,
} from "../../domain/ports/analytics-repository.port";
import { type Actor, assertCan, scopeClientId } from "../../../../shared/kernel/actor";
import { BadRequestError } from "../../../../shared/kernel/errors";

export class GetWebVitalsUseCase {
  constructor(private readonly repo: IAnalyticsRepository) {}

  async execute(
    clientId: string | null | undefined,
    fromEpoch: number,
    toEpoch: number,
    actor: Actor,
  ): Promise<WebVitalSummary[]> {
    assertCan(actor, "analytics:read");
    const targetClientId = scopeClientId(actor, clientId);
    if (!targetClientId) {
      throw new BadRequestError("Client ID is required to query analytics");
    }

    return this.repo.getWebVitals(targetClientId, fromEpoch, toEpoch);
  }
}

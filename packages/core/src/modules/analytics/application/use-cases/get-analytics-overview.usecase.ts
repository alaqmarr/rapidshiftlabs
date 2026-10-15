import type {
  IAnalyticsRepository,
  AnalyticsOverview,
  TopMetricPoint,
} from "../../domain/ports/analytics-repository.port";
import { type Actor, assertCan, scopeClientId } from "../../../../shared/kernel/actor";
import { BadRequestError } from "../../../../shared/kernel/errors";

export interface AnalyticsOverviewResult {
  overview: AnalyticsOverview;
  topPages: TopMetricPoint[];
  topReferrers: TopMetricPoint[];
  devices: {
    browsers: TopMetricPoint[];
    os: TopMetricPoint[];
    devices: TopMetricPoint[];
  };
}

export class GetAnalyticsOverviewUseCase {
  constructor(private readonly repo: IAnalyticsRepository) {}

  async execute(
    clientId: string | null | undefined,
    fromEpoch: number,
    toEpoch: number,
    actor: Actor,
  ): Promise<AnalyticsOverviewResult> {
    assertCan(actor, "analytics:read");
    const targetClientId = scopeClientId(actor, clientId);
    if (!targetClientId) {
      throw new BadRequestError("Client ID is required to query analytics");
    }

    const [overview, topPages, topReferrers, devices] = await Promise.all([
      this.repo.getOverview(targetClientId, fromEpoch, toEpoch),
      this.repo.getTopPages(targetClientId, fromEpoch, toEpoch, 10),
      this.repo.getTopReferrers(targetClientId, fromEpoch, toEpoch, 10),
      this.repo.getDeviceStats(targetClientId, fromEpoch, toEpoch),
    ]);

    return {
      overview,
      topPages,
      topReferrers,
      devices,
    };
  }
}

import { auth } from "@/auth";
import { getContainer } from "@rsl/core/container";
import { SYSTEM_ACTOR } from "@rsl/core/kernel";
import { PortalAnalyticsView } from "@/features/analytics/portal-analytics-view";
import type { AnalyticsData } from "@/features/analytics/admin-analytics-view";

export const dynamic = "force-dynamic";

export default async function PortalAnalyticsPage() {
  const session = await auth();
  const container = getContainer();

  let clientId = session?.user?.clientId;
  if (!clientId) {
    try {
      const allClients = await container.clientDirectoryRepo.list({ limit: 1 });
      clientId = allClients.items[0]?.id || "cli_preview_01";
    } catch {
      clientId = "cli_preview_01";
    }
  }

  let clientName = "Client Organization";
  let analyticsData: AnalyticsData = {
    overview: {
      totalPageviews: 0,
      uniqueVisitors: 0,
      totalSessions: 0,
      repeatVisitors: 0,
      newVisitors: 0,
      repeatVisitorRatePercent: 0,
      bounceRatePercent: 0,
      avgPagesPerSession: 0,
      avgSessionDurationSec: 0,
      activeVisitorsNow: 0,
      totalEvents: 0,
      totalErrors: 0,
      avgLcpMs: null,
    },
    topPages: [],
    entryPages: [],
    exitPages: [],
    topReferrers: [],
    countries: [],
    timezones: [],
    utmSources: [],
    utmMediums: [],
    utmCampaigns: [],
    devices: {
      browsers: [],
      os: [],
      devices: [],
      screens: [],
      languages: [],
    },
    webVitals: [],
    timeseries: [],
    visitorSessions: [],
    customEvents: [],
    recentErrors: [],
  };
  let offloadConfig: any = null;

  try {
    const actor = SYSTEM_ACTOR("portal-analytics-page");
    const toEpoch = Date.now();
    const fromEpoch = toEpoch - 30 * 86400000;

    const [client, suite, offload] = await Promise.all([
      container.clientDirectoryRepo.findById(clientId).catch(() => null),
      container.analyticsRepo.getDeepAnalyticsSuite
        ? container.analyticsRepo
            .getDeepAnalyticsSuite(clientId, fromEpoch, toEpoch, "day")
            .catch(() => null)
        : Promise.resolve(null),
      container.analytics.manageOffloadConfigUseCase
        .get(clientId, actor)
        .catch(() => null),
    ]);

    if (client) {
      clientName = client.name;
    }

    if (suite) {
      analyticsData = suite;
    }

    offloadConfig = offload;
  } catch (err) {
    console.error("[PortalAnalyticsPage] Server fetch error:", err);
  }

  return (
    <main className="flex-1 w-full px-4 sm:px-6 lg:px-8 xl:px-10 py-8">
      <PortalAnalyticsView
        clientId={clientId}
        clientName={clientName}
        initialData={analyticsData}
        offloadConfig={offloadConfig}
      />
    </main>
  );
}

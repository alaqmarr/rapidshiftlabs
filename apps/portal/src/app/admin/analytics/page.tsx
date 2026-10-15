export const dynamic = "force-dynamic";

import { getContainer } from "@rsl/core/container";
import { SYSTEM_ACTOR } from "@rsl/core/kernel";
import {
  AdminAnalyticsView,
  type AnalyticsData,
  type ClientOption,
} from "@/features/analytics/admin-analytics-view";

export default async function AdminAnalyticsPage(props: {
  searchParams: Promise<{ clientId?: string }>;
}) {
  const container = getContainer();
  const { clientId: queryClientId } = await props.searchParams;

  let clients: ClientOption[] = [];
  let selectedClientId = "";

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

  try {
    const clientsRes = await container.clientDirectoryRepo.list({ limit: 100 });
    clients = clientsRes.items.map((c) => ({ id: c.id, name: c.name }));

    selectedClientId = queryClientId || clients[0]?.id || "";

    if (selectedClientId) {
      const toEpoch = Date.now();
      const fromEpoch = toEpoch - 30 * 86400000; // 30 days

      if (container.analyticsRepo.getDeepAnalyticsSuite) {
        const suite = await container.analyticsRepo
          .getDeepAnalyticsSuite(selectedClientId, fromEpoch, toEpoch, "day")
          .catch(() => null);
        if (suite) {
          analyticsData = suite;
        }
      } else {
        const adminActor = SYSTEM_ACTOR("admin-analytics-page");
        const [overviewRes, vitalsRes] = await Promise.all([
          container.analytics.getOverviewUseCase
            .execute(selectedClientId, fromEpoch, toEpoch, adminActor)
            .catch(() => null),
          container.analytics.getWebVitalsUseCase
            .execute(selectedClientId, fromEpoch, toEpoch, adminActor)
            .catch(() => []),
        ]);

        if (overviewRes) {
          analyticsData = {
            ...analyticsData,
            overview: {
              ...analyticsData.overview,
              ...overviewRes.overview,
            },
            topPages: overviewRes.topPages || [],
            topReferrers: overviewRes.topReferrers || [],
            devices: overviewRes.devices || { browsers: [], os: [], devices: [] },
            webVitals: vitalsRes.map((v) => ({
              name: v.name,
              p75Value: v.p75Value,
              rating: v.rating,
              sampleCount: v.sampleCount,
            })),
          };
        }
      }
    }
  } catch (err) {
    console.error("[AdminAnalyticsPage] Server fetch error:", err);
  }

  return (
    <main className="flex-1 w-full px-4 sm:px-6 lg:px-8 xl:px-10 py-8">
      <AdminAnalyticsView
        initialData={analyticsData}
        clients={clients}
        selectedClientId={selectedClientId}
      />
    </main>
  );
}

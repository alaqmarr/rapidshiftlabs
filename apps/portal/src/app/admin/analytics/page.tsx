export const dynamic = "force-dynamic";

import { auth } from "@/auth";
import { getContainer } from "@rsl/core/container";
import { SYSTEM_ACTOR } from "@rsl/core/kernel";
import { AdminAnalyticsView, type AnalyticsData, type ClientOption } from "@/features/analytics/admin-analytics-view";

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
      totalEvents: 0,
      totalErrors: 0,
      avgLcpMs: null,
    },
    topPages: [],
    topReferrers: [],
    devices: {
      browsers: [],
      os: [],
      devices: [],
    },
    webVitals: [],
  };

  try {
    const clientsRes = await container.clientDirectoryRepo.list({ limit: 100 });
    clients = clientsRes.items.map((c) => ({ id: c.id, name: c.name }));

    selectedClientId = queryClientId || clients[0]?.id || "";

    if (selectedClientId) {
      const adminActor = SYSTEM_ACTOR("admin-analytics-page");
      const toEpoch = Date.now();
      const fromEpoch = toEpoch - 30 * 86400000; // 30 days

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
          overview: overviewRes.overview,
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

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
  let offloadConfig: any = null;

  try {
    const actor = SYSTEM_ACTOR("portal-analytics-page");
    const toEpoch = Date.now();
    const fromEpoch = toEpoch - 30 * 86400000;

    const [client, overviewRes, vitalsRes, offload] = await Promise.all([
      container.clientDirectoryRepo.findById(clientId).catch(() => null),
      container.analytics.getOverviewUseCase
        .execute(clientId, fromEpoch, toEpoch, actor)
        .catch(() => null),
      container.analytics.getWebVitalsUseCase
        .execute(clientId, fromEpoch, toEpoch, actor)
        .catch(() => []),
      container.analytics.manageOffloadConfigUseCase
        .get(clientId, actor)
        .catch(() => null),
    ]);

    if (client) {
      clientName = client.name;
    }

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

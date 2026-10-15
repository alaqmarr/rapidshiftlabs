import { getContainer } from "@rsl/core/container";
import { WIDGET_CATALOG } from "@rsl/core/embeds";
import { LiveEmbedClient } from "@/features/embeds/live-embed-client";
import { AlertTriangle } from "lucide-react";

export const dynamic = "force-dynamic";

interface EmbedPageProps {
  params: Promise<{ widget: string }>;
  searchParams: Promise<{
    token?: string;
    clientId?: string;
    theme?: string;
    accent?: string;
    domainId?: string;
  }>;
}

function serializeEntity(item: any): any {
  if (item === null || item === undefined) return item;
  if (Array.isArray(item)) return item.map(serializeEntity);
  if (typeof item.toState === "function") {
    return JSON.parse(JSON.stringify(item.toState()));
  }
  if (typeof item.toSnapshot === "function") {
    return JSON.parse(JSON.stringify(item.toSnapshot()));
  }
  if (item.props && typeof item.props === "object") {
    return JSON.parse(JSON.stringify({ ...item.props, ...item }));
  }
  return JSON.parse(JSON.stringify(item));
}

export default async function EmbedWidgetPage({ params, searchParams }: EmbedPageProps) {
  const { widget } = await params;
  const query = await searchParams;

  const token = query.token || "";
  const requestedClientId = query.clientId || "";
  const isDark = query.theme !== "light";
  const accent = query.accent || "#2563eb";

  const container = getContainer();
  let resolvedClientId = requestedClientId;
  let authError: string | null = null;

  // Verify embed token or resolve client
  if (token) {
    try {
      const verified = await container.embeds.verifyEmbedTokenUseCase.execute(
        token,
        widget || "client-dashboard"
      );
      resolvedClientId = verified.clientId;
    } catch (err: any) {
      authError = err?.message || "Invalid or expired embed token";
    }
  }

  // If no client resolved yet and no auth error, fallback to first client for live preview
  if (!resolvedClientId && !authError) {
    try {
      const allClients = await container.clientDirectoryRepo.list({ limit: 1 });
      if (allClients.items.length > 0) {
        resolvedClientId = allClients.items[0].id;
      }
    } catch (e) {
      // Ignore preview fallback error
    }
  }

  // Resolve Client Profile Name
  let clientName = "RapidShift Client";
  if (resolvedClientId) {
    try {
      const client = await container.clientDirectoryRepo.findById(resolvedClientId);
      if (client?.name) {
        clientName = client.name;
      }
    } catch (e) {
      // ignore
    }
  }

  const widgetDef = WIDGET_CATALOG[widget] || {
    title: widget.replace(/-/g, " ").toUpperCase(),
    description: "RapidShift Embedded Live Action Widget",
  };

  // If there's an explicit authorization failure, display clear security error
  if (authError && !resolvedClientId) {
    return (
      <div className={`min-h-screen p-6 flex flex-col justify-center items-center font-sans ${isDark ? "bg-slate-950 text-slate-100" : "bg-slate-50 text-slate-900"}`}>
        <div className={`w-full max-w-md p-6 rounded-2xl border ${isDark ? "bg-slate-900 border-slate-800" : "bg-white border-slate-200"} shadow-xl text-center space-y-4`}>
          <div className="w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-500 flex items-center justify-center mx-auto">
            <AlertTriangle className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-base font-bold">Embed Authentication Failed</h2>
            <p className="text-xs text-slate-400 mt-1">{authError}</p>
          </div>
          <p className="text-[11px] text-slate-500">
            Please verify the embed token from the client portal or mint a new one with required permissions.
          </p>
        </div>
      </div>
    );
  }

  // Query Real Live Initial Data
  let invoices: any[] = [];
  let payments: any[] = [];
  let summary = {
    outstandingMinor: 0,
    totalBilledMinor: 0,
    totalPaidMinor: 0,
    overdueMinor: 0,
    unpaidCount: 0,
  };
  let processes: any[] = [];
  let domains: any[] = [];
  let tickets: any[] = [];
  let credentials: any[] = [];
  let releases: any[] = [];
  let contracts: any[] = [];
  let analytics: any = {
    pageviews: 0,
    visitors: 0,
    repeatVisitors: 0,
    repeatRate: 0,
    bounceRate: 0,
    activeVisitorsNow: 0,
    avgDurationSec: 0,
    avgLcpMs: null,
    topPaths: [] as any[],
    topReferrers: [] as any[],
    countries: [] as any[],
    webVitals: [] as any[],
    timeseries: [] as any[],
    visitorSessions: [] as any[],
  };

  if (resolvedClientId) {
    try {
      const invRes = await container.billingRepo.listInvoices({ clientId: resolvedClientId });
      const rawInvoices = (invRes as any)?.items || (Array.isArray(invRes) ? invRes : []);
      invoices = serializeEntity(rawInvoices) || [];
    } catch (e) {}

    try {
      const payRes = await container.billingRepo.listPayments({ clientId: resolvedClientId });
      const rawPayments = (payRes as any)?.items || (Array.isArray(payRes) ? payRes : []);
      payments = serializeEntity(rawPayments) || [];
    } catch (e) {}

    try {
      const s = await container.billingRepo.getBillingSummary(resolvedClientId);
      if (s) {
        summary = {
          outstandingMinor: s.outstandingMinor || 0,
          totalBilledMinor: s.totalBilledMinor || 0,
          totalPaidMinor: s.totalPaidMinor || 0,
          overdueMinor: 0,
          unpaidCount: s.activeInvoicesCount || 0,
        };
      }
    } catch (e) {}

    try {
      const procs = await container.pm2ProcessRepo.listByClientId(resolvedClientId);
      processes = serializeEntity(procs || []) || [];
    } catch (e) {}

    try {
      const doms = await container.monitoredDomainRepo.findByClientId(resolvedClientId);
      const serializedDoms = serializeEntity(doms || []) || [];
      if (query.domainId && Array.isArray(serializedDoms)) {
        // Move requested domainId to front if present
        const idx = serializedDoms.findIndex((d: any) => d.id === query.domainId || d.props?.id === query.domainId);
        if (idx > 0) {
          const matched = serializedDoms.splice(idx, 1)[0];
          serializedDoms.unshift(matched);
        }
      }
      domains = serializedDoms;
    } catch (e) {}

    try {
      const tix = await container.ticketRepo.list({ clientId: resolvedClientId });
      tickets = serializeEntity(tix || []) || [];
    } catch (e) {}

    try {
      const creds = await container.vaultRepo.list({ clientId: resolvedClientId });
      credentials = serializeEntity(creds || []) || [];
    } catch (e) {}

    try {
      const relResult = await container.releases.listReleasesUseCase.execute(
        { clientId: resolvedClientId },
        {
          kind: "client_user",
          id: `usr_${resolvedClientId}`,
          email: "embed@client",
          name: clientName,
          clientId: resolvedClientId,
          role: "client_admin",
        }
      );
      releases = serializeEntity(relResult || []) || [];
    } catch (e) {}

    try {
      const contractRes = await container.contractRepo.list({ clientId: resolvedClientId });
      const rawContracts = (contractRes as any)?.items || (Array.isArray(contractRes) ? contractRes : []);
      contracts = serializeEntity(rawContracts) || [];
    } catch (e) {}

    try {
      const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
      const now = Date.now();
      if (container.analyticsRepo.getDeepAnalyticsSuite) {
        const suite = await container.analyticsRepo.getDeepAnalyticsSuite(
          resolvedClientId,
          thirtyDaysAgo,
          now,
          "day"
        );
        if (suite) {
          analytics = {
            pageviews: suite.overview.totalPageviews || 0,
            visitors: suite.overview.uniqueVisitors || 0,
            repeatVisitors: suite.overview.repeatVisitors || 0,
            repeatRate: suite.overview.repeatVisitorRatePercent || 0,
            bounceRate: suite.overview.bounceRatePercent || 0,
            activeVisitorsNow: suite.overview.activeVisitorsNow || 0,
            avgDurationSec: suite.overview.avgSessionDurationSec || 0,
            avgLcpMs: suite.overview.avgLcpMs ?? null,
            topPaths: suite.topPages || [],
            topReferrers: suite.topReferrers || [],
            countries: suite.countries || [],
            webVitals: suite.webVitals || [],
            timeseries: suite.timeseries || [],
            visitorSessions: (suite.visitorSessions || []).slice(0, 8),
          };
        }
      } else {
        const overview = await container.analyticsRepo.getOverview(
          resolvedClientId,
          thirtyDaysAgo,
          now
        );
        if (overview) {
          analytics = {
            pageviews: overview.totalPageviews || 0,
            visitors: overview.uniqueVisitors || 0,
            repeatVisitors: 0,
            repeatRate: 0,
            bounceRate: 0,
            activeVisitorsNow: 0,
            avgDurationSec: 0,
            avgLcpMs: overview.avgLcpMs ?? null,
            topPaths: [],
            topReferrers: [],
            countries: [],
            webVitals: [],
            timeseries: [],
            visitorSessions: [],
          };
        }
      }
    } catch (e) {}
  }

  return (
    <LiveEmbedClient
      widget={widget}
      widgetTitle={widgetDef.title}
      widgetDescription={widgetDef.description}
      clientId={resolvedClientId || "preview"}
      clientName={clientName}
      token={token}
      isDark={isDark}
      accent={accent}
      initialData={{
        invoices,
        payments,
        summary,
        processes,
        domains,
        tickets,
        credentials,
        releases,
        contracts: (contracts as any[]) || [],
        analytics: (analytics as any) || {
          pageviews: 0,
          visitors: 0,
          repeatVisitors: 0,
          repeatRate: 0,
          bounceRate: 0,
          activeVisitorsNow: 0,
          avgDurationSec: 0,
          avgLcpMs: null,
          topPaths: [],
          topReferrers: [],
          countries: [],
          webVitals: [],
          timeseries: [],
          visitorSessions: [],
        },
      }}
    />
  );
}

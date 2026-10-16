import { getContainer } from "@rsl/core/container";
import { WIDGET_CATALOG } from "@rsl/core/embeds";
import { LiveEmbedClient } from "@/features/embeds/live-embed-client";
import { auth } from "@/auth";
import { AlertTriangle } from "lucide-react";

export const dynamic = "force-dynamic";

interface EmbedPageProps {
  params: Promise<{ widget: string }>;
  searchParams: Promise<{
    token?: string;
    apiKey?: string;
    api_key?: string;
    key?: string;
    clientId?: string;
    client?: string;
    theme?: string;
    accent?: string;
    domainId?: string;
  }>;
}

function serializeEntity(item: any): any {
  if (item === null || item === undefined) return item;
  if (Array.isArray(item)) return item.map(serializeEntity);
  if (typeof item.toJSON === "function") {
    return JSON.parse(JSON.stringify(item.toJSON()));
  }
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

  const rawCredential = (
    query.apiKey ||
    query.api_key ||
    query.key ||
    query.token ||
    ""
  ).trim();
  const requestedClientId = (query.clientId || query.client || "").trim();
  const isDark = query.theme !== "light";
  const accent = query.accent || "#2563eb";

  const container = getContainer();
  let resolvedClientId = requestedClientId;
  let authError: string | null = null;

  // 1. Verify API Key (rpk_live_... or rsk_live_...) OR Scoped Embed Token (emb_...)
  if (rawCredential) {
    if (rawCredential.startsWith("rpk_") || rawCredential.startsWith("rsk_")) {
      try {
        const verifiedKey = await container.apiPlatformModule.validateApiKey(rawCredential);
        if (verifiedKey && verifiedKey.valid && verifiedKey.clientId) {
          resolvedClientId = verifiedKey.clientId;
        } else {
          authError =
            verifiedKey?.error === "key_revoked"
              ? "This API key has been revoked."
              : verifiedKey?.error === "key_expired"
              ? "This API key has expired."
              : "Invalid API key provided for embed.";
        }
      } catch (err: any) {
        authError = err?.message || "Failed to validate API key";
      }
    } else if (rawCredential.startsWith("emb_")) {
      try {
        const verified = await container.embeds.verifyEmbedTokenUseCase.execute(
          rawCredential,
          widget || "client-dashboard"
        );
        resolvedClientId = verified.clientId;
      } catch (err: any) {
        authError = err?.message || "Invalid or expired embed token";
      }
    }
  }

  // 2. If no explicit credential or clientId was passed, check active authenticated session
  if (!resolvedClientId && !authError) {
    try {
      const session = await auth();
      if (session?.user?.clientId) {
        resolvedClientId = session.user.clientId;
      }
    } catch {
      // Ignore session check failure
    }
  }

  // 3. Fallback to first client only for unauthenticated sandbox preview
  if (!resolvedClientId && !authError) {
    try {
      const allClients = await container.clientDirectoryRepo.list({ limit: 1 });
      if (allClients.items.length > 0) {
        resolvedClientId = allClients.items[0].id;
      }
    } catch {
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
    } catch {
      // ignore
    }
  }

  const widgetDef = WIDGET_CATALOG[widget] || {
    title: widget
      .replace(/-/g, " ")
      .replace(/\b\w/g, (c) => c.toUpperCase()),
    description: "RapidShift Embedded Live Action Widget",
  };

  // If there's an explicit authorization failure, display card-only security error
  if (authError && !resolvedClientId) {
    return (
      <>
        <style>{`html, body { background: transparent !important; margin: 0 !important; padding: 0 !important; min-height: 0 !important; }`}</style>
        <div
          className={`w-full p-6 rounded-2xl border font-sans ${
            isDark
              ? "bg-zinc-900 border-zinc-800 text-zinc-100"
              : "bg-white border-zinc-200 text-zinc-900"
          } shadow-lg text-center space-y-3`}
        >
          <div className="w-11 h-11 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-500 flex items-center justify-center mx-auto">
            <AlertTriangle className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-sm font-bold">Embed Authentication Failed</h2>
            <p className="text-xs text-zinc-400 mt-1">{authError}</p>
          </div>
          <p className="text-[11px] text-zinc-500">
            Generate a permanent Universal API Key (<code className="font-mono">rpk_live_...</code>) in the Client Portal or Embed Studio to authorize all embeds without token expiry.
          </p>
        </div>
      </>
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
    } catch {}

    try {
      const payRes = await container.billingRepo.listPayments({ clientId: resolvedClientId });
      const rawPayments = (payRes as any)?.items || (Array.isArray(payRes) ? payRes : []);
      payments = serializeEntity(rawPayments) || [];
    } catch {}

    try {
      const s = await container.billingRepo.getBillingSummary(resolvedClientId).catch(() => null);
      const nowMs = Date.now();
      const activeInvoices = invoices.filter(
        (inv: any) => inv.status !== "cancelled" && inv.status !== "void" && inv.status !== "draft"
      );
      const unpaidInvs = activeInvoices.filter((inv: any) => inv.status !== "paid");
      const computedOutstanding = unpaidInvs.reduce(
        (acc: number, inv: any) => acc + (Number(inv.balanceMinor ?? inv.totalMinor) || 0),
        0
      );
      const computedBilled = activeInvoices.reduce(
        (acc: number, inv: any) => acc + (Number(inv.totalMinor) || 0),
        0
      );
      const computedPaid = payments.reduce(
        (acc: number, p: any) => acc + (Number(p.amountMinor) || 0),
        0
      );
      const computedOverdue = unpaidInvs
        .filter(
          (inv: any) =>
            inv.status === "overdue" ||
            (inv.dueDate && new Date(inv.dueDate).getTime() < nowMs)
        )
        .reduce(
          (acc: number, inv: any) => acc + (Number(inv.balanceMinor ?? inv.totalMinor) || 0),
          0
        );

      summary = {
        outstandingMinor: s?.outstandingMinor ?? computedOutstanding,
        totalBilledMinor: s?.totalBilledMinor ?? computedBilled,
        totalPaidMinor: s?.totalPaidMinor ?? computedPaid,
        overdueMinor: computedOverdue,
        unpaidCount: unpaidInvs.length,
      };
    } catch {}

    try {
      const [procs, servers] = await Promise.all([
        container.pm2ProcessRepo.listByClientId(resolvedClientId),
        container.fleetModule.listServers().catch(() => []),
      ]);
      const serverMap = new Map<string, { name: string; host: string }>();
      for (const srv of servers || []) {
        const snap = srv as any;
        if (snap?.id) {
          serverMap.set(snap.id, { name: snap.name, host: snap.host });
        }
      }
      const rawProcs = serializeEntity(procs || []) || [];
      processes = rawProcs.map((p: any) => {
        const srv = serverMap.get(p.serverId);
        return {
          ...p,
          cpu: Number(p.cpu ?? p.cpuPercent ?? 0),
          memory: Number(p.memory ?? p.memoryBytes ?? 0),
          restarts: Number(p.restarts ?? 0),
          uptimeMs: Number(p.uptimeMs ?? 0),
          serverName: srv?.name || p.serverName || "Managed Host",
          serverHost: srv?.host || p.serverHost || "",
        };
      });
    } catch {}

    try {
      const [doms, activeIncidents, recentIncidents] = await Promise.all([
        container.monitoredDomainRepo.findByClientId(resolvedClientId),
        container.incidentRepo.findActiveByClientId(resolvedClientId).catch(() => []),
        container.incidentRepo.findRecentByClientId(resolvedClientId, 10).catch(() => []),
      ]);
      const serializedDoms = serializeEntity(doms || []) || [];
      const allClientIncidents = serializeEntity([
        ...(activeIncidents || []),
        ...(recentIncidents || []),
      ]) || [];
      if (query.domainId && Array.isArray(serializedDoms)) {
        const idx = serializedDoms.findIndex(
          (d: any) => d.id === query.domainId || d.props?.id === query.domainId
        );
        if (idx > 0) {
          const matched = serializedDoms.splice(idx, 1)[0];
          serializedDoms.unshift(matched);
        }
      }
      // Enrich domains with active/recent incident counts
      for (const dom of serializedDoms) {
        const domIncidents = allClientIncidents.filter(
          (inc: any) => inc.domainId === dom.id
        );
        dom.incidents = domIncidents.slice(0, 5);
        dom.openIncidentsCount = domIncidents.filter(
          (inc: any) => inc.status !== "resolved"
        ).length;
      }
      domains = serializedDoms;
    } catch {}

    try {
      const tixRes = await container.ticketRepo.list({ clientId: resolvedClientId });
      const rawTickets =
        (tixRes as any)?.tickets ||
        (tixRes as any)?.items ||
        (Array.isArray(tixRes) ? tixRes : []);
      const serializedTickets = serializeEntity(rawTickets) || [];
      // Hydrate conversation messages for recent tickets
      for (const t of serializedTickets.slice(0, 8)) {
        try {
          const msgs = await container.ticketRepo.listMessages(t.id, false);
          t.messages = serializeEntity(msgs || []) || [];
        } catch {
          t.messages = [];
        }
      }
      tickets = serializedTickets;
    } catch {}

    try {
      const creds = await container.vaultRepo.list({ clientId: resolvedClientId });
      const rawCreds = (creds as any)?.items || (Array.isArray(creds) ? creds : []);
      credentials = serializeEntity(rawCreds) || [];
    } catch {}

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
      const rawReleases =
        (relResult as any)?.items ||
        (relResult as any)?.releases ||
        (Array.isArray(relResult) ? relResult : []);
      releases = serializeEntity(rawReleases) || [];
    } catch {}

    try {
      const contractRes = await container.contractRepo.list({ clientId: resolvedClientId });
      const rawContracts =
        (contractRes as any)?.items || (Array.isArray(contractRes) ? contractRes : []);
      const serialized = serializeEntity(rawContracts) || [];
      contracts = serialized.sort((a: any, b: any) => {
        if (a.status === "active" && b.status !== "active") return -1;
        if (b.status === "active" && a.status !== "active") return 1;
        return (b.validFrom || 0) - (a.validFrom || 0);
      });
    } catch {}

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
    } catch {}
  }

  return (
    <>
      <style>{`html, body { background: transparent !important; margin: 0 !important; padding: 0 !important; min-height: 0 !important; overflow-x: hidden; }`}</style>
      <LiveEmbedClient
        widget={widget}
        widgetTitle={widgetDef.title}
        widgetDescription={widgetDef.description}
        clientId={resolvedClientId || "preview"}
        clientName={clientName}
        token={rawCredential}
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
    </>
  );
}

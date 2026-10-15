import { auth } from "@/auth";
import { getContainer } from "@rsl/core/container";
import type { Actor } from "@rsl/core/kernel";
import { ClientHealthService } from "@rsl/core/clients";
import {
  PortalDashboardView,
  type PortalProcessItem,
  type PortalInvoiceItem,
  type PortalDomainItem,
  type PortalTicketItem,
  type PortalReleaseItem,
} from "@/features/portal/portal-dashboard-view";

export const dynamic = "force-dynamic";

export default async function ClientPortalOverviewPage() {
  const session = await auth();

  const userEmail = session?.user?.email || "client@company.com";
  const userRole = session?.user?.role || "client_admin";
  let clientId = (session?.user as any)?.clientId;

  const container = getContainer();

  if (!clientId) {
    try {
      const allClients = await container.clientDirectoryRepo.list({ limit: 1 });
      clientId = allClients.items[0]?.id || "cli_preview_01";
    } catch {
      clientId = "cli_preview_01";
    }
  }

  const clientActor: Actor = {
    kind: "client_user",
    id: (session?.user as any)?.id || "usr_client",
    email: userEmail,
    name: session?.user?.name || "Client User",
    role: "client_admin",
    clientId,
  };

  // Parallel concurrent data gathering for this specific client organization
  const [
    client,
    billingSummary,
    invoicesRes,
    contractsRes,
    clientProcesses,
    serversList,
    clientDomains,
    ticketsRes,
    releasesList,
    apiKeysList,
  ] = await Promise.all([
    container.clientDirectoryRepo.findById(clientId).catch(() => null),
    container.billingRepo.getBillingSummary(clientId).catch(() => ({
      outstandingMinor: 0,
      totalBilledMinor: 0,
      totalPaidMinor: 0,
      overdueCount: 0,
      activeInvoicesCount: 0,
    })),
    container.billingRepo.listInvoices({ clientId, limit: 10 }).catch(() => ({ items: [], total: 0 })),
    container.contractRepo.list({ clientId, limit: 5 }).catch(() => ({ items: [], total: 0 })),
    container.pm2ProcessRepo.listByClientId(clientId).catch(() => []),
    container.fleetModule.listServers().catch(() => []),
    container.monitoredDomainRepo.findByClientId(clientId).catch(() => []),
    container.supportModule.listTicketsUseCase.execute({ limit: 10 }, clientActor).catch(() => ({ items: [], total: 0 })),
    container.releases.listReleasesUseCase.execute({}, clientActor).catch(() => []),
    container.apiKeyRepo.findByClientId(clientId, { includeRevoked: true }).catch(() => []),
  ]);

  const clientName = client?.name || "Client Organization";
  const clientSlug = (client as any)?.slug || clientId;
  const clientCurrency = (client as any)?.currency || "INR";

  // Map server names
  const serverNameMap = new Map<string, string>();
  serversList.forEach((s: any) => {
    serverNameMap.set(s.id, s.name || s.hostname || s.id);
  });

  // Calculate Client Health Index 360
  const overdueInvoices = invoicesRes.items.filter((i: any) => i.status === "overdue");
  const overdueBalanceMinor = overdueInvoices.reduce((sum: number, i: any) => sum + (i.balanceMinor || 0), 0);
  const onlineProcs = clientProcesses.filter((p: any) => p.status === "online").length;
  const erroredProcs = clientProcesses.filter((p: any) => p.status === "errored" || p.status === "stopped").length;
  const activeIncidents = clientDomains.filter((d: any) => d.status === "down" || d.status === "degraded").length;
  const expiringSslCount = clientDomains.filter((d: any) => (d.sslExpiryDays ?? 999) < 14).length;
  const clientTickets = (ticketsRes as any).items || [];
  const p1Count = clientTickets.filter((t: any) => t.priority === "urgent" || t.priority === "high" || t.priority === "p1").length;

  const health = ClientHealthService.calculate({
    clientId,
    clientStatus: client?.status || "active",
    billing: {
      outstandingMinor: overdueBalanceMinor,
      totalBilledMinor: billingSummary.totalBilledMinor,
      overdueInvoicesCount: overdueInvoices.length,
      entitlementAllowed: overdueInvoices.length === 0,
      entitlementStatus: overdueInvoices.length > 0 ? "overdue" : "active",
    },
    fleet: {
      totalProcesses: clientProcesses.length,
      onlineProcesses: onlineProcs,
      erroredProcesses: erroredProcs,
      hasCrashLoop: clientProcesses.some((p: any) => p.restarts >= 5),
    },
    monitoring: {
      totalDomains: clientDomains.length,
      activeIncidentsCount: activeIncidents,
      expiringSslCount,
    },
    support: {
      openTicketsCount: clientTickets.filter((t: any) => t.status !== "resolved" && t.status !== "closed").length,
      breachedSlaCount: 0,
      hasEscalatedP1: p1Count > 0,
    },
  });

  // Map Invoices
  const recentInvoices: PortalInvoiceItem[] = invoicesRes.items.map((i: any) => ({
    id: i.id,
    invoiceNumber: i.invoiceNumber,
    totalMinor: i.totalMinor,
    balanceMinor: i.balanceMinor,
    status: i.status,
    dueDate: typeof i.dueDate === "number" ? i.dueDate : new Date(i.dueDate).getTime(),
    currency: i.currency || clientCurrency,
    pdfPath: i.pdfPath,
  }));

  // Map Processes
  const processes: PortalProcessItem[] = clientProcesses.map((p: any) => ({
    id: p.id,
    serverId: p.serverId,
    serverName: serverNameMap.get(p.serverId) || "Production Cluster",
    pm2Id: p.pm2Id,
    name: p.name,
    allowClientRestart: p.allowClientRestart ?? true,
    restartCooldownSec: p.restartCooldownSec || 30,
    status: p.status,
    cpu: p.cpu || 0,
    memory: p.memory || 0,
    restarts: p.restarts || 0,
    uptimeMs: p.uptimeMs || 0,
  }));

  // Map Domains
  const domains: PortalDomainItem[] = clientDomains.map((d: any) => ({
    id: d.id,
    hostname: d.hostname,
    status: d.status,
    sslStatus: d.sslStatus,
    sslExpiryDays: d.sslExpiryDays,
    uptimePercent: d.uptimePercent,
    lastHttpCheckAt: d.lastHttpCheckAt,
  }));

  // Map Tickets
  const tickets: PortalTicketItem[] = clientTickets.map((t: any) => ({
    id: t.id,
    ticketNumber: t.ticketNumber || t.id.slice(0, 8),
    subject: t.subject,
    priority: t.priority,
    status: t.status,
    createdAt: typeof t.createdAt === "number" ? t.createdAt : new Date(t.createdAt).getTime(),
  }));

  // Map Releases
  const releases: PortalReleaseItem[] = (releasesList || []).map((r: any) => ({
    id: r.id,
    version: r.version,
    channel: r.channel || "production",
    notes: r.notes || r.changelog,
    deployedAt: typeof r.deployedAt === "number" ? r.deployedAt : (r.createdAt ? new Date(r.createdAt).getTime() : Date.now()),
    previewUrl: r.previewUrl,
  }));

  const activeApiKey = apiKeysList[0]
    ? {
        id: apiKeysList[0].id,
        keyPrefix: apiKeysList[0].keyPrefix || "rsl_live_••••",
        name: apiKeysList[0].name,
        status: (apiKeysList[0] as any).revokedAt ? "revoked" : "active",
      }
    : undefined;

  return (
    <PortalDashboardView
      user={{ email: userEmail, role: userRole }}
      client={{
        id: clientId,
        name: clientName,
        slug: clientSlug,
        billingEmail: (client as any)?.billingEmail,
        currency: clientCurrency,
      }}
      health={{
        score: health.overallScore,
        category: health.tier,
        recommendations: health.recommendations,
        factors: {
          billing: health.factors.billing.score,
          fleet: health.factors.fleet.score,
          domains: health.factors.monitoring.score,
          support: health.factors.support.score,
        },
      }}
      billingSummary={{
        outstandingMinor: billingSummary.outstandingMinor,
        totalBilledMinor: billingSummary.totalBilledMinor,
        totalPaidMinor: billingSummary.totalPaidMinor,
        overdueCount: billingSummary.overdueCount,
        activeInvoicesCount: billingSummary.activeInvoicesCount,
      }}
      recentInvoices={recentInvoices}
      activeContractsCount={contractsRes.total}
      processes={processes}
      domains={domains}
      tickets={tickets}
      releases={releases}
      apiKey={activeApiKey}
    />
  );
}

import { auth } from "@/auth";
import { getContainer } from "@rsl/core/container";
import { SYSTEM_ACTOR } from "@rsl/core/kernel";
import { ClientHealthService } from "@rsl/core/clients";
import {
  AdminDashboardView,
  type AtRiskClientItem,
  type AdminInvoiceItem,
  type AdminFleetProcessItem,
  type AdminMonitoredDomainItem,
  type AdminUrgentTicketItem,
  type AdminAuditRecordItem,
} from "@/features/admin/admin-dashboard-view";

export const dynamic = "force-dynamic";

export default async function AdminDashboardPage() {
  const session = await auth();

  const userEmail = session?.user?.email || "admin@rapidshiftlabs.com";
  const userRole = session?.user?.role || "owner";

  const container = getContainer();
  const adminActor = SYSTEM_ACTOR("admin-dashboard-page");

  // Parallel concurrent data gathering across all bounded contexts
  const [
    clientsRes,
    contractsRes,
    billingSummary,
    invoicesRes,
    serversList,
    processesList,
    domainsList,
    ticketsRes,
    releasesList,
    vaultList,
    recentAudits,
  ] = await Promise.all([
    container.clientDirectoryRepo.list({ limit: 50 }).catch(() => ({ items: [], total: 0 })),
    container.contractRepo.list({ limit: 1 }).catch(() => ({ items: [], total: 0 })),
    container.billingRepo.getBillingSummary().catch(() => ({ outstandingMinor: 0, totalBilledMinor: 0, totalPaidMinor: 0, overdueCount: 0, activeInvoicesCount: 0 })),
    container.billingRepo.listInvoices({ limit: 15 }).catch(() => ({ items: [], total: 0 })),
    container.fleetModule.listServers().catch(() => []),
    container.pm2ProcessRepo.listAll().catch(() => []),
    container.monitoredDomainRepo.listAll?.() ?? [],
    container.supportModule.listTicketsUseCase.execute({ limit: 100 }, adminActor).catch(() => ({ items: [], total: 0 })),
    container.releases.listReleasesUseCase.execute({}, adminActor).catch(() => []),
    container.vault.listCredentialsUseCase.execute({}, adminActor).catch(() => []),
    container.auditRepo.listRecent(8).catch(() => []),
  ]);

  // Compute live client health radar for all active organizations with accurate per-client billing
  const clientNameMap = new Map<string, string>();
  clientsRes.items.forEach((c: any) => {
    clientNameMap.set(c.id, c.name);
  });

  const clientBillingSummaries = await Promise.all(
    clientsRes.items.map((c: any) =>
      container.billingRepo.getBillingSummary(c.id).catch(() => ({
        totalBilledMinor: 0,
        totalPaidMinor: 0,
        outstandingMinor: 0,
        overdueCount: 0,
        activeInvoicesCount: 0,
      }))
    ),
  );

  const atRiskClients: AtRiskClientItem[] = clientsRes.items.map((c: any, index: number) => {
    const billing = clientBillingSummaries[index] || {
      totalBilledMinor: 0,
      totalPaidMinor: 0,
      outstandingMinor: 0,
      overdueCount: 0,
      activeInvoicesCount: 0,
    };

    const clientProcesses = processesList.filter((p: any) => p.clientId === c.id);
    const onlineProcs = clientProcesses.filter((p: any) => p.status === "online").length;
    const erroredProcs = clientProcesses.filter((p: any) => p.status === "errored" || p.status === "stopped").length;

    const clientDomains = domainsList.filter((d: any) => d.clientId === c.id);
    const activeIncidents = clientDomains.filter((d: any) => d.status === "down" || d.status === "degraded").length;
    const expiringSslCount = clientDomains.filter((d: any) => (d.sslExpiryDays ?? 999) < 14).length;

    const clientTickets = ((ticketsRes as any).items || []).filter((t: any) => t.clientId === c.id);
    const p1Count = clientTickets.filter((t: any) => t.priority === "urgent" || t.priority === "high" || t.priority === "p1").length;

    const health = ClientHealthService.calculate({
      clientId: c.id,
      clientStatus: c.status || "active",
      billing: {
        outstandingMinor: billing.outstandingMinor,
        totalBilledMinor: billing.totalBilledMinor,
        overdueInvoicesCount: billing.overdueCount,
        entitlementAllowed: billing.overdueCount === 0,
        entitlementStatus: billing.overdueCount > 0 ? "overdue" : "active",
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

    return {
      id: c.id,
      name: c.name,
      slug: c.slug || c.id,
      tier: c.status || "active",
      healthScore: health.overallScore,
      healthCategory: health.tier,
      primaryRisk: health.recommendations[0] || health.summary || "All operations stable",
      factors: {
        billing: health.factors.billing.score,
        fleet: health.factors.fleet.score,
        domains: health.factors.monitoring.score,
        support: health.factors.support.score,
      },
      outstandingPaise: billing.outstandingMinor,
    };
  }).sort((a: AtRiskClientItem, b: AtRiskClientItem) => a.healthScore - b.healthScore);

  // Map Recent Invoices
  const recentInvoices: AdminInvoiceItem[] = invoicesRes.items.map((i: any) => ({
    id: i.id,
    invoiceNumber: i.invoiceNumber,
    clientName: clientNameMap.get(i.clientId) || i.clientId,
    clientId: i.clientId,
    totalMinor: i.totalMinor,
    balanceMinor: i.balanceMinor,
    status: i.status,
    dueDate: typeof i.dueDate === "number" ? i.dueDate : new Date(i.dueDate).getTime(),
    currency: i.currency || "INR",
  }));

  // Server Name Map
  const serverNameMap = new Map<string, string>();
  serversList.forEach((s: any) => {
    serverNameMap.set(s.id, s.name || s.hostname || s.id);
  });

  // Map Fleet Processes
  const fleetProcesses: AdminFleetProcessItem[] = processesList.map((p: any) => ({
    id: p.id,
    serverId: p.serverId,
    serverName: serverNameMap.get(p.serverId) || "Production Server",
    pm2Id: p.pm2Id,
    name: p.name,
    clientId: p.clientId,
    clientName: p.clientId ? (clientNameMap.get(p.clientId) || p.clientId) : undefined,
    status: p.status,
    cpu: p.cpu || 0,
    memory: p.memory || 0,
    restarts: p.restarts || 0,
    uptimeMs: p.uptimeMs || 0,
  }));

  // Map Monitored Domains
  const monitoredDomains: AdminMonitoredDomainItem[] = domainsList.map((d: any) => ({
    id: d.id,
    hostname: d.hostname,
    clientName: d.clientId ? (clientNameMap.get(d.clientId) || d.clientId) : undefined,
    status: d.status,
    sslStatus: d.sslStatus,
    sslExpiryDays: d.sslExpiryDays,
    uptimePercent: d.uptimePercent,
    lastHttpCheckAt: d.lastHttpCheckAt,
  }));

  // Map Urgent Tickets
  const urgentTickets: AdminUrgentTicketItem[] = ((ticketsRes as any).items || [])
    .filter((t: any) => t.status !== "closed" && t.status !== "resolved")
    .map((t: any) => ({
      id: t.id,
      ticketNumber: t.ticketNumber || t.id.slice(0, 8),
      subject: t.subject,
      clientId: t.clientId,
      clientName: clientNameMap.get(t.clientId) || t.clientId,
      priority: t.priority,
      status: t.status,
      createdAt: typeof t.createdAt === "number" ? t.createdAt : new Date(t.createdAt).getTime(),
    }));

  // Map Audit Logs
  const recentAuditLogs: AdminAuditRecordItem[] = recentAudits.map((a: any) => ({
    id: a.id,
    action: a.action,
    actorEmail: a.actorEmail,
    actorType: a.actorType,
    entityType: a.entityType,
    entityId: a.entityId,
    timestamp: typeof a.timestamp === "number" ? a.timestamp : new Date(a.timestamp).getTime(),
  }));

  const onlineProcesses = fleetProcesses.filter((p) => p.status === "online").length;
  const erroredProcesses = fleetProcesses.filter((p) => p.status === "errored" || p.status === "stopped").length;
  const atRiskClientsCount = atRiskClients.filter((c) => c.healthCategory === "AT_RISK" || c.healthCategory === "CRITICAL").length;

  return (
    <AdminDashboardView
      user={{ email: userEmail, role: userRole }}
      kpis={{
        clientCount: clientsRes.total,
        contractCount: contractsRes.total,
        outstandingPaise: billingSummary.outstandingMinor,
        totalBilledPaise: billingSummary.totalBilledMinor,
        serverCount: serversList.length,
        domainCount: domainsList.length,
        ticketCount: (ticketsRes as any).total || 0,
        releaseCount: releasesList.length,
        vaultCount: vaultList.length,
        onlineProcesses,
        totalProcesses: fleetProcesses.length,
        erroredProcesses,
        atRiskClientsCount,
      }}
      atRiskClients={atRiskClients}
      recentInvoices={recentInvoices}
      fleetProcesses={fleetProcesses}
      monitoredDomains={monitoredDomains}
      urgentTickets={urgentTickets}
      recentAuditLogs={recentAuditLogs}
    />
  );
}

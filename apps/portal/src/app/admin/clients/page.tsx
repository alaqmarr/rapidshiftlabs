import { getContainer } from "@rsl/core/container";
import { ClientManager, type ClientItem } from "@/features/clients/client-manager";

export const dynamic = "force-dynamic";

export default async function AdminClientsPage() {
  const container = getContainer();

  let initialClients: ClientItem[] = [];

  try {
    const result = await container.clientsModule.listClientsUseCase.execute({
      limit: 100,
    });

    initialClients = await Promise.all(
      result.items.map(async (client) => {
        const [contacts, projects, users, entitlement, billingSummary, processes, domains, tickets] = await Promise.all([
          container.clientDirectoryRepo.findContactsByClient(client.id),
          container.clientDirectoryRepo.findProjectsByClient(client.id),
          container.clientRepo.findByClientId(client.id),
          container.entitlementModule.evaluate(client.id).catch(() => ({ status: "active", allowed: true })),
          container.billingRepo.getBillingSummary(client.id).catch(() => ({
            totalBilledMinor: 0,
            totalPaidMinor: 0,
            outstandingMinor: 0,
            overdueCount: 0,
            activeInvoicesCount: 0,
          })),
          container.pm2ProcessRepo.listByClientId(client.id).catch(() => []),
          container.monitoredDomainRepo.findByClientId(client.id).catch(() => []),
          container.ticketRepo.list({ clientId: client.id }).catch(() => []),
        ]);

        const { ClientHealthService } = await import("@rsl/core/clients");
        const health = ClientHealthService.calculate({
          clientId: client.id,
          clientStatus: client.status,
          billing: {
            outstandingMinor: billingSummary.outstandingMinor,
            totalBilledMinor: billingSummary.totalBilledMinor,
            overdueInvoicesCount: billingSummary.overdueCount,
            entitlementAllowed: (entitlement as any).allowed,
            entitlementStatus: (entitlement as any).status,
          },
          fleet: {
            totalProcesses: processes.length,
            onlineProcesses: processes.filter((p: any) => p.status === "online").length,
            erroredProcesses: processes.filter((p: any) => p.status === "errored" || p.status === "stopped").length,
            hasCrashLoop: processes.some(
              (p: any) =>
                (p.status === "errored" && (p.restarts || 0) >= 3) ||
                (p.status === "online" && p.uptimeMs > 0 && p.uptimeMs < 30_000 && (p.restarts || 0) >= 8)
            ),
          },
          monitoring: {
            totalDomains: domains.length,
            activeIncidentsCount: domains.filter((d: any) => d.status === "down").length,
            expiringSslCount: domains.filter((d: any) => d.sslStatus === "expiring").length,
          },
          support: {
            openTicketsCount: tickets.filter((t: any) => t.status !== "resolved" && t.status !== "closed").length,
            breachedSlaCount: tickets.filter((t: any) => (t as any).isSlaBreached).length,
            hasEscalatedP1: tickets.some((t: any) => t.priority === "P1" && t.status !== "resolved" && t.status !== "closed"),
          },
        });

        return {
          id: client.id,
          name: client.name,
          slug: client.slug,
          gstin: client.gstin || undefined,
          pan: client.pan || undefined,
          billingMode: client.billingMode,
          currency: client.currency,
          status: client.status,
          city: client.city || undefined,
          state: client.state || undefined,
          addressLine1: client.addressLine1 || undefined,
          contactsCount: contacts.length,
          projectsCount: projects.length,
          entitlementStatus: (entitlement as any).status,
          entitlementAllowed: (entitlement as any).allowed,
          entitlementReason: (entitlement as any).reason || undefined,
          overrideMode: (entitlement as any).manualOverrideMode || undefined,
          healthScore: health.overallScore,
          healthTier: health.tier,
          contacts: contacts.map((c: any) => ({
            id: c.id,
            name: c.name,
            email: c.email,
            phone: c.phone || undefined,
            isPrimary: c.isPrimary,
          })),
          projects: projects.map((p: any) => ({
            id: p.id,
            name: p.name,
            slug: p.slug,
            status: p.status,
          })),
          portalUsers: users.map((u: any) => ({
            id: u.id,
            name: u.name,
            email: u.email.value,
            role: u.role,
            status: u.status,
            createdAt: u.createdAt.getTime(),
          })),
          createdAt: client.createdAt,
        };
      }),
    );
  } catch (err) {
    console.error("[AdminClientsPage] Server fetch error:", err);
  }

  return <ClientManager initialClients={initialClients} />;
}

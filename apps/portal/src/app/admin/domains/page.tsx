export const dynamic = "force-dynamic";

import { getContainer } from "@rsl/core/container";
import { DomainManager, type SerializedDomain, type ClientOption } from "@/features/monitoring/domain-manager";

export default async function AdminDomainsPage() {
  const container = getContainer();

  let initialDomains: SerializedDomain[] = [];
  let clientOptions: ClientOption[] = [];

  try {
    const [domainsList, clientsRes] = await Promise.all([
      container.monitoredDomainRepo.listAll?.() ?? [],
      container.clientDirectoryRepo.list({ limit: 100 }),
    ]);

    clientOptions = clientsRes.items.map((c) => ({
      id: c.id,
      name: c.name,
    }));

    initialDomains = domainsList.map((d) => {
      const state = d.toState();
      return {
        id: state.id,
        clientId: state.clientId,
        name: state.name,
        hostname: state.hostname,
        targetUrl: state.targetUrl,
        port: state.port,
        status: state.status as any,
        consecutiveFailures: state.consecutiveFailures,
        lastHttpCheckAt: state.lastHttpCheckAt,
        lastHttpStatus: state.lastHttpStatus,
        lastLatencyMs: state.lastLatencyMs,
        lastHttpError: state.lastHttpError,
        lastSslCheckAt: state.lastSslCheckAt,
        sslStatus: state.sslStatus as any,
        sslExpiresAt: state.sslExpiresAt,
        sslDaysRemaining: state.sslDaysRemaining,
        sslIssuer: state.sslIssuer,
        lastDnsCheckAt: state.lastDnsCheckAt,
        dnsStatus: state.dnsStatus as any,
        dnsDriftDetails: state.dnsDriftDetails,
        resolvedIp: state.resolvedIp,
        lastRdapCheckAt: state.lastRdapCheckAt,
        domainExpiresAt: state.domainExpiresAt,
        domainRegistrar: state.domainRegistrar,
        createdAt: state.createdAt,
      };
    });
  } catch (err) {
    console.error("[AdminDomainsPage] Server fetch error:", err);
  }

  return <DomainManager initialDomains={initialDomains} clients={clientOptions} />;
}

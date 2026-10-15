export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { getContainer } from "@rsl/core/container";
import {
  PortalDomainsView,
  type PortalDomain,
  type PortalIncident,
} from "@/features/monitoring/portal-domains-view";

export default async function PortalDomainsPage() {
  const session = await auth();
  const clientId = session?.user?.clientId;
  if (!clientId) {
    redirect("/portal/login");
  }

  const container = getContainer();

  let clientSlug = "demo";
  let clientName = "Client Organization";
  let domains: PortalDomain[] = [];
  let incidents: PortalIncident[] = [];

  try {
    const [client, rawDomains, rawIncidents] = await Promise.all([
      container.clientDirectoryRepo.findById(clientId),
      container.monitoringModule.listDomainsByClient(clientId),
      container.monitoringModule.listActiveIncidents(clientId),
    ]);

    if (client) {
      clientSlug = client.slug;
      clientName = client.name;
    }

    domains = rawDomains.map((d) => {
      const state = d.toState();
      return {
        id: state.id,
        name: state.name,
        hostname: state.hostname,
        targetUrl: state.targetUrl,
        port: state.port,
        status: state.status as any,
        lastHttpCheckAt: state.lastHttpCheckAt,
        lastLatencyMs: state.lastLatencyMs,
        lastHttpError: state.lastHttpError,
        sslStatus: state.sslStatus as any,
        sslDaysRemaining: state.sslDaysRemaining,
        sslIssuer: state.sslIssuer,
        dnsStatus: state.dnsStatus as any,
        domainExpiresAt: state.domainExpiresAt,
        domainRegistrar: state.domainRegistrar,
      };
    });

    incidents = rawIncidents.map((i) => {
      const state = i.toState();
      return {
        id: state.id,
        domainId: state.domainId,
        type: state.type,
        status: state.status,
        severity: state.severity,
        title: state.title,
        reason: state.reason,
        startedAt: state.startedAt,
      };
    });
  } catch (err) {
    console.error("[PortalDomainsPage] Server fetch error:", err);
  }

  return (
    <PortalDomainsView
      clientId={clientId}
      clientSlug={clientSlug}
      clientName={clientName}
      domains={domains}
      incidents={incidents}
    />
  );
}

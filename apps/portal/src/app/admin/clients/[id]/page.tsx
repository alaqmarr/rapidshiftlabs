import { notFound } from "next/navigation";
import { getContainer } from "@rsl/core/container";
import { ClientDetailView } from "@/features/clients/client-detail-view";

export const dynamic = "force-dynamic";

export default async function AdminClientDetailPage(props: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await props.params;
  const container = getContainer();

  const client = await container.clientDirectoryRepo.findById(id);
  if (!client) {
    notFound();
  }

  // Fetch all tenant data concurrently on the server
  const [
    contacts,
    projects,
    users,
    contractsRes,
    invoicesRes,
    paymentsRes,
    apiKeys,
    billingSummary,
    entitlementRes,
    domains,
    processes,
    tickets,
  ] = await Promise.all([
    container.clientDirectoryRepo.findContactsByClient(id),
    container.clientDirectoryRepo.findProjectsByClient(id),
    container.clientRepo.findByClientId(id),
    container.contractRepo.list({ clientId: id, limit: 100 }).catch(() => ({ items: [], total: 0 })),
    container.billingRepo.listInvoices({ clientId: id, limit: 100 }).catch(() => ({ items: [], total: 0 })),
    container.billingRepo.listPayments({ clientId: id, limit: 100 }).catch(() => ({ items: [], total: 0 })),
    container.apiKeyRepo.findByClientId(id).catch(() => []),
    container.billingRepo.getBillingSummary(id).catch(() => ({
      totalBilledMinor: 0,
      totalPaidMinor: 0,
      outstandingMinor: 0,
      overdueCount: 0,
      activeInvoicesCount: 0,
    })),
    container.entitlementModule.evaluate(id).catch(() => ({
      status: "active",
      allowed: true,
      reason: undefined,
      manualOverrideMode: undefined,
    })),
    container.monitoredDomainRepo.findByClientId(id).catch(() => []),
    container.pm2ProcessRepo.listByClientId(id).catch(() => []),
    container.ticketRepo.list({ clientId: id }).catch(() => []),
  ]);

  const { ClientHealthService } = await import("@rsl/core/clients");
  const healthReport = ClientHealthService.calculate({
    clientId: id,
    clientStatus: client.status,
    billing: {
      outstandingMinor: billingSummary.outstandingMinor,
      totalBilledMinor: billingSummary.totalBilledMinor,
      overdueInvoicesCount: billingSummary.overdueCount,
      entitlementAllowed: (entitlementRes as any).allowed,
      entitlementStatus: (entitlementRes as any).status,
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

  const clientData = {
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
    addressLine2: client.addressLine2 || undefined,
    postalCode: client.postalCode || undefined,
    country: client.country || undefined,
    notes: client.notes || undefined,
    githubRepo: (client as any).githubRepo || undefined,
    githubBranch: (client as any).githubBranch || "main",
    createdAt: client.createdAt,
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
  };

function toTimestamp(val: unknown, fallback = 0): number {
  if (typeof val === "number") return val;
  if (val instanceof Date) return val.getTime();
  if (typeof val === "string") {
    const parsed = new Date(val).getTime();
    return Number.isNaN(parsed) ? fallback : parsed;
  }
  return fallback;
}

  const contractsData = contractsRes.items.map((c: any) => ({
    id: c.id,
    code: c.code,
    title: c.title,
    amountMinor: c.amountMinor,
    currency: c.currency,
    billingCycle: c.billingCycle,
    intervalCount: c.intervalCount || 1,
    anchorDay: c.anchorDay || 1,
    autoRenew: Boolean(c.autoRenew),
    taxProfile: c.taxProfile || "non_gst",
    notes: c.notes || undefined,
    status: c.status,
    validFrom: toTimestamp(c.validFrom),
    validTo: toTimestamp(c.validTo),
    createdAt: toTimestamp(c.createdAt),
  }));

  const invoicesData = invoicesRes.items.map((inv: any) => ({
    id: inv.id,
    invoiceNumber: inv.invoiceNumber,
    status: inv.status,
    totalMinor: inv.totalMinor,
    balanceDueMinor: inv.balanceMinor,
    dueDate: toTimestamp(inv.dueDate),
    issuedAt: inv.issuedAt ? toTimestamp(inv.issuedAt) : undefined,
    createdAt: toTimestamp(inv.createdAt),
  }));

  const paymentsData = paymentsRes.items.map((p: any) => ({
    id: p.id,
    amountMinor: p.amountMinor,
    currency: p.currency,
    method: p.method,
    reference: p.reference || undefined,
    paymentDate: toTimestamp(p.paymentDate),
    notes: p.notes || undefined,
  }));

  const apiKeysData = apiKeys.map((k: any) => ({
    id: k.id,
    keyPrefix: k.keyPrefix,
    name: k.name,
    scopes: Array.from(k.scopes || []).map(String),
    status: (k as { revokedAt?: unknown }).revokedAt ? "revoked" : "active",
    createdAt: toTimestamp(k.createdAt),
    lastUsedAt: k.lastUsedAt ? toTimestamp(k.lastUsedAt) : undefined,
  }));

  const monitoredDomainsData = domains.map((d: any) => ({
    id: d.id,
    hostname: d.hostname,
    status: d.status,
    sslStatus: d.sslStatus || "pending",
    dnsStatus: d.dnsStatus || "pending",
    lastCheckedAt: d.lastHttpCheckAt || undefined,
  }));

  const ent = entitlementRes as {
    status?: string;
    allowed?: boolean;
    reason?: string;
    manualOverrideMode?: string;
  };

  return (
    <ClientDetailView
      client={clientData}
      contracts={contractsData}
      invoices={invoicesData}
      payments={paymentsData}
      apiKeys={apiKeysData}
      billingSummary={billingSummary}
      entitlement={{
        status: ent.status || "active",
        allowed: ent.allowed ?? true,
        reason: ent.reason,
        manualOverride: ent.manualOverrideMode ? { mode: ent.manualOverrideMode } : undefined,
      }}
      monitoredDomains={monitoredDomainsData}
      healthReport={healthReport}
    />
  );
}

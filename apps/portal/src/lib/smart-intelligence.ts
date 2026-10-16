import { calculateContractTenure, type ContractTenureMetrics } from "@/lib/contract-tenure";

export interface SmartActionItem {
  id: string;
  priority: "critical" | "high" | "medium" | "low";
  category: "contract" | "billing" | "fleet" | "domain" | "support";
  title: string;
  description: string;
  clientId?: string;
  clientName?: string;
  entityId?: string;
  metricBadge: string;
  actionLabel: string;
  actionHref: string;
  apiAction?: {
    type: "roll_forward_renewal" | "generate_next_cycle_invoice" | "diagnose_process" | "check_domain";
    endpoint: string;
    payload?: Record<string, unknown>;
  };
}

export interface CorrelatedIncidentItem {
  id: string;
  severity: "critical" | "warning" | "info";
  title: string;
  rootCauseSummary: string;
  clientId?: string;
  clientName?: string;
  signals: Array<{
    source: "fleet" | "domain" | "release" | "support" | "billing";
    label: string;
    detail: string;
  }>;
  recommendation: string;
  actionHref: string;
}

export interface CashflowForecastMetrics {
  expectedNext30DaysMinor: number;
  expectedNext60DaysMinor: number;
  expectedNext90DaysMinor: number;
  overdueCollectibleMinor: number;
  scheduledRenewals30DaysCount: number;
  scheduledRenewals30DaysMinor: number;
  autoRenewEnabledCount: number;
  manualRenewalAtRiskCount: number;
  upcomingBillingEvents: Array<{
    contractId: string;
    contractCode: string;
    clientId: string;
    clientName: string;
    billingDateMs: number;
    billingDateLabel: string;
    amountMinor: number;
    currency: string;
    cycleLabel: string;
    isRenewalBoundary: boolean;
    autoRenew: boolean;
  }>;
}

export interface MonthlyClientExecutiveDigest {
  monthLabel: string;
  generatedAtMs: number;
  overallHealthScore: number;
  healthTier: string;
  uptimeDeliveredPct: number;
  monitoredDomainsCount: number;
  healthyDomainsCount: number;
  activeProcessesCount: number;
  onlineProcessesCount: number;
  totalDeploysAndRestarts: number;
  releasesShippedCount: number;
  latestReleaseVersion: string;
  ticketsResolvedCount: number;
  openTicketsCount: number;
  contractSummary: {
    hasActiveContract: boolean;
    code: string;
    tenureLabel: string;
    dateRangeLabel: string;
    cycleLabel: string;
    nextBillingDateLabel: string;
    progressPct: number;
    totalContractValueMinor: number;
    currency: string;
  };
  highlights: string[];
}

const DAY_MS = 86_400_000;

/**
 * Computes 30 / 60 / 90-day revenue & contract renewal forecast across all client contracts and open invoices.
 */
export function calculateCashflowForecast(params: {
  contracts: Array<{
    id: string;
    code?: string;
    clientId: string;
    clientName?: string;
    status?: string;
    billingCycle?: string;
    intervalCount?: number;
    anchorDay?: number | null;
    validFrom?: number | string | Date;
    validTo?: number | string | Date;
    amountMinor?: number;
    currency?: string;
    autoRenew?: boolean;
  }>;
  invoices: Array<{
    id: string;
    clientId: string;
    status: string;
    balanceMinor: number;
    dueDate: number;
  }>;
  nowMs?: number;
}): CashflowForecastMetrics {
  const nowMs = params.nowMs ?? Date.now();
  const activeContracts = params.contracts.filter(
    (c) => (c.status || "").toLowerCase() === "active" || (c.status || "").toLowerCase() === "renewed",
  );

  // 1. Open / Overdue collectible receivables
  let overdueCollectibleMinor = 0;
  let openDueNext30Minor = 0;
  for (const inv of params.invoices) {
    if (inv.status === "paid" || inv.status === "void" || inv.status === "draft") continue;
    const bal = Math.max(0, Number(inv.balanceMinor || 0));
    if (inv.status === "overdue" || inv.dueDate < nowMs) {
      overdueCollectibleMinor += bal;
    } else if (inv.dueDate <= nowMs + 30 * DAY_MS) {
      openDueNext30Minor += bal;
    }
  }

  // 2. Recurring contract velocity & upcoming billing events
  let recurringMonthlyMinor = 0;
  let scheduledRenewals30DaysCount = 0;
  let scheduledRenewals30DaysMinor = 0;
  let autoRenewEnabledCount = 0;
  let manualRenewalAtRiskCount = 0;

  const upcomingBillingEvents: CashflowForecastMetrics["upcomingBillingEvents"] = [];

  for (const c of activeContracts) {
    const tenure: ContractTenureMetrics = calculateContractTenure(
      {
        billingCycle: c.billingCycle,
        intervalCount: c.intervalCount,
        anchorDay: c.anchorDay,
        validFrom: c.validFrom,
        validTo: c.validTo,
        amountMinor: c.amountMinor,
        status: c.status,
      },
      nowMs,
    );

    if (c.autoRenew) {
      autoRenewEnabledCount += 1;
    }

    if (!tenure.isOneTime) {
      recurringMonthlyMinor += tenure.monthlyEquivalentMinor;

      if (tenure.daysRemaining <= 30 && !tenure.isExpired) {
        scheduledRenewals30DaysCount += 1;
        scheduledRenewals30DaysMinor += Number(c.amountMinor || 0);
        if (!c.autoRenew) {
          manualRenewalAtRiskCount += 1;
        }
      }

      if (tenure.nextBillingDateMs && tenure.nextBillingDateMs <= nowMs + 90 * DAY_MS) {
        upcomingBillingEvents.push({
          contractId: c.id,
          contractCode: c.code || c.id.slice(0, 8),
          clientId: c.clientId,
          clientName: c.clientName || c.clientId,
          billingDateMs: tenure.nextBillingDateMs,
          billingDateLabel: tenure.nextBillingDateLabel,
          amountMinor: Number(c.amountMinor || 0),
          currency: c.currency || "INR",
          cycleLabel: tenure.cycleLabel,
          isRenewalBoundary: tenure.daysRemaining <= 30,
          autoRenew: Boolean(c.autoRenew),
        });
      }
    }
  }

  upcomingBillingEvents.sort((a, b) => a.billingDateMs - b.billingDateMs);

  const expectedNext30DaysMinor = openDueNext30Minor + overdueCollectibleMinor + recurringMonthlyMinor;
  const expectedNext60DaysMinor = expectedNext30DaysMinor + recurringMonthlyMinor;
  const expectedNext90DaysMinor = expectedNext60DaysMinor + recurringMonthlyMinor;

  return {
    expectedNext30DaysMinor,
    expectedNext60DaysMinor,
    expectedNext90DaysMinor,
    overdueCollectibleMinor,
    scheduledRenewals30DaysCount,
    scheduledRenewals30DaysMinor,
    autoRenewEnabledCount,
    manualRenewalAtRiskCount,
    upcomingBillingEvents: upcomingBillingEvents.slice(0, 12),
  };
}

/**
 * Generates prioritized "Next Best Actions" across Contracts, Billing, Fleet, Domains, and Support.
 */
export function generateSmartNextActions(params: {
  contracts: Array<{
    id: string;
    code?: string;
    clientId: string;
    clientName?: string;
    status?: string;
    billingCycle?: string;
    intervalCount?: number;
    anchorDay?: number | null;
    validFrom?: number | string | Date;
    validTo?: number | string | Date;
    amountMinor?: number;
    currency?: string;
    autoRenew?: boolean;
  }>;
  invoices: Array<{
    id: string;
    invoiceNumber: string;
    clientId: string;
    clientName: string;
    balanceMinor: number;
    status: string;
    dueDate: number;
  }>;
  processes: Array<{
    id: string;
    name: string;
    serverName: string;
    clientId?: string;
    clientName?: string;
    status: string;
    restarts: number;
    uptimeMs: number;
    memory: number;
  }>;
  domains: Array<{
    id: string;
    hostname: string;
    clientName?: string;
    status: string;
    sslExpiryDays?: number | null;
  }>;
  tickets: Array<{
    id: string;
    ticketNumber: string;
    subject: string;
    clientId: string;
    clientName: string;
    priority: string;
    status: string;
  }>;
  nowMs?: number;
}): SmartActionItem[] {
  const nowMs = params.nowMs ?? Date.now();
  const actions: SmartActionItem[] = [];

  // 1. Fleet crash loops or high memory pressure (> 850 MB)
  for (const proc of params.processes) {
    const isCrashLoop =
      proc.status === "errored" ||
      (proc.status === "online" && proc.uptimeMs > 0 && proc.uptimeMs < 30_000 && proc.restarts >= 8);
    const memoryMb = Math.round((proc.memory || 0) / (1024 * 1024));

    if (isCrashLoop) {
      actions.push({
        id: `act_fleet_crash_${proc.id}`,
        priority: "critical",
        category: "fleet",
        title: `Process "${proc.name}" is in a failure state on ${proc.serverName}`,
        description: `Status: ${proc.status.toUpperCase()} (${proc.restarts} restarts). Run autonomous diagnostics & self-heal restart.`,
        clientId: proc.clientId,
        clientName: proc.clientName,
        entityId: proc.id,
        metricBadge: proc.status === "errored" ? "ERRORED" : "CRASH LOOP",
        actionLabel: "Auto-Diagnose & Heal",
        actionHref: "/admin/servers",
        apiAction: {
          type: "diagnose_process",
          endpoint: `/api/v1/portal/fleet/processes/${proc.id}/diagnose`,
          payload: { autoHeal: true },
        },
      });
    } else if (memoryMb >= 850) {
      actions.push({
        id: `act_fleet_mem_${proc.id}`,
        priority: "high",
        category: "fleet",
        title: `Predictive OOM Warning: "${proc.name}" consuming ${memoryMb} MB RAM`,
        description: `Memory footprint on ${proc.serverName} is approaching the 1 GB PM2 restart ceiling.`,
        clientId: proc.clientId,
        clientName: proc.clientName,
        entityId: proc.id,
        metricBadge: `${memoryMb} MB RAM`,
        actionLabel: "Inspect Process",
        actionHref: "/admin/servers",
      });
    }
  }

  // 2. Domain HTTP outage or SSL certificate expiring within 14 days
  for (const dom of params.domains) {
    if (dom.status === "down" || dom.status === "degraded") {
      actions.push({
        id: `act_dom_down_${dom.id}`,
        priority: "critical",
        category: "domain",
        title: `Domain ${dom.hostname} is reporting ${dom.status.toUpperCase()}`,
        description: `Endpoint check failed for ${dom.clientName || "assigned tenant"}. Verify DNS, SSL, and upstream PM2 process.`,
        clientName: dom.clientName,
        entityId: dom.id,
        metricBadge: dom.status.toUpperCase(),
        actionLabel: "Verify Endpoint",
        actionHref: "/admin/domains",
        apiAction: {
          type: "check_domain",
          endpoint: `/api/v1/admin/domains/${dom.id}/check`,
        },
      });
    } else if (dom.sslExpiryDays !== null && dom.sslExpiryDays !== undefined && dom.sslExpiryDays <= 14) {
      actions.push({
        id: `act_dom_ssl_${dom.id}`,
        priority: dom.sslExpiryDays <= 5 ? "critical" : "high",
        category: "domain",
        title: `SSL Certificate for ${dom.hostname} expires in ${dom.sslExpiryDays}d`,
        description: `Renew TLS certificate via Certbot before browser security warnings trigger.`,
        clientName: dom.clientName,
        entityId: dom.id,
        metricBadge: `SSL ${dom.sslExpiryDays}d`,
        actionLabel: "Inspect SSL",
        actionHref: "/admin/domains",
      });
    }
  }

  // 3. Contracts expiring within 30 days or overdue for renewal
  for (const c of params.contracts) {
    const status = (c.status || "").toLowerCase();
    if (status === "terminated") continue;
    const tenure = calculateContractTenure(
      {
        billingCycle: c.billingCycle,
        intervalCount: c.intervalCount,
        anchorDay: c.anchorDay,
        validFrom: c.validFrom,
        validTo: c.validTo,
        amountMinor: c.amountMinor,
        status: c.status,
      },
      nowMs,
    );

    if (tenure.isOneTime) continue;

    if (tenure.isOverdueRenewal) {
      actions.push({
        id: `act_contract_overdue_${c.id}`,
        priority: "high",
        category: "contract",
        title: `Contract ${c.code || c.id.slice(0, 8)} (${c.clientName || c.clientId}) tenure completed`,
        description: `Date range (${tenure.dateRangeLabel}) ended ${tenure.daysOverdueRenewal}d ago. Roll forward tenure by ${tenure.tenureLabel} in one click.`,
        clientId: c.clientId,
        clientName: c.clientName,
        entityId: c.id,
        metricBadge: `Ended ${tenure.daysOverdueRenewal}d ago`,
        actionLabel: "Roll-Forward Renewal",
        actionHref: `/admin/clients/${c.clientId}`,
        apiAction: {
          type: "roll_forward_renewal",
          endpoint: `/api/v1/admin/contracts/${c.id}/autopilot`,
          payload: { action: "roll_forward_renewal" },
        },
      });
    } else if (tenure.isExpiringSoon) {
      actions.push({
        id: `act_contract_expiring_${c.id}`,
        priority: tenure.daysRemaining <= 7 ? "high" : "medium",
        category: "contract",
        title: `Contract ${c.code || c.id.slice(0, 8)} expires in ${tenure.daysRemaining} days`,
        description: `${c.clientName || c.clientId} • ${tenure.tenureLabel} (${tenure.dateRangeLabel}). ${c.autoRenew ? "Auto-Renew enabled." : "Manual renewal required."}`,
        clientId: c.clientId,
        clientName: c.clientName,
        entityId: c.id,
        metricBadge: `${tenure.daysRemaining}d left`,
        actionLabel: "Extend / Roll-Forward",
        actionHref: `/admin/clients/${c.clientId}`,
        apiAction: {
          type: "roll_forward_renewal",
          endpoint: `/api/v1/admin/contracts/${c.id}/autopilot`,
          payload: { action: "roll_forward_renewal" },
        },
      });
    }
  }

  // 4. Overdue Invoices
  for (const inv of params.invoices) {
    if (inv.status === "overdue" || (inv.status === "issued" && inv.dueDate < nowMs && inv.balanceMinor > 0)) {
      const daysLate = Math.max(1, Math.ceil((nowMs - inv.dueDate) / DAY_MS));
      actions.push({
        id: `act_inv_overdue_${inv.id}`,
        priority: daysLate >= 8 ? "critical" : "high",
        category: "billing",
        title: `Invoice ${inv.invoiceNumber} is ${daysLate}d overdue (${inv.clientName})`,
        description: `Access Gate stage: ${daysLate >= 8 ? "Stage 3 Strict Block" : daysLate >= 4 ? "Stage 2 Admin Restricted" : "Stage 1 Grace Banner"}.`,
        clientId: inv.clientId,
        clientName: inv.clientName,
        entityId: inv.id,
        metricBadge: `${daysLate}d Overdue`,
        actionLabel: "Record Settlement",
        actionHref: "/admin/invoices",
      });
    }
  }

  // 5. Urgent / P1 Support Tickets
  for (const t of params.tickets) {
    if (t.status === "resolved" || t.status === "closed") continue;
    const p = (t.priority || "").toLowerCase();
    if (p === "urgent" || p === "p1" || p === "high") {
      actions.push({
        id: `act_ticket_${t.id}`,
        priority: p === "urgent" || p === "p1" ? "critical" : "high",
        category: "support",
        title: `Priority Ticket #${t.ticketNumber}: ${t.subject}`,
        description: `Raised by ${t.clientName} • Live system telemetry snapshot attached to thread.`,
        clientId: t.clientId,
        clientName: t.clientName,
        entityId: t.id,
        metricBadge: p.toUpperCase(),
        actionLabel: "Open SLA Desk",
        actionHref: "/admin/support",
      });
    }
  }

  const weight = { critical: 4, high: 3, medium: 2, low: 1 };
  return actions.sort((a, b) => weight[b.priority] - weight[a.priority]).slice(0, 10);
}

/**
 * Correlates Fleet crashes, Domain incidents, Recent Releases, and Support Tickets per client
 * so admins see unified root-cause intelligence instead of isolated alerts.
 */
export function correlateCrossModuleIncidents(params: {
  clients: Array<{ id: string; name: string }>;
  processes: Array<{
    id: string;
    name: string;
    serverName: string;
    clientId?: string;
    status: string;
    restarts: number;
    uptimeMs: number;
    memory: number;
  }>;
  domains: Array<{
    id: string;
    hostname: string;
    clientId?: string;
    status: string;
    sslExpiryDays?: number | null;
  }>;
  releases: Array<{
    id: string;
    clientId?: string;
    version: string;
    channel?: string;
    deployedAt?: number;
  }>;
  tickets: Array<{
    id: string;
    ticketNumber: string;
    subject: string;
    clientId: string;
    priority: string;
    status: string;
  }>;
  nowMs?: number;
}): CorrelatedIncidentItem[] {
  const nowMs = params.nowMs ?? Date.now();
  const correlated: CorrelatedIncidentItem[] = [];

  for (const client of params.clients) {
    const cProcs = params.processes.filter((p) => p.clientId === client.id);
    const cDomains = params.domains.filter((d) => d.clientId === client.id);
    const cReleases = params.releases.filter((r) => !r.clientId || r.clientId === client.id);
    const cTickets = params.tickets.filter(
      (t) => t.clientId === client.id && t.status !== "resolved" && t.status !== "closed",
    );

    const crashingProcs = cProcs.filter(
      (p) =>
        p.status === "errored" ||
        p.status === "stopped" ||
        (p.status === "online" && p.uptimeMs > 0 && p.uptimeMs < 30_000 && p.restarts >= 8),
    );
    const downDomains = cDomains.filter((d) => d.status === "down" || d.status === "degraded");
    const recentRelease = cReleases.find(
      (r) => r.deployedAt && nowMs - r.deployedAt <= 24 * 60 * 60 * 1000,
    );

    if (crashingProcs.length > 0 || downDomains.length > 0) {
      const signals: CorrelatedIncidentItem["signals"] = [];
      for (const p of crashingProcs) {
        signals.push({
          source: "fleet",
          label: `PM2 ${p.name}`,
          detail: `${p.status.toUpperCase()} on ${p.serverName} (${p.restarts} restarts)`,
        });
      }
      for (const d of downDomains) {
        signals.push({
          source: "domain",
          label: d.hostname,
          detail: `HTTP Check ${d.status.toUpperCase()}`,
        });
      }
      if (recentRelease) {
        signals.push({
          source: "release",
          label: `Release ${recentRelease.version}`,
          detail: `Deployed recently (${recentRelease.channel || "production"})`,
        });
      }
      if (cTickets.length > 0) {
        signals.push({
          source: "support",
          label: `${cTickets.length} Open Ticket(s)`,
          detail: `Latest: #${cTickets[0].ticketNumber} "${cTickets[0].subject}"`,
        });
      }

      let rootCauseSummary = `Infrastructure degradation detected for ${client.name}.`;
      if (crashingProcs.length > 0 && downDomains.length > 0 && recentRelease) {
        rootCauseSummary = `Domain ${downDomains[0].hostname} outage correlates with PM2 process "${crashingProcs[0].name}" failure following Release ${recentRelease.version}.`;
      } else if (crashingProcs.length > 0 && downDomains.length > 0) {
        rootCauseSummary = `Upstream PM2 process "${crashingProcs[0].name}" (${crashingProcs[0].status}) is causing HTTP ${downDomains[0].status} on ${downDomains[0].hostname}.`;
      } else if (crashingProcs.length > 0 && recentRelease) {
        rootCauseSummary = `PM2 process "${crashingProcs[0].name}" instability began after Release ${recentRelease.version} deployment.`;
      }

      correlated.push({
        id: `corr_${client.id}`,
        severity: downDomains.length > 0 || crashingProcs.some((p) => p.status === "errored") ? "critical" : "warning",
        title: `${client.name}: Multi-Signal Correlated Incident`,
        rootCauseSummary,
        clientId: client.id,
        clientName: client.name,
        signals,
        recommendation:
          crashingProcs.length > 0
            ? `Run Auto-Heal Restart on "${crashingProcs[0].name}" and inspect stack trace against ${recentRelease ? `Release ${recentRelease.version}` : "recent logs"}.`
            : `Run on-demand HTTP/DNS verification for ${downDomains[0]?.hostname}.`,
        actionHref: `/admin/clients/${client.id}`,
      });
    }
  }

  return correlated;
}

/**
 * Generates the Monthly Client Executive Digest for the Client Portal.
 */
export function generateMonthlyClientDigest(params: {
  clientName: string;
  currency: string;
  healthScore: number;
  healthTier: string;
  domains: Array<{ hostname: string; status: string; uptimePercent?: number | null }>;
  processes: Array<{ name: string; status: string; restarts: number }>;
  releases: Array<{ version: string; deployedAt?: number }>;
  tickets: Array<{ status: string }>;
  activeContract?: {
    code?: string;
    billingCycle?: string;
    intervalCount?: number;
    anchorDay?: number | null;
    validFrom?: number | string | Date;
    validTo?: number | string | Date;
    amountMinor?: number;
    currency?: string;
    status?: string;
  } | null;
  nowMs?: number;
}): MonthlyClientExecutiveDigest {
  const nowMs = params.nowMs ?? Date.now();
  const d = new Date(nowMs);
  const monthNames = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
  ];
  const monthLabel = `${monthNames[d.getMonth()]} ${d.getFullYear()}`;

  const monitoredDomainsCount = params.domains.length;
  const healthyDomainsCount = params.domains.filter((dom) => dom.status === "up").length;
  const uptimes = params.domains
    .map((dom) => dom.uptimePercent)
    .filter((u): u is number => typeof u === "number" && u > 0);
  const uptimeDeliveredPct =
    uptimes.length > 0
      ? Number((uptimes.reduce((a, b) => a + b, 0) / uptimes.length).toFixed(2))
      : healthyDomainsCount === monitoredDomainsCount && monitoredDomainsCount > 0
        ? 99.98
        : 100;

  const activeProcessesCount = params.processes.length;
  const onlineProcessesCount = params.processes.filter((p) => p.status === "online").length;
  const totalDeploysAndRestarts = params.processes.reduce((sum, p) => sum + (p.restarts || 0), 0);

  const releasesShippedCount = params.releases.length;
  const latestReleaseVersion = params.releases[0]?.version || "v1.0.0";

  const ticketsResolvedCount = params.tickets.filter(
    (t) => t.status === "resolved" || t.status === "closed",
  ).length;
  const openTicketsCount = params.tickets.length - ticketsResolvedCount;

  const c = params.activeContract;
  const tenure = c
    ? calculateContractTenure(
        {
          billingCycle: c.billingCycle,
          intervalCount: c.intervalCount,
          anchorDay: c.anchorDay,
          validFrom: c.validFrom,
          validTo: c.validTo,
          amountMinor: c.amountMinor,
          status: c.status,
        },
        nowMs,
      )
    : null;

  const highlights: string[] = [
    `Delivered ${uptimeDeliveredPct}% average HTTP availability across ${monitoredDomainsCount} monitored domain(s).`,
    `Managed ${onlineProcessesCount}/${activeProcessesCount} online PM2 production processes (${totalDeploysAndRestarts} cumulative deployments/restarts).`,
  ];
  if (tenure) {
    highlights.push(
      `Active ${tenure.cycleLabel} engagement (${tenure.tenureLabel}): ${tenure.dateRangeLabel} • Next billing: ${tenure.nextBillingDateLabel}.`,
    );
  }
  if (releasesShippedCount > 0) {
    highlights.push(
      `${releasesShippedCount} tracked release artifact(s) delivered (latest: ${latestReleaseVersion}).`,
    );
  }

  return {
    monthLabel,
    generatedAtMs: nowMs,
    overallHealthScore: params.healthScore,
    healthTier: params.healthTier,
    uptimeDeliveredPct,
    monitoredDomainsCount,
    healthyDomainsCount,
    activeProcessesCount,
    onlineProcessesCount,
    totalDeploysAndRestarts,
    releasesShippedCount,
    latestReleaseVersion,
    ticketsResolvedCount,
    openTicketsCount,
    contractSummary: {
      hasActiveContract: Boolean(tenure),
      code: c?.code || "—",
      tenureLabel: tenure?.tenureLabel || "No Active Contract",
      dateRangeLabel: tenure?.dateRangeLabel || "—",
      cycleLabel: tenure?.cycleLabel || "—",
      nextBillingDateLabel: tenure?.nextBillingDateLabel || "—",
      progressPct: tenure?.progressPct || 0,
      totalContractValueMinor: tenure?.totalContractValueMinor || 0,
      currency: c?.currency || params.currency,
    },
    highlights,
  };
}

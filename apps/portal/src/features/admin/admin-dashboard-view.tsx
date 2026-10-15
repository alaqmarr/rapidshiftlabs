"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Users,
  Receipt,
  Server,
  Globe,
  LifeBuoy,
  ArrowRight,
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  Clock,
  Activity,
  RefreshCw,
  ExternalLink,
  ShieldAlert,
  ShieldCheck,
  Stethoscope,
  Terminal,
  CreditCard,
  History,
  TrendingUp,
  Zap,
  ArrowUpRight,
  Eye,
} from "lucide-react";
import { formatCurrency, formatDate, formatDateTime } from "@/lib/format";
import { useAlert } from "@/components/ui/alert-popup";
import { IosSpinner } from "@/components/ui/ios-spinner";

export interface AtRiskClientItem {
  id: string;
  name: string;
  slug: string;
  tier: string;
  healthScore: number;
  healthCategory: "EXCELLENT" | "GOOD" | "AT_RISK" | "CRITICAL";
  primaryRisk: string;
  factors: {
    billing: number;
    fleet: number;
    domains: number;
    support: number;
  };
  outstandingPaise: number;
}

export interface AdminInvoiceItem {
  id: string;
  invoiceNumber: string;
  clientName: string;
  clientId: string;
  totalMinor: number;
  balanceMinor: number;
  status: string;
  dueDate: number;
  currency: string;
}

export interface AdminFleetProcessItem {
  id: string;
  serverId: string;
  serverName: string;
  pm2Id: number;
  name: string;
  clientId: string | null;
  clientName?: string;
  status: string;
  cpu: number;
  memory: number;
  restarts: number;
  uptimeMs: number;
}

export interface AdminMonitoredDomainItem {
  id: string;
  hostname: string;
  clientName?: string;
  status: string;
  sslStatus?: string;
  sslExpiryDays?: number;
  uptimePercent?: number;
  lastHttpCheckAt?: number;
}

export interface AdminUrgentTicketItem {
  id: string;
  ticketNumber?: string;
  subject: string;
  clientId: string;
  clientName?: string;
  priority: string;
  status: string;
  createdAt: number;
}

export interface AdminAuditRecordItem {
  id: string;
  action: string;
  actorEmail?: string | null;
  actorType: string;
  entityType: string;
  entityId: string;
  timestamp: number;
}

export interface AdminDashboardViewProps {
  user: { email: string; role: string };
  kpis: {
    clientCount: number;
    contractCount: number;
    outstandingPaise: number;
    totalBilledPaise: number;
    serverCount: number;
    domainCount: number;
    ticketCount: number;
    releaseCount: number;
    vaultCount: number;
    onlineProcesses: number;
    totalProcesses: number;
    erroredProcesses: number;
    atRiskClientsCount: number;
  };
  atRiskClients: AtRiskClientItem[];
  recentInvoices: AdminInvoiceItem[];
  fleetProcesses: AdminFleetProcessItem[];
  monitoredDomains: AdminMonitoredDomainItem[];
  urgentTickets: AdminUrgentTicketItem[];
  recentAuditLogs: AdminAuditRecordItem[];
}

export function AdminDashboardView({
  user,
  kpis,
  atRiskClients,
  recentInvoices,
  fleetProcesses,
  monitoredDomains,
  urgentTickets,
  recentAuditLogs,
}: AdminDashboardViewProps) {
  const { showSuccess, showError, showAlert } = useAlert();
  const [diagnosingProcessId, setDiagnosingProcessId] = useState<string | null>(null);
  const [processes, setProcesses] = useState<AdminFleetProcessItem[]>(fleetProcesses);
  const [activeTab, setActiveTab] = useState<"radar" | "fleet" | "billing" | "domains" | "support">("radar");

  const handleDiagnose = async (process: AdminFleetProcessItem, autoHeal: boolean) => {
    setDiagnosingProcessId(process.id);
    try {
      const res = await fetch(`/api/v1/admin/servers/processes/${process.id}/diagnose`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ autoHeal }),
      });
      const data = await res.json();

      if (!res.ok) {
        showError("Diagnostic Failed", data.error || "Unable to diagnose process failure.");
        return;
      }

      const diag = data.diagnosis;
      showAlert({
        type: diag.recoveryAction === "AUTO_RESTART_ELIGIBLE" ? "success" : "warning",
        title: `AI Diagnosis: ${process.name} (#${process.pm2Id})`,
        description: diag.summary,
        details: [
          { label: "Detected Failure Pattern", value: diag.failureType || "UNKNOWN_ERROR" },
          { label: "Root Cause Signature", value: diag.rootCause || "None detected", isMonospace: true },
          { label: "Suggested Remediation", value: diag.suggestedRemediation || "Review application stdout logs" },
          { label: "Recovery Decision", value: diag.recoveryAction },
          { label: "Heal Action Executed", value: data.healResult?.actionTaken || (autoHeal ? "Attempted" : "Diagnosis Only") },
        ],
      });

      if (data.healResult?.actionTaken === "RESTARTED_PROCESS") {
        setProcesses((prev) =>
          prev.map((p) => (p.id === process.id ? { ...p, status: "online", restarts: p.restarts + 1 } : p))
        );
      }
    } catch (err: any) {
      showError("Connection Error", err.message || "Failed to reach diagnostic agent.");
    } finally {
      setDiagnosingProcessId(null);
    }
  };

  const getHealthBadge = (category: string, score: number) => {
    switch (category) {
      case "EXCELLENT":
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
            <CheckCircle2 className="w-3.5 h-3.5" /> {score}/100 Excellent
          </span>
        );
      case "GOOD":
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20">
            <CheckCircle2 className="w-3.5 h-3.5" /> {score}/100 Good
          </span>
        );
      case "AT_RISK":
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 animate-pulse">
            <AlertTriangle className="w-3.5 h-3.5" /> {score}/100 At Risk
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20 animate-pulse">
            <AlertCircle className="w-3.5 h-3.5" /> {score}/100 Critical
          </span>
        );
    }
  };

  return (
    <div className="min-h-screen bg-slate-50/50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 flex flex-col">
      <main className="flex-1 w-full px-4 sm:px-6 lg:px-8 xl:px-10 py-8 space-y-8">
        
        {/* Executive Hero Command Center */}
        <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-zinc-900 via-slate-900 to-blue-950 text-white p-7 sm:p-9 shadow-lg border border-zinc-800/80">
          <div className="absolute -right-20 -top-20 w-80 h-80 bg-blue-600/15 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute right-1/3 -bottom-20 w-64 h-64 bg-indigo-600/10 rounded-full blur-3xl pointer-events-none" />

          <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
            <div className="space-y-3 max-w-2xl">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold bg-blue-500/15 text-blue-300 border border-blue-500/30 backdrop-blur-md">
                <Activity className="w-3.5 h-3.5 text-blue-400 animate-pulse" />
                <span className="font-tech text-[11px] tracking-wide">
                  Autonomous Fleet Control • Live Telemetry WAL
                </span>
              </div>
              <h1 className="text-fluid-title steel-heading text-white">
                Admin Mission Control
              </h1>
              <p className="text-sm sm:text-base text-zinc-300 leading-relaxed font-sans">
                Operating as <span className="font-tech font-semibold text-white">{user.email}</span> (role:{" "}
                <span className="capitalize font-tech font-bold text-blue-300">{user.role}</span>).
                Real-time operational command across client health, revenue collection, runtime healing, and domain security.
              </p>
            </div>

            {/* Quick Action Dock */}
            <div className="flex flex-wrap sm:flex-nowrap gap-2.5 items-center">
              <Link
                href="/admin/clients"
                className="px-3.5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-tech text-xs font-semibold shadow-sm transition flex items-center gap-1.5"
              >
                <Users className="w-3.5 h-3.5" />
                <span>+ Create Client</span>
              </Link>
              <Link
                href="/admin/invoices"
                className="px-3.5 py-2.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-white font-tech text-xs font-semibold border border-zinc-700/80 transition flex items-center gap-1.5"
              >
                <Receipt className="w-3.5 h-3.5" />
                <span>Issue Tax Invoice</span>
              </Link>
              <Link
                href="/admin/domains"
                className="px-3.5 py-2.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white font-tech text-xs font-semibold border border-zinc-700/80 transition flex items-center gap-1.5"
              >
                <Globe className="w-3.5 h-3.5 text-blue-400" />
                <span>Probes</span>
              </Link>
            </div>
          </div>
        </section>

        {/* Real-Time Operational Pulse Ribbon */}
        <section className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Revenue Velocity */}
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800 rounded-2xl p-5 shadow-xs relative overflow-hidden group hover:border-blue-500/40 transition">
            <div className="flex items-center justify-between">
              <span className="steel-metric-label text-zinc-500 dark:text-zinc-400">Ledger Outstanding</span>
              <div className="w-9 h-9 rounded-xl bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 border border-blue-200/60 dark:border-blue-800/60 flex items-center justify-center">
                <Receipt className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-3 flex items-baseline gap-2">
              <span className="text-fluid-kpi steel-kpi font-tech text-zinc-900 dark:text-white">
                {formatCurrency(kpis.outstandingPaise, "INR")}
              </span>
            </div>
            <div className="mt-2.5 flex items-center justify-between text-xs">
              <span className="text-zinc-400 font-sans">
                {recentInvoices.filter((i) => i.status === "overdue").length} overdue invoices
              </span>
              <Link href="/admin/invoices" className="font-semibold text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1">
                <span>Collect</span>
                <ArrowRight className="w-3 h-3" />
              </Link>
            </div>
          </div>

          {/* Client 360 Health */}
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800 rounded-2xl p-5 shadow-xs relative overflow-hidden group hover:border-blue-500/40 transition">
            <div className="flex items-center justify-between">
              <span className="steel-metric-label text-zinc-500 dark:text-zinc-400">Client Health Radar</span>
              <div className="w-9 h-9 rounded-xl bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 border border-blue-200/60 dark:border-blue-800/60 flex items-center justify-center">
                <Users className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-3 flex items-baseline gap-2">
              <span className="text-fluid-kpi steel-kpi font-tech text-zinc-900 dark:text-white">
                {kpis.clientCount}
              </span>
              <span className={`steel-pill ${kpis.atRiskClientsCount > 0 ? "text-amber-600 dark:text-amber-400 bg-amber-500/10 border-amber-500/20" : "text-emerald-600 dark:text-emerald-400"}`}>
                {kpis.atRiskClientsCount > 0 ? `${kpis.atRiskClientsCount} At Risk` : "All Healthy"}
              </span>
            </div>
            <div className="mt-2.5 flex items-center justify-between text-xs">
              <span className="text-zinc-400 font-sans">Weighted 360 score</span>
              <Link href="/admin/clients" className="font-semibold text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1">
                <span>Inspect</span>
                <ArrowRight className="w-3 h-3" />
              </Link>
            </div>
          </div>

          {/* Fleet Runtime Status */}
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800 rounded-2xl p-5 shadow-xs relative overflow-hidden group hover:border-blue-500/40 transition">
            <div className="flex items-center justify-between">
              <span className="steel-metric-label text-zinc-500 dark:text-zinc-400">Fleet Integrity</span>
              <div className="w-9 h-9 rounded-xl bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 border border-blue-200/60 dark:border-blue-800/60 flex items-center justify-center">
                <Server className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-3 flex items-baseline gap-2">
              <span className="text-fluid-kpi steel-kpi font-tech text-zinc-900 dark:text-white">
                {kpis.onlineProcesses} / {kpis.totalProcesses}
              </span>
              <span className={`steel-pill ${kpis.erroredProcesses > 0 ? "text-rose-600 dark:text-rose-400 bg-rose-500/10 border-rose-500/20" : "text-emerald-600 dark:text-emerald-400"}`}>
                {kpis.erroredProcesses > 0 ? `${kpis.erroredProcesses} Errored` : "100% Online"}
              </span>
            </div>
            <div className="mt-2.5 flex items-center justify-between text-xs">
              <span className="text-zinc-400 font-sans">{kpis.serverCount} Hosts Monitored</span>
              <Link href="/admin/servers" className="font-semibold text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1">
                <span>View Fleet</span>
                <ArrowRight className="w-3 h-3" />
              </Link>
            </div>
          </div>

          {/* Domain Probes & Watchdog */}
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800 rounded-2xl p-5 shadow-xs relative overflow-hidden group hover:border-blue-500/40 transition">
            <div className="flex items-center justify-between">
              <span className="steel-metric-label text-zinc-500 dark:text-zinc-400">Endpoints &amp; SSL</span>
              <div className="w-9 h-9 rounded-xl bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 border border-blue-200/60 dark:border-blue-800/60 flex items-center justify-center">
                <Globe className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-3 flex items-baseline gap-2">
              <span className="text-fluid-kpi steel-kpi font-tech text-zinc-900 dark:text-white">
                {kpis.domainCount}
              </span>
              <span className="steel-pill text-blue-600 dark:text-blue-400">
                {monitoredDomains.filter((d) => (d.sslExpiryDays ?? 99) < 30).length > 0
                  ? `${monitoredDomains.filter((d) => (d.sslExpiryDays ?? 99) < 30).length} SSL Expirations`
                  : "SSL Valid"}
              </span>
            </div>
            <div className="mt-2.5 flex items-center justify-between text-xs">
              <span className="text-zinc-400 font-sans">HTTP &bull; SSL &bull; DNS</span>
              <Link href="/admin/domains" className="font-semibold text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1">
                <span>Probes</span>
                <ArrowRight className="w-3 h-3" />
              </Link>
            </div>
          </div>
        </section>

        {/* Operational Filter Tabs */}
        <div className="flex items-center gap-2 border-b border-zinc-200/80 dark:border-zinc-800 pb-3 overflow-x-auto">
          {[
            { id: "radar", label: "Client Health Radar", count: atRiskClients.length, icon: Users },
            { id: "fleet", label: "Fleet Runtime & Healing", count: fleetProcesses.length, icon: Server },
            { id: "billing", label: "Overdue Dues & Invoices", count: recentInvoices.length, icon: Receipt },
            { id: "domains", label: "Endpoint Security & SSL", count: monitoredDomains.length, icon: Globe },
            { id: "support", label: "Urgent SLA Support", count: urgentTickets.length, icon: LifeBuoy },
          ].map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`px-4 py-2 rounded-xl text-xs font-semibold font-tech flex items-center gap-2 transition whitespace-nowrap ${
                  active
                    ? "bg-blue-600 text-white shadow-xs"
                    : "bg-white dark:bg-zinc-900 text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white border border-zinc-200/60 dark:border-zinc-800"
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{tab.label}</span>
                <span className={`px-1.5 py-0.2 rounded-full text-[10px] ${active ? "bg-blue-700 text-white" : "bg-zinc-100 dark:bg-zinc-800 text-zinc-500"}`}>
                  {tab.count}
                </span>
              </button>
            );
          })}
        </div>

        {/* Dynamic Operational Panel View */}
        <section className="space-y-6">
          {/* TAB 1: Client Health Radar */}
          {activeTab === "radar" && (
            <div className="bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800 rounded-2xl p-6 shadow-xs space-y-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h2 className="steel-heading text-lg text-zinc-900 dark:text-white flex items-center gap-2">
                    <Users className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                    Customer 360 &amp; Health Radar
                  </h2>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
                    Multi-factor algorithmic health tracking across Billing (35%), Fleet (25%), Domains (20%), and Support SLA (20%).
                  </p>
                </div>
                <Link
                  href="/admin/clients"
                  className="px-3.5 py-1.5 rounded-xl border border-zinc-200 dark:border-zinc-800 text-xs font-tech font-semibold text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800/60 transition flex items-center gap-1.5 w-fit"
                >
                  <span>Open Client Directory</span>
                  <ExternalLink className="w-3 h-3" />
                </Link>
              </div>

              {atRiskClients.length === 0 ? (
                <div className="text-center py-12 text-zinc-500 dark:text-zinc-400 text-xs">
                  <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto mb-2 opacity-80" />
                  No clients currently at risk. All organizations are operating in excellent standing.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-zinc-100 dark:border-zinc-800 text-zinc-400 font-tech uppercase tracking-wider">
                        <th className="pb-3 font-semibold">Client Organization</th>
                        <th className="pb-3 font-semibold">Health Score</th>
                        <th className="pb-3 font-semibold">Factor Breakdown</th>
                        <th className="pb-3 font-semibold">Primary Risk / Attention</th>
                        <th className="pb-3 font-semibold text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800/60">
                      {atRiskClients.map((client) => (
                        <tr key={client.id} className="hover:bg-zinc-50/50 dark:hover:bg-zinc-800/30 transition">
                          <td className="py-3.5 font-medium text-zinc-900 dark:text-white">
                            <Link href={`/admin/clients/${client.id}`} className="hover:text-blue-600 hover:underline flex items-center gap-1.5">
                              {client.name}
                              <ArrowUpRight className="w-3 h-3 text-zinc-400" />
                            </Link>
                            <span className="text-[10px] text-zinc-400 font-tech">{client.id}</span>
                          </td>
                          <td className="py-3.5">
                            {getHealthBadge(client.healthCategory, client.healthScore)}
                          </td>
                          <td className="py-3.5">
                            <div className="flex items-center gap-3 text-[10px] font-tech text-zinc-400 min-w-[220px]">
                              <span title={`Billing: ${client.factors.billing}/100`}>
                                Bill: <strong className="text-zinc-700 dark:text-zinc-200">{client.factors.billing}%</strong>
                              </span>
                              <span title={`Fleet: ${client.factors.fleet}/100`}>
                                Fleet: <strong className="text-zinc-700 dark:text-zinc-200">{client.factors.fleet}%</strong>
                              </span>
                              <span title={`Domains: ${client.factors.domains}/100`}>
                                Dom: <strong className="text-zinc-700 dark:text-zinc-200">{client.factors.domains}%</strong>
                              </span>
                              <span title={`Support: ${client.factors.support}/100`}>
                                SLA: <strong className="text-zinc-700 dark:text-zinc-200">{client.factors.support}%</strong>
                              </span>
                            </div>
                          </td>
                          <td className="py-3.5">
                            <span className="inline-flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400 font-medium">
                              <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                              {client.primaryRisk}
                            </span>
                          </td>
                          <td className="py-3.5 text-right">
                            <Link
                              href={`/admin/clients/${client.id}`}
                              className="px-3 py-1.5 rounded-lg bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 border border-blue-200/60 dark:border-blue-800/60 font-tech font-semibold hover:bg-blue-600 hover:text-white transition inline-flex items-center gap-1"
                            >
                              <span>360° Profile</span>
                              <ArrowRight className="w-3 h-3" />
                            </Link>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* TAB 2: Fleet Runtime & Healing */}
          {activeTab === "fleet" && (
            <div className="bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800 rounded-2xl p-6 shadow-xs space-y-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h2 className="steel-heading text-lg text-zinc-900 dark:text-white flex items-center gap-2">
                    <Server className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                    PM2 Fleet &amp; Smart Diagnostics
                  </h2>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
                    Live process telemetry, CPU/Memory resource metrics, crash loops, and autonomous diagnostic healing.
                  </p>
                </div>
                <Link
                  href="/admin/servers"
                  className="px-3.5 py-1.5 rounded-xl border border-zinc-200 dark:border-zinc-800 text-xs font-tech font-semibold text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800/60 transition flex items-center gap-1.5 w-fit"
                >
                  <span>Open Fleet Manager</span>
                  <ExternalLink className="w-3 h-3" />
                </Link>
              </div>

              {processes.length === 0 ? (
                <div className="text-center py-12 text-zinc-500 dark:text-zinc-400 text-xs">
                  <Server className="w-8 h-8 mx-auto mb-2 opacity-40" />
                  No PM2 processes discovered yet. Discover processes via Fleet Servers.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-zinc-100 dark:border-zinc-800 text-zinc-400 font-tech uppercase tracking-wider">
                        <th className="pb-3 font-semibold">Process / Host</th>
                        <th className="pb-3 font-semibold">Client Tenant</th>
                        <th className="pb-3 font-semibold">Status</th>
                        <th className="pb-3 font-semibold">CPU / Memory</th>
                        <th className="pb-3 font-semibold">Restarts</th>
                        <th className="pb-3 font-semibold text-right">Autonomous Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800/60">
                      {processes.map((proc) => {
                        const isErrored = proc.status === "errored" || proc.status === "stopped";
                        const isDiagnosing = diagnosingProcessId === proc.id;
                        return (
                          <tr key={proc.id} className="hover:bg-zinc-50/50 dark:hover:bg-zinc-800/30 transition">
                            <td className="py-3.5 font-medium text-zinc-900 dark:text-white">
                              <div className="flex items-center gap-2">
                                <span className="font-tech font-bold">{proc.name}</span>
                                <span className="text-[10px] text-zinc-400 font-tech">#{proc.pm2Id}</span>
                              </div>
                              <div className="text-[11px] text-zinc-400 font-sans">{proc.serverName}</div>
                            </td>
                            <td className="py-3.5">
                              {proc.clientName ? (
                                <span className="font-medium text-zinc-700 dark:text-zinc-300">{proc.clientName}</span>
                              ) : (
                                <span className="text-zinc-400 italic">Unmapped</span>
                              )}
                            </td>
                            <td className="py-3.5">
                              <span
                                className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                                  proc.status === "online"
                                    ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20"
                                    : "bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20 animate-pulse"
                                }`}
                              >
                                <span className={`w-1.5 h-1.5 rounded-full ${proc.status === "online" ? "bg-emerald-500" : "bg-rose-500"}`} />
                                {proc.status}
                              </span>
                            </td>
                            <td className="py-3.5 font-tech text-zinc-600 dark:text-zinc-300">
                              <div>{proc.cpu}% CPU</div>
                              <div className="text-[10px] text-zinc-400 font-sans">
                                {(proc.memory / 1024 / 1024).toFixed(1)} MB RAM
                              </div>
                            </td>
                            <td className="py-3.5 font-tech">
                              <span className={proc.restarts > 5 ? "text-amber-500 font-bold" : "text-zinc-500"}>
                                {proc.restarts}
                              </span>
                            </td>
                            <td className="py-3.5 text-right">
                              <div className="flex items-center justify-end gap-2">
                                <button
                                  onClick={() => handleDiagnose(proc, true)}
                                  disabled={isDiagnosing}
                                  className={`px-3 py-1.5 rounded-lg text-xs font-tech font-semibold transition inline-flex items-center gap-1.5 ${
                                    isErrored
                                      ? "bg-rose-600 hover:bg-rose-500 text-white shadow-xs animate-pulse"
                                      : "bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-200"
                                  }`}
                                  title="Run AI crash triage and auto-heal restart"
                                >
                                  {isDiagnosing ? (
                                    <IosSpinner size={12} />
                                  ) : (
                                    <Stethoscope className="w-3.5 h-3.5" />
                                  )}
                                  <span>{isErrored ? "Auto-Heal" : "Diagnose"}</span>
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* TAB 3: Overdue Dues & Invoices */}
          {activeTab === "billing" && (
            <div className="bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800 rounded-2xl p-6 shadow-xs space-y-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h2 className="steel-heading text-lg text-zinc-900 dark:text-white flex items-center gap-2">
                    <Receipt className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                    Overdue Invoices &amp; Revenue Collections
                  </h2>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
                    Tax invoices requiring payment reconciliation, dunning reminders, or manual settlement.
                  </p>
                </div>
                <Link
                  href="/admin/invoices"
                  className="px-3.5 py-1.5 rounded-xl border border-zinc-200 dark:border-zinc-800 text-xs font-tech font-semibold text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800/60 transition flex items-center gap-1.5 w-fit"
                >
                  <span>Open Billing Ledger</span>
                  <ExternalLink className="w-3 h-3" />
                </Link>
              </div>

              {recentInvoices.length === 0 ? (
                <div className="text-center py-12 text-zinc-500 dark:text-zinc-400 text-xs">
                  <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto mb-2 opacity-80" />
                  All accounts are settled. No outstanding invoices pending.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-zinc-100 dark:border-zinc-800 text-zinc-400 font-tech uppercase tracking-wider">
                        <th className="pb-3 font-semibold">Invoice Number</th>
                        <th className="pb-3 font-semibold">Client Name</th>
                        <th className="pb-3 font-semibold">Due Date</th>
                        <th className="pb-3 font-semibold">Total Amount</th>
                        <th className="pb-3 font-semibold">Balance Due</th>
                        <th className="pb-3 font-semibold">Status</th>
                        <th className="pb-3 font-semibold text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800/60">
                      {recentInvoices.map((inv) => (
                        <tr key={inv.id} className="hover:bg-zinc-50/50 dark:hover:bg-zinc-800/30 transition">
                          <td className="py-3.5 font-medium font-tech text-zinc-900 dark:text-white">
                            {inv.invoiceNumber}
                          </td>
                          <td className="py-3.5 text-zinc-700 dark:text-zinc-300 font-medium">
                            {inv.clientName}
                          </td>
                          <td className="py-3.5 text-zinc-500 font-tech">
                            {formatDate(inv.dueDate)}
                          </td>
                          <td className="py-3.5 font-tech text-zinc-900 dark:text-white">
                            {formatCurrency(inv.totalMinor, inv.currency)}
                          </td>
                          <td className="py-3.5 font-tech font-bold text-rose-600 dark:text-rose-400">
                            {formatCurrency(inv.balanceMinor, inv.currency)}
                          </td>
                          <td className="py-3.5">
                            <span
                              className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                                inv.status === "paid"
                                  ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20"
                                  : inv.status === "overdue"
                                  ? "bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20"
                                  : "bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20"
                              }`}
                            >
                              {inv.status}
                            </span>
                          </td>
                          <td className="py-3.5 text-right">
                            <Link
                              href={`/admin/payments?invoiceId=${inv.id}`}
                              className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-tech font-semibold transition inline-flex items-center gap-1"
                            >
                              <CreditCard className="w-3 h-3" />
                              <span>Record Payment</span>
                            </Link>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* TAB 4: Endpoint Security & SSL */}
          {activeTab === "domains" && (
            <div className="bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800 rounded-2xl p-6 shadow-xs space-y-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h2 className="steel-heading text-lg text-zinc-900 dark:text-white flex items-center gap-2">
                    <Globe className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                    Domain Probes &amp; SSL Watchdog
                  </h2>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
                    Continuous HTTP uptime monitoring, SSL certificate expiry countdowns, and DNS resolution validation.
                  </p>
                </div>
                <Link
                  href="/admin/domains"
                  className="px-3.5 py-1.5 rounded-xl border border-zinc-200 dark:border-zinc-800 text-xs font-tech font-semibold text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800/60 transition flex items-center gap-1.5 w-fit"
                >
                  <span>Open Domain Watchdog</span>
                  <ExternalLink className="w-3 h-3" />
                </Link>
              </div>

              {monitoredDomains.length === 0 ? (
                <div className="text-center py-12 text-zinc-500 dark:text-zinc-400 text-xs">
                  <Globe className="w-8 h-8 mx-auto mb-2 opacity-40" />
                  No domains registered for monitoring yet.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-zinc-100 dark:border-zinc-800 text-zinc-400 font-tech uppercase tracking-wider">
                        <th className="pb-3 font-semibold">Hostname</th>
                        <th className="pb-3 font-semibold">Client Tenant</th>
                        <th className="pb-3 font-semibold">HTTP Status</th>
                        <th className="pb-3 font-semibold">SSL Expiry</th>
                        <th className="pb-3 font-semibold">Uptime</th>
                        <th className="pb-3 font-semibold text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800/60">
                      {monitoredDomains.map((domain) => {
                        const sslDays = domain.sslExpiryDays ?? 999;
                        const isSslExpiring = sslDays < 30;
                        return (
                          <tr key={domain.id} className="hover:bg-zinc-50/50 dark:hover:bg-zinc-800/30 transition">
                            <td className="py-3.5 font-medium font-tech text-zinc-900 dark:text-white">
                              {domain.hostname}
                            </td>
                            <td className="py-3.5 text-zinc-600 dark:text-zinc-300">
                              {domain.clientName || "Platform"}
                            </td>
                            <td className="py-3.5">
                              <span
                                className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                                  domain.status === "up" || domain.status === "healthy"
                                    ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20"
                                    : "bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20"
                                }`}
                              >
                                <span className={`w-1.5 h-1.5 rounded-full ${domain.status === "up" || domain.status === "healthy" ? "bg-emerald-500" : "bg-rose-500"}`} />
                                {domain.status}
                              </span>
                            </td>
                            <td className="py-3.5">
                              <span className={`font-tech text-xs ${isSslExpiring ? "text-amber-600 dark:text-amber-400 font-bold" : "text-zinc-600 dark:text-zinc-300"}`}>
                                {sslDays < 999 ? `${sslDays} days left` : "Valid"}
                              </span>
                            </td>
                            <td className="py-3.5 font-tech text-zinc-700 dark:text-zinc-300">
                              {domain.uptimePercent ? `${domain.uptimePercent.toFixed(2)}%` : "99.9%"}
                            </td>
                            <td className="py-3.5 text-right">
                              <Link
                                href="/admin/domains"
                                className="px-2.5 py-1.5 rounded-lg bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-200 font-tech font-semibold text-xs transition inline-flex items-center gap-1"
                              >
                                <RefreshCw className="w-3 h-3" />
                                <span>Probe</span>
                              </Link>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* TAB 5: Urgent SLA Support */}
          {activeTab === "support" && (
            <div className="bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800 rounded-2xl p-6 shadow-xs space-y-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h2 className="steel-heading text-lg text-zinc-900 dark:text-white flex items-center gap-2">
                    <LifeBuoy className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                    Urgent SLA Support Queue
                  </h2>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
                    Tickets with active 24×7 SLA timers, high priority tiers, or pending client responses.
                  </p>
                </div>
                <Link
                  href="/admin/support"
                  className="px-3.5 py-1.5 rounded-xl border border-zinc-200 dark:border-zinc-800 text-xs font-tech font-semibold text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800/60 transition flex items-center gap-1.5 w-fit"
                >
                  <span>Open Support Desk</span>
                  <ExternalLink className="w-3 h-3" />
                </Link>
              </div>

              {urgentTickets.length === 0 ? (
                <div className="text-center py-12 text-zinc-500 dark:text-zinc-400 text-xs">
                  <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto mb-2 opacity-80" />
                  Support inbox zero! No active or escalated tickets pending response.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-zinc-100 dark:border-zinc-800 text-zinc-400 font-tech uppercase tracking-wider">
                        <th className="pb-3 font-semibold">Ticket Subject</th>
                        <th className="pb-3 font-semibold">Client</th>
                        <th className="pb-3 font-semibold">Priority</th>
                        <th className="pb-3 font-semibold">Status</th>
                        <th className="pb-3 font-semibold">Created</th>
                        <th className="pb-3 font-semibold text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800/60">
                      {urgentTickets.map((t) => (
                        <tr key={t.id} className="hover:bg-zinc-50/50 dark:hover:bg-zinc-800/30 transition">
                          <td className="py-3.5 font-medium text-zinc-900 dark:text-white">
                            <Link href={`/admin/support?ticketId=${t.id}`} className="hover:text-blue-600 hover:underline">
                              {t.subject}
                            </Link>
                          </td>
                          <td className="py-3.5 text-zinc-600 dark:text-zinc-300 font-medium">
                            {t.clientName || t.clientId}
                          </td>
                          <td className="py-3.5">
                            <span
                              className={`px-2 py-0.5 rounded-md text-[11px] font-tech font-semibold ${
                                t.priority === "urgent" || t.priority === "high" || t.priority === "p1"
                                  ? "bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20"
                                  : "bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20"
                              }`}
                            >
                              {t.priority}
                            </span>
                          </td>
                          <td className="py-3.5">
                            <span className="font-tech text-zinc-500">{t.status}</span>
                          </td>
                          <td className="py-3.5 font-tech text-zinc-400">
                            {formatDateTime(t.createdAt)}
                          </td>
                          <td className="py-3.5 text-right">
                            <Link
                              href="/admin/support"
                              className="px-3 py-1.5 rounded-lg bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 border border-blue-200/60 dark:border-blue-800/60 font-tech font-semibold hover:bg-blue-600 hover:text-white transition inline-flex items-center gap-1"
                            >
                              <span>Reply</span>
                              <ArrowRight className="w-3 h-3" />
                            </Link>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </section>

        {/* Live System Audit Stream */}
        <section className="bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800 rounded-2xl p-6 shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <History className="w-5 h-5 text-blue-600 dark:text-blue-400" />
              <h2 className="steel-heading text-base text-zinc-900 dark:text-white">
                Platform Audit &amp; Event Stream
              </h2>
            </div>
            <span className="font-tech text-xs text-zinc-400">Zero-Tamper Append Log</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 pt-2">
            {recentAuditLogs.map((log) => (
              <div
                key={log.id}
                className="p-3.5 rounded-xl bg-zinc-50 dark:bg-zinc-800/40 border border-zinc-200/60 dark:border-zinc-800 flex flex-col justify-between space-y-2"
              >
                <div className="flex items-center justify-between text-[11px] font-tech text-zinc-400">
                  <span className="font-bold text-zinc-700 dark:text-zinc-300 truncate max-w-[140px]">
                    {log.action}
                  </span>
                  <span>{formatDate(log.timestamp)}</span>
                </div>
                <div className="text-xs text-zinc-600 dark:text-zinc-400 font-sans truncate">
                  Actor: <span className="font-tech font-semibold text-zinc-900 dark:text-zinc-200">{log.actorEmail || log.actorType}</span>
                </div>
                <div className="text-[10px] text-zinc-400 font-tech">
                  Target: {log.entityType} ({log.entityId.slice(0, 10)}...)
                </div>
              </div>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}

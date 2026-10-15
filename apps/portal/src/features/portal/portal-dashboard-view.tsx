"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Server,
  Receipt,
  Globe,
  LifeBuoy,
  Rocket,
  Key,
  ArrowRight,
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  Clock,
  Activity,
  RefreshCw,
  ExternalLink,
  Download,
  RotateCw,
  Stethoscope,
  ShieldCheck,
  CreditCard,
  Copy,
  Check,
  Code2,
} from "lucide-react";
import { formatCurrency, formatDate, formatDateTime } from "@/lib/format";
import { useAlert } from "@/components/ui/alert-popup";
import { IosSpinner } from "@/components/ui/ios-spinner";

export interface PortalProcessItem {
  id: string;
  serverId: string;
  serverName: string;
  pm2Id: number;
  name: string;
  allowClientRestart: boolean;
  restartCooldownSec: number;
  status: string;
  cpu: number;
  memory: number;
  restarts: number;
  uptimeMs: number;
}

export interface PortalInvoiceItem {
  id: string;
  invoiceNumber: string;
  totalMinor: number;
  balanceMinor: number;
  status: string;
  dueDate: number;
  currency: string;
  pdfPath?: string | null;
}

export interface PortalDomainItem {
  id: string;
  hostname: string;
  status: string;
  sslStatus?: string;
  sslExpiryDays?: number;
  uptimePercent?: number;
  lastHttpCheckAt?: number;
}

export interface PortalTicketItem {
  id: string;
  ticketNumber?: string;
  subject: string;
  priority: string;
  status: string;
  createdAt: number;
}

export interface PortalReleaseItem {
  id: string;
  version: string;
  channel: string;
  notes?: string;
  deployedAt: number;
  previewUrl?: string;
}

export interface PortalDashboardViewProps {
  user: { email: string; role: string };
  client: {
    id: string;
    name: string;
    slug: string;
    billingEmail?: string;
    currency: string;
  };
  health: {
    score: number;
    category: "EXCELLENT" | "GOOD" | "AT_RISK" | "CRITICAL";
    recommendations: string[];
    factors: {
      billing: number;
      fleet: number;
      domains: number;
      support: number;
    };
  };
  billingSummary: {
    outstandingMinor: number;
    totalBilledMinor: number;
    totalPaidMinor: number;
    overdueCount: number;
    activeInvoicesCount: number;
  };
  recentInvoices: PortalInvoiceItem[];
  activeContractsCount: number;
  processes: PortalProcessItem[];
  domains: PortalDomainItem[];
  tickets: PortalTicketItem[];
  releases: PortalReleaseItem[];
  apiKey?: {
    id: string;
    keyPrefix: string;
    name: string;
    status: string;
  };
}

export function PortalDashboardView({
  user,
  client,
  health,
  billingSummary,
  recentInvoices,
  activeContractsCount,
  processes: initialProcesses,
  domains,
  tickets,
  releases,
  apiKey,
}: PortalDashboardViewProps) {
  const { showSuccess, showError, showAlert } = useAlert();
  const [processes, setProcesses] = useState<PortalProcessItem[]>(initialProcesses);
  const [restartingId, setRestartingId] = useState<string | null>(null);
  const [diagnosingId, setDiagnosingId] = useState<string | null>(null);
  const [cooldownTimers, setCooldownTimers] = useState<Record<string, number>>({});
  const [copiedSnippet, setCopiedSnippet] = useState(false);
  const [activeTab, setActiveTab] = useState<"fleet" | "billing" | "domains" | "support" | "releases">("fleet");

  const isOverdue = billingSummary.outstandingMinor > 0;

  // Restart Process
  const handleRestart = async (process: PortalProcessItem) => {
    if (!process.allowClientRestart) {
      showError("Action Prohibited", "Client restart is disabled for this process by administrator.");
      return;
    }
    if (cooldownTimers[process.id] && cooldownTimers[process.id] > Date.now()) {
      const waitSec = Math.ceil((cooldownTimers[process.id] - Date.now()) / 1000);
      showError("Cooldown Active", `Please wait ${waitSec}s before restarting again.`);
      return;
    }

    setRestartingId(process.id);
    try {
      const res = await fetch(`/api/v1/portal/fleet/processes/${process.id}/restart`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) {
        showError("Restart Failed", data.error || "Unable to restart process.");
        return;
      }

      showSuccess("Process Restarted", `${process.name} (#${process.pm2Id}) is cycling zero-downtime.`);
      setProcesses((prev) =>
        prev.map((p) => (p.id === process.id ? { ...p, restarts: p.restarts + 1, status: "online" } : p))
      );
      setCooldownTimers((prev) => ({
        ...prev,
        [process.id]: Date.now() + (process.restartCooldownSec || 30) * 1000,
      }));
    } catch (err: any) {
      showError("Connection Error", err.message || "Network error while triggering restart.");
    } finally {
      setRestartingId(null);
    }
  };

  // AI Diagnostic
  const handleDiagnose = async (process: PortalProcessItem) => {
    setDiagnosingId(process.id);
    try {
      const res = await fetch(`/api/v1/portal/fleet/processes/${process.id}/diagnose`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ autoHeal: false }),
      });
      const data = await res.json();
      if (!res.ok) {
        showError("Diagnostic Failed", data.error || "Unable to diagnose process failure.");
        return;
      }

      const diag = data.diagnosis;
      showAlert({
        type: diag.recoveryAction === "AUTO_RESTART_ELIGIBLE" ? "success" : "warning",
        title: `AI Health Audit: ${process.name}`,
        description: diag.summary,
        details: [
          { label: "Failure Signature", value: diag.failureType || "NORMAL_OPERATION" },
          { label: "Root Cause Detail", value: diag.rootCause || "No abnormal crashes detected", isMonospace: true },
          { label: "Suggested Remediation", value: diag.suggestedRemediation || "Process is healthy" },
          { label: "Recovery Decision", value: diag.recoveryAction },
        ],
      });
    } catch (err: any) {
      showError("Connection Error", err.message || "Failed to contact diagnostic service.");
    } finally {
      setDiagnosingId(null);
    }
  };

  const copySdkSnippet = () => {
    const code = `import { checkRapidShiftGate } from "@rapidshift/sdk";

export async function middleware(req) {
  const gate = await checkRapidShiftGate({
    apiKey: process.env.RAPIDSHIFT_API_KEY,
    clientId: "${client.id}",
  });
  if (!gate.allowed) {
    return Response.redirect("https://portal.rapidshiftlabs.com/portal/billing");
  }
}`;
    navigator.clipboard.writeText(code);
    setCopiedSnippet(true);
    setTimeout(() => setCopiedSnippet(false), 2000);
  };

  const getHealthBadge = (category: string, score: number) => {
    switch (category) {
      case "EXCELLENT":
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
            <CheckCircle2 className="w-3.5 h-3.5" /> {score}/100 Optimal Health
          </span>
        );
      case "GOOD":
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20">
            <CheckCircle2 className="w-3.5 h-3.5" /> {score}/100 Good Standing
          </span>
        );
      case "AT_RISK":
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 animate-pulse">
            <AlertTriangle className="w-3.5 h-3.5" /> {score}/100 Attention Recommended
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20 animate-pulse">
            <AlertCircle className="w-3.5 h-3.5" /> {score}/100 Action Required
          </span>
        );
    }
  };

  const onlineCount = processes.filter((p) => p.status === "online").length;

  return (
    <div className="min-h-screen bg-slate-50/50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 flex flex-col">
      <main className="flex-1 w-full px-4 sm:px-6 lg:px-8 xl:px-10 py-8 space-y-8">
        
        {/* Executive Client Command Center */}
        <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-zinc-900 via-slate-900 to-blue-950 text-white p-7 sm:p-9 shadow-lg border border-zinc-800/80">
          <div className="absolute -right-20 -top-20 w-80 h-80 bg-blue-600/15 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute right-1/4 -bottom-20 w-64 h-64 bg-indigo-600/10 rounded-full blur-3xl pointer-events-none" />

          <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
            <div className="space-y-3 max-w-2xl">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold bg-blue-500/15 text-blue-300 border border-blue-500/30 backdrop-blur-md">
                <ShieldCheck className="w-3.5 h-3.5 text-blue-400" />
                <span className="font-tech text-[11px] tracking-wide">
                  {isOverdue ? "Payment Due • Fail-Open Mode Engaged" : "Access Gate Active • Dues Reconciled"}
                </span>
              </div>
              <h1 className="text-fluid-title steel-heading text-white">
                {client.name}
              </h1>
              <p className="text-sm sm:text-base text-zinc-300 leading-relaxed font-sans">
                Operating under Tenant Scope <span className="font-tech font-bold text-blue-300">{client.id}</span>.
                Real-time operational dashboard for your application runtime, uptime SLA, and billing receipts.
              </p>
            </div>

            {/* Quick Action Dock */}
            <div className="flex flex-wrap sm:flex-nowrap gap-2.5 items-center">
              <Link
                href="/portal/support"
                className="px-3.5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-tech text-xs font-semibold shadow-sm transition flex items-center gap-1.5"
              >
                <LifeBuoy className="w-3.5 h-3.5" />
                <span>+ Raise Ticket</span>
              </Link>
              <Link
                href="/portal/billing"
                className="px-3.5 py-2.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-white font-tech text-xs font-semibold border border-zinc-700/80 transition flex items-center gap-1.5"
              >
                <Receipt className="w-3.5 h-3.5" />
                <span>Invoices &amp; Receipts</span>
              </Link>
              <Link
                href={`/status/${client.slug}`}
                target="_blank"
                className="px-3.5 py-2.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white font-tech text-xs font-semibold border border-zinc-700/80 transition flex items-center gap-1.5"
              >
                <Globe className="w-3.5 h-3.5 text-blue-400" />
                <span>Status Page</span>
                <ExternalLink className="w-3 h-3" />
              </Link>
            </div>
          </div>
        </section>

        {/* Real-Time Operational Pulse Ribbon */}
        <section className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Account Standing */}
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800 rounded-2xl p-5 shadow-xs relative overflow-hidden group hover:border-blue-500/40 transition">
            <div className="flex items-center justify-between">
              <span className="steel-metric-label text-zinc-500 dark:text-zinc-400">Account Standing</span>
              <div className="w-9 h-9 rounded-xl bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 border border-blue-200/60 dark:border-blue-800/60 flex items-center justify-center">
                <Receipt className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-3 flex items-baseline gap-2">
              <span className="text-fluid-kpi steel-kpi font-tech text-zinc-900 dark:text-white">
                {billingSummary.outstandingMinor > 0
                  ? formatCurrency(billingSummary.outstandingMinor, client.currency)
                  : "Paid in Full"}
              </span>
            </div>
            <div className="mt-2.5 flex items-center justify-between text-xs">
              <span className="text-zinc-400 font-sans">
                {billingSummary.overdueCount > 0 ? `${billingSummary.overdueCount} overdue` : "Dues current"}
              </span>
              <Link href="/portal/billing" className="font-semibold text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1">
                <span>Ledger</span>
                <ArrowRight className="w-3 h-3" />
              </Link>
            </div>
          </div>

          {/* System Health Score */}
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800 rounded-2xl p-5 shadow-xs relative overflow-hidden group hover:border-blue-500/40 transition">
            <div className="flex items-center justify-between">
              <span className="steel-metric-label text-zinc-500 dark:text-zinc-400">Overall System Health</span>
              <div className="w-9 h-9 rounded-xl bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 border border-blue-200/60 dark:border-blue-800/60 flex items-center justify-center">
                <Activity className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-3 flex items-baseline gap-2">
              <span className="text-fluid-kpi steel-kpi font-tech text-zinc-900 dark:text-white">
                {health.score}
              </span>
              <span className="text-xs font-tech text-zinc-400">/100</span>
            </div>
            <div className="mt-2.5 flex items-center justify-between text-xs">
              {getHealthBadge(health.category, health.score)}
            </div>
          </div>

          {/* Application Runtime */}
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800 rounded-2xl p-5 shadow-xs relative overflow-hidden group hover:border-blue-500/40 transition">
            <div className="flex items-center justify-between">
              <span className="steel-metric-label text-zinc-500 dark:text-zinc-400">PM2 Runtime</span>
              <div className="w-9 h-9 rounded-xl bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 border border-blue-200/60 dark:border-blue-800/60 flex items-center justify-center">
                <Server className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-3 flex items-baseline gap-2">
              <span className="text-fluid-kpi steel-kpi font-tech text-zinc-900 dark:text-white">
                {onlineCount} / {processes.length}
              </span>
              <span className="steel-pill text-emerald-600 dark:text-emerald-400">Online</span>
            </div>
            <div className="mt-2.5 flex items-center justify-between text-xs">
              <span className="text-zinc-400 font-sans">Zero-downtime cluster</span>
              <Link href="/portal/infrastructure" className="font-semibold text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1">
                <span>Manage</span>
                <ArrowRight className="w-3 h-3" />
              </Link>
            </div>
          </div>

          {/* Production Domains */}
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800 rounded-2xl p-5 shadow-xs relative overflow-hidden group hover:border-blue-500/40 transition">
            <div className="flex items-center justify-between">
              <span className="steel-metric-label text-zinc-500 dark:text-zinc-400">Domain Endpoints</span>
              <div className="w-9 h-9 rounded-xl bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 border border-blue-200/60 dark:border-blue-800/60 flex items-center justify-center">
                <Globe className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-3 flex items-baseline gap-2">
              <span className="text-fluid-kpi steel-kpi font-tech text-zinc-900 dark:text-white">
                {domains.length}
              </span>
              <span className="steel-pill text-blue-600 dark:text-blue-400">Probes Active</span>
            </div>
            <div className="mt-2.5 flex items-center justify-between text-xs">
              <span className="text-zinc-400 font-sans">99.98% SLA Availability</span>
              <Link href="/portal/domains" className="font-semibold text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1">
                <span>Inspect</span>
                <ArrowRight className="w-3 h-3" />
              </Link>
            </div>
          </div>
        </section>

        {/* Operational Filter Tabs */}
        <div className="flex items-center gap-2 border-b border-zinc-200/80 dark:border-zinc-800 pb-3 overflow-x-auto">
          {[
            { id: "fleet", label: "Application Fleet & PM2", count: processes.length, icon: Server },
            { id: "billing", label: "Billing & Verified Invoices", count: recentInvoices.length, icon: Receipt },
            { id: "domains", label: "Production Domains & SSL", count: domains.length, icon: Globe },
            { id: "support", label: "24×7 Support SLA", count: tickets.length, icon: LifeBuoy },
            { id: "releases", label: "Deployments & Releases", count: releases.length, icon: Rocket },
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

        {/* Dynamic Client Operational Modules */}
        <section className="space-y-6">
          {/* TAB 1: Application Fleet & PM2 */}
          {activeTab === "fleet" && (
            <div className="bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800 rounded-2xl p-6 shadow-xs space-y-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h2 className="steel-heading text-lg text-zinc-900 dark:text-white flex items-center gap-2">
                    <Server className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                    Dedicated PM2 Processes &amp; Services
                  </h2>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
                    Control and monitor your containerized background services, web servers, and queue workers.
                  </p>
                </div>
                <Link
                  href="/portal/infrastructure"
                  className="px-3.5 py-1.5 rounded-xl border border-zinc-200 dark:border-zinc-800 text-xs font-tech font-semibold text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800/60 transition flex items-center gap-1.5 w-fit"
                >
                  <span>Open Full Fleet Console</span>
                  <ExternalLink className="w-3 h-3" />
                </Link>
              </div>

              {processes.length === 0 ? (
                <div className="text-center py-12 text-zinc-500 dark:text-zinc-400 text-xs">
                  <Server className="w-8 h-8 mx-auto mb-2 opacity-40" />
                  No PM2 processes are currently mapped to your organization scope.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-zinc-100 dark:border-zinc-800 text-zinc-400 font-tech uppercase tracking-wider">
                        <th className="pb-3 font-semibold">Service Name</th>
                        <th className="pb-3 font-semibold">Status</th>
                        <th className="pb-3 font-semibold">CPU / Memory</th>
                        <th className="pb-3 font-semibold">Restarts</th>
                        <th className="pb-3 font-semibold text-right">Self-Service Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800/60">
                      {processes.map((proc) => {
                        const isRestarting = restartingId === proc.id;
                        const isDiagnosing = diagnosingId === proc.id;
                        const isCooldown = cooldownTimers[proc.id] && cooldownTimers[proc.id] > Date.now();
                        return (
                          <tr key={proc.id} className="hover:bg-zinc-50/50 dark:hover:bg-zinc-800/30 transition">
                            <td className="py-3.5 font-medium text-zinc-900 dark:text-white">
                              <div className="font-tech font-bold text-sm">{proc.name}</div>
                              <div className="text-[11px] text-zinc-400 font-sans">Instance #{proc.pm2Id} &bull; {proc.serverName}</div>
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
                            <td className="py-3.5 font-tech text-zinc-600 dark:text-zinc-300">
                              {proc.restarts}
                            </td>
                            <td className="py-3.5 text-right">
                              <div className="flex items-center justify-end gap-2">
                                <button
                                  onClick={() => handleDiagnose(proc)}
                                  disabled={isDiagnosing}
                                  className="px-2.5 py-1.5 rounded-lg bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-200 font-tech font-semibold transition inline-flex items-center gap-1"
                                  title="Run AI health analysis on process logs"
                                >
                                  {isDiagnosing ? <IosSpinner size={12} /> : <Stethoscope className="w-3 h-3 text-blue-500" />}
                                  <span>Diagnose</span>
                                </button>
                                <button
                                  onClick={() => handleRestart(proc)}
                                  disabled={isRestarting || Boolean(isCooldown) || !proc.allowClientRestart}
                                  className={`px-3 py-1.5 rounded-lg font-tech font-semibold transition inline-flex items-center gap-1 ${
                                    isCooldown || !proc.allowClientRestart
                                      ? "bg-zinc-100 dark:bg-zinc-800 text-zinc-400 cursor-not-allowed"
                                      : "bg-blue-600 hover:bg-blue-500 text-white shadow-xs"
                                  }`}
                                  title={!proc.allowClientRestart ? "Restart disabled by admin" : "Restart zero-downtime"}
                                >
                                  {isRestarting ? <IosSpinner size={12} /> : <RotateCw className="w-3 h-3" />}
                                  <span>Restart</span>
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

          {/* TAB 2: Billing & Verified Invoices */}
          {activeTab === "billing" && (
            <div className="bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800 rounded-2xl p-6 shadow-xs space-y-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h2 className="steel-heading text-lg text-zinc-900 dark:text-white flex items-center gap-2">
                    <Receipt className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                    Invoices &amp; Tax Settlement
                  </h2>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
                    Download verified GST/Non-GST tax invoices and inspect payment settlement history.
                  </p>
                </div>
                <Link
                  href="/portal/billing"
                  className="px-3.5 py-1.5 rounded-xl border border-zinc-200 dark:border-zinc-800 text-xs font-tech font-semibold text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800/60 transition flex items-center gap-1.5 w-fit"
                >
                  <span>Open Billing Center</span>
                  <ExternalLink className="w-3 h-3" />
                </Link>
              </div>

              {recentInvoices.length === 0 ? (
                <div className="text-center py-12 text-zinc-500 dark:text-zinc-400 text-xs">
                  <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto mb-2 opacity-80" />
                  No invoices issued yet.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-zinc-100 dark:border-zinc-800 text-zinc-400 font-tech uppercase tracking-wider">
                        <th className="pb-3 font-semibold">Invoice #</th>
                        <th className="pb-3 font-semibold">Due Date</th>
                        <th className="pb-3 font-semibold">Total Amount</th>
                        <th className="pb-3 font-semibold">Balance Due</th>
                        <th className="pb-3 font-semibold">Status</th>
                        <th className="pb-3 font-semibold text-right">PDF Download</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800/60">
                      {recentInvoices.map((inv) => (
                        <tr key={inv.id} className="hover:bg-zinc-50/50 dark:hover:bg-zinc-800/30 transition">
                          <td className="py-3.5 font-medium font-tech text-zinc-900 dark:text-white">
                            {inv.invoiceNumber}
                          </td>
                          <td className="py-3.5 text-zinc-500 font-tech">
                            {formatDate(inv.dueDate)}
                          </td>
                          <td className="py-3.5 font-tech text-zinc-900 dark:text-white">
                            {formatCurrency(inv.totalMinor, inv.currency)}
                          </td>
                          <td className="py-3.5 font-tech font-bold text-zinc-700 dark:text-zinc-300">
                            {inv.balanceMinor > 0 ? (
                              <span className="text-rose-600 dark:text-rose-400">{formatCurrency(inv.balanceMinor, inv.currency)}</span>
                            ) : (
                              <span className="text-emerald-600 dark:text-emerald-400">Cleared</span>
                            )}
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
                            <a
                              href={`/api/v1/billing/invoices/${inv.id}/pdf`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="px-3 py-1.5 rounded-lg bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-200 font-tech font-semibold transition inline-flex items-center gap-1.5"
                            >
                              <Download className="w-3 h-3 text-blue-500" />
                              <span>PDF Slip</span>
                            </a>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* TAB 3: Production Domains & SSL */}
          {activeTab === "domains" && (
            <div className="bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800 rounded-2xl p-6 shadow-xs space-y-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h2 className="steel-heading text-lg text-zinc-900 dark:text-white flex items-center gap-2">
                    <Globe className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                    Monitored Endpoints &amp; SSL Certificates
                  </h2>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
                    Continuous HTTP probes, SSL certificate validation, and public incident status pages.
                  </p>
                </div>
                <Link
                  href="/portal/domains"
                  className="px-3.5 py-1.5 rounded-xl border border-zinc-200 dark:border-zinc-800 text-xs font-tech font-semibold text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800/60 transition flex items-center gap-1.5 w-fit"
                >
                  <span>Open Domain Center</span>
                  <ExternalLink className="w-3 h-3" />
                </Link>
              </div>

              {domains.length === 0 ? (
                <div className="text-center py-12 text-zinc-500 dark:text-zinc-400 text-xs">
                  <Globe className="w-8 h-8 mx-auto mb-2 opacity-40" />
                  No domains configured for uptime probes yet.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-zinc-100 dark:border-zinc-800 text-zinc-400 font-tech uppercase tracking-wider">
                        <th className="pb-3 font-semibold">Endpoint Hostname</th>
                        <th className="pb-3 font-semibold">Availability Status</th>
                        <th className="pb-3 font-semibold">SSL Certificate</th>
                        <th className="pb-3 font-semibold">30-Day Uptime</th>
                        <th className="pb-3 font-semibold text-right">Status Page</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800/60">
                      {domains.map((dom) => (
                        <tr key={dom.id} className="hover:bg-zinc-50/50 dark:hover:bg-zinc-800/30 transition">
                          <td className="py-3.5 font-medium font-tech text-zinc-900 dark:text-white">
                            {dom.hostname}
                          </td>
                          <td className="py-3.5">
                            <span
                              className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                                dom.status === "up" || dom.status === "healthy"
                                  ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20"
                                  : "bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20"
                              }`}
                            >
                              <span className={`w-1.5 h-1.5 rounded-full ${dom.status === "up" || dom.status === "healthy" ? "bg-emerald-500" : "bg-rose-500"}`} />
                              {dom.status}
                            </span>
                          </td>
                          <td className="py-3.5 font-tech text-zinc-600 dark:text-zinc-300">
                            {dom.sslExpiryDays !== undefined ? `${dom.sslExpiryDays} days remaining` : "Valid SSL"}
                          </td>
                          <td className="py-3.5 font-tech text-zinc-700 dark:text-zinc-300">
                            {dom.uptimePercent ? `${dom.uptimePercent.toFixed(2)}%` : "99.98%"}
                          </td>
                          <td className="py-3.5 text-right">
                            <Link
                              href={`/status/${client.slug}`}
                              target="_blank"
                              className="px-2.5 py-1.5 rounded-lg bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-200 font-tech font-semibold text-xs transition inline-flex items-center gap-1"
                            >
                              <span>Public View</span>
                              <ExternalLink className="w-3 h-3" />
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

          {/* TAB 4: 24×7 Support SLA */}
          {activeTab === "support" && (
            <div className="bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800 rounded-2xl p-6 shadow-xs space-y-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h2 className="steel-heading text-lg text-zinc-900 dark:text-white flex items-center gap-2">
                    <LifeBuoy className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                    24×7 Engineering Support Desk
                  </h2>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
                    Direct access to RapidShift engineering with strict SLA escalation timers.
                  </p>
                </div>
                <Link
                  href="/portal/support"
                  className="px-3.5 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-tech text-xs font-semibold shadow-xs transition flex items-center gap-1.5 w-fit"
                >
                  <span>+ New Ticket</span>
                </Link>
              </div>

              {tickets.length === 0 ? (
                <div className="text-center py-12 text-zinc-500 dark:text-zinc-400 text-xs">
                  <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto mb-2 opacity-80" />
                  No open support tickets. Everything is running smoothly.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-zinc-100 dark:border-zinc-800 text-zinc-400 font-tech uppercase tracking-wider">
                        <th className="pb-3 font-semibold">Subject</th>
                        <th className="pb-3 font-semibold">Priority</th>
                        <th className="pb-3 font-semibold">Status</th>
                        <th className="pb-3 font-semibold">Opened</th>
                        <th className="pb-3 font-semibold text-right">Thread</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800/60">
                      {tickets.map((t) => (
                        <tr key={t.id} className="hover:bg-zinc-50/50 dark:hover:bg-zinc-800/30 transition">
                          <td className="py-3.5 font-medium text-zinc-900 dark:text-white">
                            <Link href={`/portal/support?ticketId=${t.id}`} className="hover:text-blue-600 hover:underline">
                              {t.subject}
                            </Link>
                          </td>
                          <td className="py-3.5">
                            <span className="px-2 py-0.5 rounded-md text-[11px] font-tech font-semibold bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20">
                              {t.priority}
                            </span>
                          </td>
                          <td className="py-3.5 font-tech text-zinc-500">
                            {t.status}
                          </td>
                          <td className="py-3.5 font-tech text-zinc-400">
                            {formatDateTime(t.createdAt)}
                          </td>
                          <td className="py-3.5 text-right">
                            <Link
                              href="/portal/support"
                              className="px-3 py-1.5 rounded-lg bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 border border-blue-200/60 dark:border-blue-800/60 font-tech font-semibold hover:bg-blue-600 hover:text-white transition inline-flex items-center gap-1"
                            >
                              <span>View Discussion</span>
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

          {/* TAB 5: Deployments & Releases */}
          {activeTab === "releases" && (
            <div className="bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800 rounded-2xl p-6 shadow-xs space-y-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h2 className="steel-heading text-lg text-zinc-900 dark:text-white flex items-center gap-2">
                    <Rocket className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                    Authorized Builds &amp; Deployments
                  </h2>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
                    Staging previews, production releases, and commit-level changelog distributions.
                  </p>
                </div>
                <Link
                  href="/portal/releases"
                  className="px-3.5 py-1.5 rounded-xl border border-zinc-200 dark:border-zinc-800 text-xs font-tech font-semibold text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800/60 transition flex items-center gap-1.5 w-fit"
                >
                  <span>Releases Hub</span>
                  <ExternalLink className="w-3 h-3" />
                </Link>
              </div>

              {releases.length === 0 ? (
                <div className="text-center py-12 text-zinc-500 dark:text-zinc-400 text-xs">
                  <Rocket className="w-8 h-8 mx-auto mb-2 opacity-40" />
                  No releases published for this tenant yet.
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {releases.map((rel) => (
                    <div
                      key={rel.id}
                      className="p-4 rounded-xl bg-zinc-50 dark:bg-zinc-800/40 border border-zinc-200/60 dark:border-zinc-800 space-y-3"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="font-tech font-bold text-sm text-zinc-900 dark:text-white">
                            v{rel.version}
                          </span>
                          <span className="px-2 py-0.5 rounded-md text-[10px] font-tech font-semibold bg-blue-500/10 text-blue-600 dark:text-blue-400">
                            {rel.channel}
                          </span>
                        </div>
                        <span className="text-[11px] font-tech text-zinc-400">{formatDate(rel.deployedAt)}</span>
                      </div>
                      <p className="text-xs text-zinc-600 dark:text-zinc-300 line-clamp-2">
                        {rel.notes || "Standard security patches and performance optimization deployment."}
                      </p>
                      {rel.previewUrl && (
                        <a
                          href={rel.previewUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1"
                        >
                          <span>Open Staging Preview</span>
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </section>

        {/* Access Gate & SDK Integration Card */}
        <section className="bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800 rounded-2xl p-6 shadow-xs space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-2.5">
              <Key className="w-5 h-5 text-blue-600 dark:text-blue-400" />
              <div>
                <h3 className="steel-heading text-base text-zinc-900 dark:text-white">
                  Access Gate Integration &amp; SDK Key
                </h3>
                <p className="text-xs text-zinc-500 dark:text-zinc-400">
                  Protect your application routes using the fail-open `@rapidshift/sdk` middleware gate.
                </p>
              </div>
            </div>
            <button
              onClick={copySdkSnippet}
              className="px-3 py-1.5 rounded-lg bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-200 font-tech font-semibold text-xs transition inline-flex items-center gap-1.5 w-fit"
            >
              {copiedSnippet ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copiedSnippet ? "Copied Middleware" : "Copy SDK Code"}</span>
            </button>
          </div>

          <div className="p-4 rounded-xl bg-zinc-900 text-zinc-300 font-tech text-xs overflow-x-auto border border-zinc-800">
            <pre className="leading-relaxed">
{`// middleware.ts - RapidShift Access Gate
import { checkRapidShiftGate } from "@rapidshift/sdk";

export async function middleware(req) {
  const gate = await checkRapidShiftGate({
    apiKey: process.env.RAPIDSHIFT_API_KEY, // active key: ${apiKey?.keyPrefix || "rsl_live_••••••"}
    clientId: "${client.id}",
  });
  if (!gate.allowed) {
    return Response.redirect("https://portal.rapidshiftlabs.com/portal/billing");
  }
}`}
            </pre>
          </div>
        </section>
      </main>
    </div>
  );
}

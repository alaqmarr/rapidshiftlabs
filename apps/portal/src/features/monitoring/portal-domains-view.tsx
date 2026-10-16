"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import {
  Globe,
  Plus,
  ExternalLink,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Clock,
  ShieldCheck,
  ShieldAlert,
  X,
  Activity,
  Layers,
  Radio,
  RefreshCw,
  Search,
  LayoutGrid,
  Table as TableIcon,
  Lock,
  Network,
  Calendar,
  Copy,
  Check,
  ArrowUpRight,
  SlidersHorizontal,
} from "lucide-react";
import { useAlert } from "@/components/ui/alert-popup";
import { IosSpinner } from "@/components/ui/ios-spinner";
import { formatDate } from "@/lib/format";

export interface PortalDomain {
  id: string;
  name: string;
  hostname: string;
  targetUrl: string;
  port: number;
  status: "up" | "degraded" | "down" | "paused" | "pending";
  lastHttpCheckAt: number | null;
  lastLatencyMs: number | null;
  lastHttpError: string | null;
  sslStatus: "valid" | "expiring_soon" | "expired" | "invalid" | "unreachable" | null;
  sslDaysRemaining: number | null;
  sslIssuer: string | null;
  dnsStatus: "healthy" | "drift_detected" | "resolution_failed" | null;
  domainExpiresAt: number | null;
  domainRegistrar: string | null;
}

export interface PortalIncident {
  id: string;
  domainId: string;
  type: string;
  status: string;
  severity: string;
  title: string | null;
  reason: string;
  startedAt: number;
}

const formatTime = (ms: number | string | undefined | null) => {
  if (!ms) return "—";
  const d = new Date(ms);
  if (isNaN(d.getTime())) return "—";
  const hours = String(d.getHours()).padStart(2, "0");
  const mins = String(d.getMinutes()).padStart(2, "0");
  return `${hours}:${mins}`;
};

function formatRelativeTime(timestamp: number | null): string {
  if (!timestamp) return "Pending first check";
  const diffSec = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  return `${Math.floor(diffHr / 24)}d ago`;
}

interface PortalDomainsViewProps {
  clientId: string;
  clientSlug: string;
  clientName: string;
  domains: PortalDomain[];
  incidents: PortalIncident[];
}

type DomainFilterTab = "all" | "operational" | "degraded_down" | "ssl_warning";
type ViewMode = "cards" | "table";

export function PortalDomainsView({
  clientId,
  clientSlug,
  clientName,
  domains: initialDomains,
  incidents: initialIncidents,
}: PortalDomainsViewProps) {
  const { showSuccess, showError } = useAlert();
  const [domains, setDomains] = useState<PortalDomain[]>(initialDomains);
  const [incidents] = useState<PortalIncident[]>(initialIncidents);
  const [isRegisterOpen, setIsRegisterOpen] = useState(false);
  const [checkingId, setCheckingId] = useState<string | null>(null);
  const [isCheckingAll, setIsCheckingAll] = useState(false);

  // Filter, Search, View Mode & Inspector Drawer State
  const [searchTerm, setSearchTerm] = useState("");
  const [filterTab, setFilterTab] = useState<DomainFilterTab>("all");
  const [viewMode, setViewMode] = useState<ViewMode>("cards");
  const [inspectedDomainId, setInspectedDomainId] = useState<string | null>(null);
  const [copiedText, setCopiedText] = useState<string | null>(null);

  // Form State
  const [formName, setFormName] = useState("");
  const [formHostname, setFormHostname] = useState("");
  const [formTargetUrl, setFormTargetUrl] = useState("");
  const [formPort, setFormPort] = useState("443");
  const [formError, setFormError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Executive SLA & Uptime Telemetry Metrics
  const telemetry = useMemo(() => {
    const total = domains.length;
    const healthyCount = domains.filter((d) => d.status === "up").length;
    const overallSlaPercent =
      total > 0 ? ((healthyCount / total) * 100).toFixed(total === healthyCount ? 1 : 2) : "100.0";

    const sslValidCount = domains.filter(
      (d) => d.sslStatus === "valid" && (d.sslDaysRemaining == null || d.sslDaysRemaining > 14)
    ).length;

    const sslWarningCount = domains.filter(
      (d) =>
        d.sslStatus === "expiring_soon" ||
        d.sslStatus === "expired" ||
        d.sslStatus === "invalid" ||
        (d.sslDaysRemaining != null && d.sslDaysRemaining <= 21)
    ).length;

    const latencies = domains
      .map((d) => d.lastLatencyMs)
      .filter((ms): ms is number => typeof ms === "number" && ms > 0);
    const avgLatency =
      latencies.length > 0
        ? Math.round(latencies.reduce((acc, v) => acc + v, 0) / latencies.length)
        : 0;

    return {
      total,
      healthyCount,
      overallSlaPercent,
      sslValidCount,
      sslWarningCount,
      activeIncidentCount: incidents.length,
      avgLatency,
    };
  }, [domains, incidents]);

  const filteredDomains = useMemo(() => {
    return domains.filter((d) => {
      const q = searchTerm.toLowerCase().trim();
      const matchesSearch =
        !q ||
        d.name.toLowerCase().includes(q) ||
        d.hostname.toLowerCase().includes(q) ||
        (d.sslIssuer || "").toLowerCase().includes(q);

      let matchesTab = true;
      if (filterTab === "operational") {
        matchesTab = d.status === "up";
      } else if (filterTab === "degraded_down") {
        matchesTab = d.status === "down" || d.status === "degraded";
      } else if (filterTab === "ssl_warning") {
        matchesTab =
          d.sslStatus === "expiring_soon" ||
          d.sslStatus === "expired" ||
          d.sslStatus === "invalid" ||
          (d.sslDaysRemaining != null && d.sslDaysRemaining <= 30);
      }

      return matchesSearch && matchesTab;
    });
  }, [domains, searchTerm, filterTab]);

  const inspectedDomain = useMemo(
    () => (inspectedDomainId ? domains.find((d) => d.id === inspectedDomainId) ?? null : null),
    [domains, inspectedDomainId]
  );

  const inspectedDomainIncidents = useMemo(
    () =>
      inspectedDomain
        ? incidents.filter((inc) => inc.domainId === inspectedDomain.id)
        : [],
    [incidents, inspectedDomain]
  );

  function copyToClipboard(text: string, key: string) {
    navigator.clipboard.writeText(text);
    setCopiedText(key);
    setTimeout(() => setCopiedText(null), 1800);
  }

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    setFormError("");
    setIsSubmitting(true);

    try {
      const res = await fetch("/api/v1/portal/domains", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientId,
          name: formName,
          hostname: formHostname,
          targetUrl: formTargetUrl || undefined,
          port: Number(formPort) || 443,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to register domain");
      }

      setDomains((prev) => [data.domain, ...prev]);
      setIsRegisterOpen(false);
      showSuccess(
        "Domain Enrolled for Monitoring",
        `Endpoint '${data.domain.name}' (${data.domain.hostname}) is enrolled in your monitored fleet. Automated socket probes will track HTTP availability, TLS/SSL expiration, and DNS health.`,
        [
          { label: "Domain Name", value: data.domain.name },
          { label: "Hostname", value: data.domain.hostname, copyable: true },
          {
            label: "Target URL",
            value: data.domain.targetUrl || `https://${data.domain.hostname}`,
          },
          { label: "Port", value: String(data.domain.port || 443) },
        ]
      );
      resetForm();
    } catch (err: any) {
      setFormError(err.message);
      showError("Domain Registration Failed", err.message);
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleRunCheck(domainId: string, silent = false) {
    setCheckingId(domainId);
    const targetDomain = domains.find((d) => d.id === domainId);
    try {
      const res = await fetch(`/api/v1/portal/domains/${domainId}/check`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ checkType: "all" }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Diagnostics check execution failed");
      }

      if (data.domain) {
        setDomains((prev) => prev.map((d) => (d.id === domainId ? data.domain : d)));
        const d = data.domain as PortalDomain;
        if (!silent) {
          showSuccess(
            "Diagnostics Check Complete",
            `Live inspection completed for '${d.hostname}'. Status: ${d.status.toUpperCase()}.`,
            [
              { label: "Hostname", value: d.hostname },
              {
                label: "Latency",
                value: d.lastLatencyMs != null ? `${d.lastLatencyMs}ms` : "N/A",
              },
              {
                label: "SSL Certificate",
                value: d.sslStatus
                  ? `${d.sslStatus.toUpperCase()} (${d.sslDaysRemaining ?? 0}d left)`
                  : "N/A",
              },
              {
                label: "DNS Resolution",
                value: d.dnsStatus ? d.dnsStatus.toUpperCase() : "N/A",
              },
            ]
          );
        }
      }
    } catch (err: any) {
      if (!silent) {
        showError("Diagnostics Check Failed", err.message, [
          { label: "Domain", value: targetDomain?.hostname || domainId },
        ]);
      }
    } finally {
      setCheckingId(null);
    }
  }

  async function handleVerifyAll() {
    if (domains.length === 0) return;
    setIsCheckingAll(true);
    try {
      await Promise.all(domains.map((d) => handleRunCheck(d.id, true)));
      showSuccess(
        "All Endpoints Verified",
        `Completed live HTTP, SSL/TLS, and DNS verification across all ${domains.length} monitored endpoint(s).`
      );
    } finally {
      setIsCheckingAll(false);
    }
  }

  function resetForm() {
    setFormName("");
    setFormHostname("");
    setFormTargetUrl("");
    setFormPort("443");
    setFormError("");
  }

  function getStatusBadge(status: string, compact = false) {
    const sizeCls = compact ? "px-2 py-0.5 text-[10px]" : "px-2.5 py-1 text-xs";
    switch (status) {
      case "up":
        return (
          <span
            className={`steel-pill inline-flex items-center gap-1.5 ${sizeCls} rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 font-tech font-semibold`}
          >
            <CheckCircle2 className="w-3.5 h-3.5" /> Operational
          </span>
        );
      case "degraded":
        return (
          <span
            className={`steel-pill inline-flex items-center gap-1.5 ${sizeCls} rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 font-tech font-semibold`}
          >
            <AlertTriangle className="w-3.5 h-3.5" /> Degraded
          </span>
        );
      case "down":
        return (
          <span
            className={`steel-pill inline-flex items-center gap-1.5 ${sizeCls} rounded-full bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20 font-tech font-semibold`}
          >
            <XCircle className="w-3.5 h-3.5" /> Outage
          </span>
        );
      case "paused":
        return (
          <span
            className={`steel-pill inline-flex items-center gap-1.5 ${sizeCls} rounded-full bg-zinc-500/10 text-zinc-500 border border-zinc-500/20 font-tech font-semibold`}
          >
            <Clock className="w-3.5 h-3.5" /> Paused
          </span>
        );
      default:
        return (
          <span
            className={`steel-pill inline-flex items-center gap-1.5 ${sizeCls} rounded-full bg-blue-500/10 text-blue-500 border border-blue-500/20 font-tech font-semibold`}
          >
            <Clock className="w-3.5 h-3.5" /> Pending
          </span>
        );
    }
  }

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 flex flex-col font-sans">
      <main className="flex-1 w-full px-4 sm:px-6 lg:px-8 xl:px-10 py-8 space-y-6">
        {/* EXECUTIVE SLA & UPTIME TELEMETRY HEADER */}
        <div className="bg-white dark:bg-zinc-900/90 border border-zinc-200 dark:border-zinc-800/90 rounded-2xl p-5 shadow-xs space-y-5">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-center gap-3.5">
              <div className="w-11 h-11 rounded-xl bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 flex items-center justify-center border border-blue-200/60 dark:border-blue-800/60 shadow-xs shrink-0">
                <Globe className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2.5">
                  <h1 className="text-lg sm:text-xl font-bold steel-heading text-zinc-900 dark:text-white">
                    Domains &amp; SSL Health Suite
                  </h1>
                  <span className="steel-pill hidden sm:inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 font-tech">
                    <Radio className="w-2.5 h-2.5 animate-pulse" /> {clientName}
                  </span>
                </div>
                <p className="text-xs text-zinc-500 dark:text-zinc-400 font-sans mt-0.5">
                  Continuous endpoint availability probes, TLS certificate expiration tracking, and DNS integrity verification
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Link
                href={`/status/${clientSlug}`}
                target="_blank"
                className="steel-pill inline-flex items-center gap-1.5 px-3 py-2 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-xs font-tech font-semibold rounded-xl transition border border-zinc-200 dark:border-zinc-700"
              >
                <Radio className="w-3.5 h-3.5 text-emerald-500" />
                <span>Public Status Page</span>
                <ExternalLink className="w-3.5 h-3.5 text-zinc-400" />
              </Link>

              <button
                type="button"
                onClick={() => void handleVerifyAll()}
                disabled={isCheckingAll || domains.length === 0}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-800 dark:text-zinc-200 font-tech font-semibold text-xs rounded-xl border border-zinc-200 dark:border-zinc-700 transition cursor-pointer disabled:opacity-50"
              >
                {isCheckingAll ? (
                  <IosSpinner size="xs" className="text-blue-500" />
                ) : (
                  <RefreshCw className="w-3.5 h-3.5 text-blue-500" />
                )}
                <span>{isCheckingAll ? "Probing All..." : "Verify All"}</span>
              </button>

              <button
                type="button"
                onClick={() => setIsRegisterOpen(true)}
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-500 active:scale-[0.99] text-white font-semibold text-xs rounded-xl transition shadow-xs cursor-pointer font-tech"
              >
                <Plus className="w-4 h-4" />
                <span>Add Domain</span>
              </button>
            </div>
          </div>

          {/* 5-Card Executive SLA Telemetry Strip */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 pt-3 border-t border-zinc-100 dark:border-zinc-800/80">
            <div className="p-3.5 rounded-xl bg-zinc-50/80 dark:bg-zinc-950/60 border border-zinc-200/70 dark:border-zinc-800/80 flex items-center justify-between">
              <div>
                <span className="steel-metric-label text-zinc-400 block text-[10px]">
                  Overall Uptime SLA
                </span>
                <span className="text-lg font-extrabold font-tech tabular-nums text-emerald-600 dark:text-emerald-400 mt-0.5 block">
                  {telemetry.overallSlaPercent}%
                </span>
              </div>
              <div className="w-8 h-8 rounded-lg bg-emerald-500/10 text-emerald-500 flex items-center justify-center">
                <Activity className="w-4 h-4" />
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-zinc-50/80 dark:bg-zinc-950/60 border border-zinc-200/70 dark:border-zinc-800/80 flex items-center justify-between">
              <div>
                <span className="steel-metric-label text-zinc-400 block text-[10px]">
                  Healthy Endpoints
                </span>
                <span className="text-lg font-extrabold font-tech tabular-nums text-zinc-900 dark:text-white mt-0.5 block">
                  {telemetry.healthyCount}
                  <span className="text-xs font-normal text-zinc-400"> / {telemetry.total}</span>
                </span>
              </div>
              <div className="w-8 h-8 rounded-lg bg-blue-500/10 text-blue-500 flex items-center justify-center">
                <CheckCircle2 className="w-4 h-4" />
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-zinc-50/80 dark:bg-zinc-950/60 border border-zinc-200/70 dark:border-zinc-800/80 flex items-center justify-between">
              <div>
                <span className="steel-metric-label text-zinc-400 block text-[10px]">
                  SSL Certificates Valid
                </span>
                <span className="text-lg font-extrabold font-tech tabular-nums text-zinc-900 dark:text-white mt-0.5 block">
                  {telemetry.sslValidCount}
                  {telemetry.sslWarningCount > 0 && (
                    <span className="text-xs font-semibold text-amber-500 ml-1.5">
                      ({telemetry.sslWarningCount} expiring)
                    </span>
                  )}
                </span>
              </div>
              <div className="w-8 h-8 rounded-lg bg-indigo-500/10 text-indigo-500 flex items-center justify-center">
                <ShieldCheck className="w-4 h-4" />
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-zinc-50/80 dark:bg-zinc-950/60 border border-zinc-200/70 dark:border-zinc-800/80 flex items-center justify-between">
              <div>
                <span className="steel-metric-label text-zinc-400 block text-[10px]">
                  Active Incidents
                </span>
                <span
                  className={`text-lg font-extrabold font-tech tabular-nums mt-0.5 block ${
                    telemetry.activeIncidentCount > 0
                      ? "text-rose-500"
                      : "text-zinc-900 dark:text-white"
                  }`}
                >
                  {telemetry.activeIncidentCount}
                </span>
              </div>
              <div className="w-8 h-8 rounded-lg bg-rose-500/10 text-rose-500 flex items-center justify-center">
                <AlertTriangle className="w-4 h-4" />
              </div>
            </div>

            <div className="col-span-2 sm:col-span-1 p-3.5 rounded-xl bg-zinc-50/80 dark:bg-zinc-950/60 border border-zinc-200/70 dark:border-zinc-800/80 flex items-center justify-between">
              <div>
                <span className="steel-metric-label text-zinc-400 block text-[10px]">
                  Avg Response Time
                </span>
                <span className="text-lg font-extrabold font-tech tabular-nums text-blue-600 dark:text-blue-400 mt-0.5 block">
                  {telemetry.avgLatency > 0 ? `${telemetry.avgLatency} ms` : "—"}
                </span>
              </div>
              <div className="w-8 h-8 rounded-lg bg-blue-500/10 text-blue-500 flex items-center justify-center">
                <Clock className="w-4 h-4" />
              </div>
            </div>
          </div>
        </div>

        {/* Active Incidents Banner */}
        {incidents.length > 0 && (
          <div className="p-4 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-xs text-rose-700 dark:text-rose-300 space-y-2">
            <div className="flex items-center gap-2 font-bold text-sm steel-heading">
              <AlertTriangle className="w-4 h-4 text-rose-600" />
              <span>Active Outage Incidents ({incidents.length})</span>
            </div>
            {incidents.map((inc) => (
              <div key={inc.id} className="pl-6 border-l-2 border-rose-400 font-tech">
                <span className="font-semibold">
                  {inc.title || `${inc.type.toUpperCase()} Failure`}:
                </span>{" "}
                {inc.reason} • Started: {formatTime(inc.startedAt)}
              </div>
            ))}
          </div>
        )}

        {/* SEARCH, STATUS FILTER PILLS & VIEW MODE SWITCHER BAR */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 bg-white dark:bg-zinc-900/90 border border-zinc-200 dark:border-zinc-800/90 rounded-2xl p-3.5 shadow-xs">
          <div className="flex flex-wrap items-center gap-2">
            {/* Search Input */}
            <div className="relative w-full sm:w-64">
              <Search className="w-3.5 h-3.5 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search domain or hostname..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 font-tech"
              />
            </div>

            {/* Status Filter Pills */}
            <div className="flex flex-wrap items-center gap-1">
              {(
                [
                  { id: "all", label: `All (${domains.length})` },
                  { id: "operational", label: `Operational (${telemetry.healthyCount})` },
                  {
                    id: "degraded_down",
                    label: `Degraded / Down (${domains.filter((d) => d.status === "down" || d.status === "degraded").length})`,
                  },
                  { id: "ssl_warning", label: `SSL Warning (${telemetry.sslWarningCount})` },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setFilterTab(tab.id)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-tech font-semibold transition cursor-pointer ${
                    filterTab === tab.id
                      ? "bg-blue-600 text-white shadow-xs"
                      : "bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          {/* View Mode Switcher: Rich Cards vs Compact Technical Table */}
          <div className="inline-flex items-center p-1 rounded-xl bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-xs font-tech self-start md:self-auto">
            <button
              type="button"
              onClick={() => setViewMode("cards")}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-semibold transition cursor-pointer ${
                viewMode === "cards"
                  ? "bg-white dark:bg-zinc-900 text-blue-600 dark:text-blue-400 shadow-xs"
                  : "text-zinc-600 dark:text-zinc-400"
              }`}
            >
              <LayoutGrid className="w-3.5 h-3.5" />
              <span>Rich Cards</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode("table")}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-semibold transition cursor-pointer ${
                viewMode === "table"
                  ? "bg-white dark:bg-zinc-900 text-blue-600 dark:text-blue-400 shadow-xs"
                  : "text-zinc-600 dark:text-zinc-400"
              }`}
            >
              <TableIcon className="w-3.5 h-3.5" />
              <span>Technical Table</span>
            </button>
          </div>
        </div>

        {/* DOMAIN ENDPOINTS DISPLAY */}
        {filteredDomains.length === 0 ? (
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-12 text-center text-zinc-400">
            <Globe className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <h3 className="text-base font-bold steel-heading text-zinc-800 dark:text-zinc-200">
              {domains.length === 0 ? "No Monitored Endpoints" : "No Matching Endpoints"}
            </h3>
            <p className="text-xs text-zinc-500 mt-1 max-w-md mx-auto font-sans">
              {domains.length === 0
                ? "You have not registered any web domains or API endpoints for monitoring yet. Add your endpoint to start automated HTTP uptime and SSL certificate tracking."
                : "No endpoints match your current search or filter criteria."}
            </p>
            {domains.length === 0 && (
              <button
                type="button"
                onClick={() => setIsRegisterOpen(true)}
                className="mt-4 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-lg transition shadow-xs font-tech cursor-pointer"
              >
                Add First Domain
              </button>
            )}
          </div>
        ) : viewMode === "cards" ? (
          /* RICH CARDS GRID */
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredDomains.map((dom) => {
              const sslPct =
                dom.sslDaysRemaining != null
                  ? Math.min(100, Math.max(5, Math.round((dom.sslDaysRemaining / 90) * 100)))
                  : 0;
              return (
                <div
                  key={dom.id}
                  onClick={() => setInspectedDomainId(dom.id)}
                  className="group bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 hover:border-blue-500/60 dark:hover:border-blue-500/60 rounded-2xl p-6 shadow-xs flex flex-col justify-between space-y-5 transition-all cursor-pointer"
                >
                  <div className="space-y-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <h3 className="steel-heading text-base text-zinc-900 dark:text-zinc-100 flex items-center gap-1.5 truncate">
                          <span className="truncate">{dom.name}</span>
                          <a
                            href={dom.targetUrl || `https://${dom.hostname}`}
                            target="_blank"
                            rel="noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="text-zinc-400 hover:text-blue-600 shrink-0"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                          </a>
                        </h3>
                        <p className="text-xs text-zinc-500 font-tech mt-0.5 truncate">
                          {dom.hostname}:{dom.port}
                        </p>
                      </div>
                      {getStatusBadge(dom.status)}
                    </div>

                    {/* SSL Certificate Lifecycle Mini Bar */}
                    <div className="space-y-1.5 pt-2 border-t border-zinc-100 dark:border-zinc-800/80">
                      <div className="flex items-center justify-between text-[11px] font-tech">
                        <span className="text-zinc-400 flex items-center gap-1">
                          <Lock className="w-3 h-3 text-blue-500" /> TLS Certificate Lifecycle
                        </span>
                        <span
                          className={`font-bold tabular-nums ${
                            dom.sslDaysRemaining == null
                              ? "text-zinc-400"
                              : dom.sslDaysRemaining <= 14
                              ? "text-rose-500"
                              : dom.sslDaysRemaining <= 30
                              ? "text-amber-500"
                              : "text-emerald-500"
                          }`}
                        >
                          {dom.sslDaysRemaining != null
                            ? `${dom.sslDaysRemaining} days left`
                            : "Pending"}
                        </span>
                      </div>
                      <div className="w-full h-1.5 bg-zinc-200 dark:bg-zinc-800 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full ${
                            dom.sslDaysRemaining != null && dom.sslDaysRemaining <= 14
                              ? "bg-rose-500"
                              : dom.sslDaysRemaining != null && dom.sslDaysRemaining <= 30
                              ? "bg-amber-500"
                              : "bg-emerald-500"
                          }`}
                          style={{ width: `${sslPct}%` }}
                        />
                      </div>
                    </div>

                    {/* Metrics grid */}
                    <div className="grid grid-cols-2 gap-3 text-xs">
                      <div className="p-3 rounded-xl bg-zinc-50 dark:bg-zinc-800/50">
                        <span className="steel-metric-label text-zinc-400 block">
                          Response Time
                        </span>
                        <span className="steel-kpi text-sm font-tech mt-0.5 block tabular-nums">
                          {dom.lastLatencyMs != null ? `${dom.lastLatencyMs} ms` : "—"}
                        </span>
                      </div>

                      <div className="p-3 rounded-xl bg-zinc-50 dark:bg-zinc-800/50">
                        <span className="steel-metric-label text-zinc-400 block">SSL Authority</span>
                        <span className="font-semibold text-xs mt-0.5 block font-tech truncate text-zinc-700 dark:text-zinc-300">
                          {dom.sslIssuer || "Standard TLS"}
                        </span>
                      </div>

                      <div className="p-3 rounded-xl bg-zinc-50 dark:bg-zinc-800/50">
                        <span className="steel-metric-label text-zinc-400 block">DNS Health</span>
                        <span
                          className={`font-semibold mt-0.5 block capitalize font-tech ${
                            dom.dnsStatus === "healthy"
                              ? "text-emerald-600 dark:text-emerald-400"
                              : dom.dnsStatus === "drift_detected"
                              ? "text-amber-500"
                              : "text-zinc-700 dark:text-zinc-300"
                          }`}
                        >
                          {dom.dnsStatus ? dom.dnsStatus.replace("_", " ") : "Pending"}
                        </span>
                      </div>

                      <div className="p-3 rounded-xl bg-zinc-50 dark:bg-zinc-800/50">
                        <span className="steel-metric-label text-zinc-400 block">
                          Domain Expiry
                        </span>
                        <span className="font-semibold mt-0.5 block text-zinc-700 dark:text-zinc-300 font-tech tabular-nums">
                          {dom.domainExpiresAt ? formatDate(dom.domainExpiresAt) : "Not fetched"}
                        </span>
                      </div>
                    </div>

                    {dom.lastHttpError && (
                      <div className="p-2.5 rounded-lg bg-rose-50 dark:bg-rose-950/40 text-[11px] text-rose-600 dark:text-rose-400 font-tech">
                        {dom.lastHttpError}
                      </div>
                    )}
                  </div>

                  <div
                    className="pt-4 border-t border-zinc-100 dark:border-zinc-800 flex items-center justify-between text-xs text-zinc-400"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <button
                      type="button"
                      onClick={() => void handleRunCheck(dom.id)}
                      disabled={checkingId === dom.id}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-lg bg-zinc-100 dark:bg-zinc-800 hover:bg-blue-50 hover:text-blue-600 dark:hover:bg-blue-950/40 dark:hover:text-blue-400 transition cursor-pointer font-tech disabled:opacity-50"
                    >
                      {checkingId === dom.id ? (
                        <IosSpinner size="xs" className="text-blue-600" />
                      ) : (
                        <RefreshCw className="w-3 h-3" />
                      )}
                      <span>{checkingId === dom.id ? "Checking..." : "Live Check"}</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setInspectedDomainId(dom.id)}
                      className="inline-flex items-center gap-1 text-blue-600 dark:text-blue-400 font-semibold hover:underline font-tech cursor-pointer"
                    >
                      <span>Inspect Endpoint</span>
                      <ArrowUpRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          /* COMPACT TECHNICAL TABLE VIEW */
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl overflow-hidden shadow-xs">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-zinc-50 dark:bg-zinc-800/40 text-zinc-500 border-b border-zinc-200 dark:border-zinc-800">
                  <tr>
                    <th className="steel-metric-label px-5 py-3.5">Endpoint / Hostname</th>
                    <th className="steel-metric-label px-5 py-3.5">Status</th>
                    <th className="steel-metric-label px-5 py-3.5">HTTP Latency</th>
                    <th className="steel-metric-label px-5 py-3.5">TLS / SSL Lifecycle</th>
                    <th className="steel-metric-label px-5 py-3.5">DNS Status</th>
                    <th className="steel-metric-label px-5 py-3.5">Domain Expiry</th>
                    <th className="steel-metric-label px-5 py-3.5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800 font-tech">
                  {filteredDomains.map((dom) => (
                    <tr
                      key={dom.id}
                      onClick={() => setInspectedDomainId(dom.id)}
                      className="hover:bg-zinc-50/80 dark:hover:bg-zinc-800/30 cursor-pointer transition"
                    >
                      <td className="px-5 py-4">
                        <div className="font-steel font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-1.5">
                          {dom.name}
                          <a
                            href={dom.targetUrl || `https://${dom.hostname}`}
                            target="_blank"
                            rel="noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="text-zinc-400 hover:text-blue-500"
                          >
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        </div>
                        <div className="text-[11px] text-zinc-400 mt-0.5">
                          {dom.hostname}:{dom.port}
                        </div>
                      </td>
                      <td className="px-5 py-4">{getStatusBadge(dom.status, true)}</td>
                      <td className="px-5 py-4 tabular-nums">
                        {dom.lastLatencyMs != null ? (
                          <span className="font-semibold text-zinc-800 dark:text-zinc-200">
                            {dom.lastLatencyMs} ms
                          </span>
                        ) : (
                          <span className="text-zinc-400">—</span>
                        )}
                      </td>
                      <td className="px-5 py-4">
                        {dom.sslDaysRemaining != null ? (
                          <div>
                            <span
                              className={`font-semibold ${
                                dom.sslDaysRemaining <= 14
                                  ? "text-rose-500"
                                  : dom.sslDaysRemaining <= 30
                                  ? "text-amber-500"
                                  : "text-emerald-500"
                              }`}
                            >
                              {dom.sslDaysRemaining} days left
                            </span>
                            {dom.sslIssuer && (
                              <div className="text-[10px] text-zinc-400 truncate max-w-[140px]">
                                {dom.sslIssuer}
                              </div>
                            )}
                          </div>
                        ) : (
                          <span className="text-zinc-400">Pending</span>
                        )}
                      </td>
                      <td className="px-5 py-4">
                        <span
                          className={`capitalize font-semibold ${
                            dom.dnsStatus === "healthy"
                              ? "text-emerald-500"
                              : dom.dnsStatus === "drift_detected"
                              ? "text-amber-500"
                              : "text-zinc-400"
                          }`}
                        >
                          {dom.dnsStatus ? dom.dnsStatus.replace("_", " ") : "Pending"}
                        </span>
                      </td>
                      <td className="px-5 py-4 tabular-nums">
                        {dom.domainExpiresAt ? formatDate(dom.domainExpiresAt) : "Not fetched"}
                      </td>
                      <td
                        className="px-5 py-4 text-right"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="inline-flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => void handleRunCheck(dom.id)}
                            disabled={checkingId === dom.id}
                            className="px-2.5 py-1 rounded-lg border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-xs font-semibold transition cursor-pointer"
                          >
                            {checkingId === dom.id ? "Checking..." : "Verify"}
                          </button>
                          <button
                            type="button"
                            onClick={() => setInspectedDomainId(dom.id)}
                            className="px-2.5 py-1 rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400 hover:bg-blue-500/20 text-xs font-semibold transition cursor-pointer"
                          >
                            Details
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>

      {/* INTERACTIVE DOMAIN INSPECTOR DRAWER / MODAL */}
      {inspectedDomain && (
        <div
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-end"
          onClick={() => setInspectedDomainId(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-white dark:bg-zinc-900 border-l border-zinc-200 dark:border-zinc-800 w-full max-w-xl h-full overflow-y-auto p-6 shadow-2xl flex flex-col justify-between space-y-6"
          >
            <div className="space-y-6">
              {/* Drawer Header */}
              <div className="flex items-start justify-between gap-4 pb-4 border-b border-zinc-200 dark:border-zinc-800">
                <div>
                  <div className="flex items-center gap-2.5">
                    <h2 className="text-lg font-bold steel-heading text-zinc-900 dark:text-white">
                      {inspectedDomain.name}
                    </h2>
                    {getStatusBadge(inspectedDomain.status, true)}
                  </div>
                  <div className="flex items-center gap-2 text-xs font-tech text-zinc-500 mt-1">
                    <span>
                      {inspectedDomain.hostname}:{inspectedDomain.port}
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        copyToClipboard(
                          inspectedDomain.hostname,
                          `drawer-host-${inspectedDomain.id}`
                        )
                      }
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-[11px] text-zinc-600 dark:text-zinc-300 cursor-pointer"
                    >
                      {copiedText === `drawer-host-${inspectedDomain.id}` ? (
                        <>
                          <Check className="w-3 h-3 text-emerald-500" /> Copied
                        </>
                      ) : (
                        <>
                          <Copy className="w-3 h-3" /> Copy
                        </>
                      )}
                    </button>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setInspectedDomainId(null)}
                  className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Verify Endpoint Action Banner */}
              <div className="p-4 rounded-2xl bg-blue-50/60 dark:bg-blue-950/30 border border-blue-200/80 dark:border-blue-900/60 flex items-center justify-between gap-3">
                <div className="text-xs">
                  <div className="font-bold text-zinc-900 dark:text-white font-tech">
                    On-Demand Socket &amp; TLS Inspection
                  </div>
                  <div className="text-zinc-500 dark:text-zinc-400 mt-0.5">
                    Last checked: {formatRelativeTime(inspectedDomain.lastHttpCheckAt)}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => void handleRunCheck(inspectedDomain.id)}
                  disabled={checkingId === inspectedDomain.id}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-tech font-semibold transition cursor-pointer disabled:opacity-50 shrink-0 shadow-xs"
                >
                  {checkingId === inspectedDomain.id ? (
                    <IosSpinner size="xs" className="text-white" />
                  ) : (
                    <RefreshCw className="w-3.5 h-3.5" />
                  )}
                  <span>
                    {checkingId === inspectedDomain.id
                      ? "Probing..."
                      : "Verify Endpoint Now"}
                  </span>
                </button>
              </div>

              {/* SSL Certificate Lifecycle Section */}
              <div className="p-4 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-950/50 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold font-tech flex items-center gap-1.5 text-zinc-900 dark:text-white">
                    <Lock className="w-4 h-4 text-blue-500" /> SSL / TLS Certificate Lifecycle
                  </span>
                  <span
                    className={`text-xs font-bold font-tech ${
                      inspectedDomain.sslDaysRemaining != null &&
                      inspectedDomain.sslDaysRemaining <= 14
                        ? "text-rose-500"
                        : inspectedDomain.sslDaysRemaining != null &&
                          inspectedDomain.sslDaysRemaining <= 30
                        ? "text-amber-500"
                        : "text-emerald-500"
                    }`}
                  >
                    {inspectedDomain.sslDaysRemaining != null
                      ? `${inspectedDomain.sslDaysRemaining} days remaining`
                      : "Pending TLS check"}
                  </span>
                </div>

                <div className="w-full h-2.5 bg-zinc-200 dark:bg-zinc-800 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full ${
                      inspectedDomain.sslDaysRemaining != null &&
                      inspectedDomain.sslDaysRemaining <= 14
                        ? "bg-rose-500"
                        : inspectedDomain.sslDaysRemaining != null &&
                          inspectedDomain.sslDaysRemaining <= 30
                        ? "bg-amber-500"
                        : "bg-emerald-500"
                    }`}
                    style={{
                      width:
                        inspectedDomain.sslDaysRemaining != null
                          ? `${Math.min(
                              100,
                              Math.max(5, Math.round((inspectedDomain.sslDaysRemaining / 90) * 100))
                            )}%`
                          : "0%",
                    }}
                  />
                </div>

                <div className="grid grid-cols-2 gap-3 pt-1 text-xs font-tech">
                  <div>
                    <span className="text-[10px] uppercase text-zinc-400 block">Certificate Issuer</span>
                    <span className="font-semibold text-zinc-800 dark:text-zinc-200">
                      {inspectedDomain.sslIssuer || "Automated TLS Authority"}
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] uppercase text-zinc-400 block">SSL Status</span>
                    <span className="font-semibold uppercase text-zinc-800 dark:text-zinc-200">
                      {inspectedDomain.sslStatus || "Pending"}
                    </span>
                  </div>
                </div>
              </div>

              {/* HTTP, DNS & RDAP Details Grid */}
              <div className="grid grid-cols-2 gap-3 text-xs font-tech">
                <div className="p-3.5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-950/50">
                  <span className="text-[10px] uppercase text-zinc-400 block">
                    HTTP Response Latency
                  </span>
                  <span className="text-base font-extrabold text-zinc-900 dark:text-white mt-0.5 block tabular-nums">
                    {inspectedDomain.lastLatencyMs != null
                      ? `${inspectedDomain.lastLatencyMs} ms`
                      : "—"}
                  </span>
                </div>

                <div className="p-3.5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-950/50">
                  <span className="text-[10px] uppercase text-zinc-400 block">
                    DNS Verification
                  </span>
                  <span className="text-base font-extrabold capitalize text-zinc-900 dark:text-white mt-0.5 block">
                    {inspectedDomain.dnsStatus
                      ? inspectedDomain.dnsStatus.replace("_", " ")
                      : "Pending"}
                  </span>
                </div>

                <div className="p-3.5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-950/50">
                  <span className="text-[10px] uppercase text-zinc-400 block">
                    Domain Registrar
                  </span>
                  <span className="text-sm font-bold text-zinc-900 dark:text-white mt-0.5 block truncate">
                    {inspectedDomain.domainRegistrar || "Not queried"}
                  </span>
                </div>

                <div className="p-3.5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-950/50">
                  <span className="text-[10px] uppercase text-zinc-400 block">
                    Registration Expiry
                  </span>
                  <span className="text-sm font-bold text-zinc-900 dark:text-zinc-200 mt-0.5 block tabular-nums">
                    {inspectedDomain.domainExpiresAt
                      ? formatDate(inspectedDomain.domainExpiresAt)
                      : "Not fetched"}
                  </span>
                </div>
              </div>

              {/* Incident History for this Domain */}
              <div className="space-y-2.5">
                <h3 className="text-xs font-bold uppercase tracking-wider font-tech text-zinc-400">
                  Endpoint Incident History
                </h3>
                {inspectedDomainIncidents.length > 0 || inspectedDomain.lastHttpError ? (
                  <div className="space-y-2">
                    {inspectedDomain.lastHttpError && (
                      <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-xs text-rose-600 dark:text-rose-400 font-tech">
                        <strong>HTTP Probe Fault:</strong> {inspectedDomain.lastHttpError}
                      </div>
                    )}
                    {inspectedDomainIncidents.map((inc) => (
                      <div
                        key={inc.id}
                        className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-xs text-rose-700 dark:text-rose-300 font-tech"
                      >
                        <div className="font-bold">
                          {inc.title || `${inc.type.toUpperCase()} Incident`} ({inc.severity})
                        </div>
                        <div className="mt-0.5">{inc.reason}</div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="p-4 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-950/50 text-xs text-zinc-500 flex items-center gap-2 font-tech">
                    <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                    <span>Zero active outage or certificate incidents recorded for this endpoint.</span>
                  </div>
                )}
              </div>
            </div>

            <div className="pt-4 border-t border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
              <Link
                href={`/status/${clientSlug}`}
                target="_blank"
                className="inline-flex items-center gap-1.5 text-xs font-tech font-semibold text-blue-600 dark:text-blue-400 hover:underline"
              >
                <span>Open Public Status Page</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </Link>
              <button
                type="button"
                onClick={() => setInspectedDomainId(null)}
                className="px-4 py-2 rounded-xl bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-xs font-tech font-semibold transition cursor-pointer"
              >
                Close Inspector
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Register Domain Modal */}
      {isRegisterOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl max-w-md w-full p-6 shadow-xl space-y-4">
            <div className="flex items-center justify-between border-b border-zinc-200 dark:border-zinc-800 pb-3">
              <h3 className="steel-heading text-lg">Add Endpoint for Monitoring</h3>
              <button
                type="button"
                onClick={() => setIsRegisterOpen(false)}
                className="text-zinc-400 hover:text-zinc-600 transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {formError && (
              <div className="p-3 rounded-lg bg-rose-50 dark:bg-rose-950/40 text-xs text-rose-600 border border-rose-200 dark:border-rose-900 font-tech">
                {formError}
              </div>
            )}

            <form onSubmit={handleRegister} className="space-y-3 text-xs">
              <div>
                <label className="block font-semibold mb-1 steel-metric-label">
                  Friendly Name *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Production Web App"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 focus:outline-none focus:ring-2 focus:ring-blue-500 font-sans"
                />
              </div>

              <div>
                <label className="block font-semibold mb-1 steel-metric-label">
                  Hostname (FQDN) *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. app.mycompany.com"
                  value={formHostname}
                  onChange={(e) => setFormHostname(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 focus:outline-none focus:ring-2 focus:ring-blue-500 font-tech"
                />
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div className="col-span-2">
                  <label className="block font-semibold mb-1 steel-metric-label">Target URL</label>
                  <input
                    type="text"
                    placeholder="https://app.mycompany.com"
                    value={formTargetUrl}
                    onChange={(e) => setFormTargetUrl(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 focus:outline-none focus:ring-2 focus:ring-blue-500 font-tech"
                  />
                </div>
                <div>
                  <label className="block font-semibold mb-1 steel-metric-label">Port</label>
                  <input
                    type="number"
                    value={formPort}
                    onChange={(e) => setFormPort(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 font-tech"
                  />
                </div>
              </div>

              <div className="pt-3 border-t border-zinc-200 dark:border-zinc-800 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsRegisterOpen(false)}
                  className="px-4 py-2 border border-zinc-200 dark:border-zinc-800 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 transition font-sans cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition font-tech cursor-pointer disabled:opacity-50"
                >
                  {isSubmitting ? "Adding..." : "Add Endpoint"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

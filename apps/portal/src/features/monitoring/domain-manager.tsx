"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import {
  Globe,
  Plus,
  RefreshCw,
  Trash2,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Clock,
  ShieldCheck,
  ShieldAlert,
  X,
  ExternalLink,
  Activity,
  Layers,
  Search,
  Download,
  Copy,
  Check,
  Server,
  Radio,
  ArrowUpDown,
  ChevronRight,
  Lock,
  Network,
  FileCode2,
  Sparkles,
  Calendar,
  Building2,
  SlidersHorizontal,
} from "lucide-react";
import { useAlert } from "@/components/ui/alert-popup";
import { IosSpinner } from "@/components/ui/ios-spinner";
import { formatDate } from "@/lib/format";

export interface SerializedDomain {
  id: string;
  clientId: string;
  name: string;
  hostname: string;
  targetUrl: string;
  port: number;
  status: "up" | "degraded" | "down" | "paused" | "pending";
  consecutiveFailures: number;
  lastHttpCheckAt: number | null;
  lastHttpStatus: number | null;
  lastLatencyMs: number | null;
  lastHttpError: string | null;
  lastSslCheckAt: number | null;
  sslStatus: "valid" | "expiring_soon" | "expired" | "invalid" | "unreachable" | null;
  sslExpiresAt: number | null;
  sslDaysRemaining: number | null;
  sslIssuer: string | null;
  lastDnsCheckAt: number | null;
  dnsStatus: "healthy" | "drift_detected" | "resolution_failed" | null;
  dnsDriftDetails: string | null;
  resolvedIp: string | null;
  lastRdapCheckAt: number | null;
  domainExpiresAt: number | null;
  domainRegistrar: string | null;
  createdAt: number;
}

export interface ClientOption {
  id: string;
  name: string;
}

interface DomainManagerProps {
  initialDomains: SerializedDomain[];
  clients: ClientOption[];
}

type SidebarFilterPill = "all" | "up" | "down" | "ssl_expiring";
type WorkspaceMode = "inspector" | "matrix";
type MatrixSortKey = "name" | "client" | "status" | "latency" | "sslDays" | "dns" | "expires";

function formatRelativeTime(timestamp: number | null): string {
  if (!timestamp) return "Never checked";
  const diffSec = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDays = Math.floor(diffHr / 24);
  return `${diffDays}d ago`;
}

export function DomainManager({ initialDomains, clients }: DomainManagerProps) {
  const { showSuccess, showError } = useAlert();
  const [domains, setDomains] = useState<SerializedDomain[]>(initialDomains);
  const [selectedDomainId, setSelectedDomainId] = useState<string | null>(
    initialDomains[0]?.id ?? null
  );
  const [workspaceMode, setWorkspaceMode] = useState<WorkspaceMode>("inspector");

  // Filters & Search
  const [searchTerm, setSearchTerm] = useState("");
  const [tenantFilter, setTenantFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<SidebarFilterPill>("all");

  // Matrix Table Sorting & Bulk Selection
  const [sortKey, setSortKey] = useState<MatrixSortKey>("name");
  const [sortAsc, setSortAsc] = useState<boolean>(true);
  const [selectedDomainIds, setSelectedDomainIds] = useState<string[]>([]);

  // Action Loading States
  const [isRegisterOpen, setIsRegisterOpen] = useState(false);
  const [checkingId, setCheckingId] = useState<string | null>(null);
  const [checkingSubType, setCheckingSubType] = useState<string | null>(null);
  const [isRunningBulkCheck, setIsRunningBulkCheck] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Registration Form State
  const [formClientId, setFormClientId] = useState(clients[0]?.id || "");
  const [formName, setFormName] = useState("");
  const [formHostname, setFormHostname] = useState("");
  const [formTargetUrl, setFormTargetUrl] = useState("");
  const [formPort, setFormPort] = useState("443");
  const [formError, setFormError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Executive Telemetry Metrics
  const telemetry = useMemo(() => {
    const total = domains.length;
    const healthyUp = domains.filter((d) => d.status === "up").length;
    const sslWarningOrCritical = domains.filter(
      (d) =>
        d.sslStatus === "expiring_soon" ||
        d.sslStatus === "expired" ||
        d.sslStatus === "invalid" ||
        (d.sslDaysRemaining != null && d.sslDaysRemaining <= 21)
    ).length;
    const activeIncidents = domains.filter(
      (d) =>
        d.status === "down" ||
        d.status === "degraded" ||
        d.dnsStatus === "resolution_failed" ||
        d.dnsStatus === "drift_detected" ||
        d.consecutiveFailures > 0
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
      healthyUp,
      sslWarningOrCritical,
      activeIncidents,
      avgLatency,
    };
  }, [domains]);

  const filteredDomains = useMemo(() => {
    return domains.filter((d) => {
      const clientName = clients.find((c) => c.id === d.clientId)?.name || "";
      const q = searchTerm.toLowerCase().trim();
      const matchesSearch =
        !q ||
        d.name.toLowerCase().includes(q) ||
        d.hostname.toLowerCase().includes(q) ||
        (d.resolvedIp || "").toLowerCase().includes(q) ||
        clientName.toLowerCase().includes(q);

      const matchesTenant = tenantFilter === "all" || d.clientId === tenantFilter;

      let matchesStatus = true;
      if (statusFilter === "up") {
        matchesStatus = d.status === "up";
      } else if (statusFilter === "down") {
        matchesStatus = d.status === "down" || d.status === "degraded";
      } else if (statusFilter === "ssl_expiring") {
        matchesStatus =
          d.sslStatus === "expiring_soon" ||
          d.sslStatus === "expired" ||
          d.sslStatus === "invalid" ||
          (d.sslDaysRemaining != null && d.sslDaysRemaining <= 30);
      }

      return matchesSearch && matchesTenant && matchesStatus;
    });
  }, [domains, clients, searchTerm, tenantFilter, statusFilter]);

  const sortedMatrixDomains = useMemo(() => {
    const list = [...filteredDomains];
    list.sort((a, b) => {
      let cmp = 0;
      if (sortKey === "name") {
        cmp = a.name.localeCompare(b.name);
      } else if (sortKey === "client") {
        const ca = clients.find((c) => c.id === a.clientId)?.name || a.clientId;
        const cb = clients.find((c) => c.id === b.clientId)?.name || b.clientId;
        cmp = ca.localeCompare(cb);
      } else if (sortKey === "status") {
        cmp = a.status.localeCompare(b.status);
      } else if (sortKey === "latency") {
        cmp = (a.lastLatencyMs ?? 999999) - (b.lastLatencyMs ?? 999999);
      } else if (sortKey === "sslDays") {
        cmp = (a.sslDaysRemaining ?? 9999) - (b.sslDaysRemaining ?? 9999);
      } else if (sortKey === "dns") {
        cmp = (a.dnsStatus || "zzz").localeCompare(b.dnsStatus || "zzz");
      } else if (sortKey === "expires") {
        cmp = (a.domainExpiresAt ?? Number.MAX_SAFE_INTEGER) - (b.domainExpiresAt ?? Number.MAX_SAFE_INTEGER);
      }
      return sortAsc ? cmp : -cmp;
    });
    return list;
  }, [filteredDomains, clients, sortKey, sortAsc]);

  const selectedDomain = useMemo(() => {
    if (!selectedDomainId) return filteredDomains[0] ?? domains[0] ?? null;
    return domains.find((d) => d.id === selectedDomainId) ?? filteredDomains[0] ?? domains[0] ?? null;
  }, [domains, filteredDomains, selectedDomainId]);

  function copyToClipboard(text: string, key: string) {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 1800);
  }

  function handleSort(key: MatrixSortKey) {
    if (sortKey === key) {
      setSortAsc((prev) => !prev);
    } else {
      setSortKey(key);
      setSortAsc(true);
    }
  }

  function toggleSelectDomain(id: string) {
    setSelectedDomainIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  }

  function toggleSelectAllFiltered() {
    if (selectedDomainIds.length === sortedMatrixDomains.length) {
      setSelectedDomainIds([]);
    } else {
      setSelectedDomainIds(sortedMatrixDomains.map((d) => d.id));
    }
  }

  function handleExportData(format: "csv" | "json") {
    const targetList = filteredDomains.length > 0 ? filteredDomains : domains;
    if (format === "json") {
      const blob = new Blob([JSON.stringify(targetList, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `rsl-domains-telemetry-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      return;
    }

    const headers = [
      "ID",
      "Name",
      "Hostname",
      "Port",
      "Client",
      "Status",
      "HTTP Code",
      "Latency (ms)",
      "SSL Status",
      "SSL Days Remaining",
      "SSL Issuer",
      "DNS Status",
      "Resolved IP",
      "Registrar",
      "Domain Expires At",
    ];
    const rows = targetList.map((d) => {
      const clientName = clients.find((c) => c.id === d.clientId)?.name || d.clientId;
      return [
        d.id,
        `"${d.name.replace(/"/g, '""')}"`,
        d.hostname,
        d.port,
        `"${clientName.replace(/"/g, '""')}"`,
        d.status,
        d.lastHttpStatus ?? "",
        d.lastLatencyMs ?? "",
        d.sslStatus ?? "",
        d.sslDaysRemaining ?? "",
        `"${(d.sslIssuer || "").replace(/"/g, '""')}"`,
        d.dnsStatus ?? "",
        d.resolvedIp ?? "",
        `"${(d.domainRegistrar || "").replace(/"/g, '""')}"`,
        d.domainExpiresAt ? new Date(d.domainExpiresAt).toISOString() : "",
      ].join(",");
    });

    const csv = [headers.join(","), ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `rsl-domains-telemetry-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    setFormError("");
    setIsSubmitting(true);

    try {
      const res = await fetch("/api/v1/admin/domains", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientId: formClientId,
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
      setSelectedDomainId(data.domain.id);
      setIsRegisterOpen(false);
      const targetClient = clients.find((c) => c.id === formClientId);
      showSuccess(
        "Monitored Domain Enrolled",
        `Domain '${data.domain.name}' (${data.domain.hostname}) is enrolled into the automated daemon check cycle (HTTP uptime, SSL certificate validity, DNS drift, and RDAP registration).`,
        [
          { label: "Domain Name", value: data.domain.name },
          { label: "Hostname", value: data.domain.hostname, copyable: true },
          { label: "Client", value: targetClient?.name || "Client" },
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

  function resetForm() {
    setFormName("");
    setFormHostname("");
    setFormTargetUrl("");
    setFormPort("443");
    setFormError("");
  }

  async function handleRunCheck(
    domainId: string,
    checkType: "all" | "http" | "ssl" | "dns" | "rdap" = "all",
    silent = false
  ) {
    setCheckingId(domainId);
    setCheckingSubType(checkType);
    const targetDomain = domains.find((d) => d.id === domainId);
    try {
      const res = await fetch(`/api/v1/admin/domains/${domainId}/check`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ checkType }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Manual check execution failed");
      }

      if (data.domain) {
        setDomains((prev) => prev.map((d) => (d.id === domainId ? data.domain : d)));
        const d = data.domain as SerializedDomain;
        if (!silent) {
          showSuccess(
            "Diagnostics Check Complete",
            `Live ${checkType.toUpperCase()} inspection completed for '${d.hostname}'. Status: ${d.status.toUpperCase()}.`,
            [
              { label: "Hostname", value: d.hostname },
              {
                label: "HTTP Status",
                value: d.lastHttpStatus ? `${d.lastHttpStatus} (${d.lastLatencyMs ?? 0}ms)` : "N/A",
              },
              {
                label: "SSL Certificate",
                value: d.sslStatus
                  ? `${d.sslStatus.toUpperCase()} (${d.sslDaysRemaining ?? 0} days left)`
                  : "N/A",
              },
              {
                label: "DNS Resolution",
                value: d.dnsStatus
                  ? `${d.dnsStatus.toUpperCase()} (${d.resolvedIp ?? "No IP"})`
                  : "N/A",
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
      throw err;
    } finally {
      setCheckingId(null);
      setCheckingSubType(null);
    }
  }

  async function handleBulkRunChecks(targetIds?: string[]) {
    const idsToCheck =
      targetIds && targetIds.length > 0 ? targetIds : filteredDomains.map((d) => d.id);
    if (idsToCheck.length === 0) return;

    setIsRunningBulkCheck(true);
    let completed = 0;
    let failed = 0;

    try {
      await Promise.all(
        idsToCheck.map(async (id) => {
          try {
            await handleRunCheck(id, "all", true);
            completed++;
          } catch {
            failed++;
          }
        })
      );

      if (failed === 0) {
        showSuccess(
          "Fleet Verification Complete",
          `Successfully executed HTTP, TLS/SSL, DNS, and RDAP probes across ${completed} domain(s).`
        );
      } else {
        showError(
          "Fleet Verification Partially Complete",
          `Completed ${completed} domain check(s); ${failed} encountered probe errors.`
        );
      }
      if (targetIds) setSelectedDomainIds([]);
    } finally {
      setIsRunningBulkCheck(false);
    }
  }

  async function handleDeleteDomain(domainId: string) {
    const targetDomain = domains.find((d) => d.id === domainId);
    if (
      !confirm(
        `Are you sure you want to delete '${targetDomain?.hostname || "this domain"}' from monitoring?`
      )
    )
      return;

    try {
      const res = await fetch(`/api/v1/admin/domains/${domainId}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to delete domain");
      }

      setDomains((prev) => prev.filter((d) => d.id !== domainId));
      if (selectedDomainId === domainId) {
        const remaining = domains.filter((d) => d.id !== domainId);
        setSelectedDomainId(remaining[0]?.id ?? null);
      }
      showSuccess(
        "Domain Removed",
        `Domain '${targetDomain?.hostname || domainId}' was removed from monitoring.`
      );
    } catch (err: any) {
      showError("Delete Failed", err.message);
    }
  }

  function getStatusBadge(status: string, compact = false) {
    const sizeClasses = compact ? "px-2 py-0.5 text-[10px]" : "px-2.5 py-1 text-xs";
    switch (status) {
      case "up":
        return (
          <span
            className={`steel-pill inline-flex items-center gap-1.5 ${sizeClasses} rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 font-tech font-semibold`}
          >
            <CheckCircle2 className="w-3 h-3" /> Up
          </span>
        );
      case "degraded":
        return (
          <span
            className={`steel-pill inline-flex items-center gap-1.5 ${sizeClasses} rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 font-tech font-semibold`}
          >
            <AlertTriangle className="w-3 h-3" /> Degraded
          </span>
        );
      case "down":
        return (
          <span
            className={`steel-pill inline-flex items-center gap-1.5 ${sizeClasses} rounded-full bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20 font-tech font-semibold`}
          >
            <XCircle className="w-3 h-3" /> Down
          </span>
        );
      case "paused":
        return (
          <span
            className={`steel-pill inline-flex items-center gap-1.5 ${sizeClasses} rounded-full bg-zinc-500/10 text-zinc-500 border border-zinc-500/20 font-tech font-semibold`}
          >
            <Clock className="w-3 h-3" /> Paused
          </span>
        );
      default:
        return (
          <span
            className={`steel-pill inline-flex items-center gap-1.5 ${sizeClasses} rounded-full bg-blue-500/10 text-blue-500 border border-blue-500/20 font-tech font-semibold`}
          >
            <Clock className="w-3 h-3" /> Pending
          </span>
        );
    }
  }

  function getSslBadge(status: string | null, days: number | null) {
    if (!status) return <span className="font-tech text-zinc-400 text-xs">Pending</span>;
    if (status === "valid") {
      return (
        <span className="steel-pill inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-tech text-xs font-semibold">
          <ShieldCheck className="w-3.5 h-3.5" /> {days != null ? `${days}d left` : "Valid"}
        </span>
      );
    }
    if (status === "expiring_soon") {
      return (
        <span className="steel-pill inline-flex items-center gap-1 text-amber-600 dark:text-amber-400 font-tech text-xs font-semibold">
          <ShieldAlert className="w-3.5 h-3.5" /> Expiring ({days}d)
        </span>
      );
    }
    return (
      <span className="steel-pill inline-flex items-center gap-1 text-rose-600 dark:text-rose-400 font-tech text-xs font-semibold">
        <XCircle className="w-3.5 h-3.5" /> {status}
      </span>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 flex flex-col">
      <main className="flex-1 w-full px-4 sm:px-6 lg:px-8 xl:px-10 py-6 space-y-5">
        {/* TOP EXECUTIVE TELEMETRY BAR & COMMAND HEADER */}
        <div className="bg-white dark:bg-zinc-900/90 border border-zinc-200 dark:border-zinc-800/90 rounded-2xl p-4 sm:p-5 shadow-xs space-y-4">
          <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4">
            <div className="flex items-center gap-3.5">
              <div className="w-11 h-11 rounded-xl bg-blue-50 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400 flex items-center justify-center border border-blue-200/60 dark:border-blue-800/60 shadow-xs shrink-0">
                <Globe className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2.5">
                  <h1 className="text-lg sm:text-xl font-bold steel-heading text-zinc-900 dark:text-white">
                    Domain &amp; SSL Command Suite
                  </h1>
                  <span className="steel-pill hidden sm:inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20 font-tech">
                    <Radio className="w-2.5 h-2.5 animate-pulse" /> MULTI-PROBE ENGINE
                  </span>
                </div>
                <p className="text-xs text-zinc-500 dark:text-zinc-400 font-sans mt-0.5">
                  Continuous HTTP uptime probes, TLS/SSL certificate lifecycle, DNS drift detection, and RDAP registration telemetry
                </p>
              </div>
            </div>

            {/* Command Actions */}
            <div className="flex flex-wrap items-center gap-2">
              {/* View Switcher: Deep Inspector vs Full Matrix Table */}
              <div className="inline-flex items-center p-1 rounded-xl bg-zinc-100 dark:bg-zinc-800/90 border border-zinc-200 dark:border-zinc-700/80 text-xs font-tech">
                <button
                  type="button"
                  onClick={() => setWorkspaceMode("inspector")}
                  className={`px-3 py-1.5 rounded-lg font-semibold transition cursor-pointer ${
                    workspaceMode === "inspector"
                      ? "bg-white dark:bg-zinc-900 text-blue-600 dark:text-blue-400 shadow-xs"
                      : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200"
                  }`}
                >
                  Deep Inspector
                </button>
                <button
                  type="button"
                  onClick={() => setWorkspaceMode("matrix")}
                  className={`px-3 py-1.5 rounded-lg font-semibold transition cursor-pointer ${
                    workspaceMode === "matrix"
                      ? "bg-white dark:bg-zinc-900 text-blue-600 dark:text-blue-400 shadow-xs"
                      : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200"
                  }`}
                >
                  Fleet Matrix ({filteredDomains.length})
                </button>
              </div>

              {/* Export CSV/JSON */}
              <div className="inline-flex items-center rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 overflow-hidden text-xs font-tech">
                <button
                  type="button"
                  onClick={() => handleExportData("csv")}
                  className="inline-flex items-center gap-1.5 px-3 py-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300 font-semibold transition cursor-pointer"
                  title="Export filtered domains to CSV"
                >
                  <Download className="w-3.5 h-3.5 text-zinc-400" />
                  <span>CSV</span>
                </button>
                <div className="w-px h-4 bg-zinc-200 dark:bg-zinc-800" />
                <button
                  type="button"
                  onClick={() => handleExportData("json")}
                  className="inline-flex items-center gap-1.5 px-2.5 py-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300 font-semibold transition cursor-pointer"
                  title="Export filtered domains to JSON"
                >
                  <span>JSON</span>
                </button>
              </div>

              {/* Run All Checks Now */}
              <button
                type="button"
                onClick={() => void handleBulkRunChecks()}
                disabled={isRunningBulkCheck || domains.length === 0}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-800 dark:text-zinc-100 text-xs font-tech font-semibold transition cursor-pointer disabled:opacity-50"
              >
                {isRunningBulkCheck ? (
                  <IosSpinner size="xs" className="text-blue-500" />
                ) : (
                  <RefreshCw className="w-3.5 h-3.5 text-blue-500" />
                )}
                <span>{isRunningBulkCheck ? "Probing Fleet..." : "Run All Checks Now"}</span>
              </button>

              {/* Register Domain */}
              <button
                type="button"
                onClick={() => setIsRegisterOpen(true)}
                className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 active:scale-[0.99] text-white font-semibold text-xs rounded-xl transition shadow-xs cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span className="font-tech font-bold">Register Domain</span>
              </button>
            </div>
          </div>

          {/* Executive Telemetry Strip (5 KPI Cards) */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 pt-2 border-t border-zinc-100 dark:border-zinc-800/80">
            <div className="p-3 rounded-xl bg-zinc-50/80 dark:bg-zinc-950/60 border border-zinc-200/70 dark:border-zinc-800/80 flex items-center justify-between">
              <div>
                <span className="steel-metric-label text-zinc-400 block text-[10px]">
                  Total Monitored
                </span>
                <span className="text-lg font-extrabold font-tech tabular-nums text-zinc-900 dark:text-white mt-0.5 block">
                  {telemetry.total}
                </span>
              </div>
              <div className="w-8 h-8 rounded-lg bg-blue-500/10 text-blue-500 flex items-center justify-center">
                <Globe className="w-4 h-4" />
              </div>
            </div>

            <div className="p-3 rounded-xl bg-zinc-50/80 dark:bg-zinc-950/60 border border-zinc-200/70 dark:border-zinc-800/80 flex items-center justify-between">
              <div>
                <span className="steel-metric-label text-zinc-400 block text-[10px]">
                  Healthy / Up
                </span>
                <span className="text-lg font-extrabold font-tech tabular-nums text-emerald-600 dark:text-emerald-400 mt-0.5 block">
                  {telemetry.healthyUp}
                  <span className="text-xs font-normal text-zinc-400 ml-1">
                    ({telemetry.total > 0 ? Math.round((telemetry.healthyUp / telemetry.total) * 100) : 100}%)
                  </span>
                </span>
              </div>
              <div className="w-8 h-8 rounded-lg bg-emerald-500/10 text-emerald-500 flex items-center justify-center">
                <CheckCircle2 className="w-4 h-4" />
              </div>
            </div>

            <div className="p-3 rounded-xl bg-zinc-50/80 dark:bg-zinc-950/60 border border-zinc-200/70 dark:border-zinc-800/80 flex items-center justify-between">
              <div>
                <span className="steel-metric-label text-zinc-400 block text-[10px]">
                  SSL Expiring / Alert
                </span>
                <span
                  className={`text-lg font-extrabold font-tech tabular-nums mt-0.5 block ${
                    telemetry.sslWarningOrCritical > 0
                      ? "text-amber-500"
                      : "text-zinc-900 dark:text-white"
                  }`}
                >
                  {telemetry.sslWarningOrCritical}
                </span>
              </div>
              <div className="w-8 h-8 rounded-lg bg-amber-500/10 text-amber-500 flex items-center justify-center">
                <ShieldAlert className="w-4 h-4" />
              </div>
            </div>

            <div className="p-3 rounded-xl bg-zinc-50/80 dark:bg-zinc-950/60 border border-zinc-200/70 dark:border-zinc-800/80 flex items-center justify-between">
              <div>
                <span className="steel-metric-label text-zinc-400 block text-[10px]">
                  Active Incidents
                </span>
                <span
                  className={`text-lg font-extrabold font-tech tabular-nums mt-0.5 block ${
                    telemetry.activeIncidents > 0
                      ? "text-rose-500"
                      : "text-zinc-900 dark:text-white"
                  }`}
                >
                  {telemetry.activeIncidents}
                </span>
              </div>
              <div className="w-8 h-8 rounded-lg bg-rose-500/10 text-rose-500 flex items-center justify-center">
                <AlertTriangle className="w-4 h-4" />
              </div>
            </div>

            <div className="col-span-2 sm:col-span-1 p-3 rounded-xl bg-zinc-50/80 dark:bg-zinc-950/60 border border-zinc-200/70 dark:border-zinc-800/80 flex items-center justify-between">
              <div>
                <span className="steel-metric-label text-zinc-400 block text-[10px]">
                  Avg HTTP Latency
                </span>
                <span className="text-lg font-extrabold font-tech tabular-nums text-blue-600 dark:text-blue-400 mt-0.5 block">
                  {telemetry.avgLatency > 0 ? `${telemetry.avgLatency} ms` : "—"}
                </span>
              </div>
              <div className="w-8 h-8 rounded-lg bg-blue-500/10 text-blue-500 flex items-center justify-center">
                <Activity className="w-4 h-4" />
              </div>
            </div>
          </div>
        </div>

        {/* MASTER-DETAIL INDEPENDENT SCROLL WORKSPACE */}
        <div className="flex flex-col lg:flex-row items-stretch gap-6 lg:h-[calc(100vh-14.5rem)] lg:overflow-hidden">
          {/* LEFT SIDEBAR: Domain Registry */}
          <aside className="w-full lg:w-80 xl:w-96 shrink-0 flex flex-col bg-white dark:bg-zinc-900/90 border border-zinc-200 dark:border-zinc-800/90 rounded-2xl shadow-xs overflow-hidden lg:h-full">
            {/* Sidebar Search & Filter Header */}
            <div className="p-4 border-b border-zinc-200 dark:border-zinc-800 space-y-3 shrink-0">
              <div className="flex items-center justify-between">
                <span className="steel-metric-label text-zinc-500 dark:text-zinc-400">
                  Domain Registry ({filteredDomains.length}/{domains.length})
                </span>
                {tenantFilter !== "all" || statusFilter !== "all" || searchTerm ? (
                  <button
                    type="button"
                    onClick={() => {
                      setSearchTerm("");
                      setTenantFilter("all");
                      setStatusFilter("all");
                    }}
                    className="text-[11px] font-tech text-blue-500 hover:underline cursor-pointer"
                  >
                    Reset Filters
                  </button>
                ) : null}
              </div>

              {/* Search Input */}
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Search hostname, IP, or client..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-8 pr-3 py-1.5 text-xs rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 focus:outline-none focus:ring-1 focus:ring-blue-500 font-tech"
                />
              </div>

              {/* Tenant Filter Dropdown */}
              <select
                value={tenantFilter}
                onChange={(e) => setTenantFilter(e.target.value)}
                className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 focus:outline-none focus:ring-1 focus:ring-blue-500 font-tech text-zinc-700 dark:text-zinc-300"
              >
                <option value="all">All Client Organizations ({clients.length})</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>

              {/* Status Filter Pills */}
              <div className="grid grid-cols-4 gap-1 pt-0.5">
                {(
                  [
                    { id: "all", label: "All" },
                    { id: "up", label: "Up" },
                    { id: "down", label: "Down" },
                    { id: "ssl_expiring", label: "SSL Alert" },
                  ] as const
                ).map((pill) => (
                  <button
                    key={pill.id}
                    type="button"
                    onClick={() => setStatusFilter(pill.id)}
                    className={`px-2 py-1 rounded-lg text-[11px] font-tech font-semibold transition cursor-pointer text-center ${
                      statusFilter === pill.id
                        ? "bg-blue-600 text-white shadow-xs"
                        : "bg-zinc-100 dark:bg-zinc-800/80 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-800"
                    }`}
                  >
                    {pill.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Scrollable Domain Cards List */}
            <div className="flex-1 overflow-y-auto p-3 space-y-2.5 max-h-[420px] lg:max-h-none">
              {filteredDomains.length === 0 ? (
                <div className="p-8 text-center text-zinc-400">
                  <Globe className="w-8 h-8 mx-auto mb-2 opacity-30" />
                  <p className="text-xs font-sans">No domains match the current filter.</p>
                </div>
              ) : (
                filteredDomains.map((dom) => {
                  const isSelected = selectedDomain?.id === dom.id && workspaceMode === "inspector";
                  const client = clients.find((c) => c.id === dom.clientId);
                  const isChecking = checkingId === dom.id;

                  return (
                    <div
                      key={dom.id}
                      onClick={() => {
                        setSelectedDomainId(dom.id);
                        setWorkspaceMode("inspector");
                      }}
                      className={`group rounded-xl p-3.5 border transition-all cursor-pointer ${
                        isSelected
                          ? "bg-blue-50/60 dark:bg-blue-950/25 border-blue-500/80 dark:border-blue-500/70 shadow-sm ring-1 ring-blue-500/30"
                          : "bg-zinc-50/60 dark:bg-zinc-950/50 border-zinc-200/80 dark:border-zinc-800/80 hover:border-zinc-300 dark:hover:border-zinc-700"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span
                              className={`w-2 h-2 rounded-full shrink-0 ${
                                dom.status === "up"
                                  ? "bg-emerald-500"
                                  : dom.status === "degraded"
                                  ? "bg-amber-500"
                                  : dom.status === "down"
                                  ? "bg-rose-500 animate-ping"
                                  : "bg-zinc-400"
                              }`}
                            />
                            <h3 className="font-steel font-bold text-sm text-zinc-900 dark:text-zinc-100 truncate">
                              {dom.name}
                            </h3>
                            <ChevronRight
                              className={`w-3.5 h-3.5 transition-transform shrink-0 ${
                                isSelected
                                  ? "text-blue-500 translate-x-0.5"
                                  : "text-zinc-400 opacity-0 group-hover:opacity-100"
                              }`}
                            />
                          </div>
                          <p className="text-[11px] text-zinc-500 font-tech truncate mt-0.5">
                            {dom.hostname}:{dom.port}
                          </p>
                        </div>
                        {getStatusBadge(dom.status, true)}
                      </div>

                      {/* Badges Strip: Client, Latency, SSL Days, Quick Check */}
                      <div className="mt-3 pt-2.5 border-t border-zinc-200/60 dark:border-zinc-800/70 flex items-center justify-between gap-2 text-[11px] font-tech">
                        <div className="flex flex-wrap items-center gap-1.5 min-w-0">
                          <span className="px-1.5 py-0.5 rounded bg-zinc-200/70 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 truncate max-w-[110px]">
                            {client?.name || dom.clientId}
                          </span>

                          {dom.lastLatencyMs != null && (
                            <span
                              className={`px-1.5 py-0.5 rounded tabular-nums font-semibold ${
                                dom.lastLatencyMs > 800
                                  ? "bg-amber-500/10 text-amber-500"
                                  : "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                              }`}
                            >
                              {dom.lastLatencyMs}ms
                            </span>
                          )}

                          {dom.sslDaysRemaining != null && (
                            <span
                              className={`px-1.5 py-0.5 rounded tabular-nums font-semibold ${
                                dom.sslDaysRemaining <= 14
                                  ? "bg-rose-500/10 text-rose-500"
                                  : dom.sslDaysRemaining <= 30
                                  ? "bg-amber-500/10 text-amber-500"
                                  : "bg-blue-500/10 text-blue-600 dark:text-blue-400"
                              }`}
                            >
                              SSL {dom.sslDaysRemaining}d
                            </span>
                          )}
                        </div>

                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            void handleRunCheck(dom.id, "all");
                          }}
                          disabled={isChecking}
                          className="p-1.5 rounded-lg hover:bg-zinc-200/70 dark:hover:bg-zinc-800 text-zinc-500 hover:text-blue-500 transition cursor-pointer shrink-0"
                          title="Run Live Probe Check"
                        >
                          {isChecking ? (
                            <IosSpinner size="xs" className="text-blue-500" />
                          ) : (
                            <RefreshCw className="w-3.5 h-3.5" />
                          )}
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </aside>

          {/* RIGHT DETAIL WORKSPACE: Independently Scrollable */}
          <section className="flex-1 min-w-0 w-full lg:h-full lg:overflow-y-auto space-y-5 pr-0.5">
            {workspaceMode === "matrix" ? (
              /* FULL FLEET MATRIX TABLE VIEW */
              <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl overflow-hidden shadow-xs">
                <div className="p-4 sm:p-5 border-b border-zinc-200 dark:border-zinc-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <h2 className="text-base font-bold steel-heading text-zinc-900 dark:text-white">
                      Full Fleet Domain Matrix
                    </h2>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400">
                      Sortable multi-tenant endpoint directory with batch verification controls
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {selectedDomainIds.length > 0 && (
                      <button
                        type="button"
                        onClick={() => void handleBulkRunChecks(selectedDomainIds)}
                        disabled={isRunningBulkCheck}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-tech font-semibold transition cursor-pointer"
                      >
                        {isRunningBulkCheck ? (
                          <IosSpinner size="xs" className="text-white" />
                        ) : (
                          <RefreshCw className="w-3.5 h-3.5" />
                        )}
                        <span>Verify Selected ({selectedDomainIds.length})</span>
                      </button>
                    )}

                    <select
                      value={tenantFilter}
                      onChange={(e) => setTenantFilter(e.target.value)}
                      className="px-3 py-1.5 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-lg text-xs font-tech"
                    >
                      <option value="all">All Tenants</option>
                      {clients.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {sortedMatrixDomains.length === 0 ? (
                  <div className="p-12 text-center text-zinc-400 text-sm">
                    <Globe className="w-10 h-10 mx-auto mb-3 opacity-30" />
                    <p className="font-sans">No monitored domains found matching your filter.</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-zinc-50 dark:bg-zinc-800/40 text-zinc-500 border-b border-zinc-200 dark:border-zinc-800">
                        <tr>
                          <th className="px-4 py-3.5 w-10">
                            <input
                              type="checkbox"
                              checked={
                                sortedMatrixDomains.length > 0 &&
                                selectedDomainIds.length === sortedMatrixDomains.length
                              }
                              onChange={toggleSelectAllFiltered}
                              className="rounded border-zinc-300 dark:border-zinc-700"
                            />
                          </th>
                          <th
                            onClick={() => handleSort("name")}
                            className="steel-metric-label px-4 py-3.5 cursor-pointer hover:text-zinc-900 dark:hover:text-white"
                          >
                            <span className="inline-flex items-center gap-1">
                              Domain / Host <ArrowUpDown className="w-3 h-3" />
                            </span>
                          </th>
                          <th
                            onClick={() => handleSort("client")}
                            className="steel-metric-label px-4 py-3.5 cursor-pointer hover:text-zinc-900 dark:hover:text-white"
                          >
                            <span className="inline-flex items-center gap-1">
                              Organization <ArrowUpDown className="w-3 h-3" />
                            </span>
                          </th>
                          <th
                            onClick={() => handleSort("latency")}
                            className="steel-metric-label px-4 py-3.5 cursor-pointer hover:text-zinc-900 dark:hover:text-white"
                          >
                            <span className="inline-flex items-center gap-1">
                              HTTP / Latency <ArrowUpDown className="w-3 h-3" />
                            </span>
                          </th>
                          <th
                            onClick={() => handleSort("sslDays")}
                            className="steel-metric-label px-4 py-3.5 cursor-pointer hover:text-zinc-900 dark:hover:text-white"
                          >
                            <span className="inline-flex items-center gap-1">
                              TLS / SSL <ArrowUpDown className="w-3 h-3" />
                            </span>
                          </th>
                          <th
                            onClick={() => handleSort("dns")}
                            className="steel-metric-label px-4 py-3.5 cursor-pointer hover:text-zinc-900 dark:hover:text-white"
                          >
                            <span className="inline-flex items-center gap-1">
                              DNS Resolution <ArrowUpDown className="w-3 h-3" />
                            </span>
                          </th>
                          <th
                            onClick={() => handleSort("expires")}
                            className="steel-metric-label px-4 py-3.5 cursor-pointer hover:text-zinc-900 dark:hover:text-white"
                          >
                            <span className="inline-flex items-center gap-1">
                              RDAP Expiry <ArrowUpDown className="w-3 h-3" />
                            </span>
                          </th>
                          <th className="steel-metric-label px-4 py-3.5 text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                        {sortedMatrixDomains.map((dom) => {
                          const client = clients.find((c) => c.id === dom.clientId);
                          const isChecked = selectedDomainIds.includes(dom.id);
                          return (
                            <tr
                              key={dom.id}
                              onClick={() => {
                                setSelectedDomainId(dom.id);
                                setWorkspaceMode("inspector");
                              }}
                              className="hover:bg-zinc-50/80 dark:hover:bg-zinc-800/30 cursor-pointer transition"
                            >
                              <td
                                className="px-4 py-3.5"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  toggleSelectDomain(dom.id);
                                }}
                              >
                                <input
                                  type="checkbox"
                                  checked={isChecked}
                                  onChange={() => {}}
                                  className="rounded border-zinc-300 dark:border-zinc-700"
                                />
                              </td>
                              <td className="px-4 py-3.5">
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
                                <div className="text-[11px] text-zinc-400 font-tech mt-0.5">
                                  {dom.hostname}:{dom.port}
                                </div>
                              </td>

                              <td className="px-4 py-3.5">
                                <span className="font-medium text-zinc-700 dark:text-zinc-300">
                                  {client?.name || dom.clientId}
                                </span>
                              </td>

                              <td className="px-4 py-3.5">
                                <div className="flex items-center gap-2">
                                  {getStatusBadge(dom.status, true)}
                                  {dom.lastLatencyMs != null && (
                                    <span className="text-[11px] text-zinc-400 font-tech font-semibold tabular-nums">
                                      {dom.lastLatencyMs}ms
                                    </span>
                                  )}
                                </div>
                                {dom.lastHttpError && (
                                  <div className="text-[10px] text-rose-500 mt-1 truncate max-w-xs font-tech">
                                    {dom.lastHttpError}
                                  </div>
                                )}
                              </td>

                              <td className="px-4 py-3.5">
                                {getSslBadge(dom.sslStatus, dom.sslDaysRemaining)}
                                {dom.sslIssuer && (
                                  <div className="text-[10px] text-zinc-400 mt-0.5 truncate max-w-[140px]">
                                    {dom.sslIssuer}
                                  </div>
                                )}
                              </td>

                              <td className="px-4 py-3.5">
                                {dom.dnsStatus === "healthy" ? (
                                  <span className="text-emerald-600 dark:text-emerald-400 font-medium font-tech">
                                    Healthy
                                  </span>
                                ) : dom.dnsStatus === "drift_detected" ? (
                                  <span className="text-amber-600 dark:text-amber-400 font-medium font-tech">
                                    Drift Detected
                                  </span>
                                ) : dom.dnsStatus ? (
                                  <span className="text-rose-600 font-medium font-tech">
                                    {dom.dnsStatus}
                                  </span>
                                ) : (
                                  <span className="text-zinc-400 font-tech">Pending</span>
                                )}
                                {dom.resolvedIp && (
                                  <div className="text-[10px] text-zinc-400 font-mono mt-0.5">
                                    {dom.resolvedIp}
                                  </div>
                                )}
                              </td>

                              <td className="px-4 py-3.5 font-tech">
                                {dom.domainExpiresAt ? (
                                  <div className="text-zinc-700 dark:text-zinc-300">
                                    {formatDate(dom.domainExpiresAt)}
                                  </div>
                                ) : (
                                  <span className="text-zinc-400">Not fetched</span>
                                )}
                                {dom.domainRegistrar && (
                                  <div className="text-[10px] text-zinc-400 truncate max-w-[120px]">
                                    {dom.domainRegistrar}
                                  </div>
                                )}
                              </td>

                              <td
                                className="px-4 py-3.5 text-right"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <div className="flex items-center justify-end gap-1.5">
                                  <button
                                    type="button"
                                    onClick={() => void handleRunCheck(dom.id, "all")}
                                    disabled={checkingId === dom.id}
                                    className="p-1.5 rounded-lg border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition cursor-pointer"
                                    title="Run Checks Now"
                                  >
                                    {checkingId === dom.id ? (
                                      <IosSpinner size="xs" className="text-blue-500" />
                                    ) : (
                                      <RefreshCw className="w-3.5 h-3.5" />
                                    )}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => void handleDeleteDomain(dom.id)}
                                    className="p-1.5 rounded-lg border border-zinc-200 dark:border-zinc-800 hover:bg-rose-50 dark:hover:bg-rose-950/40 text-rose-500 transition cursor-pointer"
                                    title="Delete Domain"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
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
            ) : selectedDomain ? (
              /* SELECTED DOMAIN DEEP INSPECTOR VIEW */
              <>
                {/* 1. Domain Command Header Banner */}
                <div className="bg-white dark:bg-zinc-900/90 border border-zinc-200 dark:border-zinc-800/90 rounded-2xl p-5 shadow-xs space-y-4">
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-zinc-200 dark:border-zinc-800">
                    <div className="space-y-1.5">
                      <div className="flex flex-wrap items-center gap-2.5">
                        <h2 className="text-xl font-bold steel-heading text-zinc-900 dark:text-white">
                          {selectedDomain.name}
                        </h2>
                        {getStatusBadge(selectedDomain.status)}
                        <span className="steel-pill inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 font-tech">
                          <Building2 className="w-3 h-3 text-blue-500" />
                          {clients.find((c) => c.id === selectedDomain.clientId)?.name ||
                            selectedDomain.clientId}
                        </span>
                      </div>

                      <div className="flex flex-wrap items-center gap-2 text-xs font-tech text-zinc-400">
                        <span>
                          FQDN:{" "}
                          <strong className="text-zinc-800 dark:text-zinc-200">
                            {selectedDomain.hostname}:{selectedDomain.port}
                          </strong>
                        </span>
                        <button
                          type="button"
                          onClick={() =>
                            copyToClipboard(selectedDomain.hostname, `host-${selectedDomain.id}`)
                          }
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-[11px] text-zinc-600 dark:text-zinc-300 transition cursor-pointer"
                        >
                          {copiedKey === `host-${selectedDomain.id}` ? (
                            <>
                              <Check className="w-3 h-3 text-emerald-500" /> Copied
                            </>
                          ) : (
                            <>
                              <Copy className="w-3 h-3" /> Copy Host
                            </>
                          )}
                        </button>
                        <span>·</span>
                        <a
                          href={selectedDomain.targetUrl || `https://${selectedDomain.hostname}`}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 text-blue-600 dark:text-blue-400 hover:underline"
                        >
                          <span>{selectedDomain.targetUrl || `https://${selectedDomain.hostname}`}</span>
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      </div>
                    </div>

                    {/* Targeted Probe Action Buttons */}
                    <div className="flex flex-wrap items-center gap-2">
                      <Link
                        href={`/status/${selectedDomain.clientId}`}
                        target="_blank"
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800/80 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-xs font-tech font-semibold text-zinc-700 dark:text-zinc-300 transition"
                      >
                        <Radio className="w-3.5 h-3.5 text-emerald-500" />
                        <span>Public Status Page</span>
                        <ExternalLink className="w-3 h-3 text-zinc-400" />
                      </Link>

                      <button
                        type="button"
                        onClick={() => void handleRunCheck(selectedDomain.id, "all")}
                        disabled={checkingId === selectedDomain.id}
                        className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-tech font-semibold transition cursor-pointer disabled:opacity-50 shadow-xs"
                      >
                        {checkingId === selectedDomain.id && checkingSubType === "all" ? (
                          <IosSpinner size="xs" className="text-white" />
                        ) : (
                          <RefreshCw className="w-3.5 h-3.5" />
                        )}
                        <span>Run Full Probe Suite</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => void handleDeleteDomain(selectedDomain.id)}
                        className="p-2 rounded-xl border border-zinc-200 dark:border-zinc-800 hover:bg-rose-50 dark:hover:bg-rose-950/40 text-rose-500 transition cursor-pointer"
                        title="Remove Domain from Monitoring"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {/* Individual Sub-Probe Trigger Bar */}
                  <div className="flex flex-wrap items-center justify-between gap-2 pt-1 text-xs font-tech">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-zinc-400 mr-1">Targeted Probes:</span>
                      {(
                        [
                          { type: "http", label: "HTTP Uptime" },
                          { type: "ssl", label: "TLS / SSL" },
                          { type: "dns", label: "DNS Drift" },
                          { type: "rdap", label: "RDAP WHOIS" },
                        ] as const
                      ).map((probe) => (
                        <button
                          key={probe.type}
                          type="button"
                          onClick={() => void handleRunCheck(selectedDomain.id, probe.type)}
                          disabled={checkingId === selectedDomain.id}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 hover:border-blue-500/50 hover:text-blue-500 transition cursor-pointer disabled:opacity-50"
                        >
                          {checkingId === selectedDomain.id && checkingSubType === probe.type ? (
                            <IosSpinner size="xs" className="text-blue-500" />
                          ) : (
                            <RefreshCw className="w-3 h-3" />
                          )}
                          <span>{probe.label}</span>
                        </button>
                      ))}
                    </div>

                    <span className="text-[11px] text-zinc-400">
                      Last HTTP Check: {formatRelativeTime(selectedDomain.lastHttpCheckAt)}
                    </span>
                  </div>
                </div>

                {/* 2. Deep Inspector 4-Card Diagnostic Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  {/* Card A: HTTP Uptime & Response Status */}
                  <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-5 shadow-xs flex flex-col justify-between space-y-4">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-2.5">
                        <div className="w-9 h-9 rounded-xl bg-emerald-500/10 text-emerald-500 flex items-center justify-center border border-emerald-500/20">
                          <Activity className="w-4 h-4" />
                        </div>
                        <div>
                          <h3 className="font-steel font-bold text-sm text-zinc-900 dark:text-white">
                            HTTP Uptime &amp; Latency Probe
                          </h3>
                          <p className="text-[11px] text-zinc-400 font-tech">
                            Checked {formatRelativeTime(selectedDomain.lastHttpCheckAt)}
                          </p>
                        </div>
                      </div>
                      {getStatusBadge(selectedDomain.status, true)}
                    </div>

                    <div className="grid grid-cols-3 gap-3 pt-2 border-t border-zinc-100 dark:border-zinc-800/80 font-tech">
                      <div className="p-3 rounded-xl bg-zinc-50 dark:bg-zinc-950/70 border border-zinc-200/60 dark:border-zinc-800/70">
                        <span className="text-[10px] uppercase text-zinc-400 block">Status Code</span>
                        <span
                          className={`text-base font-extrabold tabular-nums mt-0.5 block ${
                            selectedDomain.lastHttpStatus &&
                            selectedDomain.lastHttpStatus >= 200 &&
                            selectedDomain.lastHttpStatus < 400
                              ? "text-emerald-500"
                              : selectedDomain.lastHttpStatus
                              ? "text-rose-500"
                              : "text-zinc-400"
                          }`}
                        >
                          {selectedDomain.lastHttpStatus ? `HTTP ${selectedDomain.lastHttpStatus}` : "—"}
                        </span>
                      </div>

                      <div className="p-3 rounded-xl bg-zinc-50 dark:bg-zinc-950/70 border border-zinc-200/60 dark:border-zinc-800/70">
                        <span className="text-[10px] uppercase text-zinc-400 block">Latency</span>
                        <span className="text-base font-extrabold tabular-nums text-zinc-900 dark:text-white mt-0.5 block">
                          {selectedDomain.lastLatencyMs != null
                            ? `${selectedDomain.lastLatencyMs} ms`
                            : "—"}
                        </span>
                      </div>

                      <div className="p-3 rounded-xl bg-zinc-50 dark:bg-zinc-950/70 border border-zinc-200/60 dark:border-zinc-800/70">
                        <span className="text-[10px] uppercase text-zinc-400 block">Failures</span>
                        <span
                          className={`text-base font-extrabold tabular-nums mt-0.5 block ${
                            selectedDomain.consecutiveFailures > 0
                              ? "text-rose-500"
                              : "text-emerald-500"
                          }`}
                        >
                          {selectedDomain.consecutiveFailures} streak
                        </span>
                      </div>
                    </div>

                    {selectedDomain.lastHttpError ? (
                      <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-xs text-rose-600 dark:text-rose-400 font-tech">
                        <strong>Last HTTP Fault:</strong> {selectedDomain.lastHttpError}
                      </div>
                    ) : (
                      <div className="p-2.5 rounded-xl bg-emerald-500/5 border border-emerald-500/20 text-xs text-emerald-600 dark:text-emerald-400 font-tech flex items-center gap-2">
                        <CheckCircle2 className="w-4 h-4 shrink-0" />
                        <span>Endpoint responding within nominal SLA latency thresholds.</span>
                      </div>
                    )}
                  </div>

                  {/* Card B: SSL Certificate Health & Lifecycle Countdown */}
                  <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-5 shadow-xs flex flex-col justify-between space-y-4">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-2.5">
                        <div className="w-9 h-9 rounded-xl bg-blue-500/10 text-blue-500 flex items-center justify-center border border-blue-500/20">
                          <Lock className="w-4 h-4" />
                        </div>
                        <div>
                          <h3 className="font-steel font-bold text-sm text-zinc-900 dark:text-white">
                            TLS / SSL Certificate Lifecycle
                          </h3>
                          <p className="text-[11px] text-zinc-400 font-tech">
                            Checked {formatRelativeTime(selectedDomain.lastSslCheckAt)}
                          </p>
                        </div>
                      </div>
                      {getSslBadge(selectedDomain.sslStatus, selectedDomain.sslDaysRemaining)}
                    </div>

                    {/* Visual SSL Countdown Progress Bar */}
                    <div className="space-y-1.5 pt-2 border-t border-zinc-100 dark:border-zinc-800/80">
                      <div className="flex items-center justify-between text-xs font-tech">
                        <span className="text-zinc-400">Certificate Validity Window (90d standard)</span>
                        <span className="font-bold text-zinc-900 dark:text-white tabular-nums">
                          {selectedDomain.sslDaysRemaining != null
                            ? `${selectedDomain.sslDaysRemaining} days remaining`
                            : "Awaiting TLS Handshake"}
                        </span>
                      </div>
                      <div className="w-full h-2.5 bg-zinc-200 dark:bg-zinc-800 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all duration-500 ${
                            selectedDomain.sslDaysRemaining == null
                              ? "w-0"
                              : selectedDomain.sslDaysRemaining <= 14
                              ? "bg-rose-500"
                              : selectedDomain.sslDaysRemaining <= 30
                              ? "bg-amber-500"
                              : "bg-emerald-500"
                          }`}
                          style={{
                            width:
                              selectedDomain.sslDaysRemaining != null
                                ? `${Math.min(100, Math.max(5, Math.round((selectedDomain.sslDaysRemaining / 90) * 100)))}%`
                                : "0%",
                          }}
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3 text-xs font-tech">
                      <div className="p-3 rounded-xl bg-zinc-50 dark:bg-zinc-950/70 border border-zinc-200/60 dark:border-zinc-800/70">
                        <span className="text-[10px] uppercase text-zinc-400 block">Certificate Authority</span>
                        <span className="font-bold text-zinc-800 dark:text-zinc-200 mt-0.5 block truncate">
                          {selectedDomain.sslIssuer || "Not inspected"}
                        </span>
                      </div>
                      <div className="p-3 rounded-xl bg-zinc-50 dark:bg-zinc-950/70 border border-zinc-200/60 dark:border-zinc-800/70">
                        <span className="text-[10px] uppercase text-zinc-400 block">Expiration Date</span>
                        <span className="font-bold text-zinc-800 dark:text-zinc-200 mt-0.5 block">
                          {selectedDomain.sslExpiresAt
                            ? formatDate(selectedDomain.sslExpiresAt)
                            : "—"}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Card C: DNS Resolution & Drift Inspector */}
                  <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-5 shadow-xs flex flex-col justify-between space-y-4">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-2.5">
                        <div className="w-9 h-9 rounded-xl bg-indigo-500/10 text-indigo-500 flex items-center justify-center border border-indigo-500/20">
                          <Network className="w-4 h-4" />
                        </div>
                        <div>
                          <h3 className="font-steel font-bold text-sm text-zinc-900 dark:text-white">
                            DNS Resolution &amp; Drift Inspector
                          </h3>
                          <p className="text-[11px] text-zinc-400 font-tech">
                            Checked {formatRelativeTime(selectedDomain.lastDnsCheckAt)}
                          </p>
                        </div>
                      </div>
                      <span
                        className={`steel-pill inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-tech font-semibold ${
                          selectedDomain.dnsStatus === "healthy"
                            ? "bg-emerald-500/10 text-emerald-500 border border-emerald-500/20"
                            : selectedDomain.dnsStatus === "drift_detected"
                            ? "bg-amber-500/10 text-amber-500 border border-amber-500/20"
                            : selectedDomain.dnsStatus
                            ? "bg-rose-500/10 text-rose-500 border border-rose-500/20"
                            : "bg-zinc-500/10 text-zinc-400"
                        }`}
                      >
                        {selectedDomain.dnsStatus
                          ? selectedDomain.dnsStatus.replace("_", " ").toUpperCase()
                          : "PENDING"}
                      </span>
                    </div>

                    <div className="p-3.5 rounded-xl bg-zinc-50 dark:bg-zinc-950/70 border border-zinc-200/60 dark:border-zinc-800/70 flex items-center justify-between font-tech">
                      <div>
                        <span className="text-[10px] uppercase text-zinc-400 block">
                          Primary Resolved A/AAAA Record
                        </span>
                        <span className="text-sm font-bold text-zinc-900 dark:text-white font-mono mt-0.5 block">
                          {selectedDomain.resolvedIp || "Unresolved / Pending DNS query"}
                        </span>
                      </div>
                      {selectedDomain.resolvedIp && (
                        <button
                          type="button"
                          onClick={() =>
                            copyToClipboard(
                              selectedDomain.resolvedIp!,
                              `ip-${selectedDomain.id}`
                            )
                          }
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-zinc-200/70 dark:bg-zinc-800 hover:bg-zinc-300 dark:hover:bg-zinc-700 text-xs transition cursor-pointer"
                        >
                          {copiedKey === `ip-${selectedDomain.id}` ? (
                            <>
                              <Check className="w-3 h-3 text-emerald-500" /> Copied
                            </>
                          ) : (
                            <>
                              <Copy className="w-3 h-3" /> Copy IP
                            </>
                          )}
                        </button>
                      )}
                    </div>

                    {selectedDomain.dnsDriftDetails ? (
                      <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900 text-xs text-amber-700 dark:text-amber-300 font-tech">
                        <strong>DNS Drift Alert:</strong> {selectedDomain.dnsDriftDetails}
                      </div>
                    ) : (
                      <div className="text-xs text-zinc-500 dark:text-zinc-400 font-sans">
                        Authoritative nameserver records match expected baseline routing with zero IP drift detected.
                      </div>
                    )}
                  </div>

                  {/* Card D: Domain Registration (RDAP) & Governance */}
                  <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-5 shadow-xs flex flex-col justify-between space-y-4">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-2.5">
                        <div className="w-9 h-9 rounded-xl bg-purple-500/10 text-purple-500 flex items-center justify-center border border-purple-500/20">
                          <Calendar className="w-4 h-4" />
                        </div>
                        <div>
                          <h3 className="font-steel font-bold text-sm text-zinc-900 dark:text-white">
                            Domain Registration (RDAP)
                          </h3>
                          <p className="text-[11px] text-zinc-400 font-tech">
                            Checked {formatRelativeTime(selectedDomain.lastRdapCheckAt)}
                          </p>
                        </div>
                      </div>
                      <span className="steel-pill px-2.5 py-0.5 rounded-full text-[11px] bg-purple-500/10 text-purple-500 border border-purple-500/20 font-tech font-semibold">
                        WHOIS / RDAP
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-3 pt-2 border-t border-zinc-100 dark:border-zinc-800/80 font-tech text-xs">
                      <div className="p-3 rounded-xl bg-zinc-50 dark:bg-zinc-950/70 border border-zinc-200/60 dark:border-zinc-800/70">
                        <span className="text-[10px] uppercase text-zinc-400 block">
                          Sponsoring Registrar
                        </span>
                        <span className="font-bold text-zinc-800 dark:text-zinc-200 mt-0.5 block truncate">
                          {selectedDomain.domainRegistrar || "Not queried"}
                        </span>
                      </div>

                      <div className="p-3 rounded-xl bg-zinc-50 dark:bg-zinc-950/70 border border-zinc-200/60 dark:border-zinc-800/70">
                        <span className="text-[10px] uppercase text-zinc-400 block">
                          Registration Expiry
                        </span>
                        <span className="font-bold text-zinc-800 dark:text-zinc-200 mt-0.5 block">
                          {selectedDomain.domainExpiresAt
                            ? formatDate(selectedDomain.domainExpiresAt)
                            : "Not queried"}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center justify-between text-xs text-zinc-400 font-tech pt-1">
                      <span>Enrolled: {formatDate(selectedDomain.createdAt)}</span>
                      <span>TLS Port: {selectedDomain.port}</span>
                    </div>
                  </div>
                </div>

                {/* 3. Incident History Timeline & Probe Configuration */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
                  <div className="lg:col-span-2 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-5 shadow-xs space-y-4">
                    <div className="flex items-center justify-between">
                      <h3 className="font-steel font-bold text-sm text-zinc-900 dark:text-white flex items-center gap-2">
                        <AlertTriangle className="w-4 h-4 text-amber-500" />
                        <span>Incident &amp; Anomaly Timeline</span>
                      </h3>
                      <span className="text-[11px] font-tech text-zinc-400">
                        Real-time fault correlation
                      </span>
                    </div>

                    {selectedDomain.status === "down" ||
                    selectedDomain.status === "degraded" ||
                    selectedDomain.lastHttpError ||
                    selectedDomain.dnsStatus === "drift_detected" ||
                    selectedDomain.sslStatus === "expiring_soon" ||
                    selectedDomain.sslStatus === "expired" ? (
                      <div className="space-y-3">
                        {selectedDomain.lastHttpError && (
                          <div className="p-3.5 rounded-xl bg-rose-50/70 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900/70 flex items-start gap-3">
                            <XCircle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
                            <div className="text-xs space-y-1">
                              <div className="font-bold text-rose-700 dark:text-rose-300 font-tech">
                                HTTP Probe Alert ({selectedDomain.consecutiveFailures} consecutive failure(s))
                              </div>
                              <p className="text-rose-600 dark:text-rose-400 font-mono">
                                {selectedDomain.lastHttpError}
                              </p>
                            </div>
                          </div>
                        )}

                        {(selectedDomain.sslStatus === "expiring_soon" ||
                          selectedDomain.sslStatus === "expired" ||
                          selectedDomain.sslStatus === "invalid") && (
                          <div className="p-3.5 rounded-xl bg-amber-50/70 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/70 flex items-start gap-3">
                            <ShieldAlert className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                            <div className="text-xs space-y-1">
                              <div className="font-bold text-amber-700 dark:text-amber-300 font-tech">
                                SSL Certificate Warning ({selectedDomain.sslStatus.toUpperCase()})
                              </div>
                              <p className="text-amber-600 dark:text-amber-400">
                                Certificate expires in {selectedDomain.sslDaysRemaining ?? 0} days (Issuer:{" "}
                                {selectedDomain.sslIssuer || "Unknown"}). Renew via Certbot/ACME.
                              </p>
                            </div>
                          </div>
                        )}

                        {selectedDomain.dnsDriftDetails && (
                          <div className="p-3.5 rounded-xl bg-amber-50/70 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/70 flex items-start gap-3">
                            <Network className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                            <div className="text-xs space-y-1">
                              <div className="font-bold text-amber-700 dark:text-amber-300 font-tech">
                                DNS Resolution Drift
                              </div>
                              <p className="text-amber-600 dark:text-amber-400 font-mono">
                                {selectedDomain.dnsDriftDetails}
                              </p>
                            </div>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="p-6 rounded-xl bg-zinc-50 dark:bg-zinc-950/60 border border-zinc-200/60 dark:border-zinc-800/70 text-center space-y-2">
                        <CheckCircle2 className="w-7 h-7 text-emerald-500 mx-auto" />
                        <div className="text-xs font-bold font-tech text-zinc-800 dark:text-zinc-200">
                          Zero Active Incidents Detected
                        </div>
                        <p className="text-xs text-zinc-500 max-w-md mx-auto">
                          All HTTP availability probes, TLS certificate chains, and DNS A/AAAA records are operating normally.
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Probe Configuration Summary Card */}
                  <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-5 shadow-xs space-y-3">
                    <h3 className="font-steel font-bold text-sm text-zinc-900 dark:text-white flex items-center gap-2">
                      <SlidersHorizontal className="w-4 h-4 text-blue-500" />
                      <span>Check Configuration</span>
                    </h3>
                    <div className="space-y-2.5 text-xs font-tech pt-1">
                      <div className="flex justify-between py-1.5 border-b border-zinc-100 dark:border-zinc-800">
                        <span className="text-zinc-400">Domain ID</span>
                        <span className="text-zinc-700 dark:text-zinc-300 truncate max-w-[150px]">
                          {selectedDomain.id}
                        </span>
                      </div>
                      <div className="flex justify-between py-1.5 border-b border-zinc-100 dark:border-zinc-800">
                        <span className="text-zinc-400">Target URL</span>
                        <span className="text-zinc-700 dark:text-zinc-300 truncate max-w-[160px]">
                          {selectedDomain.targetUrl || `https://${selectedDomain.hostname}`}
                        </span>
                      </div>
                      <div className="flex justify-between py-1.5 border-b border-zinc-100 dark:border-zinc-800">
                        <span className="text-zinc-400">TLS Socket Port</span>
                        <span className="text-zinc-700 dark:text-zinc-300">{selectedDomain.port}</span>
                      </div>
                      <div className="flex justify-between py-1.5">
                        <span className="text-zinc-400">Daemon Schedule</span>
                        <span className="text-emerald-500 font-semibold">Active (60s HTTP / 6h SSL)</span>
                      </div>
                    </div>
                  </div>
                </div>
              </>
            ) : (
              <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-12 text-center text-zinc-400">
                <Globe className="w-12 h-12 mx-auto mb-3 opacity-30" />
                <p className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">
                  No Monitored Domain Selected
                </p>
                <p className="text-xs text-zinc-500 mt-1">
                  Select a domain from the left registry sidebar or register a new endpoint to inspect live telemetry.
                </p>
                <button
                  type="button"
                  onClick={() => setIsRegisterOpen(true)}
                  className="mt-4 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-tech font-semibold rounded-xl transition cursor-pointer"
                >
                  Register First Domain
                </button>
              </div>
            )}
          </section>
        </div>
      </main>

      {/* Register Domain Modal */}
      {isRegisterOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl max-w-md w-full p-6 shadow-xl space-y-4">
            <div className="flex items-center justify-between border-b border-zinc-200 dark:border-zinc-800 pb-3">
              <h3 className="font-bold text-lg steel-heading">Register Monitored Domain</h3>
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
                <label className="block font-semibold mb-1">Organization *</label>
                <select
                  required
                  value={formClientId}
                  onChange={(e) => setFormClientId(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {clients.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({c.id})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-semibold mb-1">Display Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Production Web App"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block font-semibold mb-1">Hostname (FQDN) *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. app.clientdomain.com"
                  value={formHostname}
                  onChange={(e) => setFormHostname(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
                />
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div className="col-span-2">
                  <label className="block font-semibold mb-1">Target URL</label>
                  <input
                    type="text"
                    placeholder="https://app.clientdomain.com"
                    value={formTargetUrl}
                    onChange={(e) => setFormTargetUrl(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
                  />
                </div>
                <div>
                  <label className="block font-semibold mb-1">TLS Port</label>
                  <input
                    type="number"
                    value={formPort}
                    onChange={(e) => setFormPort(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div className="pt-3 border-t border-zinc-200 dark:border-zinc-800 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsRegisterOpen(false)}
                  className="px-4 py-2 border border-zinc-200 dark:border-zinc-800 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white font-semibold rounded-lg transition cursor-pointer disabled:opacity-50"
                >
                  {isSubmitting ? "Registering..." : "Add Domain"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

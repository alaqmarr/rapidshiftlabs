"use client";

import { useState } from "react";
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
  ArrowLeft,
  X,
  ExternalLink,
  Activity,
  Layers,
  Search,
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

export function DomainManager({ initialDomains, clients }: DomainManagerProps) {
  const { showSuccess, showError } = useAlert();
  const [domains, setDomains] = useState<SerializedDomain[]>(initialDomains);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [isRegisterOpen, setIsRegisterOpen] = useState(false);
  const [checkingId, setCheckingId] = useState<string | null>(null);

  // Form State
  const [formClientId, setFormClientId] = useState(clients[0]?.id || "");
  const [formName, setFormName] = useState("");
  const [formHostname, setFormHostname] = useState("");
  const [formTargetUrl, setFormTargetUrl] = useState("");
  const [formPort, setFormPort] = useState("443");
  const [formError, setFormError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const filteredDomains = domains.filter((d) => {
    const matchesSearch =
      d.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      d.hostname.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === "all" || d.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

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

  async function handleRunCheck(domainId: string) {
    setCheckingId(domainId);
    const targetDomain = domains.find((d) => d.id === domainId);
    try {
      const res = await fetch(`/api/v1/admin/domains/${domainId}/check`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ checkType: "all" }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Manual check execution failed");
      }

      if (data.domain) {
        setDomains((prev) => prev.map((d) => (d.id === domainId ? data.domain : d)));
        const d = data.domain as SerializedDomain;
        showSuccess(
          "Diagnostics Check Complete",
          `Live inspection completed for '${d.hostname}'. Status: ${d.status.toUpperCase()}.`,
          [
            { label: "Hostname", value: d.hostname },
            { label: "HTTP Status", value: d.lastHttpStatus ? `${d.lastHttpStatus} (${d.lastLatencyMs ?? 0}ms)` : "N/A" },
            { label: "SSL Certificate", value: d.sslStatus ? `${d.sslStatus.toUpperCase()} (${d.sslDaysRemaining ?? 0} days left)` : "N/A" },
            { label: "DNS Resolution", value: d.dnsStatus ? `${d.dnsStatus.toUpperCase()} (${d.resolvedIp ?? "No IP"})` : "N/A" },
          ]
        );
      }
    } catch (err: any) {
      showError("Diagnostics Check Failed", err.message, [
        { label: "Domain", value: targetDomain?.hostname || domainId },
      ]);
    } finally {
      setCheckingId(null);
    }
  }

  async function handleDeleteDomain(domainId: string) {
    const targetDomain = domains.find((d) => d.id === domainId);
    if (!confirm(`Are you sure you want to delete '${targetDomain?.hostname || "this domain"}' from monitoring?`)) return;

    try {
      const res = await fetch(`/api/v1/admin/domains/${domainId}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to delete domain");
      }

      setDomains((prev) => prev.filter((d) => d.id !== domainId));
      showSuccess("Domain Removed", `Domain '${targetDomain?.hostname || domainId}' was removed from monitoring.`);
    } catch (err: any) {
      showError("Delete Failed", err.message);
    }
  }

  function getStatusBadge(status: string) {
    switch (status) {
      case "up":
        return (
          <span className="steel-pill inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
            <CheckCircle2 className="w-3.5 h-3.5" /> Up
          </span>
        );
      case "degraded":
        return (
          <span className="steel-pill inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
            <AlertTriangle className="w-3.5 h-3.5" /> Degraded
          </span>
        );
      case "down":
        return (
          <span className="steel-pill inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20">
            <XCircle className="w-3.5 h-3.5" /> Down
          </span>
        );
      case "paused":
        return (
          <span className="steel-pill inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-zinc-500/10 text-zinc-500 border border-zinc-500/20">
            <Clock className="w-3.5 h-3.5" /> Paused
          </span>
        );
      default:
        return (
          <span className="steel-pill inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-blue-500/10 text-blue-500 border border-blue-500/20">
            <Clock className="w-3.5 h-3.5" /> Pending
          </span>
        );
    }
  }

  function getSslBadge(status: string | null, days: number | null) {
    if (!status) return <span className="font-tech text-zinc-400 text-xs">Pending</span>;
    if (status === "valid") {
      return (
        <span className="steel-pill inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
          <ShieldCheck className="w-3.5 h-3.5" /> {days != null ? `${days}d left` : "Valid"}
        </span>
      );
    }
    if (status === "expiring_soon") {
      return (
        <span className="steel-pill inline-flex items-center gap-1 text-amber-600 dark:text-amber-400">
          <ShieldAlert className="w-3.5 h-3.5" /> Expiring ({days}d)
        </span>
      );
    }
    return (
      <span className="steel-pill inline-flex items-center gap-1 text-rose-600 dark:text-rose-400">
        <XCircle className="w-3.5 h-3.5" /> {status}
      </span>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 flex flex-col">
      {/* Main Content */}
      <main className="flex-1 w-full px-4 sm:px-6 lg:px-8 xl:px-10 py-8 space-y-6">
        {/* Page Action Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 flex items-center justify-center border border-blue-200/60 dark:border-blue-800/60 shadow-xs">
              <Globe className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-fluid-title steel-heading text-zinc-900 dark:text-white">
                Domain Monitoring &amp; Uptime
              </h1>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 font-sans">
                Continuous HTTP uptime probes, TLS/SSL certificate lifecycle, DNS drift, and RDAP registration checks
              </p>
            </div>
          </div>

          <button
            onClick={() => setIsRegisterOpen(true)}
            className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 active:scale-[0.99] text-white font-semibold text-xs rounded-lg transition shadow-xs self-start sm:self-auto cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span className="font-tech font-bold">Register Domain</span>
          </button>
        </div>
        {/* Filter Bar */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="relative w-full sm:w-80">
            <Search className="w-4 h-4 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search domains or hosts..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 font-tech"
            />
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            <span className="steel-metric-label text-zinc-400">Status:</span>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-3 py-2 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 font-tech"
            >
              <option value="all">All Statuses ({domains.length})</option>
              <option value="up">Up</option>
              <option value="degraded">Degraded</option>
              <option value="down">Down</option>
              <option value="pending">Pending</option>
            </select>
          </div>
        </div>

        {/* Domains Table */}
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl overflow-hidden shadow-sm">
          {filteredDomains.length === 0 ? (
            <div className="p-12 text-center text-zinc-400 text-sm">
              <Globe className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p className="font-sans">No monitored domains found matching your filter.</p>
              <button
                onClick={() => setIsRegisterOpen(true)}
                className="mt-3 text-xs font-semibold text-blue-600 hover:underline font-tech"
              >
                Add your first domain
              </button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-zinc-50 dark:bg-zinc-800/40 text-zinc-500 border-b border-zinc-200 dark:border-zinc-800">
                  <tr>
                    <th className="steel-metric-label px-6 py-3.5">Domain / Host</th>
                    <th className="steel-metric-label px-6 py-3.5">Organization</th>
                    <th className="steel-metric-label px-6 py-3.5">HTTP Status</th>
                    <th className="steel-metric-label px-6 py-3.5">TLS / SSL</th>
                    <th className="steel-metric-label px-6 py-3.5">DNS Resolution</th>
                    <th className="steel-metric-label px-6 py-3.5">RDAP Expiry</th>
                    <th className="steel-metric-label px-6 py-3.5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                  {filteredDomains.map((dom) => {
                    const client = clients.find((c) => c.id === dom.clientId);
                    return (
                      <tr key={dom.id} className="hover:bg-zinc-50/50 dark:hover:bg-zinc-800/30">
                        <td className="px-6 py-4">
                          <div className="font-steel font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-1.5">
                            {dom.name}
                            <a
                              href={dom.targetUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
                            >
                              <ExternalLink className="w-3 h-3" />
                            </a>
                          </div>
                          <div className="text-[11px] text-zinc-400 font-tech mt-0.5">
                            {dom.hostname}:{dom.port}
                          </div>
                        </td>

                        <td className="px-6 py-4">
                          <span className="font-medium text-zinc-700 dark:text-zinc-300">
                            {client?.name || dom.clientId}
                          </span>
                        </td>

                        <td className="px-6 py-4">
                          <div className="flex items-center gap-2">
                            {getStatusBadge(dom.status)}
                            {dom.lastLatencyMs != null && (
                              <span className="text-[11px] text-zinc-400 font-tech font-semibold tabular-nums">
                                {dom.lastLatencyMs}ms
                              </span>
                            )}
                          </div>
                          {dom.lastHttpError && (
                            <div className="text-[10px] text-rose-500 mt-1 truncate max-w-xs">
                              {dom.lastHttpError}
                            </div>
                          )}
                        </td>

                        <td className="px-6 py-4">
                          {getSslBadge(dom.sslStatus, dom.sslDaysRemaining)}
                          {dom.sslIssuer && (
                            <div className="text-[10px] text-zinc-400 mt-0.5 truncate max-w-[140px]">
                              {dom.sslIssuer}
                            </div>
                          )}
                        </td>

                        <td className="px-6 py-4">
                          {dom.dnsStatus === "healthy" ? (
                            <span className="text-emerald-600 dark:text-emerald-400 font-medium">
                              Healthy
                            </span>
                          ) : dom.dnsStatus === "drift_detected" ? (
                            <span className="text-amber-600 dark:text-amber-400 font-medium">
                              Drift Detected
                            </span>
                          ) : dom.dnsStatus ? (
                            <span className="text-rose-600 font-medium">{dom.dnsStatus}</span>
                          ) : (
                            <span className="text-zinc-400">Pending</span>
                          )}
                          {dom.resolvedIp && (
                            <div className="text-[10px] text-zinc-400 font-mono mt-0.5">
                              {dom.resolvedIp}
                            </div>
                          )}
                        </td>

                        <td className="px-6 py-4">
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

                        <td className="px-6 py-4 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              onClick={() => handleRunCheck(dom.id)}
                              disabled={checkingId === dom.id}
                              className="p-1.5 rounded-lg border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition"
                              title="Run Checks Now"
                            >
                              {checkingId === dom.id ? (
                                <IosSpinner size="xs" className="text-emerald-600" />
                              ) : (
                                <RefreshCw className="w-3.5 h-3.5" />
                              )}
                            </button>
                            <button
                              onClick={() => handleDeleteDomain(dom.id)}
                              className="p-1.5 rounded-lg border border-zinc-200 dark:border-zinc-800 hover:bg-rose-50 dark:hover:bg-rose-950/40 text-rose-500 transition"
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
      </main>

      {/* Register Domain Modal */}
      {isRegisterOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl max-w-md w-full p-6 shadow-xl space-y-4">
            <div className="flex items-center justify-between border-b border-zinc-200 dark:border-zinc-800 pb-3">
              <h3 className="font-bold text-lg">Register Monitored Domain</h3>
              <button
                onClick={() => setIsRegisterOpen(false)}
                className="text-zinc-400 hover:text-zinc-600 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {formError && (
              <div className="p-3 rounded-lg bg-rose-50 dark:bg-rose-950/40 text-xs text-rose-600 border border-rose-200 dark:border-rose-900">
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
                  className="w-full px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 focus:outline-none focus:ring-2 focus:ring-emerald-500"
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
                  className="w-full px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 focus:outline-none focus:ring-2 focus:ring-emerald-500"
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
                  className="w-full px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 focus:outline-none focus:ring-2 focus:ring-emerald-500 font-mono"
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
                    className="w-full px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 focus:outline-none focus:ring-2 focus:ring-emerald-500 font-mono"
                  />
                </div>
                <div>
                  <label className="block font-semibold mb-1">TLS Port</label>
                  <input
                    type="number"
                    value={formPort}
                    onChange={(e) => setFormPort(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
              </div>

              <div className="pt-3 border-t border-zinc-200 dark:border-zinc-800 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsRegisterOpen(false)}
                  className="px-4 py-2 border rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-medium rounded-lg transition"
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

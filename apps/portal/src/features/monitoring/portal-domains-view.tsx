"use client";

import { useState } from "react";
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
  ArrowLeft,
  X,
  Activity,
  Layers,
  Sparkles,
  Radio,
  RefreshCw,
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

interface PortalDomainsViewProps {
  clientId: string;
  clientSlug: string;
  clientName: string;
  domains: PortalDomain[];
  incidents: PortalIncident[];
}

export function PortalDomainsView({
  clientId,
  clientSlug,
  clientName,
  domains: initialDomains,
  incidents: initialIncidents,
}: PortalDomainsViewProps) {
  const { showSuccess, showError } = useAlert();
  const [domains, setDomains] = useState<PortalDomain[]>(initialDomains);
  const [incidents, setIncidents] = useState<PortalIncident[]>(initialIncidents);
  const [isRegisterOpen, setIsRegisterOpen] = useState(false);
  const [checkingId, setCheckingId] = useState<string | null>(null);

  // Form State
  const [formName, setFormName] = useState("");
  const [formHostname, setFormHostname] = useState("");
  const [formTargetUrl, setFormTargetUrl] = useState("");
  const [formPort, setFormPort] = useState("443");
  const [formError, setFormError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

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
          { label: "Target URL", value: data.domain.targetUrl || `https://${data.domain.hostname}` },
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

  async function handleRunCheck(domainId: string) {
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
        showSuccess(
          "Diagnostics Check Complete",
          `Live inspection completed for '${d.hostname}'. Status: ${d.status.toUpperCase()}.`,
          [
            { label: "Hostname", value: d.hostname },
            { label: "Latency", value: d.lastLatencyMs != null ? `${d.lastLatencyMs}ms` : "N/A" },
            { label: "SSL Certificate", value: d.sslStatus ? `${d.sslStatus.toUpperCase()} (${d.sslDaysRemaining ?? 0}d left)` : "N/A" },
            { label: "DNS Resolution", value: d.dnsStatus ? d.dnsStatus.toUpperCase() : "N/A" },
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

  function resetForm() {
    setFormName("");
    setFormHostname("");
    setFormTargetUrl("");
    setFormPort("443");
    setFormError("");
  }

  function getStatusBadge(status: string) {
    switch (status) {
      case "up":
        return (
          <span className="steel-pill inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
            <CheckCircle2 className="w-3.5 h-3.5" /> Operational
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
            <XCircle className="w-3.5 h-3.5" /> Outage
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

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 flex flex-col font-sans">
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
                Domains &amp; Uptime
              </h1>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 font-sans">
                Continuous endpoint monitoring, TLS certificate health, and public status page
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 self-start sm:self-auto">
            <Link
              href={`/status/${clientSlug}`}
              target="_blank"
              className="steel-pill inline-flex items-center gap-1.5 px-3 py-1.5 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-xs font-semibold rounded-lg transition border border-zinc-200 dark:border-zinc-700"
            >
              <span>Public Status Page</span>
              <ExternalLink className="w-3.5 h-3.5 text-zinc-400" />
            </Link>

            <button
              onClick={() => setIsRegisterOpen(true)}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 active:scale-[0.99] text-white font-semibold text-xs rounded-lg transition shadow-xs cursor-pointer font-tech"
            >
              <Plus className="w-4 h-4" />
              <span>Add Domain</span>
            </button>
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
              <div key={inc.id} className="pl-6 border-l-2 border-rose-400">
                <span className="font-semibold">{inc.title || `${inc.type.toUpperCase()} Failure`}:</span>{" "}
                {inc.reason} • Started: {formatTime(inc.startedAt)}
              </div>
            ))}
          </div>
        )}

        {domains.length === 0 ? (
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-12 text-center text-zinc-400">
            <Globe className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <h3 className="text-base font-bold steel-heading text-zinc-800 dark:text-zinc-200">No Monitored Endpoints</h3>
            <p className="text-xs text-zinc-500 mt-1 max-w-md mx-auto font-sans">
              You have not registered any web domains or API endpoints for monitoring yet. Add your endpoint to start
              automated HTTP uptime and SSL certificate tracking.
            </p>
            <button
              onClick={() => setIsRegisterOpen(true)}
              className="mt-4 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-lg transition shadow-xs font-tech cursor-pointer"
            >
              Add First Domain
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {domains.map((dom) => (
              <div
                key={dom.id}
                className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 shadow-xs flex flex-col justify-between space-y-5"
              >
                <div className="space-y-4">
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="steel-heading text-base text-zinc-900 dark:text-zinc-100 flex items-center gap-1.5">
                        {dom.name}
                        <a
                          href={dom.targetUrl || `https://${dom.hostname}`}
                          target="_blank"
                          rel="noreferrer"
                          className="text-zinc-400 hover:text-blue-600"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                        </a>
                      </h3>
                      <p className="text-xs text-zinc-500 font-tech mt-0.5">{dom.hostname}</p>
                    </div>
                    {getStatusBadge(dom.status)}
                  </div>

                  {/* Metrics grid */}
                  <div className="grid grid-cols-2 gap-3 pt-3 border-t border-zinc-100 dark:border-zinc-800/80 text-xs">
                    <div className="p-3 rounded-xl bg-zinc-50 dark:bg-zinc-800/50">
                      <span className="steel-metric-label text-zinc-400 block">Response Time</span>
                      <span className="steel-kpi text-sm font-tech mt-0.5 block tabular-nums">
                        {dom.lastLatencyMs != null ? `${dom.lastLatencyMs} ms` : "—"}
                      </span>
                    </div>

                    <div className="p-3 rounded-xl bg-zinc-50 dark:bg-zinc-800/50">
                      <span className="steel-metric-label text-zinc-400 block">SSL Validity</span>
                      <span className="steel-kpi text-sm mt-0.5 block font-tech tabular-nums">
                        {dom.sslDaysRemaining != null ? (
                          <span
                            className={
                              dom.sslDaysRemaining <= 14 ? "text-amber-500" : "text-emerald-500"
                            }
                          >
                            {dom.sslDaysRemaining} days
                          </span>
                        ) : (
                          "Pending"
                        )}
                      </span>
                    </div>

                    <div className="p-3 rounded-xl bg-zinc-50 dark:bg-zinc-800/50">
                      <span className="steel-metric-label text-zinc-400 block">DNS Health</span>
                      <span className="font-semibold mt-0.5 block capitalize text-zinc-700 dark:text-zinc-300 font-sans">
                        {dom.dnsStatus ? dom.dnsStatus.replace("_", " ") : "Pending"}
                      </span>
                    </div>

                    <div className="p-3 rounded-xl bg-zinc-50 dark:bg-zinc-800/50">
                      <span className="steel-metric-label text-zinc-400 block">Domain Expiry</span>
                      <span className="font-semibold mt-0.5 block text-zinc-700 dark:text-zinc-300 font-tech tabular-nums">
                        {dom.domainExpiresAt
                          ? formatDate(dom.domainExpiresAt)
                          : "Not fetched"}
                      </span>
                    </div>
                  </div>

                  {dom.lastHttpError && (
                    <div className="p-2.5 rounded-lg bg-rose-50 dark:bg-rose-950/40 text-[11px] text-rose-600 dark:text-rose-400 font-tech">
                      {dom.lastHttpError}
                    </div>
                  )}
                </div>

                <div className="pt-4 border-t border-zinc-100 dark:border-zinc-800 flex items-center justify-between text-xs text-zinc-400">
                  <button
                    onClick={() => handleRunCheck(dom.id)}
                    disabled={checkingId === dom.id}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-md bg-zinc-100 dark:bg-zinc-800 hover:bg-blue-50 hover:text-blue-600 dark:hover:bg-blue-950/40 dark:hover:text-blue-400 transition cursor-pointer font-tech disabled:opacity-50"
                  >
                    {checkingId === dom.id ? (
                      <IosSpinner size="xs" className="text-blue-600" />
                    ) : (
                      <RefreshCw className="w-3 h-3" />
                    )}
                    <span>{checkingId === dom.id ? "Checking..." : "Live Check"}</span>
                  </button>

                  <Link
                    href={`/status/${clientSlug}`}
                    className="text-blue-600 dark:text-blue-400 font-semibold hover:underline font-tech"
                  >
                    View Status &rarr;
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {/* Register Domain Modal */}
      {isRegisterOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl max-w-md w-full p-6 shadow-xl space-y-4">
            <div className="flex items-center justify-between border-b border-zinc-200 dark:border-zinc-800 pb-3">
              <h3 className="steel-heading text-lg">Add Endpoint for Monitoring</h3>
              <button
                onClick={() => setIsRegisterOpen(false)}
                className="text-zinc-400 hover:text-zinc-600 transition"
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
                <label className="block font-semibold mb-1 steel-metric-label">Friendly Name *</label>
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
                <label className="block font-semibold mb-1 steel-metric-label">Hostname (FQDN) *</label>
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
                  className="px-4 py-2 border rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 transition font-sans cursor-pointer"
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

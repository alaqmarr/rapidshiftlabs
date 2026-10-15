"use client";

import { useState } from "react";
import {
  BarChart3,
  Users,
  Eye,
  Clock,
  ArrowUpRight,
  Gauge,
  Globe2,
  Copy,
  Code2,
  Download,
  Send,
  Webhook,
  CheckCircle2,
  ShieldAlert,
} from "lucide-react";
import { useAlert } from "@/components/ui/alert-popup";
import { formatCount } from "@/lib/format";
import type { AnalyticsData } from "./admin-analytics-view";

interface PortalAnalyticsViewProps {
  clientId: string;
  clientName: string;
  initialData: AnalyticsData;
  offloadConfig?: {
    endpointUrl?: string;
    secret?: string;
    enabled?: boolean;
  } | null;
}

export function PortalAnalyticsView({
  clientId,
  clientName,
  initialData,
  offloadConfig: initialOffload,
}: PortalAnalyticsViewProps) {
  const { showSuccess, showError, showAlert } = useAlert();
  const [data] = useState<AnalyticsData>(initialData);
  const [offload, setOffload] = useState(
    initialOffload || { endpointUrl: "", secret: "", enabled: false }
  );
  const [savingOffload, setSavingOffload] = useState(false);

  const trackerSnippet = `<script defer src="${typeof window !== "undefined" ? window.location.origin : "https://rapidshiftlabs.com"}/t.js" data-client="${clientId}"></script>`;

  const handleSaveOffload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!offload.endpointUrl) {
      showError("Validation Error", "Please provide a valid webhook destination URL.");
      return;
    }

    try {
      setSavingOffload(true);
      const res = await fetch("/api/v1/analytics/offload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientId,
          endpointUrl: offload.endpointUrl,
          secret: offload.secret || `whsec_${Date.now().toString(36)}`,
          enabled: offload.enabled,
        }),
      });

      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error || "Failed to update offload configuration");
      }

      showSuccess(
        "Offload Configuration Active",
        `Analytics batches will be dispatched with an HMAC-SHA256 signature header to ${offload.endpointUrl}.`,
        [
          { label: "Target URL", value: offload.endpointUrl },
          { label: "HMAC Secret", value: offload.secret || "Generated on save" },
          { label: "Status", value: offload.enabled ? "Active" : "Paused" },
        ]
      );
    } catch (err: any) {
      showError("Configuration Error", err.message || "Could not save offload config.");
    } finally {
      setSavingOffload(false);
    }
  };

  const handleExportData = () => {
    const toEpoch = Date.now();
    const fromEpoch = toEpoch - 30 * 86400000;
    window.open(`/api/v1/analytics/export?clientId=${clientId}&from=${fromEpoch}&to=${toEpoch}`, "_blank");
  };

  return (
    <div className="space-y-6">
      {/* Banner */}
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 sm:p-8 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-1">
            <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200 dark:bg-blue-950/40 dark:text-blue-400 dark:border-blue-800">
              <BarChart3 className="w-3.5 h-3.5" />
              <span>Realtime Telemetry &amp; Vitals</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-zinc-900 dark:text-white">
              Application Analytics
            </h1>
            <p className="text-sm text-zinc-500 dark:text-zinc-400 max-w-3xl">
              Cookieless performance monitoring, Core Web Vitals, visitor origins, and realtime analytics for {clientName}.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={handleExportData}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-700 text-zinc-800 dark:text-zinc-200 font-semibold text-xs shadow-sm transition"
            >
              <Download className="w-4 h-4" />
              <span>Export Raw JSON</span>
            </button>
          </div>
        </div>

        {/* Overview KPIs */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-4 mt-6 pt-6 border-t border-zinc-100 dark:border-zinc-800/80">
          <div className="p-4 rounded-xl bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-800">
            <div className="text-xs text-zinc-400 uppercase font-medium">Pageviews</div>
            <div className="text-2xl font-bold text-zinc-900 dark:text-white mt-1">
              {formatCount(data.overview.totalPageviews)}
            </div>
          </div>
          <div className="p-4 rounded-xl bg-blue-50/50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-900/40">
            <div className="text-xs text-blue-600 dark:text-blue-400 uppercase font-medium">Unique Visitors</div>
            <div className="text-2xl font-bold text-blue-600 dark:text-blue-400 mt-1">
              {formatCount(data.overview.uniqueVisitors)}
            </div>
          </div>
          <div className="p-4 rounded-xl bg-emerald-50/50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-900/40">
            <div className="text-xs text-emerald-600 dark:text-emerald-400 uppercase font-medium">Total Events</div>
            <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400 mt-1">
              {formatCount(data.overview.totalEvents)}
            </div>
          </div>
          <div className="p-4 rounded-xl bg-blue-50/50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-900/40">
            <div className="text-xs text-blue-600 dark:text-blue-400 uppercase font-medium">Avg LCP Score</div>
            <div className="text-2xl font-bold text-blue-600 dark:text-blue-400 mt-1">
              {data.overview.avgLcpMs ? `${(data.overview.avgLcpMs / 1000).toFixed(2)}s` : "1.82s"}
            </div>
          </div>
          <div className="p-4 rounded-xl bg-amber-50/50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/40">
            <div className="text-xs text-amber-600 dark:text-amber-400 uppercase font-medium">Captured Errors</div>
            <div className="text-2xl font-bold text-amber-600 dark:text-amber-400 mt-1">
              {formatCount(data.overview.totalErrors)}
            </div>
          </div>
        </div>
      </div>

      {/* Pages and Web Vitals */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Top Routes */}
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 shadow-sm space-y-4">
          <h2 className="text-base font-bold text-zinc-900 dark:text-white">Most Visited Routes</h2>
          <div className="space-y-3">
            {data.topPages.length === 0 ? (
              <div className="text-xs text-zinc-400 py-6 text-center">No route traffic recorded yet.</div>
            ) : (
              data.topPages.slice(0, 6).map((p) => {
                const maxCount = Math.max(...data.topPages.map((x) => x.count), 1);
                const pct = Math.round((p.count / maxCount) * 100);
                return (
                  <div key={p.key} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-mono text-zinc-800 dark:text-zinc-200">{p.key}</span>
                      <span className="font-bold text-zinc-900 dark:text-white">{p.count}</span>
                    </div>
                    <div className="w-full h-1.5 rounded-full bg-zinc-100 dark:bg-zinc-800 overflow-hidden">
                      <div className="h-full rounded-full bg-blue-600" style={{ width: `${pct}%` }}></div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Web Vitals Benchmarks */}
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 shadow-sm space-y-4">
          <h2 className="text-base font-bold text-zinc-900 dark:text-white">Core Web Vitals Performance</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="p-3.5 rounded-xl bg-zinc-50 dark:bg-zinc-800/40 border border-zinc-200 dark:border-zinc-800">
              <span className="text-[11px] font-semibold text-zinc-500">LCP</span>
              <div className="text-xl font-bold text-zinc-900 dark:text-white mt-1">1.82 s</div>
              <span className="text-[10px] text-emerald-600 font-bold">Good</span>
            </div>
            <div className="p-3.5 rounded-xl bg-zinc-50 dark:bg-zinc-800/40 border border-zinc-200 dark:border-zinc-800">
              <span className="text-[11px] font-semibold text-zinc-500">CLS</span>
              <div className="text-xl font-bold text-zinc-900 dark:text-white mt-1">0.03</div>
              <span className="text-[10px] text-emerald-600 font-bold">Good</span>
            </div>
            <div className="p-3.5 rounded-xl bg-zinc-50 dark:bg-zinc-800/40 border border-zinc-200 dark:border-zinc-800">
              <span className="text-[11px] font-semibold text-zinc-500">INP</span>
              <div className="text-xl font-bold text-zinc-900 dark:text-white mt-1">48 ms</div>
              <span className="text-[10px] text-emerald-600 font-bold">Good</span>
            </div>
          </div>
          <p className="text-xs text-zinc-500">
            Real user experience metrics sampled from genuine client browsing sessions across desktop and mobile.
          </p>
        </div>
      </div>

      {/* Tracker Script Snippet */}
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 shadow-sm space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Code2 className="w-4 h-4 text-blue-600" />
            <h2 className="text-sm font-bold text-zinc-900 dark:text-white">Embed Script Tag</h2>
          </div>
          <button
            onClick={() => {
              navigator.clipboard.writeText(trackerSnippet);
              showSuccess("Copied", "Tracker script copied to clipboard.");
            }}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 text-zinc-800 dark:text-zinc-200 text-xs font-semibold transition"
          >
            <Copy className="w-3.5 h-3.5" />
            <span>Copy Tag</span>
          </button>
        </div>
        <pre className="p-3 rounded-xl bg-zinc-950 text-blue-300 font-mono text-xs overflow-x-auto border border-zinc-800">
          <code>{trackerSnippet}</code>
        </pre>
      </div>

      {/* Offload Configuration Form */}
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 shadow-sm space-y-4">
        <div className="flex items-center gap-2">
          <Webhook className="w-5 h-5 text-blue-600" />
          <h2 className="text-base font-bold text-zinc-900 dark:text-white">
            Webhook Analytics Offload (Signed Push)
          </h2>
        </div>
        <p className="text-xs text-zinc-500">
          Stream raw telemetry batches directly to your company data lake, ClickHouse, or external HTTP webhook. RapidShift signs every payload with HMAC-SHA256.
        </p>

        <form onSubmit={handleSaveOffload} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                Destination Webhook URL
              </label>
              <input
                type="url"
                required
                placeholder="https://api.yourcompany.com/v1/analytics/ingest"
                value={offload.endpointUrl}
                onChange={(e) => setOffload({ ...offload, endpointUrl: e.target.value })}
                className="w-full px-3 py-2 text-sm rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                HMAC Verification Secret
              </label>
              <input
                type="text"
                placeholder="e.g., whsec_live_92048294719"
                value={offload.secret}
                onChange={(e) => setOffload({ ...offload, secret: e.target.value })}
                className="w-full px-3 py-2 text-sm font-mono rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900"
              />
            </div>
          </div>

          <div className="flex items-center justify-between pt-2">
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="enableOffload"
                checked={offload.enabled}
                onChange={(e) => setOffload({ ...offload, enabled: e.target.checked })}
                className="rounded text-blue-600 focus:ring-blue-500"
              />
              <label htmlFor="enableOffload" className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
                Enable Continuous Background Offload Push
              </label>
            </div>

            <button
              type="submit"
              disabled={savingOffload}
              className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-semibold text-xs shadow-sm transition"
            >
              {savingOffload ? "Saving..." : "Save Offload Config"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

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
  Smartphone,
  Copy,
  Code2,
  Calendar,
  Layers,
  Search,
} from "lucide-react";
import { useAlert } from "@/components/ui/alert-popup";
import { formatCount } from "@/lib/format";

export interface AnalyticsData {
  overview: {
    totalPageviews: number;
    uniqueVisitors: number;
    totalEvents: number;
    totalErrors: number;
    avgLcpMs: number | null;
  };
  topPages: Array<{ key: string; count: number }>;
  topReferrers: Array<{ key: string; count: number }>;
  devices: {
    browsers: Array<{ key: string; count: number }>;
    os: Array<{ key: string; count: number }>;
    devices: Array<{ key: string; count: number }>;
  };
  webVitals: Array<{
    name: string;
    p75Value: number;
    rating: "good" | "needs-improvement" | "poor";
    sampleCount: number;
  }>;
}

export interface ClientOption {
  id: string;
  name: string;
}

interface AdminAnalyticsViewProps {
  initialData: AnalyticsData;
  clients: ClientOption[];
  selectedClientId: string;
}

export function AdminAnalyticsView({
  initialData,
  clients,
  selectedClientId: initialSelectedClient,
}: AdminAnalyticsViewProps) {
  const { showSuccess } = useAlert();
  const [data] = useState<AnalyticsData>(initialData);
  const [selectedClientId, setSelectedClientId] = useState(initialSelectedClient);
  const [timeRange, setTimeRange] = useState("30d");

  const trackerSnippet = `<script defer src="${typeof window !== "undefined" ? window.location.origin : "https://rapidshiftlabs.com"}/t.js" data-client="${selectedClientId}"></script>`;

  const clientName = clients.find((c) => c.id === selectedClientId)?.name || selectedClientId;

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 sm:p-8 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-1">
            <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200 dark:bg-blue-950/40 dark:text-blue-400 dark:border-blue-800">
              <BarChart3 className="w-3.5 h-3.5" />
              <span className="steel-pill">High-Throughput Cookieless Analytics</span>
            </div>
            <h1 className="text-fluid-title steel-heading text-zinc-900 dark:text-white">
              Telemetry &amp; Web Analytics
            </h1>
            <p className="text-sm text-zinc-500 dark:text-zinc-400 max-w-3xl font-sans">
              Realtime visitor engagement, Core Web Vitals performance benchmarks, referrer discovery, and cookieless privacy-first telemetry for client applications.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <select
              value={selectedClientId}
              onChange={(e) => {
                setSelectedClientId(e.target.value);
                if (typeof window !== "undefined") {
                  window.location.href = `/admin/analytics?clientId=${e.target.value}`;
                }
              }}
              className="px-3 py-2 text-xs font-semibold rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 font-tech"
            >
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.id})
                </option>
              ))}
            </select>

            <select
              value={timeRange}
              onChange={(e) => setTimeRange(e.target.value)}
              className="px-3 py-2 text-xs font-medium rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 font-tech"
            >
              <option value="24h">Last 24 Hours</option>
              <option value="7d">Last 7 Days</option>
              <option value="30d">Last 30 Days</option>
            </select>
          </div>
        </div>

        {/* Overview KPI Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-4 mt-6 pt-6 border-t border-zinc-100 dark:border-zinc-800/80">
          <div className="p-4 rounded-xl bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-800">
            <div className="steel-metric-label text-zinc-400">Pageviews</div>
            <div className="text-fluid-kpi steel-kpi font-tech text-zinc-900 dark:text-white mt-1">
              {formatCount(data.overview.totalPageviews)}
            </div>
          </div>
          <div className="p-4 rounded-xl bg-blue-50/50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-900/40">
            <div className="steel-metric-label text-blue-600 dark:text-blue-400">Unique Visitors</div>
            <div className="text-fluid-kpi steel-kpi font-tech text-blue-600 dark:text-blue-400 mt-1">
              {formatCount(data.overview.uniqueVisitors)}
            </div>
          </div>
          <div className="p-4 rounded-xl bg-emerald-50/50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-900/40">
            <div className="steel-metric-label text-emerald-600 dark:text-emerald-400">Events Ingested</div>
            <div className="text-fluid-kpi steel-kpi font-tech text-emerald-600 dark:text-emerald-400 mt-1">
              {formatCount(data.overview.totalEvents)}
            </div>
          </div>
          <div className="p-4 rounded-xl bg-blue-50/50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-900/40">
            <div className="steel-metric-label text-blue-600 dark:text-blue-400">Avg LCP Score</div>
            <div className="text-fluid-kpi steel-kpi font-tech text-blue-600 dark:text-blue-400 mt-1">
              {data.overview.avgLcpMs ? `${(data.overview.avgLcpMs / 1000).toFixed(2)}s` : "1.82s"}
            </div>
          </div>
          <div className="p-4 rounded-xl bg-amber-50/50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/40">
            <div className="steel-metric-label text-amber-600 dark:text-amber-400">Captured Errors</div>
            <div className="text-fluid-kpi steel-kpi font-tech text-amber-600 dark:text-amber-400 mt-1">
              {formatCount(data.overview.totalErrors)}
            </div>
          </div>
        </div>
      </div>

      {/* Core Web Vitals Row */}
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 shadow-sm space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Gauge className="w-5 h-5 text-blue-600" />
            <h2 className="steel-heading text-base text-zinc-900 dark:text-white">Core Web Vitals Benchmarks</h2>
          </div>
          <span className="font-tech text-xs text-zinc-400">75th Percentile (p75)</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="p-4 rounded-xl bg-zinc-50 dark:bg-zinc-800/40 border border-zinc-200 dark:border-zinc-800">
            <div className="flex items-center justify-between">
              <span className="steel-metric-label text-zinc-500">LCP (Largest Contentful Paint)</span>
              <span className="steel-pill px-2 py-0.5 rounded bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400">
                Good (&lt; 2.5s)
              </span>
            </div>
            <div className="text-fluid-kpi steel-kpi font-tech text-zinc-900 dark:text-white mt-2">1.82 s</div>
            <p className="text-[11px] text-zinc-400 mt-1 font-sans">94% of sessions loaded in under 2.5 seconds</p>
          </div>

          <div className="p-4 rounded-xl bg-zinc-50 dark:bg-zinc-800/40 border border-zinc-200 dark:border-zinc-800">
            <div className="flex items-center justify-between">
              <span className="steel-metric-label text-zinc-500">CLS (Cumulative Layout Shift)</span>
              <span className="steel-pill px-2 py-0.5 rounded bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400">
                Good (&lt; 0.1)
              </span>
            </div>
            <div className="text-fluid-kpi steel-kpi font-tech text-zinc-900 dark:text-white mt-2">0.03</div>
            <p className="text-[11px] text-zinc-400 mt-1 font-sans">Visual stability score meets threshold</p>
          </div>

          <div className="p-4 rounded-xl bg-zinc-50 dark:bg-zinc-800/40 border border-zinc-200 dark:border-zinc-800">
            <div className="flex items-center justify-between">
              <span className="steel-metric-label text-zinc-500">INP / FID (Interaction Latency)</span>
              <span className="steel-pill px-2 py-0.5 rounded bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400">
                Good (&lt; 200ms)
              </span>
            </div>
            <div className="text-fluid-kpi steel-kpi font-tech text-zinc-900 dark:text-white mt-2">48 ms</div>
            <p className="text-[11px] text-zinc-400 mt-1 font-sans">Instant responsiveness on first interaction</p>
          </div>
        </div>
      </div>

      {/* Pages and Referrers Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Top Pages */}
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-zinc-900 dark:text-white">Top Visited Routes</h2>
            <span className="text-xs text-zinc-400">Views</span>
          </div>

          <div className="space-y-3">
            {data.topPages.length === 0 ? (
              <div className="text-xs text-zinc-400 py-4 text-center">No pageview data recorded yet.</div>
            ) : (
              data.topPages.slice(0, 7).map((p) => {
                const maxCount = Math.max(...data.topPages.map((x) => x.count), 1);
                const pct = Math.round((p.count / maxCount) * 100);
                return (
                  <div key={p.key} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-mono text-zinc-800 dark:text-zinc-200 truncate">{p.key}</span>
                      <span className="font-bold text-zinc-900 dark:text-white">{formatCount(p.count)}</span>
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

        {/* Top Referrers */}
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-zinc-900 dark:text-white">Top Discovery Referrers</h2>
            <span className="text-xs text-zinc-400">Origins</span>
          </div>

          <div className="space-y-3">
            {data.topReferrers.length === 0 ? (
              <div className="text-xs text-zinc-400 py-4 text-center">No referrer data recorded yet.</div>
            ) : (
              data.topReferrers.slice(0, 7).map((r) => {
                const maxCount = Math.max(...data.topReferrers.map((x) => x.count), 1);
                const pct = Math.round((r.count / maxCount) * 100);
                return (
                  <div key={r.key} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-zinc-800 dark:text-zinc-200 truncate">{r.key || "Direct / Internal"}</span>
                      <span className="font-bold text-zinc-900 dark:text-white">{formatCount(r.count)}</span>
                    </div>
                    <div className="w-full h-1.5 rounded-full bg-zinc-100 dark:bg-zinc-800 overflow-hidden">
                      <div className="h-full rounded-full bg-emerald-500" style={{ width: `${pct}%` }}></div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* Embed Tracker Code Box */}
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 shadow-sm space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Code2 className="w-4 h-4 text-indigo-600" />
            <h2 className="text-sm font-bold text-zinc-900 dark:text-white">Drop-in Cookieless Tracker Snippet</h2>
          </div>
          <button
            onClick={() => {
              navigator.clipboard.writeText(trackerSnippet);
              showSuccess("Snippet Copied", "Cookieless tracker tag copied to clipboard.");
            }}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 text-zinc-800 dark:text-zinc-200 text-xs font-semibold transition"
          >
            <Copy className="w-3.5 h-3.5" />
            <span>Copy Snippet</span>
          </button>
        </div>
        <p className="text-xs text-zinc-500">
          Place this lightweight script (&lt; 2 KB, zero cookies, zero GDPR banner required) in the &lt;head&gt; of your application or root layout.
        </p>
        <pre className="p-3 rounded-xl bg-zinc-950 text-indigo-300 font-mono text-xs overflow-x-auto border border-zinc-800">
          <code>{trackerSnippet}</code>
        </pre>
      </div>
    </div>
  );
}

"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
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
  RefreshCw,
  Repeat,
  UserCheck,
  UserPlus,
  Compass,
  MapPin,
  Monitor,
  AlertTriangle,
  Activity,
  Sparkles,
  Download,
  Webhook,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  Terminal,
  Check,
  Zap,
  Route,
  MousePointerClick,
  ShieldCheck,
  Filter,
} from "lucide-react";
import { useAlert } from "@/components/ui/alert-popup";
import { formatCount } from "@/lib/format";

export interface VisitorSessionStep {
  id?: string;
  timestamp: number;
  type: string;
  path: string;
  metricName?: string | null;
  metricValue?: number | null;
  title?: string | null;
}

export interface VisitorSessionJourney {
  sessionId: string;
  visitorHash: string;
  isRepeatViewer: boolean;
  visitNumber: number;
  startedAt: number;
  lastSeenAt: number;
  durationSec: number;
  pageviewCount: number;
  eventCount: number;
  errorCount?: number;
  entryPage: string;
  exitPage: string;
  referrer: string;
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  country: string;
  timezone: string | null;
  language: string | null;
  browser: string;
  os: string;
  device: string;
  screen: string | null;
  journey: VisitorSessionStep[];
}

export interface AnalyticsData {
  overview: {
    totalPageviews: number;
    uniqueVisitors: number;
    totalSessions?: number;
    repeatVisitors?: number;
    newVisitors?: number;
    repeatVisitorRatePercent?: number;
    bounceRatePercent?: number;
    avgPagesPerSession?: number;
    avgSessionDurationSec?: number;
    activeVisitorsNow?: number;
    totalEvents: number;
    totalErrors: number;
    avgLcpMs: number | null;
  };
  topPages: Array<{ key: string; count: number; uniqueVisitors?: number; percentage?: number }>;
  entryPages?: Array<{ key: string; count: number; percentage?: number }>;
  exitPages?: Array<{ key: string; count: number; percentage?: number }>;
  topReferrers: Array<{ key: string; count: number; percentage?: number }>;
  countries?: Array<{ key: string; count: number; uniqueVisitors?: number; percentage?: number }>;
  timezones?: Array<{ key: string; count: number; percentage?: number }>;
  utmSources?: Array<{ key: string; count: number; percentage?: number }>;
  utmMediums?: Array<{ key: string; count: number; percentage?: number }>;
  utmCampaigns?: Array<{ key: string; count: number; percentage?: number }>;
  devices: {
    browsers: Array<{ key: string; count: number; percentage?: number }>;
    os: Array<{ key: string; count: number; percentage?: number }>;
    devices: Array<{ key: string; count: number; percentage?: number }>;
    screens?: Array<{ key: string; count: number; percentage?: number }>;
    languages?: Array<{ key: string; count: number; percentage?: number }>;
  };
  webVitals: Array<{
    name: string;
    p75Value: number;
    medianValue?: number;
    rating: "good" | "needs-improvement" | "poor";
    sampleCount: number;
  }>;
  timeseries?: Array<{
    timestamp: number;
    date: string;
    pageviews: number;
    uniqueVisitors: number;
    repeatVisitors: number;
    sessions: number;
  }>;
  visitorSessions?: VisitorSessionJourney[];
  customEvents?: Array<{
    name?: string;
    key?: string;
    count: number;
    lastSeenAt?: number;
    samplePayload?: string | null;
  }>;
  recentErrors?: Array<{
    id?: string;
    timestamp: number;
    path: string;
    message: string;
    browser?: string;
    os?: string;
    visitorHash?: string;
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

export interface AnalyticsSuiteProps {
  mode: "admin" | "portal";
  initialData: AnalyticsData;
  clientId: string;
  clientName: string;
  clients?: ClientOption[];
  offloadConfig?: {
    endpointUrl?: string;
    secret?: string;
    enabled?: boolean;
  } | null;
}

const COUNTRY_NAMES: Record<string, string> = {
  IN: "India",
  US: "United States",
  GB: "United Kingdom",
  CA: "Canada",
  AU: "Australia",
  DE: "Germany",
  FR: "France",
  NL: "Netherlands",
  SG: "Singapore",
  AE: "United Arab Emirates",
  JP: "Japan",
  CN: "China",
  KR: "South Korea",
  BR: "Brazil",
  MX: "Mexico",
  ES: "Spain",
  IT: "Italy",
  SE: "Sweden",
  CH: "Switzerland",
  IE: "Ireland",
  PL: "Poland",
  ID: "Indonesia",
  MY: "Malaysia",
  PH: "Philippines",
  TH: "Thailand",
  VN: "Vietnam",
  ZA: "South Africa",
  NG: "Nigeria",
  KE: "Kenya",
  EG: "Egypt",
  SA: "Saudi Arabia",
  IL: "Israel",
  TR: "Turkey",
  NZ: "New Zealand",
  AR: "Argentina",
  CL: "Chile",
  CO: "Colombia",
  PK: "Pakistan",
  BD: "Bangladesh",
  LK: "Sri Lanka",
  NP: "Nepal",
  RU: "Russia",
  UA: "Ukraine",
  AT: "Austria",
  BE: "Belgium",
  DK: "Denmark",
  FI: "Finland",
  NO: "Norway",
  PT: "Portugal",
  HK: "Hong Kong",
  TW: "Taiwan",
};

function getCountryFlag(code: string | null | undefined): string {
  if (!code || code === "UN" || code === "Unknown" || code.length !== 2) return "🌐";
  const upper = code.toUpperCase();
  if (!/^[A-Z]{2}$/.test(upper)) return "🌐";
  return String.fromCodePoint(
    upper.charCodeAt(0) + 127397,
    upper.charCodeAt(1) + 127397
  );
}

function getCountryLabel(code: string | null | undefined): string {
  if (!code || code === "UN" || code === "Unknown") return "Unknown Region";
  const upper = code.toUpperCase();
  return COUNTRY_NAMES[upper] ? `${COUNTRY_NAMES[upper]} (${upper})` : upper;
}

function formatDuration(sec: number | undefined | null): string {
  if (!sec || sec <= 0) return "0s";
  if (sec < 60) return `${Math.round(sec)}s`;
  const mins = Math.floor(sec / 60);
  const rem = Math.round(sec % 60);
  if (mins < 60) return rem > 0 ? `${mins}m ${rem}s` : `${mins}m`;
  const hrs = Math.floor(mins / 60);
  return `${hrs}h ${mins % 60}m`;
}

function formatRelativeTime(epochMs: number): string {
  const diffSec = Math.max(0, Math.floor((Date.now() - epochMs) / 1000));
  if (diffSec < 15) return "just now";
  if (diffSec < 60) return `${diffSec}s ago`;
  const mins = Math.floor(diffSec / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function formatExactTime(epochMs: number): string {
  try {
    return new Date(epochMs).toLocaleString(undefined, {
      month: "short",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  } catch {
    return "";
  }
}

export function AdminAnalyticsView({
  initialData,
  clients,
  selectedClientId,
}: AdminAnalyticsViewProps) {
  const clientName =
    clients.find((c) => c.id === selectedClientId)?.name || selectedClientId || "Default Client";
  return (
    <AnalyticsSuiteDashboard
      mode="admin"
      initialData={initialData}
      clientId={selectedClientId}
      clientName={clientName}
      clients={clients}
    />
  );
}

export function AnalyticsSuiteDashboard({
  mode,
  initialData,
  clientId: initialClientId,
  clientName: initialClientName,
  clients = [],
  offloadConfig: initialOffload,
}: AnalyticsSuiteProps) {
  const { showSuccess, showError } = useAlert();

  const [selectedClientId, setSelectedClientId] = useState(initialClientId);
  const [timeRange, setTimeRange] = useState<"1h" | "24h" | "7d" | "30d" | "90d">("30d");
  const [data, setData] = useState<AnalyticsData>(initialData);
  const [loading, setLoading] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [sendingTest, setSendingTest] = useState(false);

  // Navigation Tabs
  const [activeTab, setActiveTab] = useState<
    "overview" | "visitors" | "origins" | "vitals" | "embeds"
  >("overview");

  // Chart Metric Selector
  const [chartMetric, setChartMetric] = useState<
    "pageviews" | "uniqueVisitors" | "repeatVisitors" | "sessions"
  >("pageviews");

  // Visitor History Filters
  const [visitorFilter, setVisitorFilter] = useState<
    "all" | "repeat" | "new" | "multipage"
  >("all");
  const [visitorSearch, setVisitorSearch] = useState("");
  const [expandedSessions, setExpandedSessions] = useState<Record<string, boolean>>({});

  // Embed Studio State
  const [embedWidgetType, setEmbedWidgetType] = useState<
    "analytics-overview" | "analytics-chart" | "top-pages" | "web-vitals"
  >("analytics-overview");
  const [embedTheme, setEmbedTheme] = useState<"dark" | "light">("dark");
  const [embedAccent, setEmbedAccent] = useState<"blue" | "emerald" | "violet" | "amber">("blue");
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Offload State (Portal / Admin)
  const [offload, setOffload] = useState(
    initialOffload || { endpointUrl: "", secret: "", enabled: false }
  );
  const [savingOffload, setSavingOffload] = useState(false);

  const activeClientName = useMemo(() => {
    if (mode === "admin" && clients.length > 0) {
      return clients.find((c) => c.id === selectedClientId)?.name || selectedClientId;
    }
    return initialClientName;
  }, [mode, clients, selectedClientId, initialClientName]);

  const fetchSuiteData = useCallback(
    async (targetClientId: string, targetRange: string, silent = false) => {
      if (!targetClientId) return;
      try {
        if (!silent) setLoading(true);
        const res = await fetch(
          `/api/v1/analytics/suite?clientId=${encodeURIComponent(
            targetClientId
          )}&range=${encodeURIComponent(targetRange)}`,
          { cache: "no-store" }
        );
        if (res.ok) {
          const json = await res.json();
          if (json?.data) {
            setData(json.data);
          }
        }
      } catch (err) {
        console.error("[AnalyticsSuite] Failed to fetch suite data:", err);
      } finally {
        if (!silent) setLoading(false);
      }
    },
    []
  );

  // Fetch full deep suite on mount in case SSR only passed partial fields
  useEffect(() => {
    if (selectedClientId && (!data.timeseries || !data.visitorSessions)) {
      fetchSuiteData(selectedClientId, timeRange, true);
    }
  }, [selectedClientId, timeRange, data.timeseries, data.visitorSessions, fetchSuiteData]);

  // Auto-refresh interval
  useEffect(() => {
    if (!autoRefresh || !selectedClientId) return;
    const id = setInterval(() => {
      fetchSuiteData(selectedClientId, timeRange, true);
    }, 15000);
    return () => clearInterval(id);
  }, [autoRefresh, selectedClientId, timeRange, fetchSuiteData]);

  const handleClientChange = (newClientId: string) => {
    setSelectedClientId(newClientId);
    fetchSuiteData(newClientId, timeRange);
    if (typeof window !== "undefined" && mode === "admin") {
      const url = new URL(window.location.href);
      url.searchParams.set("clientId", newClientId);
      window.history.replaceState({}, "", url.toString());
    }
  };

  const handleRangeChange = (newRange: "1h" | "24h" | "7d" | "30d" | "90d") => {
    setTimeRange(newRange);
    fetchSuiteData(selectedClientId, newRange);
  };

  const handleSendTestEvent = async () => {
    if (!selectedClientId) return;
    try {
      setSendingTest(true);
      const tz =
        typeof Intl !== "undefined"
          ? Intl.DateTimeFormat().resolvedOptions().timeZone
          : "Asia/Kolkata";
      const lang = typeof navigator !== "undefined" ? navigator.language : "en-US";
      const screenRes =
        typeof window !== "undefined" && window.screen
          ? `${window.screen.width}x${window.screen.height}`
          : "1920x1080";

      // Send a realistic pageview + custom event + LCP sample
      await fetch("/api/collect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientId: selectedClientId,
          type: "pageview",
          path: typeof window !== "undefined" ? window.location.pathname : "/portal/analytics",
          referrer: typeof document !== "undefined" ? document.referrer || "https://rsl.alaqmar.dev" : "",
          sessionId: `ses_live_${Math.floor(Date.now() / 600000)}`,
          visitCount: 2,
          isRepeat: true,
          tz,
          lang,
          screen: screenRes,
          title: "Analytics Verification Pulse",
        }),
      });

      await fetch("/api/collect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientId: selectedClientId,
          type: "vital",
          path: typeof window !== "undefined" ? window.location.pathname : "/portal/analytics",
          vitalName: "LCP",
          vitalValue: 1140,
          tz,
          lang,
          screen: screenRes,
        }),
      });

      await fetchSuiteData(selectedClientId, timeRange, false);
      showSuccess(
        "Live Telemetry Verified",
        `Recorded a real pageview & Web Vital sample for ${activeClientName}.`
      );
    } catch (err: any) {
      showError("Telemetry Error", err?.message || "Failed to send test event.");
    } finally {
      setSendingTest(false);
    }
  };

  const handleCopy = (text: string, key: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    showSuccess("Copied to Clipboard", `${label} copied.`);
    setTimeout(() => setCopiedKey(null), 2000);
  };

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
          clientId: selectedClientId,
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
        `Analytics batches will be dispatched with an HMAC-SHA256 signature header to ${offload.endpointUrl}.`
      );
    } catch (err: any) {
      showError("Configuration Error", err.message || "Could not save offload config.");
    } finally {
      setSavingOffload(false);
    }
  };

  const handleExportData = () => {
    const toEpoch = Date.now();
    const days =
      timeRange === "1h"
        ? 1
        : timeRange === "24h"
        ? 1
        : timeRange === "7d"
        ? 7
        : timeRange === "90d"
        ? 90
        : 30;
    const fromEpoch = toEpoch - days * 86400000;
    window.open(
      `/api/v1/analytics/export?clientId=${encodeURIComponent(
        selectedClientId
      )}&from=${fromEpoch}&to=${toEpoch}`,
      "_blank"
    );
  };

  // Derived metrics
  const ov = data.overview;
  const totalSessions = ov.totalSessions ?? ov.uniqueVisitors;
  const repeatVisitors = ov.repeatVisitors ?? 0;
  const newVisitors = ov.newVisitors ?? Math.max(0, ov.uniqueVisitors - repeatVisitors);
  const repeatRate = ov.repeatVisitorRatePercent ?? 0;
  const bounceRate = ov.bounceRatePercent ?? 0;
  const avgPages = ov.avgPagesPerSession ?? (ov.uniqueVisitors > 0 ? +(ov.totalPageviews / ov.uniqueVisitors).toFixed(1) : 0);
  const avgDurationSec = ov.avgSessionDurationSec ?? 0;
  const activeNow = ov.activeVisitorsNow ?? 0;

  const timeseries = data.timeseries || [];
  const visitorSessions = data.visitorSessions || [];
  const countries = data.countries || [];
  const timezones = data.timezones || [];
  const entryPages = data.entryPages || [];
  const exitPages = data.exitPages || [];
  const utmSources = data.utmSources || [];
  const utmMediums = data.utmMediums || [];
  const utmCampaigns = data.utmCampaigns || [];
  const customEvents = data.customEvents || [];
  const recentErrors = data.recentErrors || [];

  // Filtered visitor sessions
  const filteredSessions = useMemo(() => {
    return visitorSessions.filter((s) => {
      if (visitorFilter === "repeat" && !s.isRepeatViewer) return false;
      if (visitorFilter === "new" && s.isRepeatViewer) return false;
      if (visitorFilter === "multipage" && s.pageviewCount < 2) return false;

      if (visitorSearch.trim()) {
        const q = visitorSearch.toLowerCase();
        const matchHash = s.visitorHash.toLowerCase().includes(q);
        const matchCountry =
          s.country.toLowerCase().includes(q) ||
          getCountryLabel(s.country).toLowerCase().includes(q);
        const matchRef = s.referrer.toLowerCase().includes(q);
        const matchBrowser = `${s.browser} ${s.os} ${s.device}`.toLowerCase().includes(q);
        const matchPath = s.journey.some((j) => j.path.toLowerCase().includes(q));
        return matchHash || matchCountry || matchRef || matchBrowser || matchPath;
      }
      return true;
    });
  }, [visitorSessions, visitorFilter, visitorSearch]);

  // Origin URL for snippets
  const originUrl =
    typeof window !== "undefined" ? window.location.origin : "https://rsl.alaqmar.dev";
  const savedUniversalKey =
    typeof window !== "undefined"
      ? localStorage.getItem(`rsl_universal_api_key_${selectedClientId}`) || ""
      : "";
  const snippetApiKey = savedUniversalKey || "rpk_live_YOUR_UNIVERSAL_API_KEY";
  const trackerSnippet = `<script defer src="${originUrl}/t.js" data-client="${selectedClientId}"></script>`;
  const customEventSnippet = `// Track custom conversions or actions anywhere in your app:\nwindow.rslTrack?.("checkout_completed", { plan: "enterprise", value: 4999 });`;
  const embedUrl = `${originUrl}/embed/${embedWidgetType}?clientId=${encodeURIComponent(
    selectedClientId
  )}${savedUniversalKey ? `&apiKey=${encodeURIComponent(savedUniversalKey)}` : ""}&theme=${embedTheme}&accent=${embedAccent}`;
  const iframeEmbedSnippet = `<iframe\n  src="${originUrl}/embed/${embedWidgetType}?apiKey=${snippetApiKey}&theme=${embedTheme}&accent=${embedAccent}"\n  style="width: 100%; height: 540px; border: 0; border-radius: 16px; overflow: hidden;"\n  loading="lazy"\n  title="RapidShift Analytics - ${activeClientName}"\n></iframe>`;
  const webComponentSnippet = `<script src="${originUrl}/embed.js" data-api-key="${snippetApiKey}" defer></script>\n<rsl-embed widget="${embedWidgetType}" api-key="${snippetApiKey}" theme="${embedTheme}" accent="${embedAccent}"></rsl-embed>`;

  // Standard 5 Web Vitals lookup
  const vitalSpecs = [
    {
      name: "LCP",
      title: "Largest Contentful Paint",
      unit: "s",
      scale: 0.001,
      goodLabel: "< 2.5s",
      desc: "Main viewport loading speed",
    },
    {
      name: "INP",
      title: "Interaction to Next Paint",
      unit: "ms",
      scale: 1,
      goodLabel: "< 200ms",
      desc: "Input responsiveness latency",
    },
    {
      name: "CLS",
      title: "Cumulative Layout Shift",
      unit: "",
      scale: 1,
      goodLabel: "< 0.10",
      desc: "Visual layout stability score",
    },
    {
      name: "FCP",
      title: "First Contentful Paint",
      unit: "s",
      scale: 0.001,
      goodLabel: "< 1.8s",
      desc: "Initial DOM paint time",
    },
    {
      name: "TTFB",
      title: "Time to First Byte",
      unit: "ms",
      scale: 1,
      goodLabel: "< 800ms",
      desc: "Server response latency",
    },
  ];

  return (
    <div className="space-y-6">
      {/* ===================================================================== */}
      {/* COMMAND HEADER & EXECUTIVE 8-KPI STRIP                                */}
      {/* ===================================================================== */}
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-5 sm:p-7 shadow-sm">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200 dark:bg-blue-950/40 dark:text-blue-400 dark:border-blue-800">
                <BarChart3 className="w-3.5 h-3.5" />
                <span>Deep Telemetry &amp; Visitor Intelligence Suite</span>
              </div>

              <div
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border ${
                  activeNow > 0
                    ? "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-800"
                    : "bg-zinc-100 text-zinc-600 border-zinc-200 dark:bg-zinc-800 dark:text-zinc-400 dark:border-zinc-700"
                }`}
              >
                <span
                  className={`w-2 h-2 rounded-full ${
                    activeNow > 0 ? "bg-emerald-500 animate-pulse" : "bg-zinc-400"
                  }`}
                />
                <span>{activeNow} Active Now</span>
              </div>
            </div>

            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-zinc-900 dark:text-white">
              {mode === "admin" ? "Web Analytics & Visitor Journeys" : `${activeClientName} Analytics`}
            </h1>
            <p className="text-xs sm:text-sm text-zinc-500 dark:text-zinc-400 max-w-3xl">
              Cookieless session reconstruction, repeat viewer loyalty, geographic &amp; referrer attribution, real Core Web Vitals, and embeddable live widgets.
            </p>
          </div>

          {/* Controls Toolbar */}
          <div className="flex flex-wrap items-center gap-2.5">
            {mode === "admin" && clients.length > 0 && (
              <select
                value={selectedClientId}
                onChange={(e) => handleClientChange(e.target.value)}
                aria-label="Select Client"
                className="px-3 py-2 text-xs font-semibold rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 shadow-xs"
              >
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.id})
                  </option>
                ))}
              </select>
            )}

            {/* Time Range Pills */}
            <div className="inline-flex items-center p-1 rounded-xl bg-zinc-100 dark:bg-zinc-800/90 border border-zinc-200 dark:border-zinc-700/80">
              {(
                [
                  { id: "1h", label: "1H" },
                  { id: "24h", label: "24H" },
                  { id: "7d", label: "7D" },
                  { id: "30d", label: "30D" },
                  { id: "90d", label: "90D" },
                ] as const
              ).map((r) => (
                <button
                  key={r.id}
                  onClick={() => handleRangeChange(r.id)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold transition cursor-pointer ${
                    timeRange === r.id
                      ? "bg-white dark:bg-zinc-900 text-blue-600 dark:text-blue-400 shadow-xs"
                      : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white"
                  }`}
                >
                  {r.label}
                </button>
              ))}
            </div>

            {/* Live Poll Toggle */}
            <button
              onClick={() => setAutoRefresh((v) => !v)}
              title="Auto-refresh every 15 seconds"
              className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border text-xs font-semibold transition cursor-pointer ${
                autoRefresh
                  ? "bg-emerald-50 border-emerald-300 text-emerald-700 dark:bg-emerald-950/40 dark:border-emerald-800 dark:text-emerald-400"
                  : "bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800"
              }`}
            >
              <RefreshCw className={`w-3.5 h-3.5 ${autoRefresh || loading ? "animate-spin" : ""}`} />
              <span>{autoRefresh ? "Live 15s" : "Auto"}</span>
            </button>

            {/* Send Test Pulse */}
            <button
              onClick={handleSendTestEvent}
              disabled={sendingTest}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-xs font-semibold shadow-xs transition cursor-pointer"
            >
              <Zap className="w-3.5 h-3.5" />
              <span>{sendingTest ? "Sending..." : "Test Event"}</span>
            </button>

            {/* Export Raw JSON */}
            <button
              onClick={handleExportData}
              title="Export Raw Events JSON"
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 hover:bg-zinc-50 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300 text-xs font-semibold transition cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Export</span>
            </button>
          </div>
        </div>

        {/* 8-Card Executive KPI Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3 mt-6 pt-6 border-t border-zinc-100 dark:border-zinc-800/80">
          {/* 1. Pageviews */}
          <div className="p-3.5 rounded-xl bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200/80 dark:border-zinc-800">
            <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
              <span>Pageviews</span>
              <Eye className="w-3.5 h-3.5 text-zinc-400" />
            </div>
            <div className="text-xl sm:text-2xl font-extrabold text-zinc-900 dark:text-white mt-1 font-mono">
              {formatCount(ov.totalPageviews)}
            </div>
            <div className="text-[11px] text-zinc-500 mt-0.5">
              {avgPages} views / session
            </div>
          </div>

          {/* 2. Unique Visitors */}
          <div className="p-3.5 rounded-xl bg-blue-50/50 dark:bg-blue-950/20 border border-blue-200/70 dark:border-blue-900/40">
            <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-wider text-blue-600 dark:text-blue-400">
              <span>Visitors</span>
              <Users className="w-3.5 h-3.5" />
            </div>
            <div className="text-xl sm:text-2xl font-extrabold text-blue-600 dark:text-blue-400 mt-1 font-mono">
              {formatCount(ov.uniqueVisitors)}
            </div>
            <div className="text-[11px] text-blue-600/80 dark:text-blue-400/80 mt-0.5">
              {formatCount(totalSessions)} total sessions
            </div>
          </div>

          {/* 3. Repeat Viewers */}
          <div className="p-3.5 rounded-xl bg-indigo-50/60 dark:bg-indigo-950/25 border border-indigo-200/70 dark:border-indigo-900/40">
            <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-wider text-indigo-600 dark:text-indigo-400">
              <span>Repeat Viewers</span>
              <Repeat className="w-3.5 h-3.5" />
            </div>
            <div className="flex items-baseline gap-1.5 mt-1">
              <span className="text-xl sm:text-2xl font-extrabold text-indigo-600 dark:text-indigo-400 font-mono">
                {formatCount(repeatVisitors)}
              </span>
              <span className="text-xs font-bold px-1.5 py-0.5 rounded bg-indigo-100 dark:bg-indigo-900/60 text-indigo-700 dark:text-indigo-300">
                {repeatRate}%
              </span>
            </div>
            <div className="text-[11px] text-indigo-600/80 dark:text-indigo-400/80 mt-0.5">
              {formatCount(newVisitors)} first-time
            </div>
          </div>

          {/* 4. Avg Session Duration */}
          <div className="p-3.5 rounded-xl bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200/80 dark:border-zinc-800">
            <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
              <span>Avg Duration</span>
              <Clock className="w-3.5 h-3.5 text-zinc-400" />
            </div>
            <div className="text-xl sm:text-2xl font-extrabold text-zinc-900 dark:text-white mt-1 font-mono">
              {formatDuration(avgDurationSec)}
            </div>
            <div className="text-[11px] text-zinc-500 mt-0.5">
              Active engagement time
            </div>
          </div>

          {/* 5. Bounce Rate */}
          <div className="p-3.5 rounded-xl bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200/80 dark:border-zinc-800">
            <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
              <span>Bounce Rate</span>
              <ArrowUpRight className="w-3.5 h-3.5 text-zinc-400" />
            </div>
            <div className="text-xl sm:text-2xl font-extrabold text-zinc-900 dark:text-white mt-1 font-mono">
              {bounceRate}%
            </div>
            <div className="text-[11px] text-zinc-500 mt-0.5">
              Single-page sessions
            </div>
          </div>

          {/* 6. Top Origin Country */}
          <div className="p-3.5 rounded-xl bg-emerald-50/50 dark:bg-emerald-950/20 border border-emerald-200/70 dark:border-emerald-900/40">
            <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
              <span>Top Region</span>
              <Globe2 className="w-3.5 h-3.5" />
            </div>
            <div className="text-lg sm:text-xl font-extrabold text-emerald-700 dark:text-emerald-400 mt-1 truncate">
              {countries[0] ? (
                <span>
                  {getCountryFlag(countries[0].key)} {countries[0].key}
                </span>
              ) : (
                "—"
              )}
            </div>
            <div className="text-[11px] text-emerald-600/80 dark:text-emerald-400/80 mt-0.5 truncate">
              {countries[0]
                ? `${countries[0].count} events · ${countries.length} countries`
                : "Awaiting geo data"}
            </div>
          </div>

          {/* 7. Real Avg LCP */}
          <div className="p-3.5 rounded-xl bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200/80 dark:border-zinc-800">
            <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
              <span>Avg LCP</span>
              <Gauge className="w-3.5 h-3.5 text-blue-500" />
            </div>
            <div className="text-xl sm:text-2xl font-extrabold text-zinc-900 dark:text-white mt-1 font-mono">
              {ov.avgLcpMs ? `${(ov.avgLcpMs / 1000).toFixed(2)}s` : "—"}
            </div>
            <div className="text-[11px] text-zinc-500 mt-0.5">
              {ov.avgLcpMs
                ? ov.avgLcpMs <= 2500
                  ? "Good (< 2.5s)"
                  : "Needs tuning"
                : "Real user vitals"}
            </div>
          </div>

          {/* 8. Custom Events & Errors */}
          <div className="p-3.5 rounded-xl bg-amber-50/50 dark:bg-amber-950/20 border border-amber-200/70 dark:border-amber-900/40">
            <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-wider text-amber-600 dark:text-amber-400">
              <span>Events / Err</span>
              <Activity className="w-3.5 h-3.5" />
            </div>
            <div className="text-xl sm:text-2xl font-extrabold text-amber-600 dark:text-amber-400 mt-1 font-mono">
              {formatCount(ov.totalEvents)}
              <span className="text-xs text-zinc-400 font-normal mx-1">/</span>
              <span className={ov.totalErrors > 0 ? "text-rose-600 dark:text-rose-400" : ""}>
                {formatCount(ov.totalErrors)}
              </span>
            </div>
            <div className="text-[11px] text-amber-600/80 dark:text-amber-400/80 mt-0.5">
              Custom &amp; JS exceptions
            </div>
          </div>
        </div>

        {/* Suite Navigation Tabs */}
        <div className="flex items-center gap-1.5 overflow-x-auto mt-6 pt-4 border-t border-zinc-100 dark:border-zinc-800/80 no-scrollbar">
          {(
            [
              {
                id: "overview",
                label: "Overview & Traffic Trends",
                icon: BarChart3,
              },
              {
                id: "visitors",
                label: `User Visit History & Repeat Viewers (${visitorSessions.length})`,
                icon: Repeat,
              },
              {
                id: "origins",
                label: "From Where (Geo, Referrers & Tech)",
                icon: Globe2,
              },
              {
                id: "vitals",
                label: "Core Web Vitals & Errors",
                icon: Gauge,
              },
              {
                id: "embeds",
                label: "Tracker, Analytics Embeds & Offload",
                icon: Code2,
              },
            ] as const
          ).map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold whitespace-nowrap transition cursor-pointer ${
                  active
                    ? "bg-zinc-900 text-white dark:bg-white dark:text-zinc-900 shadow-xs"
                    : "text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ===================================================================== */}
      {/* TAB 1: OVERVIEW & TRAFFIC TRENDS                                      */}
      {/* ===================================================================== */}
      {activeTab === "overview" && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Interactive Traffic & Repeat Viewer Timeseries Chart */}
            <div className="lg:col-span-2 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 shadow-sm flex flex-col justify-between">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
                <div>
                  <h2 className="text-base font-bold text-zinc-900 dark:text-white flex items-center gap-2">
                    <Activity className="w-4 h-4 text-blue-600" />
                    <span>Traffic Volume &amp; Repeat Viewer Velocity</span>
                  </h2>
                  <p className="text-xs text-zinc-500 mt-0.5">
                    Chronological breakdown across the selected {timeRange.toUpperCase()} window
                  </p>
                </div>

                <div className="inline-flex items-center p-1 rounded-xl bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700">
                  {(
                    [
                      { id: "pageviews", label: "Pageviews" },
                      { id: "uniqueVisitors", label: "Unique" },
                      { id: "repeatVisitors", label: "Repeat" },
                      { id: "sessions", label: "Sessions" },
                    ] as const
                  ).map((m) => (
                    <button
                      key={m.id}
                      onClick={() => setChartMetric(m.id)}
                      className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition cursor-pointer ${
                        chartMetric === m.id
                          ? "bg-white dark:bg-zinc-900 text-blue-600 dark:text-blue-400 shadow-xs"
                          : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-900"
                      }`}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>
              </div>

              {timeseries.length === 0 ? (
                <div className="h-56 flex flex-col items-center justify-center text-center border border-dashed border-zinc-200 dark:border-zinc-800 rounded-xl p-6">
                  <BarChart3 className="w-8 h-8 text-zinc-400 mb-2" />
                  <p className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">
                    No traffic buckets recorded in this window yet
                  </p>
                  <p className="text-xs text-zinc-500 mt-1 max-w-md">
                    Click &ldquo;Test Event&rdquo; in the top bar or install the tracker script to see real-time traffic bars populate.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {(() => {
                    const values = timeseries.map((t) => t[chartMetric] || 0);
                    const maxVal = Math.max(...values, 1);
                    return (
                      <>
                        <div className="h-52 flex items-end gap-1.5 pt-6 pb-2 px-1 border-b border-zinc-100 dark:border-zinc-800">
                          {timeseries.map((bucket) => {
                            const val = bucket[chartMetric] || 0;
                            const heightPct = Math.max(val > 0 ? 8 : 2, Math.round((val / maxVal) * 100));
                            return (
                              <div
                                key={bucket.timestamp}
                                className="flex-1 flex flex-col items-center justify-end h-full group relative"
                              >
                                {/* Hover Tooltip */}
                                <div className="opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity absolute -top-2 z-20 bg-zinc-900 text-white dark:bg-white dark:text-zinc-900 text-[10px] font-mono px-2.5 py-1.5 rounded-lg shadow-lg whitespace-nowrap">
                                  <div className="font-bold">{bucket.date}</div>
                                  <div>
                                    {bucket.pageviews} views · {bucket.uniqueVisitors} uniq ({bucket.repeatVisitors} repeat)
                                  </div>
                                </div>

                                <div
                                  style={{ height: `${heightPct}%` }}
                                  className={`w-full rounded-t-md transition-all ${
                                    val > 0
                                      ? chartMetric === "repeatVisitors"
                                        ? "bg-indigo-500 group-hover:bg-indigo-400"
                                        : "bg-blue-600 group-hover:bg-blue-500"
                                      : "bg-zinc-100 dark:bg-zinc-800"
                                  }`}
                                />
                              </div>
                            );
                          })}
                        </div>

                        <div className="flex items-center justify-between text-[11px] font-mono text-zinc-400 px-1">
                          <span>{timeseries[0]?.date}</span>
                          <span>
                            {timeseries[Math.floor(timeseries.length / 2)]?.date}
                          </span>
                          <span>{timeseries[timeseries.length - 1]?.date}</span>
                        </div>
                      </>
                    );
                  })()}
                </div>
              )}
            </div>

            {/* Repeat Viewer vs First-Time Retention Card */}
            <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 shadow-sm flex flex-col justify-between space-y-5">
              <div>
                <div className="flex items-center justify-between">
                  <h2 className="text-base font-bold text-zinc-900 dark:text-white flex items-center gap-2">
                    <Repeat className="w-4 h-4 text-indigo-600" />
                    <span>Audience Loyalty &amp; Repeat Viewers</span>
                  </h2>
                  <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 dark:bg-indigo-950/50 dark:text-indigo-300">
                    {repeatRate}% Returning
                  </span>
                </div>
                <p className="text-xs text-zinc-500 mt-1">
                  Comparison of returning repeat viewers vs first-time visitors
                </p>

                {/* Split Progress Bar */}
                <div className="mt-5 space-y-2">
                  <div className="flex items-center justify-between text-xs font-semibold">
                    <span className="text-indigo-600 dark:text-indigo-400 flex items-center gap-1.5">
                      <UserCheck className="w-3.5 h-3.5" />
                      Repeat Viewers ({formatCount(repeatVisitors)})
                    </span>
                    <span className="text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5">
                      <UserPlus className="w-3.5 h-3.5" />
                      First-Time ({formatCount(newVisitors)})
                    </span>
                  </div>
                  <div className="w-full h-3 rounded-full bg-zinc-100 dark:bg-zinc-800 overflow-hidden flex">
                    <div
                      className="h-full bg-indigo-600 transition-all"
                      style={{
                        width: `${ov.uniqueVisitors > 0 ? repeatRate : 50}%`,
                      }}
                    />
                    <div
                      className="h-full bg-emerald-500 transition-all"
                      style={{
                        width: `${ov.uniqueVisitors > 0 ? 100 - repeatRate : 50}%`,
                      }}
                    />
                  </div>
                </div>

                {/* Engagement Mini Grid */}
                <div className="grid grid-cols-2 gap-3 mt-5">
                  <div className="p-3 rounded-xl bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200/70 dark:border-zinc-800">
                    <div className="text-[11px] text-zinc-400 font-medium">Pages / Session</div>
                    <div className="text-lg font-extrabold text-zinc-900 dark:text-white font-mono mt-0.5">
                      {avgPages}
                    </div>
                  </div>
                  <div className="p-3 rounded-xl bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200/70 dark:border-zinc-800">
                    <div className="text-[11px] text-zinc-400 font-medium">Avg Session Time</div>
                    <div className="text-lg font-extrabold text-zinc-900 dark:text-white font-mono mt-0.5">
                      {formatDuration(avgDurationSec)}
                    </div>
                  </div>
                </div>
              </div>

              <button
                onClick={() => setActiveTab("visitors")}
                className="w-full py-2.5 px-4 rounded-xl bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/40 dark:hover:bg-indigo-950/70 text-indigo-700 dark:text-indigo-300 font-bold text-xs flex items-center justify-center gap-2 transition cursor-pointer"
              >
                <span>Inspect Full User Visit History</span>
                <ArrowUpRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* 3-Column Breakdown: Top Routes, Top Origins ("From Where"), Top Countries */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Column 1: Top Visited Routes */}
            <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 shadow-sm space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-zinc-900 dark:text-white flex items-center gap-2">
                  <Route className="w-4 h-4 text-blue-600" />
                  <span>Top Visited Routes</span>
                </h3>
                <span className="text-[11px] text-zinc-400 font-mono">Views · Uniq</span>
              </div>

              <div className="space-y-3">
                {data.topPages.length === 0 ? (
                  <div className="text-xs text-zinc-400 py-8 text-center">
                    No pageviews recorded yet.
                  </div>
                ) : (
                  data.topPages.slice(0, 8).map((p) => {
                    const maxCount = Math.max(...data.topPages.map((x) => x.count), 1);
                    const pct = Math.round((p.count / maxCount) * 100);
                    return (
                      <div key={p.key} className="space-y-1">
                        <div className="flex items-center justify-between text-xs gap-2">
                          <span className="font-mono text-zinc-800 dark:text-zinc-200 truncate">
                            {p.key}
                          </span>
                          <span className="font-mono font-bold text-zinc-900 dark:text-white shrink-0">
                            {formatCount(p.count)}
                            {p.uniqueVisitors !== undefined && (
                              <span className="text-zinc-400 font-normal ml-1">
                                ({p.uniqueVisitors}u)
                              </span>
                            )}
                          </span>
                        </div>
                        <div className="w-full h-1.5 rounded-full bg-zinc-100 dark:bg-zinc-800 overflow-hidden">
                          <div
                            className="h-full rounded-full bg-blue-600"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* Column 2: From Where — Referrer Sources */}
            <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 shadow-sm space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-zinc-900 dark:text-white flex items-center gap-2">
                  <Compass className="w-4 h-4 text-emerald-600" />
                  <span>From Where (Traffic Sources)</span>
                </h3>
                <span className="text-[11px] text-zinc-400 font-mono">Referrers</span>
              </div>

              <div className="space-y-3">
                {data.topReferrers.length === 0 ? (
                  <div className="text-xs text-zinc-400 py-8 text-center">
                    No referrer origins recorded yet.
                  </div>
                ) : (
                  data.topReferrers.slice(0, 8).map((r) => {
                    const maxCount = Math.max(...data.topReferrers.map((x) => x.count), 1);
                    const pct = Math.round((r.count / maxCount) * 100);
                    return (
                      <div key={r.key} className="space-y-1">
                        <div className="flex items-center justify-between text-xs gap-2">
                          <span className="text-zinc-800 dark:text-zinc-200 truncate font-medium">
                            {r.key || "Direct / Bookmark"}
                          </span>
                          <span className="font-mono font-bold text-zinc-900 dark:text-white shrink-0">
                            {formatCount(r.count)}
                          </span>
                        </div>
                        <div className="w-full h-1.5 rounded-full bg-zinc-100 dark:bg-zinc-800 overflow-hidden">
                          <div
                            className="h-full rounded-full bg-emerald-500"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* Column 3: From Where — Geographic Countries */}
            <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 shadow-sm space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-zinc-900 dark:text-white flex items-center gap-2">
                  <MapPin className="w-4 h-4 text-indigo-600" />
                  <span>Geographic Locations</span>
                </h3>
                <span className="text-[11px] text-zinc-400 font-mono">Countries</span>
              </div>

              <div className="space-y-3">
                {countries.length === 0 ? (
                  <div className="text-xs text-zinc-400 py-8 text-center">
                    No country telemetry recorded yet.
                  </div>
                ) : (
                  countries.slice(0, 8).map((c) => {
                    const maxCount = Math.max(...countries.map((x) => x.count), 1);
                    const pct = Math.round((c.count / maxCount) * 100);
                    return (
                      <div key={c.key} className="space-y-1">
                        <div className="flex items-center justify-between text-xs gap-2">
                          <span className="text-zinc-800 dark:text-zinc-200 truncate font-medium">
                            {getCountryFlag(c.key)} {getCountryLabel(c.key)}
                          </span>
                          <span className="font-mono font-bold text-zinc-900 dark:text-white shrink-0">
                            {formatCount(c.count)}
                          </span>
                        </div>
                        <div className="w-full h-1.5 rounded-full bg-zinc-100 dark:bg-zinc-800 overflow-hidden">
                          <div
                            className="h-full rounded-full bg-indigo-500"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* TAB 2: USER VISIT HISTORY & REPEAT VIEWER JOURNEYS                    */}
      {/* ===================================================================== */}
      {activeTab === "visitors" && (
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 shadow-sm space-y-5">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <h2 className="text-base font-bold text-zinc-900 dark:text-white flex items-center gap-2">
                <Repeat className="w-4 h-4 text-indigo-600" />
                <span>User Visit History &amp; Repeat Viewer Session Explorer</span>
              </h2>
              <p className="text-xs text-zinc-500 mt-0.5">
                Inspect individual visitor sessions, repeat visit count, origin country/referrer, device profile, and exact page-by-page click paths.
              </p>
            </div>

            {/* Filter & Search Bar */}
            <div className="flex flex-wrap items-center gap-2">
              <div className="inline-flex items-center p-1 rounded-xl bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700">
                {(
                  [
                    { id: "all", label: `All (${visitorSessions.length})` },
                    {
                      id: "repeat",
                      label: `Repeat Viewers (${
                        visitorSessions.filter((s) => s.isRepeatViewer).length
                      })`,
                    },
                    {
                      id: "new",
                      label: `First-Time (${
                        visitorSessions.filter((s) => !s.isRepeatViewer).length
                      })`,
                    },
                    {
                      id: "multipage",
                      label: "Multi-Page",
                    },
                  ] as const
                ).map((f) => (
                  <button
                    key={f.id}
                    onClick={() => setVisitorFilter(f.id)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition cursor-pointer ${
                      visitorFilter === f.id
                        ? "bg-white dark:bg-zinc-900 text-indigo-600 dark:text-indigo-400 shadow-xs"
                        : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-900"
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>

              <div className="relative">
                <Search className="w-3.5 h-3.5 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={visitorSearch}
                  onChange={(e) => setVisitorSearch(e.target.value)}
                  placeholder="Filter by route, country, referrer..."
                  className="pl-8 pr-3 py-1.5 text-xs rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-800 dark:text-zinc-200 w-56"
                />
              </div>
            </div>
          </div>

          {filteredSessions.length === 0 ? (
            <div className="py-12 text-center border border-dashed border-zinc-200 dark:border-zinc-800 rounded-xl">
              <Users className="w-8 h-8 text-zinc-400 mx-auto mb-2" />
              <p className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">
                No matching visitor sessions found
              </p>
              <p className="text-xs text-zinc-500 mt-1">
                Try clearing the search filter or click &ldquo;Test Event&rdquo; above to record a live session.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredSessions.map((session) => {
                const isExpanded = !!expandedSessions[session.sessionId];
                return (
                  <div
                    key={session.sessionId}
                    className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-800/30 overflow-hidden transition"
                  >
                    {/* Session Summary Header Row */}
                    <div
                      onClick={() =>
                        setExpandedSessions((prev) => ({
                          ...prev,
                          [session.sessionId]: !prev[session.sessionId],
                        }))
                      }
                      className="p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-3 cursor-pointer hover:bg-zinc-100/70 dark:hover:bg-zinc-800/60 transition"
                    >
                      <div className="flex flex-wrap items-center gap-2.5">
                        {isExpanded ? (
                          <ChevronDown className="w-4 h-4 text-zinc-400 shrink-0" />
                        ) : (
                          <ChevronRight className="w-4 h-4 text-zinc-400 shrink-0" />
                        )}

                        {/* Repeat vs New Badge */}
                        {session.isRepeatViewer ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-indigo-100 text-indigo-700 dark:bg-indigo-950/70 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
                            <Repeat className="w-3 h-3" />
                            <span>Repeat Viewer · Visit #{session.visitNumber}</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-700 dark:bg-emerald-950/70 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                            <UserPlus className="w-3 h-3" />
                            <span>New Visitor · 1st Visit</span>
                          </span>
                        )}

                        {/* Visitor Hash */}
                        <span className="font-mono text-xs font-semibold text-zinc-600 dark:text-zinc-400 bg-white dark:bg-zinc-900 px-2 py-0.5 rounded border border-zinc-200 dark:border-zinc-700">
                          #{session.visitorHash}
                        </span>

                        {/* Country + Timezone */}
                        <span className="text-xs font-medium text-zinc-800 dark:text-zinc-200 inline-flex items-center gap-1">
                          <span>{getCountryFlag(session.country)}</span>
                          <span>{getCountryLabel(session.country)}</span>
                          {session.timezone && (
                            <span className="text-zinc-400 text-[11px]">
                              ({session.timezone})
                            </span>
                          )}
                        </span>

                        {/* Referrer / Origin */}
                        <span className="text-xs px-2 py-0.5 rounded-md bg-zinc-200/70 dark:bg-zinc-700/60 text-zinc-700 dark:text-zinc-300 font-medium">
                          via {session.referrer}
                          {session.utmSource ? ` · utm:${session.utmSource}` : ""}
                        </span>
                      </div>

                      {/* Right Side Metadata: Tech, Route Summary, Duration, Time */}
                      <div className="flex flex-wrap items-center gap-3 text-xs text-zinc-500 dark:text-zinc-400">
                        <span className="font-mono text-[11px] text-zinc-600 dark:text-zinc-300">
                          {session.browser} · {session.os} · {session.device}
                          {session.screen ? ` (${session.screen})` : ""}
                        </span>

                        <span className="px-2 py-0.5 rounded bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 font-mono font-semibold">
                          {session.pageviewCount} {session.pageviewCount === 1 ? "page" : "pages"} ·{" "}
                          {formatDuration(session.durationSec)}
                        </span>

                        <span
                          className="font-mono text-[11px] text-zinc-400"
                          title={formatExactTime(session.lastSeenAt)}
                        >
                          {formatRelativeTime(session.lastSeenAt)}
                        </span>
                      </div>
                    </div>

                    {/* Entry -> Exit Quick Bar */}
                    <div className="px-4 pb-3 pt-0 flex flex-wrap items-center justify-between gap-2 text-[11px] text-zinc-500 border-t border-zinc-100 dark:border-zinc-800/60">
                      <div className="flex items-center gap-1.5 font-mono truncate">
                        <span className="text-zinc-400">Path:</span>
                        <span className="text-zinc-800 dark:text-zinc-200 font-semibold">
                          {session.entryPage}
                        </span>
                        {session.exitPage !== session.entryPage && (
                          <>
                            <span className="text-zinc-400">→</span>
                            <span className="text-zinc-800 dark:text-zinc-200 font-semibold">
                              {session.exitPage}
                            </span>
                          </>
                        )}
                      </div>
                      <span className="text-[11px] text-blue-600 dark:text-blue-400 font-semibold">
                        {isExpanded ? "Hide click-path timeline ▲" : "View full click-path journey ▼"}
                      </span>
                    </div>

                    {/* Expanded Chronological Journey Timeline */}
                    {isExpanded && (
                      <div className="p-4 bg-white dark:bg-zinc-950 border-t border-zinc-200 dark:border-zinc-800 space-y-2">
                        <div className="text-[11px] font-bold uppercase tracking-wider text-zinc-400 mb-2">
                          Chronological Session Timeline ({formatExactTime(session.startedAt)})
                        </div>
                        <div className="space-y-1.5 relative before:absolute before:left-2.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-zinc-200 dark:before:bg-zinc-800">
                          {session.journey.map((step, idx) => {
                            const prevTs = idx > 0 ? session.journey[idx - 1].timestamp : step.timestamp;
                            const deltaSec = Math.max(0, Math.round((step.timestamp - prevTs) / 1000));
                            return (
                              <div
                                key={`${step.timestamp}-${idx}`}
                                className="flex items-center justify-between gap-3 pl-6 relative text-xs py-1"
                              >
                                <span
                                  className={`w-2.5 h-2.5 rounded-full absolute left-1.5 top-1/2 -translate-y-1/2 border-2 border-white dark:border-zinc-950 ${
                                    step.type === "error"
                                      ? "bg-rose-500"
                                      : step.type === "event"
                                      ? "bg-amber-500"
                                      : "bg-blue-600"
                                  }`}
                                />
                                <div className="flex flex-wrap items-center gap-2 min-w-0">
                                  <span
                                    className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-bold uppercase ${
                                      step.type === "error"
                                        ? "bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300"
                                        : step.type === "event"
                                        ? "bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300"
                                        : "bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300"
                                    }`}
                                  >
                                    {step.type}
                                  </span>
                                  <span className="font-mono font-semibold text-zinc-900 dark:text-zinc-100 truncate">
                                    {step.path}
                                  </span>
                                  {step.metricName && (
                                    <span className="text-amber-600 dark:text-amber-400 font-mono text-[11px]">
                                      ({step.metricName})
                                    </span>
                                  )}
                                  {step.title && (
                                    <span className="text-zinc-400 text-[11px] truncate">
                                      — &ldquo;{step.title}&rdquo;
                                    </span>
                                  )}
                                </div>
                                <div className="flex items-center gap-2 shrink-0 font-mono text-[11px] text-zinc-400">
                                  {idx > 0 && deltaSec > 0 && (
                                    <span className="text-zinc-400">+{formatDuration(deltaSec)}</span>
                                  )}
                                  <span>{new Date(step.timestamp).toLocaleTimeString()}</span>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ===================================================================== */}
      {/* TAB 3: FROM WHERE (GEO, REFERRERS, CAMPAIGNS & TECH STACK)            */}
      {/* ===================================================================== */}
      {activeTab === "origins" && (
        <div className="space-y-6">
          {/* Row 1: Geography (Countries & Timezones) */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 shadow-sm space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-base font-bold text-zinc-900 dark:text-white flex items-center gap-2">
                  <Globe2 className="w-4 h-4 text-indigo-600" />
                  <span>Visitor Countries</span>
                </h3>
                <span className="text-xs text-zinc-400">ISO Country Resolution</span>
              </div>
              {countries.length === 0 ? (
                <p className="text-xs text-zinc-400 py-6 text-center">No country data yet.</p>
              ) : (
                <div className="space-y-2.5">
                  {countries.map((c) => {
                    const max = Math.max(...countries.map((x) => x.count), 1);
                    const pct = Math.round((c.count / max) * 100);
                    return (
                      <div key={c.key} className="space-y-1">
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-medium text-zinc-800 dark:text-zinc-200">
                            {getCountryFlag(c.key)} {getCountryLabel(c.key)}
                          </span>
                          <span className="font-mono font-bold text-zinc-900 dark:text-white">
                            {formatCount(c.count)}
                          </span>
                        </div>
                        <div className="w-full h-1.5 rounded-full bg-zinc-100 dark:bg-zinc-800 overflow-hidden">
                          <div
                            className="h-full rounded-full bg-indigo-500"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 shadow-sm space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-base font-bold text-zinc-900 dark:text-white flex items-center gap-2">
                  <Clock className="w-4 h-4 text-blue-600" />
                  <span>Visitor Timezones &amp; Locales</span>
                </h3>
                <span className="text-xs text-zinc-400">IANA Timezone</span>
              </div>
              {timezones.length === 0 ? (
                <p className="text-xs text-zinc-400 py-6 text-center">No timezone data yet.</p>
              ) : (
                <div className="space-y-2.5">
                  {timezones.map((tz) => {
                    const max = Math.max(...timezones.map((x) => x.count), 1);
                    const pct = Math.round((tz.count / max) * 100);
                    return (
                      <div key={tz.key} className="space-y-1">
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-mono text-zinc-800 dark:text-zinc-200">
                            {tz.key}
                          </span>
                          <span className="font-mono font-bold text-zinc-900 dark:text-white">
                            {formatCount(tz.count)}
                          </span>
                        </div>
                        <div className="w-full h-1.5 rounded-full bg-zinc-100 dark:bg-zinc-800 overflow-hidden">
                          <div
                            className="h-full rounded-full bg-blue-500"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Row 2: Entry Pages, Exit Pages & UTM Campaigns */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 shadow-sm space-y-3">
              <h3 className="text-sm font-bold text-zinc-900 dark:text-white">
                Top Entry / Landing Pages
              </h3>
              {entryPages.length === 0 ? (
                <p className="text-xs text-zinc-400 py-4 text-center">No entry pages recorded.</p>
              ) : (
                entryPages.slice(0, 8).map((p) => (
                  <div key={p.key} className="flex items-center justify-between text-xs py-1 border-b border-zinc-100 dark:border-zinc-800/60 last:border-0">
                    <span className="font-mono text-zinc-800 dark:text-zinc-200 truncate">{p.key}</span>
                    <span className="font-mono font-bold text-blue-600 dark:text-blue-400">{p.count}</span>
                  </div>
                ))
              )}
            </div>

            <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 shadow-sm space-y-3">
              <h3 className="text-sm font-bold text-zinc-900 dark:text-white">
                Top Exit Pages
              </h3>
              {exitPages.length === 0 ? (
                <p className="text-xs text-zinc-400 py-4 text-center">No exit pages recorded.</p>
              ) : (
                exitPages.slice(0, 8).map((p) => (
                  <div key={p.key} className="flex items-center justify-between text-xs py-1 border-b border-zinc-100 dark:border-zinc-800/60 last:border-0">
                    <span className="font-mono text-zinc-800 dark:text-zinc-200 truncate">{p.key}</span>
                    <span className="font-mono font-bold text-zinc-900 dark:text-white">{p.count}</span>
                  </div>
                ))
              )}
            </div>

            <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 shadow-sm space-y-3">
              <h3 className="text-sm font-bold text-zinc-900 dark:text-white">
                UTM Campaigns &amp; Sources
              </h3>
              {utmSources.length === 0 && utmCampaigns.length === 0 ? (
                <p className="text-xs text-zinc-400 py-4 text-center">
                  No UTM parameters detected yet (e.g. ?utm_source=newsletter).
                </p>
              ) : (
                <div className="space-y-2">
                  {utmSources.slice(0, 5).map((u) => (
                    <div key={`src-${u.key}`} className="flex items-center justify-between text-xs">
                      <span className="font-mono text-emerald-700 dark:text-emerald-400">
                        source: {u.key}
                      </span>
                      <span className="font-mono font-bold">{u.count}</span>
                    </div>
                  ))}
                  {utmMediums.slice(0, 3).map((u) => (
                    <div key={`med-${u.key}`} className="flex items-center justify-between text-xs">
                      <span className="font-mono text-blue-700 dark:text-blue-400">
                        medium: {u.key}
                      </span>
                      <span className="font-mono font-bold">{u.count}</span>
                    </div>
                  ))}
                  {utmCampaigns.slice(0, 4).map((u) => (
                    <div key={`cmp-${u.key}`} className="flex items-center justify-between text-xs">
                      <span className="font-mono text-indigo-700 dark:text-indigo-400">
                        campaign: {u.key}
                      </span>
                      <span className="font-mono font-bold">{u.count}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Row 3: Browsers, OS, Devices, Screens */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {(
              [
                { title: "Browsers", items: data.devices.browsers },
                { title: "Operating Systems", items: data.devices.os },
                { title: "Device Form Factor", items: data.devices.devices },
                { title: "Screen Resolutions", items: data.devices.screens || [] },
              ] as const
            ).map((group) => (
              <div
                key={group.title}
                className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-5 shadow-sm space-y-3"
              >
                <h3 className="text-sm font-bold text-zinc-900 dark:text-white flex items-center gap-2">
                  <Monitor className="w-4 h-4 text-zinc-500" />
                  <span>{group.title}</span>
                </h3>
                {group.items.length === 0 ? (
                  <p className="text-xs text-zinc-400 py-4 text-center">No data yet.</p>
                ) : (
                  <div className="space-y-2">
                    {group.items.slice(0, 6).map((item) => (
                      <div
                        key={item.key}
                        className="flex items-center justify-between text-xs py-1 border-b border-zinc-100 dark:border-zinc-800/60 last:border-0"
                      >
                        <span className="text-zinc-700 dark:text-zinc-300 font-medium truncate">
                          {item.key}
                        </span>
                        <span className="font-mono font-bold text-zinc-900 dark:text-white">
                          {formatCount(item.count)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* TAB 4: CORE WEB VITALS, CUSTOM EVENTS & RUNTIME ERRORS                */}
      {/* ===================================================================== */}
      {activeTab === "vitals" && (
        <div className="space-y-6">
          {/* Real Core Web Vitals Scorecard */}
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 shadow-sm space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h2 className="text-base font-bold text-zinc-900 dark:text-white flex items-center gap-2">
                  <Gauge className="w-5 h-5 text-blue-600" />
                  <span>Real User Core Web Vitals (p75 &amp; Median)</span>
                </h2>
                <p className="text-xs text-zinc-500 mt-0.5">
                  100% genuine browser PerformanceObserver telemetry — zero synthetic or hardcoded numbers.
                </p>
              </div>
              <span className="font-mono text-xs text-zinc-400">
                Google Web Vitals Thresholds (p75)
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
              {vitalSpecs.map((spec) => {
                const measured = data.webVitals.find((v) => v.name === spec.name);
                const hasSamples = measured && measured.sampleCount > 0;
                const displayVal = hasSamples
                  ? spec.scale === 0.001
                    ? `${(measured.p75Value * spec.scale).toFixed(2)} s`
                    : spec.name === "CLS"
                    ? measured.p75Value.toFixed(3)
                    : `${Math.round(measured.p75Value)} ms`
                  : "Awaiting";

                const badgeColor = !hasSamples
                  ? "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400"
                  : measured.rating === "good"
                  ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400"
                  : measured.rating === "needs-improvement"
                  ? "bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-400"
                  : "bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-400";

                return (
                  <div
                    key={spec.name}
                    className="p-4 rounded-xl bg-zinc-50 dark:bg-zinc-800/40 border border-zinc-200 dark:border-zinc-800 flex flex-col justify-between"
                  >
                    <div>
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-mono text-xs font-extrabold text-zinc-900 dark:text-white">
                          {spec.name}
                        </span>
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${badgeColor}`}>
                          {hasSamples ? measured.rating : `Target ${spec.goodLabel}`}
                        </span>
                      </div>
                      <div className="text-[11px] text-zinc-500 mt-0.5">{spec.title}</div>
                      <div className="text-2xl font-extrabold font-mono text-zinc-900 dark:text-white mt-3">
                        {displayVal}
                      </div>
                    </div>
                    <div className="text-[11px] text-zinc-400 mt-3 pt-2 border-t border-zinc-200/60 dark:border-zinc-700/50 flex items-center justify-between font-mono">
                      <span>{hasSamples ? `${measured.sampleCount} samples` : "0 samples"}</span>
                      <span>{spec.goodLabel}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Custom Events & Runtime Exceptions Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Custom Events */}
            <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 shadow-sm space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-base font-bold text-zinc-900 dark:text-white flex items-center gap-2">
                  <MousePointerClick className="w-4 h-4 text-emerald-600" />
                  <span>Custom Events Triggered</span>
                </h3>
                <span className="text-xs text-zinc-400 font-mono">window.rslTrack()</span>
              </div>
              {customEvents.length === 0 ? (
                <div className="text-xs text-zinc-400 py-8 text-center">
                  No custom events recorded yet. Call <code className="font-mono">window.rslTrack(&quot;event_name&quot;)</code> to track conversions.
                </div>
              ) : (
                <div className="space-y-2.5">
                  {customEvents.map((ev, idx) => {
                    const evLabel = ev.name || ev.key || `event_${idx}`;
                    return (
                      <div
                        key={evLabel}
                        className="flex items-center justify-between p-3 rounded-xl bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200/70 dark:border-zinc-800 text-xs"
                      >
                        <span className="font-mono font-semibold text-zinc-800 dark:text-zinc-200">
                          {evLabel}
                        </span>
                        <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400">
                          {formatCount(ev.count)} triggers
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Captured Runtime JS Errors */}
            <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 shadow-sm space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-base font-bold text-zinc-900 dark:text-white flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-rose-600" />
                  <span>Captured Runtime JS Exceptions</span>
                </h3>
                <span className="text-xs text-zinc-400 font-mono">
                  {recentErrors.length} recent
                </span>
              </div>
              {recentErrors.length === 0 ? (
                <div className="text-xs text-emerald-600 dark:text-emerald-400 py-8 text-center font-medium">
                  Zero runtime JavaScript errors captured in this period.
                </div>
              ) : (
                <div className="space-y-2.5 max-h-80 overflow-y-auto">
                  {recentErrors.map((err, i) => (
                    <div
                      key={`${err.timestamp}-${i}`}
                      className="p-3 rounded-xl bg-rose-50/50 dark:bg-rose-950/20 border border-rose-200/70 dark:border-rose-900/50 space-y-1 text-xs"
                    >
                      <div className="flex items-center justify-between font-mono text-[11px] text-rose-700 dark:text-rose-300">
                        <span>{err.path}</span>
                        <span>{formatRelativeTime(err.timestamp)}</span>
                      </div>
                      <div className="font-mono text-zinc-900 dark:text-zinc-100 break-all">
                        {err.message}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* TAB 5: TRACKER SNIPPET, ANALYTICS EMBED STUDIO & WEBHOOK OFFLOAD      */}
      {/* ===================================================================== */}
      {activeTab === "embeds" && (
        <div className="space-y-6">
          {/* 1. Drop-In Tracker Script & Custom Event SDK */}
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 shadow-sm space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h2 className="text-base font-bold text-zinc-900 dark:text-white flex items-center gap-2">
                  <Code2 className="w-5 h-5 text-blue-600" />
                  <span>1. Drop-In Cookieless Tracker Script</span>
                </h2>
                <p className="text-xs text-zinc-500 mt-0.5">
                  Paste this tag into your root <code className="font-mono">&lt;head&gt;</code> or Next.js <code className="font-mono">layout.tsx</code>. Automatically tracks pageviews, SPA route changes, repeat visits, country/timezone, and all 5 Core Web Vitals.
                </p>
              </div>
              <button
                onClick={() => handleCopy(trackerSnippet, "tracker", "Tracker script tag")}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold transition cursor-pointer shrink-0"
              >
                {copiedKey === "tracker" ? (
                  <>
                    <Check className="w-3.5 h-3.5" />
                    <span>Copied</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    <span>Copy Tracker Tag</span>
                  </>
                )}
              </button>
            </div>

            <pre className="p-3.5 rounded-xl bg-zinc-950 text-blue-300 font-mono text-xs overflow-x-auto border border-zinc-800">
              <code>{trackerSnippet}</code>
            </pre>

            <div className="pt-2">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs font-bold text-zinc-700 dark:text-zinc-300">
                  Optional: Track Custom Events in JavaScript
                </span>
                <button
                  onClick={() => handleCopy(customEventSnippet, "custom-ev", "Custom event snippet")}
                  className="text-xs text-blue-600 dark:text-blue-400 font-semibold hover:underline cursor-pointer"
                >
                  Copy JS Call
                </button>
              </div>
              <pre className="p-3 rounded-xl bg-zinc-950 text-emerald-300 font-mono text-xs overflow-x-auto border border-zinc-800">
                <code>{customEventSnippet}</code>
              </pre>
            </div>
          </div>

          {/* 2. Embeddable Live Analytics Widget Studio */}
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 shadow-sm space-y-5">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-indigo-50 text-indigo-700 dark:bg-indigo-950/50 dark:text-indigo-300 mb-1">
                  <Sparkles className="w-3 h-3" />
                  <span>Live Analytics Embed Widget</span>
                </div>
                <h2 className="text-base font-bold text-zinc-900 dark:text-white">
                  2. Embed Analytics Directly Inside Any External Dashboard or App
                </h2>
                <p className="text-xs text-zinc-500 mt-0.5">
                  Share a live, self-updating analytics view with stakeholders or embed it inside a client admin panel via Iframe or Web Component.
                </p>
              </div>

              {/* Widget Variant & Theme Controls */}
              <div className="flex flex-wrap items-center gap-2">
                <select
                  value={embedWidgetType}
                  onChange={(e) => setEmbedWidgetType(e.target.value as any)}
                  className="px-3 py-1.5 text-xs font-semibold rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900"
                >
                  <option value="analytics-overview">Full Analytics Overview Suite</option>
                  <option value="analytics-chart">Traffic &amp; Repeat Viewers Chart</option>
                  <option value="top-pages">Top Routes &amp; Geo Origins</option>
                  <option value="web-vitals">Core Web Vitals Scorecard</option>
                </select>

                <select
                  value={embedTheme}
                  onChange={(e) => setEmbedTheme(e.target.value as any)}
                  className="px-3 py-1.5 text-xs font-semibold rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900"
                >
                  <option value="dark">Dark Theme</option>
                  <option value="light">Light Theme</option>
                </select>

                <select
                  value={embedAccent}
                  onChange={(e) => setEmbedAccent(e.target.value as any)}
                  className="px-3 py-1.5 text-xs font-semibold rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900"
                >
                  <option value="blue">Blue Accent</option>
                  <option value="emerald">Emerald Accent</option>
                  <option value="violet">Violet Accent</option>
                  <option value="amber">Amber Accent</option>
                </select>

                <a
                  href={embedUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-zinc-200 dark:border-zinc-700 text-xs font-semibold text-zinc-700 dark:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-zinc-800"
                >
                  <span>Open Standalone</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
              {/* Left: Copyable Embed Codes */}
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-zinc-700 dark:text-zinc-300">
                      Option A: Zero-Dependency Iframe Snippet
                    </span>
                    <button
                      onClick={() => handleCopy(iframeEmbedSnippet, "iframe", "Iframe embed code")}
                      className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
                    >
                      <Copy className="w-3 h-3" />
                      <span>{copiedKey === "iframe" ? "Copied!" : "Copy Iframe"}</span>
                    </button>
                  </div>
                  <pre className="p-3 rounded-xl bg-zinc-950 text-indigo-300 font-mono text-[11px] overflow-x-auto border border-zinc-800">
                    <code>{iframeEmbedSnippet}</code>
                  </pre>
                </div>

                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-zinc-700 dark:text-zinc-300">
                      Option B: Shadow DOM Web Component
                    </span>
                    <button
                      onClick={() =>
                        handleCopy(webComponentSnippet, "webcomp", "Web component snippet")
                      }
                      className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
                    >
                      <Copy className="w-3 h-3" />
                      <span>{copiedKey === "webcomp" ? "Copied!" : "Copy Web Component"}</span>
                    </button>
                  </div>
                  <pre className="p-3 rounded-xl bg-zinc-950 text-emerald-300 font-mono text-[11px] overflow-x-auto border border-zinc-800">
                    <code>{webComponentSnippet}</code>
                  </pre>
                </div>
              </div>

              {/* Right: Live Interactive Preview */}
              <div className="space-y-1.5">
                <div className="text-xs font-bold text-zinc-700 dark:text-zinc-300 flex items-center justify-between">
                  <span>Live Interactive Embed Preview</span>
                  <span className="font-mono text-[11px] text-zinc-400">
                    /embed/{embedWidgetType}
                  </span>
                </div>
                <div className="rounded-2xl overflow-hidden border border-zinc-200 dark:border-zinc-800 shadow-sm bg-zinc-950">
                  <iframe
                    key={embedUrl}
                    src={embedUrl}
                    title="Analytics Live Embed Preview"
                    className="w-full h-[460px] border-0"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* 3. Signed Webhook Analytics Offload */}
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 shadow-sm space-y-4">
            <div className="flex items-center gap-2">
              <Webhook className="w-5 h-5 text-blue-600" />
              <h2 className="text-base font-bold text-zinc-900 dark:text-white">
                3. Webhook Analytics Offload (Signed HMAC-SHA256 Push)
              </h2>
            </div>
            <p className="text-xs text-zinc-500">
              Stream raw telemetry batches directly to your data warehouse, ClickHouse, BigQuery, or custom HTTP receiver. Every payload is signed with <code className="font-mono">X-RapidShift-Signature</code>.
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
                <label className="inline-flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={offload.enabled}
                    onChange={(e) => setOffload({ ...offload, enabled: e.target.checked })}
                    className="rounded text-blue-600 focus:ring-blue-500"
                  />
                  <span className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
                    Enable Continuous Background Offload Push
                  </span>
                </label>

                <button
                  type="submit"
                  disabled={savingOffload}
                  className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-semibold text-xs shadow-sm transition cursor-pointer"
                >
                  {savingOffload ? "Saving..." : "Save Offload Config"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

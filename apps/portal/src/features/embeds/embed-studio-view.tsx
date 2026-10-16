"use client";

import { useState, useEffect, useMemo } from "react";
import {
  Code2,
  Copy,
  Check,
  Layout,
  ExternalLink,
  Sparkles,
  RefreshCw,
  Key,
  Search,
  Monitor,
  Tablet,
  Smartphone,
  Download,
  CreditCard,
  Server,
  Globe,
  LifeBuoy,
  BarChart3,
  Rocket,
  LayoutDashboard,
} from "lucide-react";
import { useAlert } from "@/components/ui/alert-popup";
import { getSiteOrigin } from "@/lib/site-url";
import { ALL_UNIVERSAL_SCOPES } from "@/features/portal/portal-api-keys-view";

export interface ClientOption {
  id: string;
  name: string;
}

export type WidgetCategory =
  | "all"
  | "billing"
  | "fleet"
  | "monitoring"
  | "support"
  | "analytics"
  | "releases"
  | "dashboard";

export interface WidgetItem {
  id: string;
  name: string;
  tag: string;
  title: string;
  description: string;
  category: Exclude<WidgetCategory, "all">;
  requiredScopes?: string[];
}

export const AVAILABLE_WIDGETS: WidgetItem[] = [
  // Billing (4)
  {
    id: "due-banner",
    name: "due-banner",
    tag: "rsl-due-banner",
    title: "Payment Due Alert Banner",
    description: "Top-bar overdue alert strip with live balance due, countdown, and settlement link.",
    category: "billing",
    requiredScopes: ["billing:read"],
  },
  {
    id: "billing-summary",
    name: "billing-summary",
    tag: "rsl-billing-summary",
    title: "Billing Summary Card",
    description: "Displays current balance due, total paid, next billing date, and active retainer status.",
    category: "billing",
    requiredScopes: ["billing:read"],
  },
  {
    id: "invoice-list",
    name: "invoice-list",
    tag: "rsl-invoice-list",
    title: "Invoice Ledger",
    description: "Issued invoices list with GST tax splits, status badges, and PDF download links.",
    category: "billing",
    requiredScopes: ["billing:read"],
  },
  {
    id: "payment-history",
    name: "payment-history",
    tag: "rsl-payment-history",
    title: "Payment History Ledger",
    description: "Chronological ledger of recorded client payments, transaction references, and methods.",
    category: "billing",
    requiredScopes: ["billing:read"],
  },

  // Fleet & PM2 (3)
  {
    id: "server-status",
    name: "server-status",
    tag: "rsl-server-status",
    title: "Server Health Card",
    description: "High-level health summary of mapped PM2 processes, active nodes, and CPU/RAM load.",
    category: "fleet",
    requiredScopes: ["fleet:read"],
  },
  {
    id: "process-list",
    name: "process-list",
    tag: "rsl-process-list",
    title: "PM2 Process Operations",
    description: "Monitored PM2 processes with CPU/memory telemetry, deploy count, and zero-downtime restart.",
    category: "fleet",
    requiredScopes: ["fleet:read", "fleet:restart"],
  },
  {
    id: "process-detail",
    name: "process-detail",
    tag: "rsl-process-detail",
    title: "Single Process Inspector",
    description: "Deep telemetry card for a primary PM2 process with live logs and self-service restart.",
    category: "fleet",
    requiredScopes: ["fleet:read", "fleet:logs", "fleet:restart"],
  },

  // Domain Monitoring (3)
  {
    id: "domain-status",
    name: "domain-status",
    tag: "rsl-domain-status",
    title: "Domain Uptime & SSL Matrix",
    description: "Live HTTP uptime status, response latency, SSL certificate days remaining, and DNS health.",
    category: "monitoring",
    requiredScopes: ["monitoring:read"],
  },
  {
    id: "ssl-badge",
    name: "ssl-badge",
    tag: "rsl-ssl-badge",
    title: "SSL Certificate Trust Pill",
    description: "Compact TLS/SSL validity badge showing certificate authority and days until expiry.",
    category: "monitoring",
    requiredScopes: ["monitoring:read"],
  },
  {
    id: "incident-banner",
    name: "incident-banner",
    tag: "rsl-incident-banner",
    title: "Active Incident Banner",
    description: "Real-time outage and SSL expiration alert banner for client-facing status pages.",
    category: "monitoring",
    requiredScopes: ["monitoring:read"],
  },

  // Support Desk (3)
  {
    id: "support-widget",
    name: "support-widget",
    tag: "rsl-support-widget",
    title: "Support Desk & Ticket Launcher",
    description: "Interactive support widget allowing clients to raise new tickets and view active threads.",
    category: "support",
    requiredScopes: ["support:read", "support:write"],
  },
  {
    id: "ticket-list",
    name: "ticket-list",
    tag: "rsl-ticket-list",
    title: "Support Ticket Queue",
    description: "24×7 support ticket list with priority badges, escalation level, and status tracking.",
    category: "support",
    requiredScopes: ["support:read"],
  },
  {
    id: "sla-indicator",
    name: "sla-indicator",
    tag: "rsl-sla-indicator",
    title: "24×7 SLA Compliance Card",
    description: "Displays active SLA response target, open ticket count, and escalation readiness.",
    category: "support",
    requiredScopes: ["support:read"],
  },

  // Analytics (5)
  {
    id: "analytics-overview",
    name: "analytics-overview",
    tag: "rsl-analytics-overview",
    title: "Complete Analytics Suite",
    description: "Full traffic dashboard with unique visitors, repeat rate, top pages, geo, and journeys.",
    category: "analytics",
    requiredScopes: ["analytics:read"],
  },
  {
    id: "pageviews-chart",
    name: "pageviews-chart",
    tag: "rsl-pageviews-chart",
    title: "Traffic & Pageviews Chart",
    description: "Time-series traffic bar chart with pageviews, unique visitors, and session metrics.",
    category: "analytics",
    requiredScopes: ["analytics:read"],
  },
  {
    id: "realtime-visitors",
    name: "realtime-visitors",
    tag: "rsl-realtime-visitors",
    title: "Live Active Visitors Pill",
    description: "Compact real-time counter showing active visitors currently browsing the site.",
    category: "analytics",
    requiredScopes: ["analytics:read"],
  },
  {
    id: "top-pages",
    name: "top-pages",
    tag: "rsl-top-pages",
    title: "Top Performing Pages",
    description: "Ranked leaderboard of most visited URLs with relative traffic share bars.",
    category: "analytics",
    requiredScopes: ["analytics:read"],
  },
  {
    id: "web-vitals",
    name: "web-vitals",
    tag: "rsl-web-vitals",
    title: "Core Web Vitals Scorecard",
    description: "Real-user LCP, CLS, INP, FCP, and TTFB performance percentiles.",
    category: "analytics",
    requiredScopes: ["analytics:read"],
  },

  // Releases (1)
  {
    id: "release-list",
    name: "release-list",
    tag: "rsl-release-list",
    title: "Software Releases & Builds",
    description: "Staging, beta, and production release feed with changelogs and preview links.",
    category: "releases",
    requiredScopes: ["releases:read"],
  },

  // Composite Dashboards (4)
  {
    id: "client-dashboard",
    name: "client-dashboard",
    tag: "rsl-client-dashboard",
    title: "All-in-One Client Control Plane",
    description: "Complete multi-tabbed embedded portal with Billing, Fleet, Domains, Support & Analytics.",
    category: "dashboard",
    requiredScopes: ["billing:read", "fleet:read", "monitoring:read", "support:read", "analytics:read"],
  },
  {
    id: "ops-center",
    name: "ops-center",
    tag: "rsl-ops-center",
    title: "DevOps & Uptime Command Card",
    description: "Combined PM2 process fleet health and domain/SSL monitoring operations card.",
    category: "dashboard",
    requiredScopes: ["fleet:read", "monitoring:read"],
  },
  {
    id: "finance-hub",
    name: "finance-hub",
    tag: "rsl-finance-hub",
    title: "Commercial & Finance Hub",
    description: "Unified billing summary, invoice ledger, and payment history card.",
    category: "dashboard",
    requiredScopes: ["billing:read"],
  },
  {
    id: "compact-status-bar",
    name: "compact-status-bar",
    tag: "rsl-compact-status-bar",
    title: "Compact System Status Strip",
    description: "Single-row status bar showing gate status, processes online, domains up, and balance.",
    category: "dashboard",
    requiredScopes: ["billing:read", "fleet:read", "monitoring:read"],
  },
];

interface EmbedStudioViewProps {
  clients: ClientOption[];
  defaultClientId?: string;
  isClientPortal?: boolean;
}

export function EmbedStudioView({
  clients,
  defaultClientId,
  isClientPortal = false,
}: EmbedStudioViewProps) {
  const { showSuccess, showError } = useAlert();
  const [selectedWidget, setSelectedWidget] = useState<WidgetItem>(AVAILABLE_WIDGETS[1]);
  const [selectedClientId, setSelectedClientId] = useState<string>(
    defaultClientId || clients[0]?.id || ""
  );
  const [categoryFilter, setCategoryFilter] = useState<WidgetCategory>("all");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [viewportWidth, setViewportWidth] = useState<"100%" | "768px" | "400px">("100%");
  const [codeTab, setCodeTab] = useState<"webcomponent" | "iframe" | "react" | "api">("webcomponent");
  const [copiedTab, setCopiedTab] = useState<string | null>(null);

  const [authMode, setAuthMode] = useState<"apikey" | "token">("apikey");
  const [universalApiKey, setUniversalApiKey] = useState<string>("");
  const [generatingKey, setGeneratingKey] = useState<boolean>(false);
  const [mintedToken, setMintedToken] = useState<string>("");
  const [minting, setMinting] = useState<boolean>(false);
  const [tokenDurationDays, setTokenDurationDays] = useState<number>(30);
  const [previewKey, setPreviewKey] = useState<number>(0);
  const [previewHeight, setPreviewHeight] = useState<number>(380);

  const origin = getSiteOrigin();

  useEffect(() => {
    try {
      const saved = localStorage.getItem(`rsl_universal_api_key_${selectedClientId}`);
      setUniversalApiKey(saved || "");
    } catch {
      // ignore
    }
  }, [selectedClientId]);

  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      if (e.data && e.data.type === "rsl-embed-resize" && typeof e.data.height === "number") {
        setPreviewHeight(Math.max(110, Math.ceil(e.data.height) + 8));
      }
    };
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, []);

  const filteredWidgets = useMemo(() => {
    return AVAILABLE_WIDGETS.filter((w) => {
      if (categoryFilter !== "all" && w.category !== categoryFilter) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        return (
          w.title.toLowerCase().includes(q) ||
          w.tag.toLowerCase().includes(q) ||
          w.description.toLowerCase().includes(q) ||
          w.category.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [categoryFilter, searchQuery]);

  const handleGenerateUniversalKey = async () => {
    try {
      setGeneratingKey(true);
      const res = await fetch("/api/v1/portal/api-keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientId: selectedClientId,
          name: "Universal Embed & Client API Key",
          type: "publishable",
          scopes: [...ALL_UNIVERSAL_SCOPES],
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.rawKey) {
        throw new Error(json.error || "Failed to generate Universal API Key");
      }
      setUniversalApiKey(json.rawKey);
      setAuthMode("apikey");
      setPreviewKey((k) => k + 1);
      try {
        localStorage.setItem(`rsl_universal_api_key_${selectedClientId}`, json.rawKey);
      } catch {
        // ignore
      }
      showSuccess(
        "Universal API Key Generated",
        "Use this single permanent API key across all 23 Web Components, Iframes, and the Client Data API without ever having to mint tokens.",
        [
          { label: "Universal API Key", value: json.rawKey, copyable: true, isMonospace: true },
          { label: "Target Account", value: selectedClientId },
        ],
        json.rawKey
      );
    } catch (err: any) {
      showError("API Key Error", err.message || "Failed to generate API key.");
    } finally {
      setGeneratingKey(false);
    }
  };

  const handleMintToken = async () => {
    try {
      setMinting(true);
      const res = await fetch("/api/v1/embed-tokens", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientId: selectedClientId,
          scopes: selectedWidget.requiredScopes?.length
            ? selectedWidget.requiredScopes
            : ["billing:read", "fleet:read", "monitoring:read", "support:read", "releases:read", "analytics:read"],
          ttlMs: tokenDurationDays * 86400000,
        }),
      });

      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || "Failed to mint embed token");
      }

      const token = json.data?.token || json.token || `emb_${Date.now().toString(36)}`;
      setMintedToken(token);
      setPreviewKey((k) => k + 1);

      showSuccess(
        "Embed Token Minted",
        `Token generated with ${tokenDurationDays}-day validity for ${selectedWidget.title}.`,
        [
          { label: "Token ID", value: token },
          { label: "Valid For", value: `${tokenDurationDays} Days` },
          { label: "Target Account", value: selectedClientId },
        ]
      );
    } catch (err: any) {
      showError("Token Error", err.message || "Failed to generate token.");
    } finally {
      setMinting(false);
    }
  };

  const displayApiKey = universalApiKey || "rpk_live_YOUR_UNIVERSAL_API_KEY";

  const previewUrl =
    authMode === "apikey" && universalApiKey
      ? `${origin}/embed/${selectedWidget.name}?apiKey=${universalApiKey}&theme=${theme}`
      : `${origin}/embed/${selectedWidget.name}?clientId=${selectedClientId}&theme=${theme}${
          mintedToken ? `&token=${mintedToken}` : ""
        }`;

  const webComponentSnippet =
    authMode === "apikey"
      ? `<!-- 1. Include RapidShift Embed Runtime in <head> (Works for all 23 widgets) -->
<script defer src="${origin}/embed.js" data-api-key="${displayApiKey}"></script>

<!-- 2. Place Card-Only Web Component anywhere on your page -->
<${selectedWidget.tag} api-key="${displayApiKey}" theme="${theme}"></${selectedWidget.tag}>`
      : `<!-- 1. Include RapidShift Embed Runtime in <head> -->
<script defer src="${origin}/embed.js"></script>

<!-- 2. Place Card-Only Web Component anywhere on your page -->
<${selectedWidget.tag} client="${selectedClientId}"${
          mintedToken ? ` token="${mintedToken}"` : ""
        } theme="${theme}"></${selectedWidget.tag}>`;

  const iframeSnippet =
    authMode === "apikey"
      ? `<iframe
  src="${origin}/embed/${selectedWidget.name}?apiKey=${displayApiKey}&theme=${theme}"
  width="100%"
  frameborder="0"
  allowtransparency="true"
  style="border: none; width: 100%; background: transparent; display: block; min-height: 260px;"
  loading="lazy"
  title="${selectedWidget.title}">
</iframe>`
      : `<iframe
  src="${previewUrl}"
  width="100%"
  frameborder="0"
  allowtransparency="true"
  style="border: none; width: 100%; background: transparent; display: block; min-height: 260px;"
  loading="lazy"
  title="${selectedWidget.title}">
</iframe>`;

  const reactSnippet = `// Next.js / React Component Integration (${selectedWidget.title})
import Script from "next/script";

export function RapidShiftWidget() {
  return (
    <>
      <Script src="${origin}/embed.js" data-api-key="${displayApiKey}" strategy="afterInteractive" />
      {/* @ts-expect-error Custom Web Component */}
      <${selectedWidget.tag} api-key="${displayApiKey}" theme="${theme}" />
    </>
  );
}`;

  const restApiSnippet = `// Fetch live client & embed data directly via REST API using your Universal API Key
const res = await fetch("${origin}/api/v1/client/data?include=client,gate,billing,invoices,fleet,domains,tickets,releases,analytics", {
  headers: { "x-api-key": "${displayApiKey}" }
});
const { data } = await res.json();`;

  const activeSnippet =
    codeTab === "webcomponent"
      ? webComponentSnippet
      : codeTab === "iframe"
        ? iframeSnippet
        : codeTab === "react"
          ? reactSnippet
          : restApiSnippet;

  const handleCopy = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopiedTab(label);
    showSuccess("Copied", `${label} snippet copied to clipboard.`);
    setTimeout(() => setCopiedTab(null), 2000);
  };

  const handleDownloadDemoHtml = () => {
    const htmlContent = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>RapidShift Embed Demo — ${selectedWidget.title}</title>
  <script defer src="${origin}/embed.js" data-api-key="${displayApiKey}"></script>
  <style>
    body {
      margin: 0;
      padding: 32px;
      font-family: system-ui, -apple-system, sans-serif;
      background: ${theme === "dark" ? "#09090b" : "#f8fafc"};
      color: ${theme === "dark" ? "#f4f4f5" : "#0f172a"};
    }
    .container { max-width: 960px; margin: 0 auto; }
  </style>
</head>
<body>
  <div class="container">
    <${selectedWidget.tag} api-key="${displayApiKey}" theme="${theme}"></${selectedWidget.tag}>
  </div>
</body>
</html>`;
    const blob = new Blob([htmlContent], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `rsl-${selectedWidget.name}-demo.html`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const getCategoryIcon = (cat: WidgetItem["category"]) => {
    switch (cat) {
      case "billing":
        return CreditCard;
      case "fleet":
        return Server;
      case "monitoring":
        return Globe;
      case "support":
        return LifeBuoy;
      case "analytics":
        return BarChart3;
      case "releases":
        return Rocket;
      default:
        return LayoutDashboard;
    }
  };

  return (
    <div className="space-y-5">
      {/* Top Executive Header & Controls */}
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-5 sm:p-6 shadow-xs">
        <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="inline-flex items-center gap-2 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200 dark:bg-blue-950/40 dark:text-blue-400 dark:border-blue-800">
              <Sparkles className="w-3.5 h-3.5" />
              <span className="steel-pill">23 Zero-Code Widgets &bull; Card-Only Seamless Layout</span>
            </div>
            <h1 className="text-2xl sm:text-3xl steel-heading text-zinc-900 dark:text-white">
              Embeddable Component Studio
            </h1>
            <p className="text-xs sm:text-sm text-zinc-500 dark:text-zinc-400 max-w-3xl font-sans">
              Generate one permanent Universal API Key (<code className="font-mono text-blue-600 dark:text-blue-400">rpk_live_...</code>) and use it across all 23 Web Components, Iframes, and the Client Data API without outer wrapper chrome.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {!isClientPortal && (
              <div className="flex items-center gap-2">
                <label className="steel-metric-label text-zinc-500">Tenant:</label>
                <select
                  value={selectedClientId}
                  onChange={(e) => {
                    setSelectedClientId(e.target.value);
                    setMintedToken("");
                    setPreviewKey((k) => k + 1);
                  }}
                  className="px-3 py-2 text-xs font-semibold rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 font-tech"
                >
                  {clients.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({c.id})
                    </option>
                  ))}
                </select>
              </div>
            )}

            <button
              onClick={handleGenerateUniversalKey}
              disabled={generatingKey}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold rounded-xl bg-blue-600 hover:bg-blue-500 text-white shadow-xs transition cursor-pointer disabled:opacity-50"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>{generatingKey ? "Generating..." : "1-Click Universal API Key"}</span>
            </button>

            <button
              onClick={handleDownloadDemoHtml}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-200 transition cursor-pointer"
              title="Download a standalone HTML file demonstrating this widget"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Download HTML Demo</span>
            </button>
          </div>
        </div>
      </div>

      {/* Independent-Scroll Master-Detail Workspace */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 lg:h-[calc(100vh-14.5rem)] lg:min-h-[680px] lg:overflow-hidden">
        {/* Left Sticky/Scrollable Catalog Sidebar (4 cols) */}
        <div className="lg:col-span-4 flex flex-col gap-4 lg:h-full lg:overflow-hidden">
          {/* Authentication & Theme Compact Card */}
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-4 shadow-xs space-y-3 shrink-0">
            <div className="flex items-center justify-between">
              <h3 className="steel-metric-label text-zinc-900 dark:text-white flex items-center gap-1.5">
                <Key className="w-3.5 h-3.5 text-blue-600" />
                <span>Auth &amp; Theme</span>
              </h3>
              <div className="inline-flex rounded-lg border border-zinc-200 dark:border-zinc-800 p-0.5 bg-zinc-100 dark:bg-zinc-950">
                <button
                  type="button"
                  onClick={() => {
                    setTheme("dark");
                    setPreviewKey((k) => k + 1);
                  }}
                  className={`px-2 py-0.5 rounded-md text-[11px] font-semibold transition cursor-pointer ${
                    theme === "dark"
                      ? "bg-zinc-800 text-white shadow-2xs"
                      : "text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-300"
                  }`}
                >
                  Dark
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setTheme("light");
                    setPreviewKey((k) => k + 1);
                  }}
                  className={`px-2 py-0.5 rounded-md text-[11px] font-semibold transition cursor-pointer ${
                    theme === "light"
                      ? "bg-white text-zinc-900 shadow-2xs"
                      : "text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-300"
                  }`}
                >
                  Light
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-1.5">
              <button
                type="button"
                onClick={() => setAuthMode("apikey")}
                className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold border transition cursor-pointer ${
                  authMode === "apikey"
                    ? "border-blue-600 bg-blue-600 text-white"
                    : "border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-300"
                }`}
              >
                Universal API Key
              </button>
              <button
                type="button"
                onClick={() => setAuthMode("token")}
                className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold border transition cursor-pointer ${
                  authMode === "token"
                    ? "border-blue-600 bg-blue-600 text-white"
                    : "border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-300"
                }`}
              >
                Scoped Token (emb_)
              </button>
            </div>

            {authMode === "apikey" ? (
              <input
                type="text"
                value={universalApiKey}
                onChange={(e) => {
                  setUniversalApiKey(e.target.value);
                  try {
                    localStorage.setItem(`rsl_universal_api_key_${selectedClientId}`, e.target.value);
                  } catch {
                    // ignore
                  }
                }}
                placeholder="rpk_live_... (or click 1-Click Key above)"
                className="w-full px-3 py-1.5 text-xs font-mono rounded-lg border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950"
              />
            ) : (
              <div className="flex items-center gap-2">
                <select
                  value={tokenDurationDays}
                  onChange={(e) => setTokenDurationDays(Number(e.target.value))}
                  className="px-2 py-1.5 text-xs rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 font-tech flex-1"
                >
                  <option value={7}>7 Days Validity</option>
                  <option value={30}>30 Days Validity</option>
                  <option value={90}>90 Days Validity</option>
                  <option value={365}>1 Year Validity</option>
                </select>
                <button
                  onClick={handleMintToken}
                  disabled={minting}
                  className="px-3 py-1.5 text-xs rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-semibold transition disabled:opacity-50 cursor-pointer"
                >
                  {minting ? "Minting..." : "Mint Token"}
                </button>
              </div>
            )}
          </div>

          {/* Scrollable 23-Widget Catalog Card */}
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-4 shadow-xs flex flex-col flex-1 min-h-0 overflow-hidden">
            <div className="flex items-center justify-between mb-2.5 shrink-0">
              <h2 className="steel-heading text-xs uppercase tracking-wider text-zinc-900 dark:text-white flex items-center gap-1.5">
                <Layout className="w-3.5 h-3.5 text-blue-600" />
                <span>Widget Catalog ({filteredWidgets.length}/{AVAILABLE_WIDGETS.length})</span>
              </h2>
            </div>

            {/* Search Input */}
            <div className="relative mb-2.5 shrink-0">
              <Search className="w-3.5 h-3.5 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search 23 widgets by name or tag..."
                className="w-full pl-8 pr-3 py-1.5 text-xs rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>

            {/* Category Filter Pills */}
            <div className="flex flex-wrap gap-1 mb-3 shrink-0">
              {(
                [
                  { id: "all", label: "All" },
                  { id: "billing", label: "Billing" },
                  { id: "fleet", label: "Fleet" },
                  { id: "monitoring", label: "Domains" },
                  { id: "support", label: "Support" },
                  { id: "analytics", label: "Analytics" },
                  { id: "releases", label: "Releases" },
                  { id: "dashboard", label: "Suites" },
                ] as Array<{ id: WidgetCategory; label: string }>
              ).map((cat) => (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => setCategoryFilter(cat.id)}
                  className={`px-2 py-0.5 rounded-lg text-[10px] font-tech font-semibold transition cursor-pointer ${
                    categoryFilter === cat.id
                      ? "bg-blue-600 text-white"
                      : "bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200"
                  }`}
                >
                  {cat.label}
                </button>
              ))}
            </div>

            {/* Independently Scrollable List */}
            <div className="flex-1 overflow-y-auto space-y-1.5 pr-1">
              {filteredWidgets.map((widget) => {
                const isSelected = selectedWidget.id === widget.id;
                const Icon = getCategoryIcon(widget.category);
                return (
                  <button
                    type="button"
                    key={widget.id}
                    onClick={() => {
                      setSelectedWidget(widget);
                      setPreviewKey((k) => k + 1);
                    }}
                    className={`w-full p-2.5 rounded-xl border text-left cursor-pointer transition flex items-start gap-2.5 ${
                      isSelected
                        ? "border-blue-600 bg-blue-50/60 dark:bg-blue-950/40"
                        : "border-zinc-200/70 dark:border-zinc-800/80 hover:border-zinc-300 dark:hover:border-zinc-700"
                    }`}
                  >
                    <Icon
                      className={`w-4 h-4 mt-0.5 shrink-0 ${
                        isSelected ? "text-blue-600 dark:text-blue-400" : "text-zinc-400"
                      }`}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-1">
                        <span className="font-steel font-bold text-xs text-zinc-900 dark:text-white truncate">
                          {widget.title}
                        </span>
                        <span className="text-[9px] font-tech uppercase px-1.5 py-0.2 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 shrink-0">
                          {widget.category}
                        </span>
                      </div>
                      <div className="text-[10px] font-mono text-blue-600 dark:text-blue-400 truncate mt-0.5">
                        &lt;{widget.tag}&gt;
                      </div>
                      <p className="text-[11px] text-zinc-500 mt-0.5 line-clamp-1">
                        {widget.description}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Right Independent Scrollable Preview & Code Workspace (8 cols) */}
        <div className="lg:col-span-8 lg:h-full lg:overflow-y-auto space-y-5 pr-0.5">
          {/* Live Interactive Preview Card */}
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-xs overflow-hidden">
            <div className="px-5 py-3 border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-800/40 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse inline-block" />
                <span className="font-steel font-bold text-xs text-zinc-800 dark:text-zinc-200">
                  Live Card-Only Preview: {selectedWidget.title}
                </span>
                <code className="text-[11px] font-mono px-2 py-0.5 rounded bg-blue-500/10 text-blue-600 dark:text-blue-400">
                  &lt;{selectedWidget.tag}&gt;
                </code>
              </div>

              <div className="flex items-center gap-2">
                {/* Responsive Viewport Tester */}
                <div className="inline-flex items-center rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 p-0.5">
                  <button
                    type="button"
                    onClick={() => setViewportWidth("100%")}
                    className={`p-1 rounded text-xs transition cursor-pointer ${
                      viewportWidth === "100%"
                        ? "bg-blue-600 text-white"
                        : "text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200"
                    }`}
                    title="Desktop Fluid Width (100%)"
                  >
                    <Monitor className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setViewportWidth("768px")}
                    className={`p-1 rounded text-xs transition cursor-pointer ${
                      viewportWidth === "768px"
                        ? "bg-blue-600 text-white"
                        : "text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200"
                    }`}
                    title="Tablet Width (768px)"
                  >
                    <Tablet className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setViewportWidth("400px")}
                    className={`p-1 rounded text-xs transition cursor-pointer ${
                      viewportWidth === "400px"
                        ? "bg-blue-600 text-white"
                        : "text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200"
                    }`}
                    title="Mobile Width (400px)"
                  >
                    <Smartphone className="w-3.5 h-3.5" />
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => setPreviewKey((k) => k + 1)}
                  className="text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 p-1.5 rounded-lg border border-zinc-200 dark:border-zinc-700 cursor-pointer"
                  title="Reload Live Widget"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                </button>
                <a
                  href={previewUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-zinc-500 hover:text-blue-600 px-2.5 py-1 rounded-lg border border-zinc-200 dark:border-zinc-700 flex items-center gap-1 text-xs font-tech"
                >
                  <span>Popout</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              </div>
            </div>

            {/* Embedded Card-Only Viewport */}
            <div
              className={`p-5 transition-colors flex justify-center ${
                theme === "dark" ? "bg-zinc-950/90" : "bg-slate-100/80"
              }`}
            >
              <div style={{ width: viewportWidth, maxWidth: "100%" }} className="transition-all duration-200">
                <iframe
                  key={previewKey}
                  src={previewUrl}
                  style={{ height: `${previewHeight}px` }}
                  className="w-full border-0 bg-transparent block transition-[height] duration-150"
                  title={selectedWidget.title}
                />
              </div>
            </div>
          </div>

          {/* Multi-Format Integration Code Generator */}
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-5 shadow-xs space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-1.5">
                {(
                  [
                    { id: "webcomponent", label: "1. Web Component (HTML)" },
                    { id: "iframe", label: "2. Card-Only iFrame" },
                    { id: "react", label: "3. Next.js / React JSX" },
                    { id: "api", label: "4. Client Data REST API" },
                  ] as const
                ).map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setCodeTab(t.id)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-tech font-semibold transition cursor-pointer ${
                      codeTab === t.id
                        ? "bg-blue-600 text-white shadow-2xs"
                        : "bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-700"
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>

              <button
                type="button"
                onClick={() => handleCopy(activeSnippet, codeTab)}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold transition cursor-pointer"
              >
                {copiedTab === codeTab ? (
                  <>
                    <Check className="w-3.5 h-3.5" />
                    <span>Copied!</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    <span>Copy Code</span>
                  </>
                )}
              </button>
            </div>

            <pre className="p-4 rounded-xl bg-zinc-950 text-blue-300 font-mono text-xs overflow-x-auto border border-zinc-800 leading-relaxed">
              <code>{activeSnippet}</code>
            </pre>

            <div className="flex flex-wrap items-center justify-between gap-2 pt-1 text-[11px] text-zinc-500">
              <span>
                Required Scopes:{" "}
                <code className="font-mono text-zinc-700 dark:text-zinc-300">
                  {(selectedWidget.requiredScopes || ["billing:read"]).join(", ")}
                </code>
              </span>
              <span>
                Origin: <code className="font-mono text-blue-600 dark:text-blue-400">{origin}</code>
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

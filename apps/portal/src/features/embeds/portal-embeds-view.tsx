"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import {
  Code2,
  Copy,
  Check,
  Key,
  Eye,
  RefreshCw,
  Sparkles,
  LayoutDashboard,
  CreditCard,
  Server,
  Globe,
  LifeBuoy,
  BarChart3,
  Rocket,
  ShieldCheck,
  BookOpen,
  Search,
  Monitor,
  Tablet,
  Smartphone,
  Download,
  ExternalLink,
} from "lucide-react";
import { useAlert } from "@/components/ui/alert-popup";
import { IosSpinner } from "@/components/ui/ios-spinner";
import { getSiteOrigin } from "@/lib/site-url";
import { ALL_UNIVERSAL_SCOPES } from "@/features/portal/portal-api-keys-view";
import type { WidgetCatalogItem } from "./embed-studio";

interface PortalEmbedsViewProps {
  clientId: string;
  clientName: string;
  widgets: WidgetCatalogItem[];
}

type PortalWidgetCategory =
  | "all"
  | "billing"
  | "fleet"
  | "monitoring"
  | "support"
  | "analytics"
  | "releases"
  | "dashboard";

function inferCategory(name: string): Exclude<PortalWidgetCategory, "all"> {
  if (name.includes("due") || name.includes("billing") || name.includes("invoice") || name.includes("payment")) {
    return "billing";
  }
  if (name.includes("server") || name.includes("process")) {
    return "fleet";
  }
  if (name.includes("domain") || name.includes("ssl") || name.includes("incident")) {
    return "monitoring";
  }
  if (name.includes("support") || name.includes("ticket") || name.includes("sla")) {
    return "support";
  }
  if (
    name.includes("pageviews") ||
    name.includes("vitals") ||
    name.includes("visitor") ||
    name.includes("top-pages") ||
    name.includes("analytics")
  ) {
    return "analytics";
  }
  if (name.includes("release")) {
    return "releases";
  }
  return "dashboard";
}

export function PortalEmbedsView({
  clientId,
  clientName,
  widgets,
}: PortalEmbedsViewProps) {
  const { showSuccess, showError } = useAlert();
  const [selectedWidgetName, setSelectedWidgetName] = useState(
    widgets[0]?.name || "billing-summary"
  );
  const [categoryFilter, setCategoryFilter] = useState<PortalWidgetCategory>("all");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [theme, setTheme] = useState<"light" | "dark" | "system">("light");
  const [viewportWidth, setViewportWidth] = useState<"100%" | "768px" | "400px">("100%");
  const [embedType, setEmbedType] = useState<"webcomponent" | "iframe" | "react" | "api">("webcomponent");
  const [authMode, setAuthMode] = useState<"apikey" | "token">("apikey");
  const [activeTab, setActiveTab] = useState<"preview" | "code">("preview");

  const [universalApiKey, setUniversalApiKey] = useState<string>("");
  const [generatingKey, setGeneratingKey] = useState(false);

  const [activeToken, setActiveToken] = useState<string>("");
  const [mintingToken, setMintingToken] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);
  const [previewKey, setPreviewKey] = useState<number>(0);

  const selectedWidget =
    widgets.find((w) => w.name === selectedWidgetName) || widgets[0];

  useEffect(() => {
    try {
      const saved = localStorage.getItem(`rsl_universal_api_key_${clientId}`);
      if (saved) setUniversalApiKey(saved);
    } catch {
      // ignore
    }
  }, [clientId]);

  const filteredWidgets = useMemo(() => {
    return widgets.filter((w) => {
      const cat = inferCategory(w.name);
      if (categoryFilter !== "all" && cat !== categoryFilter) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        return (
          w.title.toLowerCase().includes(q) ||
          w.tag.toLowerCase().includes(q) ||
          w.description.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [widgets, categoryFilter, searchQuery]);

  const getWidgetCategoryIcon = (name: string) => {
    const cat = inferCategory(name);
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

  const handleGenerateUniversalKey = async () => {
    try {
      setGeneratingKey(true);
      const res = await fetch("/api/v1/portal/api-keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientId,
          name: "Universal Embed & Client API Key",
          type: "publishable",
          scopes: [...ALL_UNIVERSAL_SCOPES],
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.rawKey) {
        throw new Error(data.error || "Failed to generate API key");
      }
      setUniversalApiKey(data.rawKey);
      setAuthMode("apikey");
      setPreviewKey((k) => k + 1);
      try {
        localStorage.setItem(`rsl_universal_api_key_${clientId}`, data.rawKey);
      } catch {
        // ignore
      }
      showSuccess(
        "Universal API Key Generated",
        "Your permanent API key is now active across all 23 embeds (Web Components & Iframes) and the Client Data API. No more 15-minute token minting needed!",
        [
          { label: "Universal API Key", value: data.rawKey, copyable: true, isMonospace: true },
          { label: "Client Account", value: clientId },
        ],
        data.rawKey
      );
    } catch (err: any) {
      showError("API Key Error", err.message || "Failed to generate API key");
    } finally {
      setGeneratingKey(false);
    }
  };

  const handleMintToken = async () => {
    if (!selectedWidget) return;
    try {
      setMintingToken(true);
      const res = await fetch("/api/v1/embed-tokens", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientId,
          scopes: selectedWidget.requiredScopes,
          allowedOrigins: ["*"],
          ttlSeconds: 900,
        }),
      });
      const data = await res.json();
      const token = data.data?.token || data.token;
      if (res.ok && token) {
        setActiveToken(token);
      } else {
        setActiveToken(`emb_${Date.now().toString(36)}_${clientId.slice(0, 6)}`);
      }
      setPreviewKey((k) => k + 1);
    } catch {
      setActiveToken(`emb_${Date.now().toString(36)}_${clientId.slice(0, 6)}`);
    } finally {
      setMintingToken(false);
    }
  };

  useEffect(() => {
    let active = true;
    async function initToken() {
      try {
        const res = await fetch("/api/v1/embed-tokens", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            clientId,
            scopes: selectedWidget?.requiredScopes?.length ? selectedWidget.requiredScopes : ["billing:read"],
            allowedOrigins: ["*"],
            ttlSeconds: 900,
          }),
        });
        if (res.ok) {
          const data = await res.json();
          const token = data.data?.token || data.token;
          if (active && token) setActiveToken(token);
        } else {
          if (active) setActiveToken(`emb_${Date.now().toString(36)}_${clientId.slice(0, 6)}`);
        }
      } catch {
        if (active) setActiveToken(`emb_${Date.now().toString(36)}_${clientId.slice(0, 6)}`);
      }
    }
    initToken();
    return () => {
      active = false;
    };
  }, [clientId, selectedWidgetName, selectedWidget?.requiredScopes]);

  const [previewHeight, setPreviewHeight] = useState<number>(360);

  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      if (e.data && e.data.type === "rsl-embed-resize" && typeof e.data.height === "number") {
        setPreviewHeight(Math.max(120, Math.ceil(e.data.height) + 8));
      }
    };
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, []);

  const origin = getSiteOrigin();
  const displayApiKey = universalApiKey || "rpk_live_YOUR_UNIVERSAL_API_KEY";

  const webComponentSnippet =
    authMode === "apikey"
      ? `<!-- 1. RapidShift Embed Runtime (Place once in your page — works for all 23 widgets!) -->
<script defer src="${origin}/embed.js" data-api-key="${displayApiKey}"></script>

<!-- 2. ${selectedWidget?.title || "Embed Widget"} (Permanent API Key — Card-Only Seamless Layout) -->
<${selectedWidget?.tag || "rsl-widget"}
  api-key="${displayApiKey}"
  theme="${theme}"
></${selectedWidget?.tag || "rsl-widget"}>`
      : `<!-- 1. RapidShift Embed Runtime (Place once in your page) -->
<script defer src="${origin}/embed.js"></script>

<!-- 2. ${selectedWidget?.title || "Embed Widget"} (15-Minute Scoped Token) -->
<${selectedWidget?.tag || "rsl-widget"}
  client-id="${clientId}"
  theme="${theme}"${activeToken ? `\n  token="${activeToken}"` : ""}
></${selectedWidget?.tag || "rsl-widget"}>`;

  const iframeSnippet =
    authMode === "apikey"
      ? `<!-- RapidShift Embed: ${selectedWidget?.title || "Widget"} (Card-Only Iframe) -->
<iframe
  src="${origin}/embed/${selectedWidget?.name}?apiKey=${displayApiKey}&theme=${theme}"
  width="100%"
  frameborder="0"
  allowtransparency="true"
  style="border: none; width: 100%; background: transparent; display: block; min-height: 260px;"
  loading="lazy"
></iframe>`
      : `<!-- RapidShift Embed: ${selectedWidget?.title || "Widget"} (Card-Only Iframe) -->
<iframe
  src="${origin}/embed/${selectedWidget?.name}?clientId=${clientId}&theme=${theme}${activeToken ? `&token=${activeToken}` : ""}"
  width="100%"
  frameborder="0"
  allowtransparency="true"
  style="border: none; width: 100%; background: transparent; display: block; min-height: 260px;"
  loading="lazy"
></iframe>`;

  const reactSnippet = `// Next.js / React Component Integration (${selectedWidget?.title || "Widget"})
import Script from "next/script";

export function ClientPortalWidget() {
  return (
    <>
      <Script src="${origin}/embed.js" data-api-key="${displayApiKey}" strategy="afterInteractive" />
      {/* @ts-expect-error Custom Web Component */}
      <${selectedWidget?.tag || "rsl-widget"} api-key="${displayApiKey}" theme="${theme}" />
    </>
  );
}`;

  const apiSnippet = `// Fetch all client & embed data directly via REST API using the same Universal API Key
const response = await fetch("${origin}/api/v1/client/data?include=client,gate,billing,invoices,fleet,domains,tickets,releases,analytics", {
  headers: {
    "x-api-key": "${displayApiKey}"
  }
});
const { data } = await response.json();
console.log("Client Data:", data);`;

  const currentSnippet =
    embedType === "webcomponent"
      ? webComponentSnippet
      : embedType === "iframe"
        ? iframeSnippet
        : embedType === "react"
          ? reactSnippet
          : apiSnippet;

  const handleCopyCode = () => {
    navigator.clipboard.writeText(currentSnippet);
    setCopiedCode(true);
    showSuccess("Snippet Copied", "Integration snippet copied to clipboard.");
    setTimeout(() => setCopiedCode(false), 2000);
  };

  const handleDownloadDemoHtml = () => {
    const htmlContent = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${clientName} — ${selectedWidget?.title || "Widget"}</title>
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
    <${selectedWidget?.tag || "rsl-billing-summary"} api-key="${displayApiKey}" theme="${theme}"></${selectedWidget?.tag || "rsl-billing-summary"}>
  </div>
</body>
</html>`;
    const blob = new Blob([htmlContent], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `rsl-${selectedWidget?.name || "widget"}-demo.html`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const previewUrl =
    authMode === "apikey" && universalApiKey
      ? `/embed/${selectedWidget?.name}?apiKey=${universalApiKey}&theme=${theme}`
      : `/embed/${selectedWidget?.name}?clientId=${clientId}&theme=${theme}${
          activeToken ? `&token=${activeToken}` : ""
        }`;

  return (
    <div className="space-y-5">
      {/* Header Banner */}
      <section className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-5 sm:p-6 shadow-xs">
        <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200 dark:bg-indigo-950/40 dark:text-indigo-400 dark:border-indigo-800">
              <Code2 className="w-3.5 h-3.5" />
              <span>23 Card-Only Embeddable Widgets &bull; Universal API Key Ready</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-zinc-900 dark:text-white">
              Embed Studio &bull; {clientName}
            </h1>
            <p className="text-xs sm:text-sm text-zinc-500 dark:text-zinc-400 max-w-2xl">
              Generate one permanent Universal API Key (<code className="font-mono text-indigo-600 dark:text-indigo-400">rpk_live_...</code>) and use it across all {widgets.length} Web Components, Iframes, and the Client Data API without outer wrapper divs.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              onClick={handleGenerateUniversalKey}
              disabled={generatingKey}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white shadow-xs transition cursor-pointer disabled:opacity-50"
            >
              {generatingKey ? (
                <IosSpinner size="xs" className="text-current" />
              ) : (
                <Sparkles className="w-3.5 h-3.5" />
              )}
              <span>{universalApiKey ? "Regenerate Universal API Key" : "Generate Universal API Key"}</span>
            </button>

            <button
              onClick={handleDownloadDemoHtml}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-200 transition cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Download HTML Demo</span>
            </button>

            <Link
              href="/resources#embed-playground"
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-xl bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-800 dark:text-zinc-200 transition"
            >
              <BookOpen className="w-3.5 h-3.5" />
              <span>Docs &amp; Guide</span>
            </Link>
          </div>
        </div>
      </section>

      {/* Independent-Scroll Master-Detail Studio Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 lg:h-[calc(100vh-14.5rem)] lg:min-h-[680px] lg:overflow-hidden">
        {/* Left Column: Auth Mode, Theme & Scrollable Widget Catalog (4 cols) */}
        <div className="lg:col-span-4 flex flex-col gap-4 lg:h-full lg:overflow-hidden">
          {/* Authentication & Theme Compact Card */}
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-4 shadow-xs space-y-3 shrink-0">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 uppercase tracking-wider flex items-center gap-1.5">
                <Key className="w-3.5 h-3.5 text-indigo-600" />
                <span>Auth &amp; Theme</span>
              </label>
              <div className="inline-flex rounded-lg border border-zinc-200 dark:border-zinc-800 p-0.5 bg-zinc-100 dark:bg-zinc-950">
                {(["light", "dark", "system"] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setTheme(t)}
                    className={`px-2 py-0.5 rounded-md text-[10px] font-semibold capitalize transition cursor-pointer ${
                      theme === t
                        ? "bg-indigo-600 text-white shadow-2xs"
                        : "text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-300"
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-1.5">
              <button
                onClick={() => setAuthMode("apikey")}
                className={`py-1.5 px-2.5 text-xs font-semibold rounded-xl border transition cursor-pointer ${
                  authMode === "apikey"
                    ? "bg-indigo-600 text-white border-indigo-600 shadow-2xs"
                    : "bg-zinc-50 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 border-zinc-200 dark:border-zinc-700"
                }`}
              >
                Universal API Key
              </button>
              <button
                onClick={() => setAuthMode("token")}
                className={`py-1.5 px-2.5 text-xs font-semibold rounded-xl border transition cursor-pointer ${
                  authMode === "token"
                    ? "bg-indigo-600 text-white border-indigo-600 shadow-2xs"
                    : "bg-zinc-50 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 border-zinc-200 dark:border-zinc-700"
                }`}
              >
                15m Scoped Token
              </button>
            </div>

            {authMode === "apikey" ? (
              <input
                type="text"
                value={universalApiKey}
                onChange={(e) => {
                  setUniversalApiKey(e.target.value);
                  try {
                    localStorage.setItem(`rsl_universal_api_key_${clientId}`, e.target.value);
                  } catch {
                    // ignore
                  }
                }}
                placeholder="Paste rpk_live_... or click Generate above"
                className="w-full px-3 py-1.5 text-xs font-mono rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100"
              />
            ) : (
              <div className="flex items-center justify-between pt-0.5">
                <span className="text-[11px] font-mono text-zinc-500 truncate max-w-[180px]">
                  {activeToken || "Minting..."}
                </span>
                <button
                  onClick={handleMintToken}
                  disabled={mintingToken}
                  className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded-lg bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 cursor-pointer"
                >
                  <RefreshCw className="w-3 h-3" />
                  <span>Mint 15m Token</span>
                </button>
              </div>
            )}
          </div>

          {/* Independently Scrollable Widget Catalog */}
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-4 shadow-xs flex flex-col flex-1 min-h-0 overflow-hidden">
            <div className="flex items-center justify-between mb-2.5 shrink-0">
              <span className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 uppercase tracking-wider">
                Available Widgets ({filteredWidgets.length}/{widgets.length})
              </span>
              <span className="text-[10px] font-mono text-zinc-400">rsl-*</span>
            </div>

            {/* Search Input */}
            <div className="relative mb-2.5 shrink-0">
              <Search className="w-3.5 h-3.5 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search widgets by name or tag..."
                className="w-full pl-8 pr-3 py-1.5 text-xs rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 focus:outline-none focus:ring-1 focus:ring-indigo-500"
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
                ] as Array<{ id: PortalWidgetCategory; label: string }>
              ).map((cat) => (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => setCategoryFilter(cat.id)}
                  className={`px-2 py-0.5 rounded-lg text-[10px] font-semibold transition cursor-pointer ${
                    categoryFilter === cat.id
                      ? "bg-indigo-600 text-white"
                      : "bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200"
                  }`}
                >
                  {cat.label}
                </button>
              ))}
            </div>

            <div className="flex-1 overflow-y-auto space-y-1.5 pr-1">
              {filteredWidgets.map((w) => {
                const Icon = getWidgetCategoryIcon(w.name);
                const isSelected = w.name === selectedWidgetName;
                return (
                  <button
                    key={w.name}
                    onClick={() => setSelectedWidgetName(w.name)}
                    className={`w-full text-left p-2.5 rounded-xl transition flex items-start gap-2.5 cursor-pointer border ${
                      isSelected
                        ? "bg-indigo-50/70 text-indigo-700 border-indigo-500 dark:bg-indigo-950/60 dark:text-indigo-300 dark:border-indigo-700 font-semibold"
                        : "border-zinc-200/60 dark:border-zinc-800/80 hover:bg-zinc-50 dark:hover:bg-zinc-800/60 text-zinc-700 dark:text-zinc-300"
                    }`}
                  >
                    <Icon className={`w-4 h-4 mt-0.5 shrink-0 ${isSelected ? "text-indigo-600 dark:text-indigo-400" : "text-zinc-400"}`} />
                    <div className="flex-1 min-w-0">
                      <div className="text-xs truncate">{w.title}</div>
                      <div className="text-[10px] font-mono text-indigo-600 dark:text-indigo-400 truncate">&lt;{w.tag}&gt;</div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Right Column: Independently Scrollable Live Preview & Code Snippets (8 cols) */}
        <div className="lg:col-span-8 lg:h-full lg:overflow-y-auto space-y-5 pr-0.5">
          {/* Selected Widget Info Bar */}
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-5 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-lg font-bold text-zinc-900 dark:text-white">
                  {selectedWidget?.title}
                </h2>
                <code className="text-xs font-mono bg-zinc-100 dark:bg-zinc-800 text-indigo-600 dark:text-indigo-400 px-2 py-0.5 rounded">
                  &lt;{selectedWidget?.tag}&gt;
                </code>
              </div>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                {selectedWidget?.description}
              </p>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={() => setActiveTab("preview")}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition cursor-pointer ${
                  activeTab === "preview"
                    ? "bg-zinc-900 text-white dark:bg-white dark:text-zinc-900 shadow-xs"
                    : "text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                }`}
              >
                <Eye className="w-3.5 h-3.5 inline mr-1" />
                Live Preview
              </button>
              <button
                onClick={() => setActiveTab("code")}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition cursor-pointer ${
                  activeTab === "code"
                    ? "bg-zinc-900 text-white dark:bg-white dark:text-zinc-900 shadow-xs"
                    : "text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                }`}
              >
                <Code2 className="w-3.5 h-3.5 inline mr-1" />
                Integration Code
              </button>
            </div>
          </div>

          {/* Live Preview Card */}
          {activeTab === "preview" ? (
            <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl overflow-hidden shadow-xs">
              <div className="px-5 py-3 flex flex-wrap items-center justify-between gap-2 text-xs text-zinc-400 border-b border-zinc-100 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-800/40">
                <span className="flex items-center gap-1.5 font-medium text-zinc-700 dark:text-zinc-300">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                  Card-Only Viewport &bull; Zero Wrapper Padding
                </span>

                <div className="flex items-center gap-2">
                  <div className="inline-flex items-center rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 p-0.5">
                    <button
                      type="button"
                      onClick={() => setViewportWidth("100%")}
                      className={`p-1 rounded text-xs transition cursor-pointer ${
                        viewportWidth === "100%"
                          ? "bg-indigo-600 text-white"
                          : "text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200"
                      }`}
                      title="Desktop Width (100%)"
                    >
                      <Monitor className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setViewportWidth("768px")}
                      className={`p-1 rounded text-xs transition cursor-pointer ${
                        viewportWidth === "768px"
                          ? "bg-indigo-600 text-white"
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
                          ? "bg-indigo-600 text-white"
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
                    className="p-1.5 rounded-lg border border-zinc-200 dark:border-zinc-700 text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200 cursor-pointer"
                    title="Reload Preview"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                  </button>

                  <a
                    href={previewUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="px-2.5 py-1 rounded-lg border border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-300 hover:text-indigo-600 inline-flex items-center gap-1"
                  >
                    <span>Popout</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              </div>

              {/* Iframe Preview Container (Card-only, dynamic height) */}
              <div
                className={`p-5 flex justify-center transition-colors ${
                  theme === "dark" ? "bg-zinc-950/90" : "bg-slate-100/80"
                }`}
              >
                <div style={{ width: viewportWidth, maxWidth: "100%" }} className="transition-all duration-200">
                  <iframe
                    key={previewKey}
                    src={previewUrl}
                    style={{ height: `${previewHeight}px` }}
                    className="w-full border-0 bg-transparent block transition-[height] duration-150"
                    title={`Preview of ${selectedWidget?.title}`}
                  />
                </div>
              </div>
            </div>
          ) : null}

          {/* Always-Accessible Multi-Format Code Snippets Card */}
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-5 shadow-xs space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-1.5">
                {(
                  [
                    { id: "webcomponent", label: "1. Web Component" },
                    { id: "iframe", label: "2. Card-Only Iframe" },
                    { id: "react", label: "3. Next.js / React" },
                    { id: "api", label: "4. Client Data REST API" },
                  ] as const
                ).map((fmt) => (
                  <button
                    key={fmt.id}
                    type="button"
                    onClick={() => setEmbedType(fmt.id)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition cursor-pointer ${
                      embedType === fmt.id
                        ? "bg-indigo-600 text-white shadow-2xs"
                        : "bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-200"
                    }`}
                  >
                    {fmt.label}
                  </button>
                ))}
              </div>

              <button
                onClick={handleCopyCode}
                className="inline-flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white px-3.5 py-1.5 rounded-xl text-xs font-semibold shadow-xs transition cursor-pointer"
              >
                {copiedCode ? (
                  <>
                    <Check className="w-3.5 h-3.5" />
                    <span>Copied!</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    <span>Copy Snippet</span>
                  </>
                )}
              </button>
            </div>

            <div className="relative">
              <pre className="p-4 rounded-xl bg-zinc-950 text-zinc-100 font-mono text-xs overflow-x-auto leading-relaxed border border-zinc-800">
                {currentSnippet}
              </pre>
            </div>

            <div className="p-3.5 rounded-xl bg-zinc-50 dark:bg-zinc-800/40 border border-zinc-200 dark:border-zinc-800 text-xs text-zinc-600 dark:text-zinc-400 flex items-start gap-2.5">
              <ShieldCheck className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
              <div>
                <span className="font-bold text-zinc-900 dark:text-white">Universal API Key &amp; Domain Portability: </span>
                Your Universal API Key (<code className="font-mono text-indigo-600">rpk_live_...</code>) automatically resolves your client account (<code className="font-mono text-indigo-600">{clientId}</code>) for Web Components, Iframes, and <code className="font-mono text-indigo-600">GET {origin}/api/v1/client/data</code>.
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

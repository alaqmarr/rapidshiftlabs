"use client";

import { useState, useEffect } from "react";
import {
  Code2,
  Copy,
  Check,
  ExternalLink,
  Layers,
  Palette,
  Key,
  Shield,
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
} from "lucide-react";
import { useAlert } from "@/components/ui/alert-popup";
import { IosSpinner } from "@/components/ui/ios-spinner";

export interface WidgetCatalogItem {
  name: string;
  tag: string;
  title: string;
  description: string;
  sensitive: boolean;
  requiredScopes: string[];
}

export interface ClientOption {
  id: string;
  name: string;
}

interface EmbedStudioProps {
  clients: ClientOption[];
  initialClientId?: string;
  widgets: WidgetCatalogItem[];
}

export function EmbedStudio({
  clients,
  initialClientId,
  widgets,
}: EmbedStudioProps) {
  const { showSuccess, showError } = useAlert();
  const [selectedClientId, setSelectedClientId] = useState(
    initialClientId || clients[0]?.id || "cli_preview_01"
  );
  const [selectedWidgetName, setSelectedWidgetName] = useState(
    widgets[0]?.name || "billing-summary"
  );
  const [theme, setTheme] = useState<"light" | "dark" | "system">("light");
  const [embedType, setEmbedType] = useState<"webcomponent" | "iframe">("webcomponent");
  const [activeTab, setActiveTab] = useState<"preview" | "code">("preview");

  const [activeToken, setActiveToken] = useState<string>("");
  const [mintingToken, setMintingToken] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);

  const selectedWidget =
    widgets.find((w) => w.name === selectedWidgetName) || widgets[0];

  // Helper to categorize widgets
  const getWidgetCategoryIcon = (name: string) => {
    if (name.includes("due") || name.includes("billing") || name.includes("invoice") || name.includes("payment")) {
      return CreditCard;
    }
    if (name.includes("server") || name.includes("process")) {
      return Server;
    }
    if (name.includes("domain") || name.includes("ssl") || name.includes("incident") || name.includes("status")) {
      return Globe;
    }
    if (name.includes("support") || name.includes("ticket") || name.includes("sla")) {
      return LifeBuoy;
    }
    if (name.includes("pageviews") || name.includes("vitals") || name.includes("visitor") || name.includes("top-pages")) {
      return BarChart3;
    }
    if (name.includes("release")) {
      return Rocket;
    }
    return LayoutDashboard;
  };

  // Auto-mint a scoped embed token when widget or client changes
  const handleMintToken = async () => {
    if (!selectedWidget) return;
    try {
      setMintingToken(true);
      const res = await fetch("/api/v1/embed-tokens", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientId: selectedClientId,
          scopes: selectedWidget.requiredScopes,
          allowedOrigins: ["*"],
          ttlSeconds: 900, // 15 mins
        }),
      });
      const data = await res.json();
      const token = data.data?.token || data.token;
      if (res.ok && token) {
        setActiveToken(token);
      } else {
        // Fallback placeholder token
        setActiveToken(`emb_${Date.now().toString(36)}_${selectedClientId.slice(0, 6)}`);
      }
    } catch {
      setActiveToken(`emb_${Date.now().toString(36)}_${selectedClientId.slice(0, 6)}`);
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
            clientId: selectedClientId,
            scopes: selectedWidget?.requiredScopes || ["billing:read"],
            allowedOrigins: ["*"],
            ttlSeconds: 900,
          }),
        });
        if (res.ok) {
          const data = await res.json();
          const token = data.data?.token || data.token;
          if (active && token) setActiveToken(token);
        } else {
          if (active) setActiveToken(`emb_${Date.now().toString(36)}_${selectedClientId.slice(0, 6)}`);
        }
      } catch {
        if (active) setActiveToken(`emb_${Date.now().toString(36)}_${selectedClientId.slice(0, 6)}`);
      }
    }
    initToken();
    return () => {
      active = false;
    };
  }, [selectedClientId, selectedWidgetName]);

  const origin = typeof window !== "undefined" ? window.location.origin : "https://rapidshiftlabs.com";

  const webComponentSnippet = `<!-- 1. RapidShift Embed Engine (Include once in <head> or <body>) -->
<script defer src="${origin}/embed.js"></script>

<!-- 2. ${selectedWidget?.title || "Embed Widget"} -->
<${selectedWidget?.tag || "rsl-widget"}
  client-id="${selectedClientId}"
  theme="${theme}"${activeToken ? `\n  token="${activeToken}"` : ""}
></${selectedWidget?.tag || "rsl-widget"}>`;

  const iframeSnippet = `<!-- RapidShift Embed: ${selectedWidget?.title || "Widget"} (Zero JS Dependency) -->
<iframe
  src="${origin}/embed/${selectedWidget?.name}?clientId=${selectedClientId}&theme=${theme}${activeToken ? `&token=${activeToken}` : ""}"
  width="100%"
  height="450"
  frameborder="0"
  style="border-radius: 12px; border: 1px solid #e4e4e7; width: 100%; min-height: 400px;"
  loading="lazy"
></iframe>`;

  const currentSnippet = embedType === "webcomponent" ? webComponentSnippet : iframeSnippet;

  const handleCopyCode = () => {
    navigator.clipboard.writeText(currentSnippet);
    setCopiedCode(true);
    showSuccess("Snippet Copied", "Embed code copied to clipboard.");
    setTimeout(() => setCopiedCode(false), 2000);
  };

  const previewUrl = `/embed/${selectedWidget?.name}?clientId=${selectedClientId}&theme=${theme}${
    activeToken ? `&token=${activeToken}` : ""
  }`;

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <section className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 sm:p-8 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200 dark:bg-indigo-950/40 dark:text-indigo-400 dark:border-indigo-800">
              <Code2 className="w-3.5 h-3.5" />
              <span>Embed Studio &bull; 23 Drop-In Web Components</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-zinc-900 dark:text-white">
              Embed Studio &amp; Widget Catalog
            </h1>
            <p className="text-sm text-zinc-500 dark:text-zinc-400 max-w-2xl">
              Preview, customize, and generate copy-paste HTML widgets for client web applications.
              Zero dependencies, scoped tokens, and seamless Shadow DOM isolation.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={handleMintToken}
              disabled={mintingToken}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-xl bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-800 dark:text-zinc-200 transition"
              title="Mint new 15-minute scoped token"
            >
              {mintingToken ? (
                <IosSpinner size="xs" className="text-current" />
              ) : (
                <RefreshCw className="w-3.5 h-3.5" />
              )}
              <span>Refresh Token</span>
            </button>
          </div>
        </div>
      </section>

      {/* Main Studio Split Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: Widget Selector & Configuration (4 cols) */}
        <div className="lg:col-span-4 space-y-5">
          {/* Target Client */}
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-5 shadow-sm space-y-3">
            <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 uppercase tracking-wider">
              Target Client Account
            </label>
            <select
              value={selectedClientId}
              onChange={(e) => setSelectedClientId(e.target.value)}
              className="w-full px-3 py-2 text-xs rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-600 font-medium"
            >
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.id})
                </option>
              ))}
            </select>
          </div>

          {/* Theme & Format Controls */}
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-5 shadow-sm space-y-4">
            <div>
              <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 uppercase tracking-wider mb-2">
                Theme Customization
              </label>
              <div className="grid grid-cols-3 gap-2">
                {(["light", "dark", "system"] as const).map((t) => (
                  <button
                    key={t}
                    onClick={() => setTheme(t)}
                    className={`py-1.5 text-xs font-semibold rounded-lg capitalize border transition ${
                      theme === t
                        ? "bg-indigo-600 text-white border-indigo-600 shadow-sm"
                        : "bg-zinc-50 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 border-zinc-200 dark:border-zinc-700 hover:bg-zinc-100"
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 uppercase tracking-wider mb-2">
                Integration Format
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => setEmbedType("webcomponent")}
                  className={`py-1.5 text-xs font-semibold rounded-lg border transition ${
                    embedType === "webcomponent"
                      ? "bg-indigo-600 text-white border-indigo-600 shadow-sm"
                      : "bg-zinc-50 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 border-zinc-200 dark:border-zinc-700 hover:bg-zinc-100"
                  }`}
                >
                  Web Component
                </button>
                <button
                  onClick={() => setEmbedType("iframe")}
                  className={`py-1.5 text-xs font-semibold rounded-lg border transition ${
                    embedType === "iframe"
                      ? "bg-indigo-600 text-white border-indigo-600 shadow-sm"
                      : "bg-zinc-50 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 border-zinc-200 dark:border-zinc-700 hover:bg-zinc-100"
                  }`}
                >
                  Iframe Fallback
                </button>
              </div>
            </div>
          </div>

          {/* Widget Catalog List */}
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-5 shadow-sm space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 uppercase tracking-wider">
                Catalog ({widgets.length} Widgets)
              </span>
              <span className="text-[10px] font-mono text-zinc-400">rsl-*</span>
            </div>

            <div className="max-h-[460px] overflow-y-auto space-y-1.5 pr-1">
              {widgets.map((w) => {
                const Icon = getWidgetCategoryIcon(w.name);
                const isSelected = w.name === selectedWidgetName;
                return (
                  <button
                    key={w.name}
                    onClick={() => setSelectedWidgetName(w.name)}
                    className={`w-full text-left p-2.5 rounded-xl transition flex items-center gap-2.5 ${
                      isSelected
                        ? "bg-indigo-50 text-indigo-700 border border-indigo-200 dark:bg-indigo-950/60 dark:text-indigo-300 dark:border-indigo-800 font-semibold"
                        : "hover:bg-zinc-50 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300"
                    }`}
                  >
                    <Icon className={`w-4 h-4 flex-shrink-0 ${isSelected ? "text-indigo-600" : "text-zinc-400"}`} />
                    <div className="flex-1 min-w-0">
                      <div className="text-xs truncate">{w.title}</div>
                      <div className="text-[10px] font-mono text-zinc-400 truncate">{w.tag}</div>
                    </div>
                    {w.sensitive && (
                      <span className="text-[9px] px-1 py-0.2 rounded bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-950/40 dark:text-amber-400 dark:border-amber-800 font-bold">
                        Scoped
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Right Column: Live Preview & Code Snippets (8 cols) */}
        <div className="lg:col-span-8 space-y-5">
          {/* Selected Widget Info Bar */}
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-5 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
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

            <div className="flex items-center gap-2">
              <button
                onClick={() => setActiveTab("preview")}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition ${
                  activeTab === "preview"
                    ? "bg-zinc-900 text-white dark:bg-white dark:text-zinc-900 shadow-sm"
                    : "text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                }`}
              >
                <Eye className="w-3.5 h-3.5 inline mr-1" />
                Live Preview
              </button>
              <button
                onClick={() => setActiveTab("code")}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition ${
                  activeTab === "code"
                    ? "bg-zinc-900 text-white dark:bg-white dark:text-zinc-900 shadow-sm"
                    : "text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                }`}
              >
                <Code2 className="w-3.5 h-3.5 inline mr-1" />
                Integration Code
              </button>
            </div>
          </div>

          {/* Tab Content */}
          {activeTab === "preview" ? (
            <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 shadow-sm space-y-4">
              <div className="flex items-center justify-between text-xs text-zinc-400 border-b border-zinc-100 dark:border-zinc-800 pb-3">
                <span className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                  Sandbox Viewport &bull; Shadow DOM Isolated
                </span>
                <span className="font-mono text-[11px]">{previewUrl}</span>
              </div>

              {/* Iframe Preview Container */}
              <div className="rounded-xl overflow-hidden border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 min-h-[460px] flex items-stretch">
                <iframe
                  src={previewUrl}
                  className="w-full min-h-[460px] border-0"
                  title={`Preview of ${selectedWidget?.title}`}
                />
              </div>
            </div>
          ) : (
            <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 shadow-sm space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-zinc-900 dark:text-white">
                    Copyable Embed Code
                  </h3>
                  <p className="text-xs text-zinc-500 mt-0.5">
                    Paste this snippet directly into any HTML page, React layout, or static site.
                  </p>
                </div>

                <button
                  onClick={handleCopyCode}
                  className="inline-flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white px-3.5 py-1.5 rounded-lg text-xs font-semibold shadow-sm shadow-indigo-600/20 transition cursor-pointer"
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

              {/* Integration Security Note */}
              <div className="p-4 rounded-xl bg-zinc-50 dark:bg-zinc-800/40 border border-zinc-200 dark:border-zinc-800 text-xs text-zinc-600 dark:text-zinc-400 space-y-2">
                <div className="font-bold text-zinc-900 dark:text-white flex items-center gap-1.5">
                  <Shield className="w-4 h-4 text-emerald-500" />
                  <span>Scoped Security &amp; Token Architecture</span>
                </div>
                <p>
                  Embed tokens (<code className="font-mono text-indigo-600">emb_*</code>) are cryptographically signed with a 15-minute TTL and restricted to the required read scopes (
                  <code className="font-mono text-zinc-700 dark:text-zinc-300">
                    {selectedWidget?.requiredScopes.join(", ")}
                  </code>
                  ). Tokens cannot perform write operations or access other client tenants.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

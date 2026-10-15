"use client";

import { useState, useEffect } from "react";
import {
  Code2,
  Copy,
  Layout,
  ExternalLink,
  Sparkles,
  RefreshCw,
  Key,
} from "lucide-react";
import { useAlert } from "@/components/ui/alert-popup";
import { getSiteOrigin } from "@/lib/site-url";
import { ALL_UNIVERSAL_SCOPES } from "@/features/portal/portal-api-keys-view";

export interface ClientOption {
  id: string;
  name: string;
}

export interface WidgetItem {
  id: string;
  name: string;
  tag: string;
  title: string;
  description: string;
  category: "billing" | "fleet" | "monitoring" | "support" | "releases" | "dashboard" | "analytics";
  requiredScopes?: string[];
}

const AVAILABLE_WIDGETS: WidgetItem[] = [
  {
    id: "billing-summary",
    name: "billing-summary",
    tag: "rsl-billing-summary",
    title: "Billing Summary",
    description: "Displays current balance due, next billing date, and active contract retainers.",
    category: "billing",
  },
  {
    id: "due-banner",
    name: "due-banner",
    tag: "rsl-due-banner",
    title: "Payment Due Banner",
    description: "Overdue alert strip with direct settlement payment link.",
    category: "billing",
  },
  {
    id: "invoice-list",
    name: "invoice-list",
    tag: "rsl-invoice-list",
    title: "Invoice Ledger",
    description: "Issued invoices list with GST splits and download buttons.",
    category: "billing",
  },
  {
    id: "process-list",
    name: "process-list",
    tag: "rsl-process-list",
    title: "PM2 Fleet Status",
    description: "Monitored PM2 processes with CPU/memory telemetry and client restart controls.",
    category: "fleet",
  },
  {
    id: "domain-status",
    name: "domain-status",
    tag: "rsl-domain-status",
    title: "Domain Uptime & SSL",
    description: "Live HTTP uptime percentage, SSL certificate days remaining, and DNS health.",
    category: "monitoring",
  },
  {
    id: "ticket-list",
    name: "ticket-list",
    tag: "rsl-ticket-list",
    title: "Support Desk & SLA",
    description: "24×7 support tickets with SLA timers and response status.",
    category: "support",
  },
  {
    id: "analytics-overview",
    name: "analytics-overview",
    tag: "rsl-analytics-overview",
    title: "Analytics & Visitor Suite",
    description: "Traffic overview, repeat visitor rate, top pages, referrers, and recent journeys.",
    category: "analytics",
  },
  {
    id: "release-list",
    name: "release-list",
    tag: "rsl-release-list",
    title: "Software Releases & Builds",
    description: "Staging, beta, and production artifact distribution catalog.",
    category: "releases",
  },
  {
    id: "client-dashboard",
    name: "client-dashboard",
    tag: "rsl-client-dashboard",
    title: "Comprehensive Client Suite",
    description: "All-in-one embedded control panel tabbed dashboard.",
    category: "dashboard",
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
  const [selectedWidget, setSelectedWidget] = useState<WidgetItem>(AVAILABLE_WIDGETS[0]);
  const [selectedClientId, setSelectedClientId] = useState<string>(
    defaultClientId || clients[0]?.id || ""
  );
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [authMode, setAuthMode] = useState<"apikey" | "token">("apikey");
  const [universalApiKey, setUniversalApiKey] = useState<string>("");
  const [generatingKey, setGeneratingKey] = useState<boolean>(false);
  const [mintedToken, setMintedToken] = useState<string>("");
  const [minting, setMinting] = useState<boolean>(false);
  const [tokenDurationDays, setTokenDurationDays] = useState<number>(30);
  const [previewKey, setPreviewKey] = useState<number>(0);

  const origin = getSiteOrigin();

  useEffect(() => {
    try {
      const saved = localStorage.getItem(`rsl_universal_api_key_${selectedClientId}`);
      setUniversalApiKey(saved || "");
    } catch {
      // ignore
    }
  }, [selectedClientId]);

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

<!-- 2. Place Web Component anywhere on your page (Permanent API Key — No Token Minting Needed) -->
<${selectedWidget.tag} api-key="${displayApiKey}" theme="${theme}"></${selectedWidget.tag}>`
      : `<!-- 1. Include RapidShift Embed Runtime in <head> -->
<script defer src="${origin}/embed.js"></script>

<!-- 2. Place Web Component anywhere on your page -->
<${selectedWidget.tag} client="${selectedClientId}"${
          mintedToken ? ` token="${mintedToken}"` : ""
        } theme="${theme}"></${selectedWidget.tag}>`;

  const iframeSnippet =
    authMode === "apikey"
      ? `<iframe
  src="${origin}/embed/${selectedWidget.name}?apiKey=${displayApiKey}&theme=${theme}"
  width="100%"
  height="460"
  style="border: none; border-radius: 16px; overflow: hidden;"
  loading="lazy"
  title="${selectedWidget.title}">
</iframe>`
      : `<iframe
  src="${previewUrl}"
  width="100%"
  height="460"
  style="border: none; border-radius: 16px; overflow: hidden;"
  loading="lazy"
  title="${selectedWidget.title}">
</iframe>`;

  const restApiSnippet = `// Fetch all client & embed data directly via REST API using your Universal API Key
const res = await fetch("${origin}/api/v1/client/data?include=client,gate,billing,invoices,fleet,domains,tickets,releases,analytics", {
  headers: { "x-api-key": "${displayApiKey}" }
});
const { data } = await res.json();`;

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 sm:p-8 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-1">
            <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200 dark:bg-blue-950/40 dark:text-blue-400 dark:border-blue-800">
              <Sparkles className="w-3.5 h-3.5" />
              <span className="steel-pill">Zero-Code Embed Studio &bull; Universal API Key</span>
            </div>
            <h1 className="text-fluid-title steel-heading text-zinc-900 dark:text-white">
              Embeddable Component Studio
            </h1>
            <p className="text-sm text-zinc-500 dark:text-zinc-400 max-w-3xl font-sans">
              Generate one permanent Universal API Key (<code className="font-mono text-blue-600 dark:text-blue-400">rpk_live_...</code>) and use it across all Web Components, Iframes, and the Client Data API without needing to mint tokens each time.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {!isClientPortal && (
              <div className="flex items-center gap-2">
                <label className="steel-metric-label text-zinc-500">Target Client:</label>
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
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold rounded-xl bg-blue-600 hover:bg-blue-500 text-white shadow-sm transition cursor-pointer disabled:opacity-50"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>{generatingKey ? "Generating..." : "1-Click Universal API Key"}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Main Studio Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Widget Selector & Options */}
        <div className="lg:col-span-4 space-y-4">
          {/* Authentication Mode */}
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-5 shadow-sm space-y-3">
            <h3 className="steel-metric-label text-zinc-900 dark:text-white flex items-center gap-1.5">
              <Key className="w-3.5 h-3.5 text-blue-600" />
              <span>Authentication Method</span>
            </h3>

            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setAuthMode("apikey")}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition cursor-pointer ${
                  authMode === "apikey"
                    ? "border-blue-600 bg-blue-600 text-white shadow-xs"
                    : "border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-300"
                }`}
              >
                Universal API Key
              </button>
              <button
                type="button"
                onClick={() => setAuthMode("token")}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition cursor-pointer ${
                  authMode === "token"
                    ? "border-blue-600 bg-blue-600 text-white shadow-xs"
                    : "border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-300"
                }`}
              >
                Scoped Token (emb_)
              </button>
            </div>

            {authMode === "apikey" ? (
              <div className="space-y-2">
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
                  placeholder="rpk_live_... (or click Generate)"
                  className="w-full px-3 py-2 text-xs font-mono rounded-lg border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800"
                />
                <button
                  type="button"
                  onClick={handleGenerateUniversalKey}
                  disabled={generatingKey}
                  className="w-full py-1.5 px-3 rounded-lg bg-blue-50 hover:bg-blue-100 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800 text-xs font-semibold transition cursor-pointer"
                >
                  {generatingKey ? "Generating..." : "Generate Universal API Key"}
                </button>
              </div>
            ) : (
              <div>
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
                    className="px-3 py-1.5 text-xs rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-semibold shadow-sm transition disabled:opacity-50"
                  >
                    {minting ? "Minting..." : "Mint Token"}
                  </button>
                </div>
                {mintedToken && (
                  <div className="mt-2 font-tech text-[11px] text-emerald-600 dark:text-emerald-400 truncate">
                    Token: {mintedToken}
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-5 shadow-sm space-y-3">
            <h2 className="steel-heading text-sm text-zinc-900 dark:text-white flex items-center gap-2">
              <Layout className="w-4 h-4 text-blue-600" />
              Choose Component Widget
            </h2>

            <div className="space-y-2">
              {AVAILABLE_WIDGETS.map((widget) => {
                const isSelected = selectedWidget.id === widget.id;
                return (
                  <div
                    key={widget.id}
                    onClick={() => {
                      setSelectedWidget(widget);
                      setPreviewKey((k) => k + 1);
                    }}
                    className={`p-3 rounded-xl border text-left cursor-pointer transition flex flex-col justify-between ${
                      isSelected
                        ? "border-blue-600 bg-blue-50/50 dark:bg-blue-950/30"
                        : "border-zinc-200 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-steel font-bold text-xs text-zinc-900 dark:text-white">
                        {widget.title}
                      </span>
                      <span className="steel-pill px-2 py-0.5 rounded-full border bg-blue-50 text-blue-700 border-blue-200/60 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800/60">
                        {widget.category}
                      </span>
                    </div>
                    <p className="text-[11px] text-zinc-500 mt-1 line-clamp-1">
                      {widget.description}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Theme Settings */}
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-5 shadow-sm space-y-4">
            <h3 className="steel-metric-label text-zinc-900 dark:text-white">
              Widget Theme
            </h3>

            <div>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setTheme("dark");
                    setPreviewKey((k) => k + 1);
                  }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition ${
                    theme === "dark"
                      ? "border-blue-600 bg-zinc-900 text-white shadow-xs"
                      : "border-zinc-200 dark:border-zinc-800 text-zinc-600"
                  }`}
                >
                  Dark Mode
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setTheme("light");
                    setPreviewKey((k) => k + 1);
                  }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition ${
                    theme === "light"
                      ? "border-blue-600 bg-white text-zinc-900 shadow-sm"
                      : "border-zinc-200 dark:border-zinc-800 text-zinc-600"
                  }`}
                >
                  Light Mode
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Live Interactive Preview & Code Snippets */}
        <div className="lg:col-span-8 space-y-6">
          {/* Live Preview Card */}
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-sm overflow-hidden">
            <div className="px-5 py-3 border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-800/40 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block"></span>
                <span className="font-steel font-bold text-xs text-zinc-800 dark:text-zinc-200">
                  Live Preview: {selectedWidget.title}
                </span>
              </div>

              <div className="flex items-center gap-3">
                <button
                  onClick={() => setPreviewKey((k) => k + 1)}
                  className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 p-1"
                  title="Refresh Preview"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                </button>
                <a
                  href={previewUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-zinc-400 hover:text-blue-600 p-1 flex items-center gap-1 text-xs font-tech"
                >
                  <span>Popout</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              </div>
            </div>

            {/* Embedded iFrame Frame (Card-only) */}
            <div className="p-4">
              <iframe
                key={previewKey}
                src={previewUrl}
                className="w-full min-h-[380px] border-0 bg-transparent block transition"
                title={selectedWidget.title}
              />
            </div>
          </div>

          {/* Copyable Code Snippets */}
          <div className="space-y-4">
            {/* Snippet 1: Web Component */}
            <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-5 shadow-sm space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Code2 className="w-4 h-4 text-blue-600" />
                  <span className="font-steel font-bold text-xs text-zinc-900 dark:text-white">
                    Method 1: Native Web Component (HTML Custom Element)
                  </span>
                </div>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(webComponentSnippet);
                    showSuccess("Copied", "Web Component snippet copied to clipboard.");
                  }}
                  className="inline-flex items-center gap-1 px-3 py-1 rounded-lg bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 text-zinc-800 dark:text-zinc-200 text-xs font-semibold transition"
                >
                  <Copy className="w-3 h-3" />
                  <span className="font-tech">Copy Web Component</span>
                </button>
              </div>
              <pre className="p-3 rounded-xl bg-zinc-950 text-blue-300 font-tech text-xs overflow-x-auto border border-zinc-800">
                <code>{webComponentSnippet}</code>
              </pre>
            </div>

            {/* Snippet 2: iFrame */}
            <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-5 shadow-sm space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Code2 className="w-4 h-4 text-emerald-600" />
                  <span className="font-steel font-bold text-xs text-zinc-900 dark:text-white">
                    Method 2: Sandboxed Responsive iFrame
                  </span>
                </div>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(iframeSnippet);
                    showSuccess("Copied", "iFrame embed snippet copied to clipboard.");
                  }}
                  className="inline-flex items-center gap-1 px-3 py-1 rounded-lg bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 text-zinc-800 dark:text-zinc-200 text-xs font-semibold transition"
                >
                  <Copy className="w-3 h-3" />
                  <span className="font-tech">Copy iFrame</span>
                </button>
              </div>
              <pre className="p-3 rounded-xl bg-zinc-950 text-emerald-300 font-tech text-xs overflow-x-auto border border-zinc-800">
                <code>{iframeSnippet}</code>
              </pre>
            </div>

            {/* Snippet 3: Client Data REST API */}
            <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-5 shadow-sm space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Code2 className="w-4 h-4 text-indigo-600" />
                  <span className="font-steel font-bold text-xs text-zinc-900 dark:text-white">
                    Method 3: Direct Client Data REST API (GET /api/v1/client/data)
                  </span>
                </div>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(restApiSnippet);
                    showSuccess("Copied", "Client Data REST API snippet copied to clipboard.");
                  }}
                  className="inline-flex items-center gap-1 px-3 py-1 rounded-lg bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 text-zinc-800 dark:text-zinc-200 text-xs font-semibold transition"
                >
                  <Copy className="w-3 h-3" />
                  <span className="font-tech">Copy API Call</span>
                </button>
              </div>
              <pre className="p-3 rounded-xl bg-zinc-950 text-indigo-300 font-tech text-xs overflow-x-auto border border-zinc-800">
                <code>{restApiSnippet}</code>
              </pre>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import {
  Key,
  Shield,
  ShieldCheck,
  ShieldAlert,
  Plus,
  Trash2,
  Copy,
  Check,
  Code2,
  CheckCircle2,
  AlertCircle,
  X,
  Sparkles,
  Layers,
  Globe,
} from "lucide-react";
import { useAlert } from "@/components/ui/alert-popup";
import { formatDate } from "@/lib/format";
import { getSiteOrigin } from "@/lib/site-url";

export const ALL_UNIVERSAL_SCOPES = [
  "access:read",
  "billing:read",
  "contracts:read",
  "fleet:read",
  "fleet:restart",
  "fleet:logs",
  "monitoring:read",
  "support:read",
  "support:write",
  "support:escalate",
  "analytics:read",
  "analytics:write",
  "releases:read",
  "vault:read",
  "vault:reveal",
  "embeds:create",
  "webhooks:read",
  "webhooks:write",
  "clients:read",
] as const;

export interface PortalApiKeyItem {
  id: string;
  name: string;
  keyPrefix: string;
  type: "secret" | "publishable";
  scopes: string[];
  expiresAt: number | null;
  lastUsedAt: number | null;
  revokedAt: number | null;
  createdAt: number;
}

export interface LiveGateInfo {
  status: string;
  allowed: boolean;
  rapidshiftStatus: "online" | "offline";
  reason: string;
  ttlSeconds: number;
  overrideMode?: string;
}

interface PortalApiKeysViewProps {
  clientId: string;
  clientName: string;
  initialGate: LiveGateInfo;
  initialKeys: PortalApiKeyItem[];
}

export function PortalApiKeysView({
  clientId,
  clientName,
  initialGate,
  initialKeys,
}: PortalApiKeysViewProps) {
  const { showSuccess, showError } = useAlert();
  const [keys, setKeys] = useState<PortalApiKeyItem[]>(initialKeys);
  const [gate] = useState<LiveGateInfo>(initialGate);
  const [showGenerateModal, setShowGenerateModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [savedUniversalKey, setSavedUniversalKey] = useState<string>("");
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);

  const [formData, setFormData] = useState({
    name: "Universal Embed & Client API Key",
    type: "publishable" as "secret" | "publishable",
    scopes: [...ALL_UNIVERSAL_SCOPES] as string[],
  });

  const [generatedSecret, setGeneratedSecret] = useState<{
    apiKey: PortalApiKeyItem;
    rawKey: string;
  } | null>(null);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(`rsl_universal_api_key_${clientId}`);
      if (stored) setSavedUniversalKey(stored);
    } catch {
      // ignore storage errors
    }
  }, [clientId]);

  const showToast = (message: string, type: "success" | "error" = "success") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  const copyToClipboard = async (text: string, key = "default") => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(null), 2500);
      showToast("Copied to clipboard!", "success");
    } catch {
      showToast("Failed to copy to clipboard", "error");
    }
  };

  const refreshKeys = async () => {
    try {
      const res = await fetch(`/api/v1/portal/api-keys?clientId=${clientId}`);
      const data = (await res.json()) as { items?: PortalApiKeyItem[] };
      if (data.items) {
        setKeys(data.items);
      }
    } catch (err) {
      console.error("Failed to refresh keys:", err);
    }
  };

  const createKeyRequest = async (payload: {
    name: string;
    type: "secret" | "publishable";
    scopes: string[];
  }) => {
    try {
      setSubmitting(true);
      const res = await fetch("/api/v1/portal/api-keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientId,
          name: payload.name,
          type: payload.type,
          scopes: payload.scopes,
        }),
      });
      const data = (await res.json()) as { apiKey: PortalApiKeyItem; rawKey: string; error?: string };
      if (!res.ok) throw new Error(data.error || "Failed to generate key");

      try {
        localStorage.setItem(`rsl_universal_api_key_${clientId}`, data.rawKey);
        setSavedUniversalKey(data.rawKey);
      } catch {
        // ignore
      }

      setGeneratedSecret(data);
      setShowGenerateModal(false);
      showSuccess(
        "Universal API Key Ready",
        `New ${payload.type.toUpperCase()} key '${payload.name}' created. It works permanently across all 23 Embeds (Web Components & Iframes) and the Client Data API without needing to mint tokens.`,
        [
          { label: "Key Name", value: payload.name },
          { label: "Key Prefix", value: data.apiKey.keyPrefix },
          { label: "Scopes Granted", value: `${payload.scopes.length} Scopes (All Embeds & Data)` },
          { label: "Raw API Key", value: data.rawKey, copyable: true, isMonospace: true },
        ],
        data.rawKey
      );
      await refreshKeys();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to generate key";
      showError("Key Generation Failed", msg);
    } finally {
      setSubmitting(false);
    }
  };

  const handleGenerateKey = async (e: React.FormEvent) => {
    e.preventDefault();
    await createKeyRequest(formData);
  };

  const handleOneClickUniversalKey = async () => {
    await createKeyRequest({
      name: "Universal Embed & Client API Key",
      type: "publishable",
      scopes: [...ALL_UNIVERSAL_SCOPES],
    });
  };

  const handleRevokeKey = async (keyId: string) => {
    if (!confirm("Are you sure you want to revoke this API key? Client requests and embeds using this key will be blocked immediately.")) return;
    try {
      setSubmitting(true);
      const res = await fetch(`/api/v1/portal/api-keys/${keyId}`, {
        method: "DELETE",
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error || "Failed to revoke key");

      showSuccess("API Key Revoked", "The key was permanently deactivated and removed from active cache.");
      await refreshKeys();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to revoke key";
      showError("Revocation Failed", msg);
    } finally {
      setSubmitting(false);
    }
  };

  const siteOrigin = getSiteOrigin();
  const exampleKey = savedUniversalKey || "rpk_live_YOUR_UNIVERSAL_API_KEY";

  const webComponentUniversalSnippet = `<!-- 1. Load RapidShift Embed Engine once with your Universal API Key -->
<script defer src="${siteOrigin}/embed.js" data-api-key="${exampleKey}"></script>

<!-- 2. Drop ANY of the 23 Web Components anywhere on your site (no token minting needed!) -->
<rsl-client-dashboard theme="dark"></rsl-client-dashboard>
<rsl-billing-summary theme="dark"></rsl-billing-summary>
<rsl-analytics-overview theme="dark"></rsl-analytics-overview>`;

  const iframeUniversalSnippet = `<!-- Works with all 23 widgets using ?apiKey= (no clientId or 15m token needed) -->
<iframe
  src="${siteOrigin}/embed/client-dashboard?apiKey=${exampleKey}&theme=dark"
  width="100%"
  height="520"
  style="border: none; border-radius: 16px;"
  loading="lazy"
></iframe>`;

  const restApiSnippet = `// Fetch all client data (billing, invoices, fleet, domains, tickets, analytics)
const res = await fetch("${siteOrigin}/api/v1/client/data?include=client,billing,invoices,fleet,domains,tickets,analytics", {
  headers: {
    "x-api-key": "${exampleKey}"
  }
});
const { data } = await res.json();`;

  const proxyCodeSnippet = `// apps/web/src/proxy.ts (or middleware.ts)
import { createGate } from "@rapidshift/sdk";

const gate = createGate({
  secretKey: process.env.RAPIDSHIFT_SECRET_KEY!,
  baseUrl: process.env.RAPIDSHIFT_URL || "${siteOrigin}",
  blockedPage: "/payment-due",
  failMode: "open", // Client app stays accessible if RapidShift is offline
});

export default async function proxy(req: Request) {
  return gate(req);
}`;

  return (
    <div className="space-y-8">
      {/* Toast Notification */}
      {toast && (
        <div
          className={`fixed top-4 right-4 z-50 flex items-center gap-2 px-4 py-3 rounded-lg shadow-lg text-sm font-medium border ${
            toast.type === "success"
              ? "bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-950/80 dark:text-emerald-300 dark:border-emerald-800"
              : "bg-red-50 text-red-800 border-red-200 dark:bg-red-950/80 dark:text-red-300 dark:border-red-800"
          }`}
        >
          {toast.type === "success" ? <CheckCircle2 className="w-4 h-4 text-emerald-600" /> : <AlertCircle className="w-4 h-4 text-red-600" />}
          {toast.message}
        </div>
      )}

      {/* Page Action Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center border border-amber-500/20 shadow-xs">
            <Key className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-zinc-900 dark:text-white">
              Universal API Keys, Embeds &amp; Access Gate
            </h1>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              Generate one permanent API key to power all 23 Web Component / Iframe embeds, Client Data APIs, and Access Gate for {clientName}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 self-start sm:self-auto">
          <button
            onClick={handleOneClickUniversalKey}
            disabled={submitting}
            className="inline-flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 active:scale-[0.99] text-white px-4 py-2 rounded-lg text-xs font-semibold shadow-xs transition cursor-pointer disabled:opacity-50"
            data-testid="one-click-universal-key-btn"
          >
            <Sparkles className="w-4 h-4" />
            <span>{submitting ? "Generating..." : "1-Click Universal Embed & API Key"}</span>
          </button>

          <button
            onClick={() => setShowGenerateModal(true)}
            className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 active:scale-[0.99] text-white px-4 py-2 rounded-lg text-xs font-semibold shadow-xs transition cursor-pointer"
            data-testid="generate-key-btn"
          >
            <Plus className="w-4 h-4" />
            <span>Custom Scoped Key</span>
          </button>
        </div>
      </div>

      {/* Universal Embed Key Banner */}
      <section className="bg-gradient-to-r from-indigo-950/90 via-slate-900 to-blue-950/90 text-white border border-indigo-500/30 rounded-2xl p-6 shadow-sm">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="space-y-2 max-w-2xl">
            <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-indigo-500/20 text-indigo-300 border border-indigo-400/30">
              <Layers className="w-3.5 h-3.5" />
              <span>Zero Token Minting Required</span>
            </div>
            <h2 className="text-lg font-extrabold tracking-tight">
              Use One Universal API Key Across All 23 Embeds &amp; REST APIs
            </h2>
            <p className="text-xs text-slate-300 leading-relaxed">
              Instead of minting short-lived 15-minute <code className="text-indigo-300 font-mono">emb_...</code> tokens each time, generate a permanent{" "}
              <strong className="text-white">Universal API Key (<code className="font-mono text-emerald-300">rpk_live_...</code>)</strong> once. Pass it via{" "}
              <code className="text-indigo-300 font-mono">api-key=&quot;rpk_live_...&quot;</code> on Web Components,{" "}
              <code className="text-indigo-300 font-mono">?apiKey=rpk_live_...</code> on Iframes, or{" "}
              <code className="text-indigo-300 font-mono">x-api-key</code> on <code className="text-indigo-300 font-mono">/api/v1/client/data</code>.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 shrink-0">
            <Link
              href="/portal/embeds"
              className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-white/10 hover:bg-white/15 text-white border border-white/15 text-xs font-semibold transition"
            >
              <Code2 className="w-4 h-4 text-indigo-300" />
              <span>Open Embed Studio</span>
            </Link>
            <button
              onClick={handleOneClickUniversalKey}
              disabled={submitting}
              className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-500 hover:bg-indigo-400 text-white text-xs font-bold shadow-lg shadow-indigo-500/20 transition cursor-pointer"
            >
              <Sparkles className="w-4 h-4" />
              <span>Generate Universal Key Now</span>
            </button>
          </div>
        </div>

        {savedUniversalKey && (
          <div className="mt-4 pt-4 border-t border-white/10 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-xs text-emerald-300">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>Active Universal Key saved in your browser for instant Embed Studio snippets:</span>
              <code className="px-2 py-0.5 rounded bg-black/40 border border-white/10 font-mono text-[11px] text-white">
                {savedUniversalKey}
              </code>
            </div>
            <button
              onClick={() => copyToClipboard(savedUniversalKey, "savedUniversal")}
              className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-xs font-semibold text-white self-start sm:self-auto cursor-pointer"
            >
              {copiedKey === "savedUniversal" ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              <span>Copy Key</span>
            </button>
          </div>
        )}
      </section>

      {/* Live Gate Status Banner */}
      <section className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200 dark:bg-blue-950/40 dark:text-blue-400 dark:border-blue-800">
              <Shield className="w-3.5 h-3.5" />
              <span>Realtime Gate Status: {gate.status}</span>
            </div>
            <h2 className="text-xl font-extrabold text-zinc-900 dark:text-white flex items-center gap-2">
              {gate.allowed ? (
                <>
                  <ShieldCheck className="w-6 h-6 text-emerald-500" />
                  Access Passes Permitted
                </>
              ) : (
                <>
                  <ShieldAlert className="w-6 h-6 text-red-500" />
                  Access Restricted (Dues Overdue)
                </>
              )}
            </h2>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 max-w-xl leading-relaxed">
              {gate.reason}. Client applications using the SDK verify incoming traffic using signed Ed25519 JWT passes with sub-10ms response times.
            </p>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <div className="p-3 bg-zinc-50 dark:bg-zinc-800/60 rounded-xl border border-zinc-200 dark:border-zinc-700/60">
              <div className="text-[10px] uppercase text-zinc-400 font-semibold tracking-wider">RapidShift Plane</div>
              <div className="text-xs font-bold text-emerald-600 dark:text-emerald-400 mt-1 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                Online (200 OK)
              </div>
            </div>

            <div className="p-3 bg-zinc-50 dark:bg-zinc-800/60 rounded-xl border border-zinc-200 dark:border-zinc-700/60">
              <div className="text-[10px] uppercase text-zinc-400 font-semibold tracking-wider">Pass Security</div>
              <div className="text-xs font-bold text-blue-600 dark:text-blue-400 mt-1 font-mono">
                Ed25519 • JWKS
              </div>
            </div>

            <div className="p-3 bg-zinc-50 dark:bg-zinc-900/60 rounded-xl border border-zinc-200 dark:border-zinc-700/60">
              <div className="text-[10px] uppercase text-zinc-400 font-semibold tracking-wider">Edge Cache TTL</div>
              <div className="text-xs font-bold text-zinc-900 dark:text-zinc-100 mt-1 font-mono">
                {gate.ttlSeconds}s (sub-10ms)
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* API Keys Table & Generator */}
      <section className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 shadow-sm space-y-4">
        <div className="flex items-center justify-between pb-4 border-b border-zinc-200 dark:border-zinc-800">
          <div>
            <h3 className="text-base font-bold text-zinc-900 dark:text-white">Active Service &amp; Universal Embed Keys</h3>
            <p className="text-xs text-zinc-500">
              Use these keys in Web Components, Iframes, REST API requests, or your Next.js proxy.
            </p>
          </div>
          <button
            onClick={() => setShowGenerateModal(true)}
            className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white px-3.5 py-2 rounded-lg text-xs font-medium shadow-sm transition cursor-pointer"
            data-testid="portal-generate-key-btn"
          >
            <Plus className="w-4 h-4" />
            Generate New Key
          </button>
        </div>

        {keys.length === 0 ? (
          <div className="py-12 text-center text-xs text-zinc-400 border border-dashed border-zinc-200 dark:border-zinc-800 rounded-xl">
            <Key className="w-8 h-8 mx-auto text-zinc-300 dark:text-zinc-700 mb-2" />
            <p>No API keys generated yet.</p>
            <p className="text-[11px] text-zinc-500 mt-1">Click &quot;1-Click Universal Embed &amp; API Key&quot; above to create one immediately.</p>
          </div>
        ) : (
          <div className="divide-y divide-zinc-200 dark:divide-zinc-800 border border-zinc-200 dark:border-zinc-800 rounded-xl overflow-hidden text-xs">
            {keys.map((k) => (
              <div
                key={k.id}
                className="p-4 flex items-center justify-between hover:bg-zinc-50/50 dark:hover:bg-zinc-800/40 transition"
                data-testid={`portal-key-row-${k.id}`}
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-zinc-900 dark:text-zinc-100">{k.name}</span>
                    <span className="font-mono text-[11px] px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 font-medium">
                      {k.keyPrefix}...
                    </span>
                    <span className="px-1.5 py-0.2 rounded text-[10px] font-medium uppercase bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300">
                      {k.type}
                    </span>
                    {k.scopes && k.scopes.length >= 10 && (
                      <span className="px-1.5 py-0.2 rounded text-[10px] font-semibold uppercase bg-indigo-50 text-indigo-700 dark:bg-indigo-950/50 dark:text-indigo-300 border border-indigo-200/60 dark:border-indigo-800">
                        Universal Embed + API
                      </span>
                    )}
                    {k.revokedAt ? (
                      <span className="px-1.5 py-0.2 rounded text-[10px] font-medium uppercase bg-red-100 text-red-700 dark:bg-red-950/60 dark:text-red-300">
                        Revoked
                      </span>
                    ) : (
                      <span className="px-1.5 py-0.2 rounded text-[10px] font-medium uppercase bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300">
                        Active
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 text-zinc-400 text-[11px] flex-wrap">
                    <span>
                      Scopes:{" "}
                      {k.scopes && k.scopes.length > 6
                        ? `All ${k.scopes.length} Scopes (${k.scopes.slice(0, 4).join(", ")}, ...)`
                        : k.scopes?.join(", ") || "access:read"}
                    </span>
                    <span>&bull;</span>
                    <span>Created: {formatDate(k.createdAt)}</span>
                    {k.lastUsedAt && (
                      <>
                        <span>&bull;</span>
                        <span>Last used: {formatDate(k.lastUsedAt)}</span>
                      </>
                    )}
                  </div>
                </div>

                {!k.revokedAt && (
                  <button
                    onClick={() => handleRevokeKey(k.id)}
                    disabled={submitting}
                    className="p-1.5 text-zinc-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 rounded transition cursor-pointer"
                    title="Revoke Key"
                    data-testid={`portal-revoke-key-${k.id}`}
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Universal Embed & Client Data API Quick Guide */}
      <section className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 shadow-sm space-y-5">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <Globe className="w-5 h-5 text-indigo-600" />
            <h3 className="text-base font-bold text-zinc-900 dark:text-white">
              Universal Embeds (Web Component &amp; Iframe) + Client Data API
            </h3>
          </div>
          <span className="text-[11px] font-mono text-zinc-500">
            Active Domain: {siteOrigin}
          </span>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="space-y-1.5">
            <div className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
              A. Web Components (All 23 Widgets)
            </div>
            <div className="p-3.5 bg-zinc-950 text-zinc-100 rounded-xl font-mono text-[11px] overflow-x-auto relative border border-zinc-800">
              <button
                onClick={() => copyToClipboard(webComponentUniversalSnippet, "wc-uni")}
                className="absolute top-2.5 right-2.5 text-zinc-400 hover:text-white"
                title="Copy Web Component Snippet"
              >
                {copiedKey === "wc-uni" ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
              </button>
              <pre className="leading-relaxed">{webComponentUniversalSnippet}</pre>
            </div>
          </div>

          <div className="space-y-1.5">
            <div className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
              B. Direct Iframe Embed (Zero JS)
            </div>
            <div className="p-3.5 bg-zinc-950 text-zinc-100 rounded-xl font-mono text-[11px] overflow-x-auto relative border border-zinc-800">
              <button
                onClick={() => copyToClipboard(iframeUniversalSnippet, "iframe-uni")}
                className="absolute top-2.5 right-2.5 text-zinc-400 hover:text-white"
                title="Copy Iframe Snippet"
              >
                {copiedKey === "iframe-uni" ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
              </button>
              <pre className="leading-relaxed">{iframeUniversalSnippet}</pre>
            </div>
          </div>

          <div className="space-y-1.5">
            <div className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
              C. Unified Client Data REST API
            </div>
            <div className="p-3.5 bg-zinc-950 text-zinc-100 rounded-xl font-mono text-[11px] overflow-x-auto relative border border-zinc-800">
              <button
                onClick={() => copyToClipboard(restApiSnippet, "rest-uni")}
                className="absolute top-2.5 right-2.5 text-zinc-400 hover:text-white"
                title="Copy REST API Snippet"
              >
                {copiedKey === "rest-uni" ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
              </button>
              <pre className="leading-relaxed">{restApiSnippet}</pre>
            </div>
          </div>
        </div>
      </section>

      {/* SDK Gate Integration Guide Section */}
      <section className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 shadow-sm space-y-4">
        <div className="flex items-center gap-2">
          <Code2 className="w-5 h-5 text-blue-600" />
          <h3 className="text-base font-bold text-zinc-900 dark:text-white">Access Gate SDK Quick Integration Guide</h3>
        </div>
        <p className="text-xs text-zinc-500 leading-relaxed">
          Protect routes in your client Next.js application by installing <code>@rapidshift/sdk</code> and registering <code>createGate</code> in <code>proxy.ts</code>.
        </p>

        <div className="space-y-3">
          <div>
            <div className="text-[11px] font-semibold text-zinc-700 dark:text-zinc-300 mb-1">1. Install SDK in your Next.js application:</div>
            <div className="p-3 bg-zinc-900 text-zinc-100 rounded-xl font-mono text-xs flex items-center justify-between">
              <span>pnpm add @rapidshift/sdk</span>
              <button
                onClick={() => copyToClipboard("pnpm add @rapidshift/sdk", "install")}
                className="text-zinc-400 hover:text-white"
              >
                {copiedKey === "install" ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <div>
            <div className="text-[11px] font-semibold text-zinc-700 dark:text-zinc-300 mb-1">2. Add to <code>src/proxy.ts</code>:</div>
            <div className="p-3.5 bg-zinc-900 text-zinc-100 rounded-xl font-mono text-xs overflow-x-auto relative">
              <button
                onClick={() => copyToClipboard(proxyCodeSnippet, "snippet")}
                className="absolute top-3 right-3 text-zinc-400 hover:text-white"
                title="Copy Snippet"
              >
                {copiedKey === "snippet" ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
              </button>
              <pre>{proxyCodeSnippet}</pre>
            </div>
          </div>
        </div>
      </section>

      {/* Generate API Key Modal */}
      {showGenerateModal && (
        <div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 shadow-2xl max-w-lg w-full p-6 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-zinc-200 dark:border-zinc-800">
              <h3 className="font-semibold text-base">Generate New API Key</h3>
              <button
                onClick={() => setShowGenerateModal(false)}
                className="p-1 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-400"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleGenerateKey} className="space-y-3.5 text-sm">
              <div>
                <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">Key Description *</label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="e.g. Universal Embed & Client API Key"
                  className="w-full px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
                  data-testid="portal-key-name-input"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">Key Type</label>
                <select
                  value={formData.type}
                  onChange={(e) => setFormData({ ...formData, type: e.target.value as "secret" | "publishable" })}
                  className="w-full px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="publishable">Publishable / Embed Key (rpk_live_...) - Works in Web Components, Iframes &amp; API</option>
                  <option value="secret">Secret Key (rsk_live_...) - Backend Server / Proxy / Full API</option>
                </select>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400">Permitted Scopes ({formData.scopes.length} selected)</label>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setFormData({ ...formData, scopes: [...ALL_UNIVERSAL_SCOPES] })}
                      className="text-[11px] font-semibold text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer"
                    >
                      Select All (Universal)
                    </button>
                    <span className="text-zinc-300">|</span>
                    <button
                      type="button"
                      onClick={() => setFormData({ ...formData, scopes: ["access:read"] })}
                      className="text-[11px] text-zinc-500 hover:underline cursor-pointer"
                    >
                      Gate Only
                    </button>
                  </div>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5 text-xs max-h-52 overflow-y-auto p-1">
                  {ALL_UNIVERSAL_SCOPES.map((scope) => (
                    <label key={scope} className="flex items-center gap-2 cursor-pointer p-2 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-800/40">
                      <input
                        type="checkbox"
                        checked={formData.scopes.includes(scope)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setFormData({ ...formData, scopes: [...formData.scopes, scope] });
                          } else {
                            setFormData({ ...formData, scopes: formData.scopes.filter((s) => s !== scope) });
                          }
                        }}
                        className="rounded border-zinc-300 text-blue-600 focus:ring-blue-500"
                      />
                      <span className="font-mono text-[10px] truncate">{scope}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-zinc-200 dark:border-zinc-800">
                <button
                  type="button"
                  onClick={() => setShowGenerateModal(false)}
                  className="px-3 py-1.5 rounded-lg text-xs text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-1.5 rounded-lg text-xs font-medium transition cursor-pointer flex items-center gap-1.5"
                  data-testid="portal-submit-generate-key"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  {submitting ? "Generating..." : "Generate Key"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Newly Generated Raw Key Display Modal */}
      {generatedSecret && (
        <div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 shadow-2xl max-w-md w-full p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 flex items-center justify-center shrink-0">
                <Key className="w-6 h-6" />
              </div>
              <div>
                <h3 className="font-bold text-base text-zinc-900 dark:text-white">Universal API Key Generated</h3>
                <p className="text-xs text-zinc-500">Copy this key now. It is also pre-filled in your Embed Studio.</p>
              </div>
            </div>

            <div className="p-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/50 rounded-lg text-xs text-amber-800 dark:text-amber-200">
              RapidShift stores only a cryptographic SHA-256 hash in the database. Keep this key safe for your embeds and API calls.
            </div>

            <div className="p-3 bg-zinc-100 dark:bg-zinc-800 rounded-lg border border-zinc-200 dark:border-zinc-700 flex items-center justify-between gap-2">
              <span className="font-mono text-xs font-bold break-all text-zinc-900 dark:text-zinc-100 select-all" data-testid="portal-raw-key-value">
                {generatedSecret.rawKey}
              </span>
              <button
                type="button"
                onClick={() => copyToClipboard(generatedSecret.rawKey, "rawKey")}
                className="p-1.5 rounded-md hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-600 dark:text-zinc-300 shrink-0"
                title="Copy Key"
                data-testid="portal-copy-raw-key-btn"
              >
                {copiedKey === "rawKey" ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
              </button>
            </div>

            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={() => setGeneratedSecret(null)}
                className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-xs font-medium cursor-pointer"
              >
                I have saved this key
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

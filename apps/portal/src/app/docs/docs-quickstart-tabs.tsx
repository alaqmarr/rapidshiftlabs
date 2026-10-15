"use client";

import React, { useState } from "react";
import { Copy, Check, Code2, Globe, Database, BarChart3, ShieldCheck } from "lucide-react";
import { getSiteOrigin } from "@/lib/site-url";

export function DocsQuickstartTabs() {
  const [activeTab, setActiveTab] = useState<
    "webcomponent" | "iframe" | "data-api" | "tracker" | "gate"
  >("webcomponent");
  const [copied, setCopied] = useState(false);

  const origin = getSiteOrigin();

  const snippets = {
    webcomponent: {
      title: "1. Universal Web Components (All 23 Widgets — No Token Minting)",
      desc: "Include embed.js once with your permanent Universal API Key (rpk_live_...) and drop any of the 23 <rsl-*> widgets onto your page.",
      lang: "html",
      code: `<!-- 1. Include RapidShift Embed Runtime once in <head> or <body> -->
<script
  defer
  src="${origin}/embed.js"
  data-api-key="rpk_live_YOUR_UNIVERSAL_API_KEY"
></script>

<!-- 2. Drop ANY of the 23 Web Components anywhere on your site -->
<rsl-client-dashboard theme="dark"></rsl-client-dashboard>
<rsl-billing-summary theme="dark"></rsl-billing-summary>
<rsl-analytics-overview theme="dark"></rsl-analytics-overview>`,
    },
    iframe: {
      title: "2. Zero-JS Responsive Iframe Embed",
      desc: "Embed any of the 23 widgets in an isolated <iframe> using ?apiKey=rpk_live_... — clientId is resolved automatically.",
      lang: "html",
      code: `<iframe
  src="${origin}/embed/client-dashboard?apiKey=rpk_live_YOUR_UNIVERSAL_API_KEY&theme=dark"
  width="100%"
  height="520"
  frameborder="0"
  style="border: none; border-radius: 16px; width: 100%; min-height: 460px;"
  loading="lazy"
  title="RapidShift Client Suite"
></iframe>`,
    },
    "data-api": {
      title: "3. Unified Client Data REST API (GET /api/v1/client/data)",
      desc: "Fetch all your client data (billing, invoices, payments, contracts, PM2 fleet, domains, support tickets, releases, and visitor analytics) using the same API key.",
      lang: "typescript",
      code: `const response = await fetch(
  "${origin}/api/v1/client/data?include=client,gate,billing,invoices,fleet,domains,tickets,releases,analytics&days=30",
  {
    headers: {
      "x-api-key": "rpk_live_YOUR_UNIVERSAL_API_KEY",
    },
  }
);

const { data } = await response.json();
console.log("Client Profile & Billing:", data.client, data.billingSummary);
console.log("Fleet & Domains:", data.fleetProcesses, data.monitoredDomains);
console.log("Analytics & Repeat Viewers:", data.analytics);`,
    },
    tracker: {
      title: "4. Cookieless Analytics & Visitor Intelligence Tracker (t.js)",
      desc: "Captures pageviews, session click-path journeys, repeat viewer loyalty, countries, referrers, and real Core Web Vitals (< 2 KB).",
      lang: "html",
      code: `<!-- Place in your root <head> or Next.js app/layout.tsx -->
<script
  defer
  src="${origin}/t.js"
  data-client="cli_01M4ZQK3D3EY8WYGS20H5M0D9S"
></script>

<script>
  // Optional: track custom business conversions anywhere
  window.rslTrack?.("plan_purchased", { plan: "enterprise", value: 49999 });
</script>`,
    },
    gate: {
      title: "5. Fail-Open Access Gate Middleware (@rapidshift/sdk)",
      desc: "Protect your Next.js proxy.ts / middleware.ts with sub-millisecond cached passes and 100% fail-open uptime.",
      lang: "typescript",
      code: `// src/proxy.ts (or middleware.ts)
import { NextResponse, type NextRequest } from "next/server";
import { createGate } from "@rapidshift/sdk";

const gate = createGate({
  apiKey: process.env.RAPIDSHIFT_API_KEY!, // rsk_live_... or rpk_live_...
  apiUrl: process.env.RAPIDSHIFT_API_URL || "${origin}",
  blockedRedirectUrl: "${origin}/portal/billing",
  failOpen: true, // App stays 100% online even if RapidShift is unreachable
});

export default async function proxy(req: NextRequest) {
  const result = await gate.evaluate(req);
  if (result.action === "block") {
    return NextResponse.redirect(new URL(result.redirectUrl, req.url));
  }
  return NextResponse.next();
}`,
    },
  };

  const active = snippets[activeTab];

  const handleCopy = () => {
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard.writeText(active.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-sm overflow-hidden">
      {/* Top Tab Bar */}
      <div className="px-4 sm:px-6 pt-4 border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50/70 dark:bg-zinc-900/60 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-1.5 overflow-x-auto pb-3 sm:pb-0 no-scrollbar">
          {[
            { id: "webcomponent", label: "Web Component Embed", icon: Code2 },
            { id: "iframe", label: "Iframe Embed", icon: Globe },
            { id: "data-api", label: "Client Data API", icon: Database },
            { id: "tracker", label: "Analytics Tracker", icon: BarChart3 },
            { id: "gate", label: "Access Gate SDK", icon: ShieldCheck },
          ].map((t) => {
            const Icon = t.icon;
            const isSelected = activeTab === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setActiveTab(t.id as any)}
                className={`inline-flex items-center gap-1.5 px-3.5 py-2.5 text-xs font-bold border-b-2 transition whitespace-nowrap cursor-pointer ${
                  isSelected
                    ? "border-blue-600 text-blue-600 dark:text-blue-400 bg-white dark:bg-zinc-900 rounded-t-lg"
                    : "border-transparent text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200"
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{t.label}</span>
              </button>
            );
          })}
        </div>

        <div className="pb-3 sm:pb-2 text-[11px] font-mono text-zinc-500">
          Host: <span className="text-zinc-800 dark:text-zinc-200 font-semibold">{origin}</span>
        </div>
      </div>

      {/* Body */}
      <div className="p-5 sm:p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="text-sm sm:text-base font-bold text-zinc-900 dark:text-white">
              {active.title}
            </h3>
            <p className="text-xs text-zinc-600 dark:text-zinc-400 mt-0.5">
              {active.desc}
            </p>
          </div>

          <button
            type="button"
            onClick={handleCopy}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold shadow-xs transition shrink-0 self-start sm:self-auto cursor-pointer"
          >
            {copied ? (
              <>
                <Check className="w-3.5 h-3.5" />
                <span>Copied Snippet!</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5" />
                <span>Copy Snippet</span>
              </>
            )}
          </button>
        </div>

        <pre className="p-4 rounded-xl bg-zinc-950 text-zinc-100 font-mono text-xs sm:text-[13px] overflow-x-auto leading-relaxed border border-zinc-800">
          <code>{active.code}</code>
        </pre>
      </div>
    </div>
  );
}

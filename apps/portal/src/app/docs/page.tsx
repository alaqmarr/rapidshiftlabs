import React from "react";
import Link from "next/link";
import {
  ShieldCheck,
  BarChart3,
  Code2,
  Webhook,
  Layers,
  Terminal,
  BookOpen,
  ArrowRight,
  ExternalLink,
  Key,
  Sparkles,
  CheckCircle2,
} from "lucide-react";
import { DocsHeader } from "./docs-header";
import { DocsQuickstartTabs } from "./docs-quickstart-tabs";

export const metadata = {
  title: "Developer Documentation Hub | RapidShift Labs",
  description:
    "Clean, accessible developer documentation for RapidShift Universal API Keys, Web Components, Iframes, Client Data API, Analytics Tracker, and Access Gate SDK.",
};

const GUIDES = [
  {
    slug: "embeds",
    title: "Universal Embeds (Web Components & Iframes)",
    description:
      "Use one permanent Universal API Key (rpk_live_...) across all 23 Web Components, Iframes, and in-place actions without minting short-lived tokens.",
    category: "Embeds & UI",
    icon: Code2,
    readingTime: "5 min read",
    badge: "Most Popular",
  },
  {
    slug: "analytics-tracker",
    title: "Cookieless Analytics & Visitor Intelligence",
    description:
      "Drop-in < 2 KB tracker (t.js) capturing pageviews, session click-path journeys, repeat viewers, geo origins, and real Core Web Vitals.",
    category: "Analytics",
    icon: BarChart3,
    readingTime: "4 min read",
  },
  {
    slug: "gate-integration",
    title: "Client Access Gate Integration",
    description:
      "Protect Next.js proxy.ts, middleware.ts, or Express apps with sub-10ms entitlement passes and 100% fail-open resilience.",
    category: "Access Gate",
    icon: ShieldCheck,
    readingTime: "5 min read",
  },
  {
    slug: "sdk-reference",
    title: "TypeScript SDK Reference (@rapidshift/sdk)",
    description:
      "Complete API reference for createGate, createExpressGate, RapidShiftClient, caching, and TypeScript types.",
    category: "SDK",
    icon: Terminal,
    readingTime: "5 min read",
  },
  {
    slug: "webhooks",
    title: "Webhooks & Realtime Event Delivery",
    description:
      "Event catalog, HMAC-SHA256 signature verification, timestamp replay protection, and exponential backoff retries.",
    category: "Automation",
    icon: Webhook,
    readingTime: "4 min read",
  },
  {
    slug: "architecture-ddd",
    title: "Architecture & Domain-Driven Design",
    description:
      "15 bounded contexts, strict clean architecture layering, transactional outbox pattern, and SQLite WAL concurrency.",
    category: "Architecture",
    icon: Layers,
    readingTime: "6 min read",
  },
];

export default function DocsIndexPage() {
  return (
    <div className="min-h-screen bg-slate-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100">
      <DocsHeader />

      <main className="max-w-7xl mx-auto py-10 px-4 sm:px-6 lg:px-8 space-y-12">
        {/* Hero Section */}
        <section className="rounded-3xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-6 sm:p-10 shadow-xs">
          <div className="max-w-3xl space-y-4">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-bold bg-blue-50 text-blue-700 border border-blue-200 dark:bg-blue-950/60 dark:text-blue-300 dark:border-blue-800">
              <BookOpen className="w-3.5 h-3.5" />
              <span>Developer Documentation &amp; Integration Hub</span>
            </div>

            <h1 className="text-3xl sm:text-5xl font-black tracking-tight text-zinc-900 dark:text-white">
              Integrate RapidShift in Minutes
            </h1>

            <p className="text-zinc-600 dark:text-zinc-300 text-sm sm:text-base leading-relaxed">
              Generate a single permanent{" "}
              <strong className="font-semibold text-zinc-900 dark:text-white">
                Universal API Key (<code className="font-mono text-blue-600 dark:text-blue-400">rpk_live_...</code>)
              </strong>{" "}
              once and use it across all{" "}
              <strong className="font-semibold text-zinc-900 dark:text-white">23 Web Components</strong>,{" "}
              <strong className="font-semibold text-zinc-900 dark:text-white">Iframes</strong>,{" "}
              <strong className="font-semibold text-zinc-900 dark:text-white">Client Data REST APIs</strong>, and{" "}
              <strong className="font-semibold text-zinc-900 dark:text-white">Access Gate Middleware</strong> — with automatic domain portability.
            </p>

            {/* 3-Step Pill Strip */}
            <div className="pt-2 grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
              <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-zinc-800/60 border border-zinc-200/80 dark:border-zinc-800 flex items-start gap-2.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                <div>
                  <div className="font-bold text-zinc-900 dark:text-white">1. One Universal Key</div>
                  <div className="text-zinc-500 dark:text-zinc-400 mt-0.5">
                    Generate once in <code className="font-mono">/portal/api-keys</code> — no 15m token minting.
                  </div>
                </div>
              </div>

              <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-zinc-800/60 border border-zinc-200/80 dark:border-zinc-800 flex items-start gap-2.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                <div>
                  <div className="font-bold text-zinc-900 dark:text-white">2. Web Component or Iframe</div>
                  <div className="text-zinc-500 dark:text-zinc-400 mt-0.5">
                    Works with <code className="font-mono">&lt;rsl-*&gt;</code> tags and <code className="font-mono">/embed/*</code> iframes.
                  </div>
                </div>
              </div>

              <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-zinc-800/60 border border-zinc-200/80 dark:border-zinc-800 flex items-start gap-2.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                <div>
                  <div className="font-bold text-zinc-900 dark:text-white">3. Domain Portable</div>
                  <div className="text-zinc-500 dark:text-zinc-400 mt-0.5">
                    Auto-detects <code className="font-mono">rsl.alaqmar.dev</code> or any future custom domain.
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Interactive Copy-Paste Quickstart Cheat Sheet */}
        <section className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <h2 className="text-xl sm:text-2xl font-extrabold tracking-tight text-zinc-900 dark:text-white">
                Copy-Paste Quickstart Cheat Sheet
              </h2>
              <p className="text-xs sm:text-sm text-zinc-600 dark:text-zinc-400">
                Select an integration pattern below and copy the ready-to-use snippet.
              </p>
            </div>
            <Link
              href="/portal/embeds"
              className="inline-flex items-center gap-1.5 text-xs font-bold text-blue-600 dark:text-blue-400 hover:underline"
            >
              <span>Open Live Embed Studio</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          <DocsQuickstartTabs />
        </section>

        {/* Developer Guides Grid */}
        <section className="space-y-5">
          <div>
            <h2 className="text-xl sm:text-2xl font-extrabold tracking-tight text-zinc-900 dark:text-white">
              Step-by-Step Developer Guides
            </h2>
            <p className="text-xs sm:text-sm text-zinc-600 dark:text-zinc-400">
              Detailed guides with copyable examples, architecture diagrams, and full widget tables.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {GUIDES.map((guide) => {
              const Icon = guide.icon;
              return (
                <Link
                  key={guide.slug}
                  href={`/docs/${guide.slug}`}
                  className="group flex flex-col justify-between p-6 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 hover:border-blue-500/60 dark:hover:border-blue-500/60 hover:shadow-md transition-all"
                >
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-950/60 border border-blue-200/60 dark:border-blue-800/60 flex items-center justify-center text-blue-600 dark:text-blue-400 group-hover:bg-blue-600 group-hover:text-white transition-colors">
                        <Icon className="w-5 h-5" />
                      </div>
                      <div className="flex items-center gap-1.5">
                        {guide.badge && (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
                            {guide.badge}
                          </span>
                        )}
                        <span className="text-[11px] font-semibold text-zinc-500 dark:text-zinc-400 px-2.5 py-0.5 rounded-md bg-zinc-100 dark:bg-zinc-800">
                          {guide.category}
                        </span>
                      </div>
                    </div>

                    <h3 className="text-base sm:text-lg font-bold tracking-tight text-zinc-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                      {guide.title}
                    </h3>

                    <p className="text-zinc-600 dark:text-zinc-400 text-xs sm:text-sm leading-relaxed">
                      {guide.description}
                    </p>
                  </div>

                  <div className="mt-6 pt-4 border-t border-zinc-100 dark:border-zinc-800 flex items-center justify-between text-xs text-zinc-500 dark:text-zinc-400">
                    <span>{guide.readingTime}</span>
                    <span className="inline-flex items-center gap-1 font-bold text-blue-600 dark:text-blue-400 group-hover:translate-x-1 transition-transform">
                      Read Guide
                      <ArrowRight className="w-3.5 h-3.5" />
                    </span>
                  </div>
                </Link>
              );
            })}
          </div>
        </section>

        {/* Featured Bottom Cards: REST API Explorer & Operational Runbooks */}
        <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-6 sm:p-8 flex flex-col justify-between shadow-xs">
            <div className="space-y-2.5">
              <span className="inline-block px-2.5 py-0.5 text-[11px] font-mono font-bold bg-blue-600 text-white rounded-md">
                OPENAPI 3.1
              </span>
              <h2 className="text-xl sm:text-2xl font-extrabold tracking-tight text-zinc-900 dark:text-white">
                Interactive REST API Reference
              </h2>
              <p className="text-zinc-600 dark:text-zinc-400 text-xs sm:text-sm leading-relaxed">
                Browse every public and administrative endpoint (<code className="font-mono">/api/v1/client/data</code>,{" "}
                <code className="font-mono">/api/v1/access/status</code>,{" "}
                <code className="font-mono">/api/v1/embed-actions</code>,{" "}
                <code className="font-mono">/api/v1/analytics/suite</code>) with schemas, parameters, and copyable cURL commands.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3 pt-6">
              <Link
                href="/docs/api"
                className="inline-flex items-center gap-2 px-4 py-2.5 text-xs sm:text-sm font-bold rounded-xl bg-blue-600 text-white hover:bg-blue-500 transition shadow-xs"
              >
                <span>Open API Reference</span>
                <ArrowRight className="w-4 h-4" />
              </Link>
              <a
                href="/openapi.json"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 px-3.5 py-2.5 text-xs font-semibold rounded-xl border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition text-zinc-700 dark:text-zinc-300"
              >
                <span>Raw /openapi.json</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>
          </div>

          <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-6 sm:p-8 flex flex-col justify-between shadow-xs">
            <div className="space-y-2.5">
              <span className="inline-block px-2.5 py-0.5 text-[11px] font-mono font-bold bg-indigo-600 text-white rounded-md">
                16 RUNBOOKS &amp; SANDBOX
              </span>
              <h2 className="text-xl sm:text-2xl font-extrabold tracking-tight text-zinc-900 dark:text-white">
                Operational Runbooks &amp; Live Sandbox
              </h2>
              <p className="text-zinc-600 dark:text-zinc-400 text-xs sm:text-sm leading-relaxed">
                Step-by-step operational manuals for client onboarding, GST invoicing, PM2 SSH discovery, domain monitoring, SLA escalation, and an interactive live widget playground.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3 pt-6">
              <Link
                href="/resources"
                className="inline-flex items-center gap-2 px-4 py-2.5 text-xs sm:text-sm font-bold rounded-xl bg-indigo-600 text-white hover:bg-indigo-500 transition shadow-xs"
              >
                <Sparkles className="w-4 h-4" />
                <span>Open Runbooks &amp; Sandbox</span>
                <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}

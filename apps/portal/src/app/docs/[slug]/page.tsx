import fs from "node:fs";
import path from "node:path";
import React from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BookOpen, ArrowLeft, ArrowRight, Key, Code2 } from "lucide-react";
import { DocsHeader } from "../docs-header";
import { DocsMarkdownViewer } from "../docs-markdown-viewer";

interface DocsPageProps {
  params: Promise<{ slug: string }>;
}

const GUIDE_ORDER = [
  "embeds",
  "analytics-tracker",
  "gate-integration",
  "sdk-reference",
  "webhooks",
  "architecture-ddd",
] as const;

const AVAILABLE_SLUGS: Record<
  string,
  { title: string; category: string; summary: string }
> = {
  embeds: {
    title: "Embeddable Widgets, Web Components & Client Data API",
    category: "Embeds & UI",
    summary:
      "Use one permanent Universal API Key (rpk_live_...) across all 23 Web Components, Iframes, and GET /api/v1/client/data without minting tokens each time.",
  },
  "analytics-tracker": {
    title: "Cookieless Analytics Tracker & Visitor Intelligence",
    category: "Analytics",
    summary:
      "Drop-in < 2 KB script (t.js) capturing pageviews, session click-path journeys, repeat viewer loyalty, countries, referrers, and real Core Web Vitals.",
  },
  "gate-integration": {
    title: "Client Access Gate Integration",
    category: "Access Gate",
    summary:
      "Protect Next.js proxy.ts, middleware.ts, or Express applications with sub-10ms Ed25519 passes and 100% fail-open resilience.",
  },
  "sdk-reference": {
    title: "TypeScript SDK Reference (@rapidshift/sdk)",
    category: "SDK",
    summary:
      "Complete API reference for createGate, createExpressGate, RapidShiftClient, caching, and TypeScript interfaces.",
  },
  webhooks: {
    title: "Webhooks & Event Delivery",
    category: "Automation",
    summary:
      "Signed HTTP POST event delivery, HMAC-SHA256 verification, replay protection, and exponential backoff retry schedule.",
  },
  "architecture-ddd": {
    title: "Architecture & Domain-Driven Design",
    category: "Architecture",
    summary:
      "15 bounded contexts, strict clean layering rules, transactional outbox pattern, and SQLite WAL concurrency.",
  },
};

export async function generateStaticParams() {
  return Object.keys(AVAILABLE_SLUGS).map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: DocsPageProps) {
  const { slug } = await params;
  const guide = AVAILABLE_SLUGS[slug];
  if (!guide) return { title: "Not Found" };
  return {
    title: `${guide.title} | RapidShift Developer Docs`,
    description: guide.summary,
  };
}

export default async function GuideDetailPage({ params }: DocsPageProps) {
  const { slug } = await params;
  const guide = AVAILABLE_SLUGS[slug];
  if (!guide) notFound();

  const guidesDir = path.resolve(process.cwd(), "../../docs/guides");
  const fallbackDir = path.resolve(process.cwd(), "docs/guides");
  let filePath = path.join(guidesDir, `${slug}.md`);

  if (!fs.existsSync(filePath)) {
    filePath = path.join(fallbackDir, `${slug}.md`);
  }

  if (!fs.existsSync(filePath)) {
    notFound();
  }

  const rawMarkdown = await fs.promises.readFile(filePath, "utf-8");

  const currentIdx = GUIDE_ORDER.indexOf(slug as any);
  const prevSlug = currentIdx > 0 ? GUIDE_ORDER[currentIdx - 1] : null;
  const nextSlug =
    currentIdx >= 0 && currentIdx < GUIDE_ORDER.length - 1
      ? GUIDE_ORDER[currentIdx + 1]
      : null;

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100">
      <DocsHeader />

      <div className="max-w-7xl mx-auto py-8 sm:py-10 px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Left Sticky Sidebar Navigation (3 cols) */}
          <aside className="lg:col-span-3 lg:sticky lg:top-32 space-y-5">
            <Link
              href="/docs"
              className="inline-flex items-center gap-1.5 text-xs font-bold text-zinc-600 dark:text-zinc-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>All Developer Docs</span>
            </Link>

            <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4 space-y-3 shadow-xs">
              <div className="text-[11px] font-extrabold uppercase tracking-wider text-zinc-400 dark:text-zinc-500 px-2">
                Developer Guides
              </div>
              <nav className="space-y-1">
                {GUIDE_ORDER.map((s) => {
                  const meta = AVAILABLE_SLUGS[s]!;
                  const isActive = s === slug;
                  return (
                    <Link
                      key={s}
                      href={`/docs/${s}`}
                      className={`block px-3 py-2 text-xs rounded-xl transition-colors ${
                        isActive
                          ? "bg-blue-600 text-white font-bold shadow-xs"
                          : "text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 font-medium"
                      }`}
                    >
                      <div className="truncate">{meta.title}</div>
                      <div
                        className={`text-[10px] mt-0.5 ${
                          isActive
                            ? "text-blue-100"
                            : "text-zinc-400 dark:text-zinc-500"
                        }`}
                      >
                        {meta.category}
                      </div>
                    </Link>
                  );
                })}
              </nav>
            </div>

            {/* Quick Universal Key & API Box */}
            <div className="rounded-2xl border border-indigo-200 dark:border-indigo-900/60 bg-indigo-50/60 dark:bg-indigo-950/30 p-4 space-y-3 text-xs">
              <div className="flex items-center gap-2 text-indigo-700 dark:text-indigo-300 font-bold">
                <Key className="w-4 h-4" />
                <span>Need an API Key?</span>
              </div>
              <p className="text-zinc-600 dark:text-zinc-400 leading-relaxed">
                Generate one permanent Universal API Key (<code className="font-mono">rpk_live_...</code>) for all 23 embeds and REST APIs.
              </p>
              <div className="flex flex-col gap-1.5 pt-1">
                <Link
                  href="/portal/api-keys"
                  className="inline-flex items-center justify-between px-3 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold transition"
                >
                  <span>Generate Universal Key</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </Link>
                <Link
                  href="/docs/api"
                  className="inline-flex items-center justify-between px-3 py-2 rounded-xl border border-indigo-200 dark:border-indigo-800 bg-white dark:bg-zinc-900 text-indigo-700 dark:text-indigo-300 font-semibold hover:bg-indigo-50 dark:hover:bg-zinc-800 transition"
                >
                  <span>Open REST API Explorer</span>
                  <BookOpen className="w-3.5 h-3.5" />
                </Link>
              </div>
            </div>
          </aside>

          {/* Main Document Content + Right TOC (9 cols) */}
          <main className="lg:col-span-9 min-w-0 space-y-6">
            {/* Guide Banner Header */}
            <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-6 sm:p-8 shadow-xs space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="px-2.5 py-0.5 rounded-md text-xs font-bold bg-blue-50 text-blue-700 border border-blue-200 dark:bg-blue-950/60 dark:text-blue-300 dark:border-blue-800">
                  {guide.category}
                </span>
                <span className="text-xs text-zinc-400">&bull;</span>
                <span className="text-xs font-mono text-zinc-500 dark:text-zinc-400">
                  docs/guides/{slug}.md
                </span>
              </div>
              <h1 className="text-2xl sm:text-4xl font-black tracking-tight text-zinc-900 dark:text-white">
                {guide.title}
              </h1>
              <p className="text-sm sm:text-base text-zinc-600 dark:text-zinc-300 leading-relaxed max-w-3xl">
                {guide.summary}
              </p>
            </div>

            {/* Markdown Content + Sticky Right TOC */}
            <DocsMarkdownViewer markdown={rawMarkdown} />

            {/* Previous / Next Guide Pagination */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-4">
              {prevSlug ? (
                <Link
                  href={`/docs/${prevSlug}`}
                  className="group p-5 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 hover:border-blue-500/60 transition flex flex-col justify-between"
                >
                  <span className="text-xs font-semibold text-zinc-400 flex items-center gap-1">
                    <ArrowLeft className="w-3.5 h-3.5 group-hover:-translate-x-1 transition-transform" />
                    Previous Guide
                  </span>
                  <span className="text-sm font-bold text-zinc-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400 mt-1">
                    {AVAILABLE_SLUGS[prevSlug]?.title}
                  </span>
                </Link>
              ) : (
                <div />
              )}

              {nextSlug ? (
                <Link
                  href={`/docs/${nextSlug}`}
                  className="group p-5 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 hover:border-blue-500/60 transition flex flex-col justify-between text-right"
                >
                  <span className="text-xs font-semibold text-zinc-400 flex items-center justify-end gap-1">
                    Next Guide
                    <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
                  </span>
                  <span className="text-sm font-bold text-zinc-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400 mt-1">
                    {AVAILABLE_SLUGS[nextSlug]?.title}
                  </span>
                </Link>
              ) : null}
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}

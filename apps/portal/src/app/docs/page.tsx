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
} from "lucide-react";

export const metadata = {
  title: "Documentation Hub | RapidShift Control Panel",
  description: "Integration guides, SDK references, embeds, and architecture documentation for RapidShift.",
};

const GUIDES = [
  {
    slug: "gate-integration",
    title: "Client Access Gate Integration",
    description: "Protect client applications with dynamic entitlement checking and fail-open resilience in Next.js proxy.ts and middleware.",
    category: "Integration",
    icon: ShieldCheck,
    readingTime: "5 min read",
  },
  {
    slug: "analytics-tracker",
    title: "Cookieless Analytics & Offload",
    description: "Drop-in GDPR-compliant tracking script (< 2 KB), Core Web Vitals, custom events, and HMAC-signed webhook offloading.",
    category: "Analytics",
    icon: BarChart3,
    readingTime: "4 min read",
  },
  {
    slug: "embeds",
    title: "Embeddable Widgets & Web Components",
    description: "Catalog of 23 Shadow DOM Preact web components and iframe widgets with scoped embed tokens.",
    category: "Embeds",
    icon: Code2,
    readingTime: "6 min read",
  },
  {
    slug: "webhooks",
    title: "Webhooks & Realtime Event Delivery",
    description: "Event catalog, HMAC-SHA256 signature verification, retry policies, and delivery guarantees.",
    category: "Automation",
    icon: Webhook,
    readingTime: "4 min read",
  },
  {
    slug: "sdk-reference",
    title: "TypeScript SDK Reference (@rapidshift/sdk)",
    description: "Complete API reference for createGate, RapidShiftClient, Express middleware, and TypeScript types.",
    category: "SDK",
    icon: Terminal,
    readingTime: "5 min read",
  },
  {
    slug: "architecture-ddd",
    title: "Architecture & Domain-Driven Design",
    description: "15 bounded contexts, layer isolation, transactional outbox pattern, and SQLite WAL concurrency.",
    category: "Architecture",
    icon: Layers,
    readingTime: "7 min read",
  },
];

export default function DocsIndexPage() {
  return (
    <div className="w-full py-10 px-4 sm:px-6 lg:px-8 xl:px-10 space-y-12">
      {/* Header Banner */}
      <div className="space-y-4">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-medium bg-primary/10 text-primary border border-primary/20">
          <BookOpen className="w-3.5 h-3.5" />
          <span>RapidShift Knowledge Base</span>
        </div>
        <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight">Documentation Hub</h1>
        <p className="text-muted-foreground text-lg max-w-3xl leading-relaxed">
          Comprehensive integration guides, SDK references, embed catalogs, and deployment runbooks for
          building and operating client services on the RapidShift control panel.
        </p>
      </div>

      {/* Featured Cards Grid: Scalar Explorer & Master Operational Runbooks */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Scalar API Explorer */}
        <div className="relative overflow-hidden rounded-2xl border border-primary/20 bg-gradient-to-r from-primary/10 via-card to-card p-6 sm:p-8 flex flex-col justify-between">
          <div className="space-y-2">
            <span className="px-2 py-0.5 text-xs font-mono font-bold bg-primary text-primary-foreground rounded">
              OPENAPI 3.1
            </span>
            <h2 className="text-2xl font-bold tracking-tight">Interactive Scalar API Reference</h2>
            <p className="text-muted-foreground text-sm leading-relaxed">
              Explore 100% of public and administrative REST endpoints with live schemas, request builders,
              parameter descriptions, error codes, and code generators.
            </p>
          </div>
          <div className="flex items-center gap-3 pt-6">
            <Link
              href="/docs/api"
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors shadow-sm"
            >
              <span>Explore API Reference</span>
              <ArrowRight className="w-4 h-4" />
            </Link>
            <a
              href="/openapi.json"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg border border-border/80 hover:bg-muted transition-colors text-muted-foreground"
            >
              <span>Raw JSON</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </div>
        </div>

        {/* Master Resources & Runbooks */}
        <div className="relative overflow-hidden rounded-2xl border border-blue-500/30 bg-gradient-to-r from-blue-500/10 via-card to-card p-6 sm:p-8 flex flex-col justify-between">
          <div className="space-y-2">
            <span className="px-2 py-0.5 text-xs font-mono font-bold bg-blue-600 text-white rounded">
              16 RUNBOOKS & EMBEDS
            </span>
            <h2 className="text-2xl font-bold tracking-tight">Engineering Resources & Runbooks</h2>
            <p className="text-muted-foreground text-sm leading-relaxed">
              Complete step-by-step administrative runbooks (GST, billing cycles, PM2 SSH discovery, SLA support)
              and client manuals, plus an interactive live embed sandbox with zero-redirection in-place actions.
            </p>
          </div>
          <div className="flex items-center gap-3 pt-6">
            <Link
              href="/resources"
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-lg bg-blue-600 text-white hover:bg-blue-500 transition-colors shadow-sm"
            >
              <span>Open Resources Hub</span>
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </div>

      {/* Integration Guides Grid */}
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Integration Guides & Runbooks</h2>
          <p className="text-muted-foreground text-sm">
            Step-by-step guides for developers integrating client applications with RapidShift.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {GUIDES.map((guide) => {
            const Icon = guide.icon;
            return (
              <Link
                key={guide.slug}
                href={`/docs/${guide.slug}`}
                className="group relative flex flex-col justify-between p-6 rounded-xl border border-border/50 bg-card hover:border-primary/50 hover:shadow-md transition-all duration-200"
              >
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center text-primary group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                      <Icon className="w-5 h-5" />
                    </div>
                    <span className="text-[11px] font-medium text-muted-foreground px-2 py-0.5 rounded bg-muted">
                      {guide.category}
                    </span>
                  </div>
                  <h3 className="text-lg font-semibold tracking-tight group-hover:text-primary transition-colors">
                    {guide.title}
                  </h3>
                  <p className="text-muted-foreground text-xs leading-relaxed line-clamp-3">
                    {guide.description}
                  </p>
                </div>

                <div className="mt-6 pt-4 border-t border-border/40 flex items-center justify-between text-xs text-muted-foreground">
                  <span>{guide.readingTime}</span>
                  <span className="inline-flex items-center gap-1 font-medium text-primary group-hover:translate-x-1 transition-transform">
                    Read Guide
                    <ArrowRight className="w-3.5 h-3.5" />
                  </span>
                </div>
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}

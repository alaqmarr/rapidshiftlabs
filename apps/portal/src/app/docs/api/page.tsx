import React from "react";
import { openApiSpec } from "@rsl/core/openapi";
import { ScalarViewer } from "./scalar-viewer";
import { DocsHeader } from "../docs-header";

export const metadata = {
  title: "REST API Reference & Explorer | RapidShift Developer Docs",
  description:
    "Interactive OpenAPI 3.1 REST API reference for RapidShift Labs: Universal Client Data API, Access Gate, Embeds, Billing, Fleet Operations, Domain Monitoring, Support Desk, and Analytics.",
};

export default function ApiDocsPage() {
  return (
    <div className="min-h-screen bg-slate-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100">
      <DocsHeader />

      <main className="max-w-7xl mx-auto py-8 sm:py-10 px-4 sm:px-6 lg:px-8 space-y-6">
        {/* Header Card */}
        <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-6 sm:p-8 shadow-xs space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-md text-xs font-mono font-bold bg-blue-600 text-white">
              OpenAPI 3.1.0
            </span>
            <span className="text-xs font-semibold text-zinc-500 dark:text-zinc-400">
              Version 1.0.0 &bull; Base URL: <code className="font-mono text-zinc-800 dark:text-zinc-200">https://rsl.alaqmar.dev</code>
            </span>
          </div>
          <h1 className="text-2xl sm:text-4xl font-black tracking-tight text-zinc-900 dark:text-white">
            REST API Reference &amp; Endpoint Explorer
          </h1>
          <p className="text-zinc-600 dark:text-zinc-300 max-w-3xl text-xs sm:text-sm leading-relaxed">
            Explore every public, client, and administrative REST endpoint with request parameters, response schemas, error envelopes, and 1-click copyable <code className="font-mono">curl</code> examples authenticated via your Universal API Key (<code className="font-mono text-blue-600 dark:text-blue-400">rpk_live_...</code> or <code className="font-mono text-blue-600 dark:text-blue-400">rsk_live_...</code>).
          </p>
        </div>

        {/* Interactive Endpoint Explorer + Scalar Viewer */}
        <ScalarViewer spec={openApiSpec} specUrl="/openapi.json" />
      </main>
    </div>
  );
}

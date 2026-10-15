"use client";

import React, { useEffect, useState, useMemo } from "react";
import type { OpenApiSpec } from "@rsl/core/openapi";
import { Search, Copy, Check, ExternalLink, Terminal, Layers } from "lucide-react";
import { IosSpinner } from "@/components/ui/ios-spinner";
import { getSiteOrigin } from "@/lib/site-url";

interface ScalarViewerProps {
  spec: OpenApiSpec;
  specUrl?: string;
}

export function ScalarViewer({ spec, specUrl = "/openapi.json" }: ScalarViewerProps) {
  const [activeTab, setActiveTab] = useState<"explorer" | "scalar">("explorer");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedTag, setSelectedTag] = useState<string>("all");
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [scalarLoaded, setScalarLoaded] = useState(() => {
    if (typeof document !== "undefined") {
      return !!document.getElementById("scalar-script");
    }
    return false;
  });

  const siteOrigin = getSiteOrigin();

  useEffect(() => {
    if (activeTab !== "scalar") return;
    const existingScript = document.getElementById("scalar-script");
    if (!existingScript) {
      const script = document.createElement("script");
      script.id = "scalar-script";
      script.src = "https://cdn.jsdelivr.net/npm/@scalar/api-reference";
      script.async = true;
      script.onload = () => setScalarLoaded(true);
      script.onerror = () => setActiveTab("explorer");
      document.body.appendChild(script);
    } else {
      setScalarLoaded(true);
    }
  }, [activeTab]);

  const flattenedOperations = useMemo(() => {
    const list: Array<{
      path: string;
      method: "get" | "post" | "put" | "delete" | "patch";
      summary: string;
      description: string;
      operationId: string;
      tags: string[];
      parameters?: any[];
      requestBody?: any;
      responses: Record<string, any>;
    }> = [];

    // Put our Universal Client Data & Analytics Suite endpoints right at the top if not already in spec
    const customFeatured: typeof list = [
      {
        path: "/api/v1/client/data",
        method: "get",
        summary: "Get Unified Client & Embed Data (All-in-One Endpoint)",
        description:
          "Returns comprehensive client profile, realtime access gate status, billing summary, invoices, payments, contracts, mapped PM2 processes, monitored domains, support tickets, releases, and visitor analytics using a single Universal API Key.",
        operationId: "getUnifiedClientData",
        tags: ["Universal Client Data"],
        parameters: [
          {
            name: "include",
            in: "query",
            required: false,
            description:
              "Comma-separated sections to return (default: client,gate,billing,invoices,payments,contracts,fleet,domains,tickets,releases,analytics)",
          },
          {
            name: "days",
            in: "query",
            required: false,
            description: "Analytics window in days (default: 30, max: 365)",
          },
          {
            name: "apiKey",
            in: "query",
            required: false,
            description:
              "Optional Universal API Key (rpk_live_... or rsk_live_...) if not passed in x-api-key or Authorization header",
          },
        ],
        responses: {
          "200": {
            description: "Unified client data payload",
            content: {
              "application/json": {
                example: {
                  data: {
                    clientId: "cli_01M4ZQK3D3EY8WYGS20H5M0D9S",
                    generatedAt: "2026-10-15T18:00:00.000Z",
                    client: { id: "cli_01M4ZQK3D3EY8WYGS20H5M0D9S", name: "Acme Corp", status: "active" },
                    gate: { status: "allowed", allowed: true },
                    billingSummary: { outstandingMinor: 0, totalBilledMinor: 1500000, totalPaidMinor: 1500000 },
                    invoices: [],
                    fleetProcesses: [],
                    monitoredDomains: [],
                    supportTickets: [],
                    analytics: { pageviews: 1240, visitors: 410, repeatVisitors: 148, repeatRate: 36.1 },
                  },
                },
              },
            },
          },
        },
      },
      {
        path: "/api/v1/analytics/suite",
        method: "get",
        summary: "Get Deep Visitor Intelligence & Analytics Suite",
        description:
          "Returns time-series traffic, repeat viewer loyalty, session click-path journeys, countries, referrers, UTM campaigns, and Core Web Vitals.",
        operationId: "getDeepAnalyticsSuite",
        tags: ["Analytics"],
        parameters: [
          {
            name: "range",
            in: "query",
            required: false,
            description: "Time window: 1h, 24h, 7d, 30d, or 90d (default: 30d)",
          },
        ],
        responses: {
          "200": {
            description: "Deep analytics suite telemetry",
            content: {
              "application/json": {
                example: {
                  data: {
                    summary: {
                      pageviews: 1480,
                      visitors: 520,
                      repeatVisitors: 184,
                      repeatRate: 35.4,
                      bounceRate: 28.2,
                      activeVisitorsNow: 4,
                    },
                    visitorSessions: [],
                    topPaths: [],
                    countries: [],
                    webVitals: [],
                  },
                },
              },
            },
          },
        },
      },
    ];

    list.push(...customFeatured);

    for (const [pathKey, pathItem] of Object.entries(spec.paths)) {
      const methods = ["get", "post", "put", "delete", "patch"] as const;
      for (const method of methods) {
        const op = pathItem[method];
        if (op) {
          list.push({
            path: pathKey,
            method,
            summary: op.summary,
            description: op.description,
            operationId: op.operationId,
            tags: op.tags || ["General"],
            parameters: op.parameters,
            requestBody: op.requestBody,
            responses: op.responses,
          });
        }
      }
    }
    return list;
  }, [spec]);

  const allTags = useMemo(() => {
    const set = new Set<string>(["Universal Client Data"]);
    for (const t of spec.tags) set.add(t.name);
    return Array.from(set);
  }, [spec]);

  const filteredOperations = useMemo(() => {
    return flattenedOperations.filter((op) => {
      const matchesSearch =
        searchQuery === "" ||
        op.path.toLowerCase().includes(searchQuery.toLowerCase()) ||
        op.summary.toLowerCase().includes(searchQuery.toLowerCase()) ||
        op.description.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesTag = selectedTag === "all" || op.tags.includes(selectedTag);
      return matchesSearch && matchesTag;
    });
  }, [flattenedOperations, searchQuery, selectedTag]);

  const methodBadgeClass = (method: string) => {
    switch (method.toUpperCase()) {
      case "GET":
        return "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/60 dark:text-blue-300 dark:border-blue-800";
      case "POST":
        return "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800";
      case "PUT":
      case "PATCH":
        return "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-800";
      case "DELETE":
        return "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/60 dark:text-rose-300 dark:border-rose-800";
      default:
        return "bg-zinc-100 text-zinc-700 border-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:border-zinc-700";
    }
  };

  const copyText = (text: string, id: string) => {
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard.writeText(text);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    }
  };

  return (
    <div className="space-y-6">
      {/* View Switcher & Action Bar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-4 shadow-xs">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setActiveTab("explorer")}
            className={`inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold rounded-xl transition cursor-pointer ${
              activeTab === "explorer"
                ? "bg-blue-600 text-white shadow-xs"
                : "bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-700"
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>Clean Endpoint Explorer ({flattenedOperations.length})</span>
          </button>
          <button
            onClick={() => setActiveTab("scalar")}
            className={`inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold rounded-xl transition cursor-pointer ${
              activeTab === "scalar"
                ? "bg-blue-600 text-white shadow-xs"
                : "bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-700"
            }`}
          >
            <Terminal className="w-3.5 h-3.5" />
            <span>Scalar Fullscreen Sandbox</span>
          </button>
        </div>

        <div className="flex items-center gap-3 text-xs">
          <a
            href={specUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 text-zinc-700 dark:text-zinc-300 hover:text-blue-600 dark:hover:text-blue-400 transition border border-zinc-200 dark:border-zinc-700 rounded-xl px-3 py-1.5 font-semibold"
          >
            <span>Raw OpenAPI 3.1 JSON</span>
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        </div>
      </div>

      {/* Built-in Clean Endpoint Explorer */}
      {activeTab === "explorer" && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left Tag Filter Sidebar (3 cols) */}
          <aside className="lg:col-span-3 lg:sticky lg:top-32 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-4 space-y-2 shadow-xs">
            <div className="text-[11px] font-extrabold uppercase tracking-wider text-zinc-400 dark:text-zinc-500 px-2 pb-1">
              API Categories ({allTags.length})
            </div>
            <div className="space-y-1 max-h-[65vh] overflow-y-auto pr-1">
              <button
                onClick={() => setSelectedTag("all")}
                className={`w-full text-left px-3 py-2 rounded-xl text-xs font-semibold transition cursor-pointer ${
                  selectedTag === "all"
                    ? "bg-blue-600 text-white"
                    : "text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                }`}
              >
                All Endpoints ({flattenedOperations.length})
              </button>
              {allTags.map((tag) => (
                <button
                  key={tag}
                  onClick={() => setSelectedTag(tag)}
                  className={`w-full text-left px-3 py-2 rounded-xl text-xs font-medium transition cursor-pointer truncate ${
                    selectedTag === tag
                      ? "bg-blue-600 text-white font-bold"
                      : "text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                  }`}
                >
                  {tag}
                </button>
              ))}
            </div>
          </aside>

          {/* Right Endpoints List (9 cols) */}
          <div className="lg:col-span-9 space-y-4">
            {/* Search Bar */}
            <div className="relative">
              <Search className="w-4 h-4 text-zinc-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search endpoints by path (e.g. /api/v1/client/data), summary, or keyword..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl pl-10 pr-4 py-3 text-xs sm:text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-xs"
              />
            </div>

            {/* Operations Accordion List */}
            <div className="space-y-3">
              {filteredOperations.map((op, idx) => {
                const opKey = `${op.method}-${op.path}-${idx}`;
                const curlSnippet = `curl -X ${op.method.toUpperCase()} "${siteOrigin}${op.path}" \\\n  -H "x-api-key: rpk_live_YOUR_UNIVERSAL_API_KEY"`;
                return (
                  <details
                    key={opKey}
                    open={idx < 2}
                    className="group border border-zinc-200 dark:border-zinc-800 rounded-2xl bg-white dark:bg-zinc-900 overflow-hidden shadow-xs"
                  >
                    <summary className="cursor-pointer p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 select-none hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition">
                      <div className="flex items-center gap-3 min-w-0">
                        <span
                          className={`font-mono text-xs font-extrabold uppercase px-2.5 py-1 rounded-lg border shrink-0 ${methodBadgeClass(
                            op.method
                          )}`}
                        >
                          {op.method}
                        </span>
                        <span className="font-mono text-xs sm:text-sm font-bold text-zinc-900 dark:text-white truncate">
                          {op.path}
                        </span>
                      </div>
                      <div className="flex items-center gap-2.5 text-xs text-zinc-600 dark:text-zinc-400 shrink-0">
                        <span className="font-medium">{op.summary}</span>
                        <span className="rounded-md bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 px-2 py-0.5 text-[11px] font-semibold">
                          {op.tags[0]}
                        </span>
                      </div>
                    </summary>

                    <div className="p-5 border-t border-zinc-200 dark:border-zinc-800 bg-slate-50/60 dark:bg-zinc-950/50 space-y-5 text-xs">
                      <p className="text-zinc-700 dark:text-zinc-300 text-xs sm:text-sm leading-relaxed">
                        {op.description}
                      </p>

                      {/* Copyable cURL Example */}
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-zinc-900 dark:text-zinc-100">
                            Example Request (cURL)
                          </span>
                          <button
                            type="button"
                            onClick={() => copyText(curlSnippet, `curl-${opKey}`)}
                            className="inline-flex items-center gap-1 text-blue-600 dark:text-blue-400 font-semibold hover:underline cursor-pointer"
                          >
                            {copiedId === `curl-${opKey}` ? (
                              <>
                                <Check className="w-3.5 h-3.5 text-emerald-500" />
                                <span className="text-emerald-500">Copied!</span>
                              </>
                            ) : (
                              <>
                                <Copy className="w-3.5 h-3.5" />
                                <span>Copy cURL</span>
                              </>
                            )}
                          </button>
                        </div>
                        <pre className="p-3.5 rounded-xl bg-zinc-950 text-zinc-100 font-mono text-xs overflow-x-auto border border-zinc-800">
                          <code>{curlSnippet}</code>
                        </pre>
                      </div>

                      {op.parameters && op.parameters.length > 0 && (
                        <div>
                          <h4 className="font-bold text-zinc-900 dark:text-zinc-100 mb-2">
                            Parameters
                          </h4>
                          <div className="border border-zinc-200 dark:border-zinc-800 rounded-xl overflow-hidden bg-white dark:bg-zinc-900">
                            <table className="w-full text-left">
                              <thead className="bg-zinc-50 dark:bg-zinc-800/80 font-mono text-[11px] text-zinc-600 dark:text-zinc-300 border-b border-zinc-200 dark:border-zinc-800">
                                <tr>
                                  <th className="p-2.5">Name</th>
                                  <th className="p-2.5">In</th>
                                  <th className="p-2.5">Required</th>
                                  <th className="p-2.5">Description</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                                {op.parameters.map((p) => (
                                  <tr key={p.name} className="font-mono">
                                    <td className="p-2.5 text-zinc-900 dark:text-white font-bold">
                                      {p.name}
                                    </td>
                                    <td className="p-2.5 text-zinc-500">{p.in}</td>
                                    <td className="p-2.5">
                                      {p.required ? (
                                        <span className="text-rose-600 dark:text-rose-400 font-bold">
                                          Yes
                                        </span>
                                      ) : (
                                        <span className="text-zinc-400">Optional</span>
                                      )}
                                    </td>
                                    <td className="p-2.5 text-zinc-700 dark:text-zinc-300 font-sans">
                                      {p.description || "—"}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}

                      {op.requestBody && (
                        <div>
                          <h4 className="font-bold text-zinc-900 dark:text-zinc-100 mb-1.5">
                            Request Body Schema / Example
                          </h4>
                          <pre className="p-3.5 bg-zinc-950 text-zinc-100 rounded-xl border border-zinc-800 font-mono overflow-x-auto text-[11px]">
                            {JSON.stringify(
                              op.requestBody.content?.["application/json"]?.example ||
                                op.requestBody.content?.["application/json"]?.schema,
                              null,
                              2
                            )}
                          </pre>
                        </div>
                      )}

                      <div>
                        <h4 className="font-bold text-zinc-900 dark:text-zinc-100 mb-2">
                          Responses
                        </h4>
                        <div className="space-y-2">
                          {Object.entries(op.responses).map(([statusCode, resp]: [string, any]) => (
                            <div
                              key={statusCode}
                              className="p-3 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 space-y-2"
                            >
                              <div className="flex items-center gap-2">
                                <span
                                  className={`font-mono font-bold px-2 py-0.5 rounded text-xs ${
                                    statusCode.startsWith("2")
                                      ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300"
                                      : "bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300"
                                  }`}
                                >
                                  HTTP {statusCode}
                                </span>
                                <span className="text-zinc-700 dark:text-zinc-300 font-medium">
                                  {resp.description}
                                </span>
                              </div>
                              {resp.content?.["application/json"]?.example && (
                                <pre className="p-3 bg-zinc-950 text-zinc-100 rounded-lg font-mono overflow-x-auto text-[11px] border border-zinc-800">
                                  {JSON.stringify(
                                    resp.content["application/json"].example,
                                    null,
                                    2
                                  )}
                                </pre>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </details>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Scalar Container */}
      {activeTab === "scalar" && (
        <div className="relative min-h-[700px] rounded-2xl border border-zinc-200 dark:border-zinc-800 overflow-hidden bg-white dark:bg-zinc-900">
          <div
            id="api-reference"
            data-url={specUrl}
            data-configuration={JSON.stringify({
              theme: "saturn",
              darkMode: true,
              layout: "modern",
              showSidebar: true,
              searchHotKey: "k",
            })}
          />
          {!scalarLoaded && (
            <div className="p-12 flex flex-col items-center justify-center gap-3 text-center text-sm text-zinc-500">
              <IosSpinner size="lg" className="text-zinc-600 dark:text-zinc-300" />
              <span>Loading Scalar Interactive API Reference runtime...</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

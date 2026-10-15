"use client";

import React, { useEffect, useState, useMemo } from "react";
import type { OpenApiSpec } from "@rsl/core/openapi";
import { IosSpinner } from "@/components/ui/ios-spinner";

interface ScalarViewerProps {
  spec: OpenApiSpec;
  specUrl?: string;
}

export function ScalarViewer({ spec, specUrl = "/openapi.json" }: ScalarViewerProps) {
  const [activeTab, setActiveTab] = useState<"scalar" | "explorer">("scalar");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedTag, setSelectedTag] = useState<string>("all");
  const [scalarLoaded, setScalarLoaded] = useState(() => {
    if (typeof document !== "undefined") {
      return !!document.getElementById("scalar-script");
    }
    return false;
  });

  useEffect(() => {
    // Dynamically inject Scalar standalone script if not already present
    const existingScript = document.getElementById("scalar-script");
    if (!existingScript) {
      const script = document.createElement("script");
      script.id = "scalar-script";
      script.src = "https://cdn.jsdelivr.net/npm/@scalar/api-reference";
      script.async = true;
      script.onload = () => setScalarLoaded(true);
      script.onerror = () => {
        // Fallback to built-in explorer if CDN is blocked/offline
        setActiveTab("explorer");
      };
      document.body.appendChild(script);
    }
  }, []);

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

  const methodColor = (method: string) => {
    switch (method.toUpperCase()) {
      case "GET":
        return "bg-blue-500/10 text-blue-400 border-blue-500/20";
      case "POST":
        return "bg-emerald-500/10 text-emerald-400 border-emerald-500/20";
      case "PUT":
        return "bg-amber-500/10 text-amber-400 border-amber-500/20";
      case "DELETE":
        return "bg-rose-500/10 text-rose-400 border-rose-500/20";
      default:
        return "bg-zinc-500/10 text-zinc-400 border-zinc-500/20";
    }
  };

  return (
    <div className="space-y-6">
      {/* View Switcher & Action Bar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-border/40 pb-4">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setActiveTab("scalar")}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
              activeTab === "scalar"
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:text-foreground"
            }`}
          >
            Scalar Interactive View
          </button>
          <button
            onClick={() => setActiveTab("explorer")}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
              activeTab === "explorer"
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:text-foreground"
            }`}
          >
            Endpoint Catalog ({flattenedOperations.length})
          </button>
        </div>

        <div className="flex items-center gap-3 text-xs">
          <a
            href={specUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 text-muted-foreground hover:text-foreground transition-colors border border-border/60 rounded px-2.5 py-1"
          >
            <span>Raw OpenAPI 3.1 JSON</span>
            <span className="font-mono text-[10px] text-primary">/openapi.json</span>
          </a>
        </div>
      </div>

      {/* Scalar Container */}
      {activeTab === "scalar" && (
        <div className="relative min-h-[700px] rounded-lg border border-border/40 overflow-hidden bg-card/20">
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

      {/* Built-in Endpoint Explorer */}
      {activeTab === "explorer" && (
        <div className="space-y-6">
          <div className="flex flex-col md:flex-row gap-3">
            <input
              type="text"
              placeholder="Filter by path, summary, or description..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="flex-1 bg-background border border-border/60 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
            />
            <select
              value={selectedTag}
              onChange={(e) => setSelectedTag(e.target.value)}
              className="bg-background border border-border/60 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
            >
              <option value="all">All Tags ({spec.tags.length})</option>
              {spec.tags.map((tag) => (
                <option key={tag.name} value={tag.name}>
                  {tag.name}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-3">
            {filteredOperations.map((op) => (
              <details
                key={`${op.method}-${op.path}`}
                className="group border border-border/40 rounded-lg bg-card/30 overflow-hidden transition-all"
              >
                <summary className="cursor-pointer p-4 flex flex-col md:flex-row md:items-center justify-between gap-3 select-none hover:bg-muted/30">
                  <div className="flex items-center gap-3">
                    <span
                      className={`font-mono text-xs font-bold uppercase px-2 py-0.5 rounded border ${methodColor(
                        op.method
                      )}`}
                    >
                      {op.method}
                    </span>
                    <span className="font-mono text-sm font-semibold">{op.path}</span>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    <span>{op.summary}</span>
                    <span className="rounded bg-muted px-2 py-0.5 text-[11px]">{op.tags[0]}</span>
                  </div>
                </summary>

                <div className="p-4 border-t border-border/30 bg-background/50 space-y-4 text-xs">
                  <p className="text-muted-foreground text-sm">{op.description}</p>

                  {op.parameters && op.parameters.length > 0 && (
                    <div>
                      <h4 className="font-semibold text-foreground mb-2">Parameters</h4>
                      <div className="border border-border/30 rounded overflow-hidden">
                        <table className="w-full text-left">
                          <thead className="bg-muted/40 font-mono text-[11px] text-muted-foreground">
                            <tr>
                              <th className="p-2">Name</th>
                              <th className="p-2">In</th>
                              <th className="p-2">Required</th>
                              <th className="p-2">Description</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-border/20">
                            {op.parameters.map((p) => (
                              <tr key={p.name} className="font-mono">
                                <td className="p-2 text-foreground font-semibold">{p.name}</td>
                                <td className="p-2 text-muted-foreground">{p.in}</td>
                                <td className="p-2">{p.required ? "Yes" : "No"}</td>
                                <td className="p-2 text-muted-foreground font-sans">{p.description || "—"}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {op.requestBody && (
                    <div>
                      <h4 className="font-semibold text-foreground mb-1">Request Body Example</h4>
                      <pre className="p-3 bg-muted/40 rounded border border-border/30 font-mono overflow-x-auto text-[11px]">
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
                    <h4 className="font-semibold text-foreground mb-1">Responses</h4>
                    <div className="space-y-2">
                      {Object.entries(op.responses).map(([code, resp]: [string, any]) => (
                        <div key={code} className="border border-border/30 rounded p-3 bg-muted/20">
                          <div className="flex items-center gap-2 mb-1">
                            <span
                              className={`font-mono font-bold px-1.5 py-0.5 rounded text-[11px] ${
                                code.startsWith("2")
                                  ? "bg-emerald-500/20 text-emerald-400"
                                  : code.startsWith("4")
                                  ? "bg-amber-500/20 text-amber-400"
                                  : "bg-rose-500/20 text-rose-400"
                              }`}
                            >
                              {code}
                            </span>
                            <span className="text-muted-foreground">{resp.description}</span>
                          </div>
                          {resp.content?.["application/json"]?.example && (
                            <pre className="mt-2 p-2 bg-background/80 rounded border border-border/20 font-mono text-[11px] overflow-x-auto">
                              {JSON.stringify(resp.content["application/json"].example, null, 2)}
                            </pre>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </details>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

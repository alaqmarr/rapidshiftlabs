import React from "react";
import Link from "next/link";
import { openApiSpec } from "@rsl/core/openapi";
import { ScalarViewer } from "./scalar-viewer";

export const metadata = {
  title: "API Reference | RapidShift Documentation",
  description: "Interactive OpenAPI 3.1 REST API reference for RapidShift control panel.",
};

export default function ApiDocsPage() {
  return (
    <div className="w-full py-8 px-4 sm:px-6 lg:px-8 xl:px-10 space-y-8">
      {/* Breadcrumb Navigation */}
      <nav className="flex items-center gap-2 text-xs text-muted-foreground">
        <Link href="/docs" className="hover:text-foreground transition-colors">
          Documentation Hub
        </Link>
        <span>/</span>
        <span className="text-foreground font-medium">API Reference</span>
      </nav>

      {/* Header */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <span className="px-2.5 py-0.5 rounded text-xs font-mono font-semibold bg-primary/10 text-primary border border-primary/20">
            OpenAPI 3.1.0
          </span>
          <span className="text-xs text-muted-foreground">Version 1.0.0</span>
        </div>
        <h1 className="text-3xl sm:text-4xl font-bold tracking-tight">API Reference & Explorer</h1>
        <p className="text-muted-foreground max-w-3xl text-sm sm:text-base">
          Interactive reference for all RapidShift public and administrative REST endpoints: Access Gate,
          Billing, Fleet Operations, Domain Monitoring, Support Desk, Analytics, and Credential Vault.
        </p>
      </div>

      {/* Interactive Scalar Reference Component */}
      <ScalarViewer spec={openApiSpec} specUrl="/openapi.json" />
    </div>
  );
}

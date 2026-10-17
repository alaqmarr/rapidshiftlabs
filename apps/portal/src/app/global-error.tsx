"use client";

import React from "react";
import { AlertOctagon, RefreshCw, Home, Activity } from "lucide-react";
import { SystemStateShell } from "@/components/system/system-state-shell";
import "./globals.css";

export default function GlobalRootErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en" className="dark">
      <body className="bg-zinc-950 text-zinc-100 antialiased">
        <SystemStateShell
          httpCode="500"
          badgeLabel="Critical Root Boundary"
          tone="rose"
          title="Control Plane Root Layout Exception"
          subtitle="A critical exception was caught by the root application boundary. Client Access Gate SDKs continue operating in fail-open mode with zero tenant downtime."
          icon={AlertOctagon}
          traceId={error?.digest ? `ROOT-${error.digest}` : "ROOT-500"}
          technicalDetail={error?.message || "Unhandled root layout exception"}
          actions={[
            {
              label: "Attempt Recovery",
              onClick: () => reset(),
              variant: "primary",
              icon: RefreshCw,
            },
            {
              label: "Reload Application",
              onClick: () => window.location.replace("/"),
              variant: "secondary",
              icon: Home,
            },
            {
              label: "Live Platform Status",
              href: "/status/system",
              variant: "ghost",
              icon: Activity,
            },
          ]}
        />
      </body>
    </html>
  );
}

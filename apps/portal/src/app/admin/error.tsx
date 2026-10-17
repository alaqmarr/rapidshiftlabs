"use client";

import React from "react";
import { AlertTriangle, RefreshCw, LayoutDashboard, LifeBuoy, Server } from "lucide-react";
import { SystemStateShell } from "@/components/system/system-state-shell";

export default function AdminErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <SystemStateShell
      httpCode="500"
      badgeLabel="Admin Workspace Fault"
      tone="rose"
      compact
      showHeader={false}
      title="Admin Suite Encountered an Exception"
      subtitle="An unexpected error occurred while loading or mutating data in this Admin Control Plane module."
      icon={AlertTriangle}
      traceId={error?.digest ? `ADM-${error.digest}` : undefined}
      technicalDetail={error?.message || "Unhandled exception in Admin route segment"}
      actions={[
        {
          label: "Retry Module",
          onClick: () => reset(),
          variant: "primary",
          icon: RefreshCw,
        },
        {
          label: "Admin Dashboard",
          href: "/admin",
          variant: "secondary",
          icon: LayoutDashboard,
        },
        {
          label: "Fleet Operations",
          href: "/admin/servers",
          variant: "ghost",
          icon: Server,
        },
        {
          label: "Support SLA Desk",
          href: "/admin/support",
          variant: "ghost",
          icon: LifeBuoy,
        },
      ]}
    />
  );
}

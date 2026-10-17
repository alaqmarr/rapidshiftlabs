"use client";

import React from "react";
import { AlertTriangle, RefreshCw, LayoutDashboard, LifeBuoy, Activity } from "lucide-react";
import { SystemStateShell } from "@/components/system/system-state-shell";

export default function PortalErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <SystemStateShell
      httpCode="500"
      badgeLabel="Client Portal Exception"
      tone="rose"
      compact
      showHeader={false}
      title="We hit an unexpected issue loading this view"
      subtitle="Your production services and Access Gate remain unaffected. Click Retry below or raise a priority ticket with our 24×7 SLA engineering desk."
      icon={AlertTriangle}
      traceId={error?.digest ? `PRT-${error.digest}` : undefined}
      technicalDetail={error?.message || "Unhandled exception in Client Portal route segment"}
      actions={[
        {
          label: "Retry View",
          onClick: () => reset(),
          variant: "primary",
          icon: RefreshCw,
        },
        {
          label: "Portal Overview",
          href: "/portal",
          variant: "secondary",
          icon: LayoutDashboard,
        },
        {
          label: "Open Support Ticket",
          href: "/portal/support",
          variant: "ghost",
          icon: LifeBuoy,
        },
        {
          label: "Live Status",
          href: "/status/system",
          variant: "ghost",
          icon: Activity,
        },
      ]}
    />
  );
}

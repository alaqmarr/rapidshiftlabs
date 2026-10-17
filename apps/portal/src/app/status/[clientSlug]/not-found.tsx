"use client";

import React from "react";
import { usePathname } from "next/navigation";
import { Globe, Activity, Home, Shield } from "lucide-react";
import { SystemStateShell } from "@/components/system/system-state-shell";

export default function StatusSlugNotFoundPage() {
  const pathname = usePathname() || "/status";
  const slugSegment = pathname.replace(/^\/status\/?/, "") || "unknown";

  return (
    <SystemStateShell
      httpCode="404"
      badgeLabel="Status Page Identifier Not Found"
      tone="blue"
      title="No Public Status Page Found for This Organization"
      subtitle={`We couldn't find an active client organization or status page matching "${slugSegment}". Verify the client slug or view the Global RapidShift Infrastructure Status page below.`}
      icon={Globe}
      metrics={[
        { label: "Requested Slug / ID", value: slugSegment, status: "warn" },
        { label: "Global Platform", value: "100% Operational", status: "ok" },
        { label: "Monitoring Daemons", value: "Active (HTTP/SSL/DNS)", status: "ok" },
        { label: "Resolution", value: "404 Unmatched", status: "err" },
      ]}
      actions={[
        {
          label: "View Global System Status (/status/system)",
          href: "/status/system",
          variant: "primary",
          icon: Activity,
        },
        {
          label: "Admin Domains & SSL",
          href: "/admin/domains",
          variant: "secondary",
          icon: Shield,
        },
        {
          label: "Client Portal Domains",
          href: "/portal/domains",
          variant: "ghost",
          icon: Home,
        },
      ]}
    />
  );
}

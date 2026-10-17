"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { Compass, LayoutDashboard, Receipt, Server, LifeBuoy, ArrowLeft } from "lucide-react";
import { SystemStateShell } from "@/components/system/system-state-shell";

export default function PortalNotFoundPage() {
  const router = useRouter();

  return (
    <SystemStateShell
      httpCode="404"
      badgeLabel="Portal Page Not Found"
      tone="blue"
      compact
      showHeader={false}
      title="Client Portal Resource Not Found"
      subtitle="The requested invoice, contract, process, or portal view could not be found in your organization's workspace."
      icon={Compass}
      metrics={[
        { label: "Realm", value: "Client Service Layer", status: "ok" },
        { label: "Quick Search", value: "Press ⌘K / Ctrl+K", status: "neutral" },
        { label: "Tenant Isolation", value: "Verified", status: "ok" },
        { label: "Status", value: "404 Not Found", status: "warn" },
      ]}
      actions={[
        {
          label: "Portal Overview",
          href: "/portal",
          variant: "primary",
          icon: LayoutDashboard,
        },
        {
          label: "Billing & Invoices",
          href: "/portal/billing",
          variant: "secondary",
          icon: Receipt,
        },
        {
          label: "Fleet & PM2",
          href: "/portal/infrastructure",
          variant: "ghost",
          icon: Server,
        },
        {
          label: "Support Desk",
          href: "/portal/support",
          variant: "ghost",
          icon: LifeBuoy,
        },
        {
          label: "Go Back",
          onClick: () => router.back(),
          variant: "ghost",
          icon: ArrowLeft,
        },
      ]}
    />
  );
}

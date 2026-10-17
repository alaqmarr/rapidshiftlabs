"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { Compass, LayoutDashboard, ArrowLeft, Users, Server, Globe } from "lucide-react";
import { SystemStateShell } from "@/components/system/system-state-shell";

export default function AdminNotFoundPage() {
  const router = useRouter();

  return (
    <SystemStateShell
      httpCode="404"
      badgeLabel="Admin Resource Not Found"
      tone="blue"
      compact
      showHeader={false}
      title="Admin Control Plane Resource Not Found"
      subtitle="The requested client organization, contract, invoice, server node, or administrative view does not exist or may have been removed."
      icon={Compass}
      metrics={[
        { label: "Realm", value: "Admin Console", status: "ok" },
        { label: "Command Palette", value: "Press ⌘K / Ctrl+K", status: "neutral" },
        { label: "Database Tier", value: "SQLite WAL Active", status: "ok" },
        { label: "Lookup Status", value: "404 Unmatched", status: "warn" },
      ]}
      actions={[
        {
          label: "Admin Command Center",
          href: "/admin",
          variant: "primary",
          icon: LayoutDashboard,
        },
        {
          label: "Clients Directory",
          href: "/admin/clients",
          variant: "secondary",
          icon: Users,
        },
        {
          label: "Fleet & PM2",
          href: "/admin/servers",
          variant: "ghost",
          icon: Server,
        },
        {
          label: "Domains & SSL",
          href: "/admin/domains",
          variant: "ghost",
          icon: Globe,
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

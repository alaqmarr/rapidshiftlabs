"use client";

import React from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  Compass,
  Home,
  ArrowLeft,
  Activity,
  Users,
  Receipt,
  Server,
  Globe,
  LifeBuoy,
  BookOpen,
} from "lucide-react";
import { SystemStateShell } from "@/components/system/system-state-shell";

export default function GlobalNotFoundPage() {
  const pathname = usePathname() || "/";
  const router = useRouter();

  const isAdmin = pathname.startsWith("/admin");
  const isPortal = pathname.startsWith("/portal");
  const isStatus = pathname.startsWith("/status");
  const isDocs = pathname.startsWith("/docs");

  const contextHint = isStatus
    ? "The requested organization slug or client ID does not match an active public status page."
    : isAdmin
      ? "The requested Admin Control Plane resource or identifier could not be located."
      : isPortal
        ? "The requested Client Portal page or resource does not exist in your tenant workspace."
        : isDocs
          ? "The documentation guide or API endpoint reference you requested has moved or does not exist."
          : "The route, resource identifier, or endpoint you requested could not be found on the RapidShift Control Plane.";

  return (
    <SystemStateShell
      httpCode="404"
      badgeLabel="Resource Not Found"
      tone="blue"
      title="We couldn't find that page or resource"
      subtitle={contextHint}
      icon={Compass}
      metrics={[
        { label: "Control Plane", value: "Online (WAL)", status: "ok" },
        { label: "Access Gate", value: "Operational", status: "ok" },
        {
          label: "Detected Realm",
          value: isAdmin ? "Admin Console" : isPortal ? "Client Portal" : isStatus ? "Public Status" : "Public",
          status: "neutral",
        },
        { label: "Resolution", value: "Route Unmatched", status: "warn" },
      ]}
      actions={[
        {
          label: isAdmin ? "Admin Command Center" : isPortal ? "Client Portal Overview" : "Return to Dashboard",
          href: isAdmin ? "/admin" : isPortal ? "/portal" : "/admin",
          variant: "primary",
          icon: Home,
        },
        {
          label: "Go Back",
          onClick: () => router.back(),
          variant: "secondary",
          icon: ArrowLeft,
        },
        {
          label: "System Status Page",
          href: "/status/system",
          variant: "ghost",
          icon: Activity,
        },
      ]}
    >
      {/* Contextual Suggested Destinations */}
      <div className="p-4 rounded-2xl bg-zinc-50/90 dark:bg-zinc-950/60 border border-zinc-200/80 dark:border-zinc-800/80 space-y-3">
        <div className="text-[11px] font-mono uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
          Recommended Destinations
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-xs">
          <a
            href={isPortal ? "/portal/billing" : "/admin/clients"}
            className="p-2.5 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800 hover:border-blue-500/40 transition flex items-center gap-2.5"
          >
            {isPortal ? (
              <Receipt className="w-4 h-4 text-blue-500 shrink-0" />
            ) : (
              <Users className="w-4 h-4 text-blue-500 shrink-0" />
            )}
            <div className="min-w-0">
              <div className="font-semibold text-zinc-900 dark:text-zinc-100 truncate">
                {isPortal ? "Billing & Invoices" : "Clients Directory"}
              </div>
              <div className="text-[10px] text-zinc-400 truncate">
                {isPortal ? "Invoices & Contract Tenure" : "Manage Tenants & Contracts"}
              </div>
            </div>
          </a>

          <a
            href={isPortal ? "/portal/infrastructure" : "/admin/servers"}
            className="p-2.5 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800 hover:border-blue-500/40 transition flex items-center gap-2.5"
          >
            <Server className="w-4 h-4 text-emerald-500 shrink-0" />
            <div className="min-w-0">
              <div className="font-semibold text-zinc-900 dark:text-zinc-100 truncate">
                Fleet &amp; PM2 Suite
              </div>
              <div className="text-[10px] text-zinc-400 truncate">
                Live Processes &amp; Logs
              </div>
            </div>
          </a>

          <a
            href={isPortal ? "/portal/domains" : "/admin/domains"}
            className="p-2.5 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800 hover:border-blue-500/40 transition flex items-center gap-2.5"
          >
            <Globe className="w-4 h-4 text-indigo-500 shrink-0" />
            <div className="min-w-0">
              <div className="font-semibold text-zinc-900 dark:text-zinc-100 truncate">
                Domains &amp; SSL Health
              </div>
              <div className="text-[10px] text-zinc-400 truncate">
                Uptime &amp; TLS Expiry
              </div>
            </div>
          </a>
        </div>
      </div>
    </SystemStateShell>
  );
}

"use client";

import React, { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import {
  AlertOctagon,
  RefreshCw,
  Home,
  LifeBuoy,
  Activity,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { SystemStateShell } from "@/components/system/system-state-shell";

export default function GlobalErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const pathname = usePathname() || "/";
  const [showDetails, setShowDetails] = useState(false);

  useEffect(() => {
    console.error("[RapidShift Error Boundary]", error);
  }, [error]);

  const isAdmin = pathname.startsWith("/admin");
  const isPortal = pathname.startsWith("/portal");

  return (
    <SystemStateShell
      httpCode="500"
      badgeLabel="Unhandled Runtime Exception"
      tone="rose"
      title="Something went wrong while rendering this view"
      subtitle="An unexpected runtime exception occurred. Client production apps protected by the RapidShift Access Gate SDK remain unaffected (fail-open active)."
      icon={AlertOctagon}
      traceId={error?.digest ? `ERR-${error.digest}` : undefined}
      metrics={[
        { label: "Exception State", value: "Caught by Boundary", status: "err" },
        { label: "Edge Access Gate", value: "Fail-Open Active", status: "ok" },
        { label: "SQLite WAL Engine", value: "Protected", status: "ok" },
        { label: "Recovery", value: "Ready to Retry", status: "warn" },
      ]}
      actions={[
        {
          label: "Retry Operation",
          onClick: () => reset(),
          variant: "primary",
          icon: RefreshCw,
        },
        {
          label: isAdmin ? "Return to Admin Console" : isPortal ? "Return to Client Portal" : "Return Home",
          href: isAdmin ? "/admin" : isPortal ? "/portal" : "/admin",
          variant: "secondary",
          icon: Home,
        },
        {
          label: "Report to Support Desk",
          href: isAdmin ? "/admin/support" : "/portal/support",
          variant: "ghost",
          icon: LifeBuoy,
        },
        {
          label: "System Status",
          href: "/status/system",
          variant: "ghost",
          icon: Activity,
        },
      ]}
    >
      <div className="rounded-2xl bg-rose-500/5 border border-rose-500/20 overflow-hidden">
        <button
          type="button"
          onClick={() => setShowDetails((prev) => !prev)}
          className="w-full px-4 py-3 flex items-center justify-between text-xs font-mono font-semibold text-rose-600 dark:text-rose-400 hover:bg-rose-500/10 transition cursor-pointer"
        >
          <span>Diagnostic Error Signature: {error?.name || "RuntimeError"}</span>
          <span className="inline-flex items-center gap-1">
            {showDetails ? "Hide Details" : "Inspect Trace"}
            {showDetails ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </span>
        </button>
        {showDetails && (
          <div className="px-4 pb-4 pt-1 border-t border-rose-500/15 text-xs font-mono text-zinc-700 dark:text-zinc-300 space-y-1.5">
            <div className="p-3 rounded-xl bg-white/80 dark:bg-zinc-950/80 border border-zinc-200 dark:border-zinc-800 break-words">
              {error?.message || "An unexpected client or server rendering error occurred."}
            </div>
            {error?.digest && (
              <div className="text-[11px] text-zinc-400">Digest ID: {error.digest}</div>
            )}
          </div>
        )}
      </div>
    </SystemStateShell>
  );
}

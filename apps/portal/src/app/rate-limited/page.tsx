"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Clock, RefreshCw, Home, Activity, ShieldAlert } from "lucide-react";
import { SystemStateShell } from "@/components/system/system-state-shell";

export default function RateLimitedPage() {
  const router = useRouter();
  const [secondsLeft, setSecondsLeft] = useState(30);

  useEffect(() => {
    if (secondsLeft <= 0) return;
    const t = setInterval(() => {
      setSecondsLeft((s) => Math.max(0, s - 1));
    }, 1000);
    return () => clearInterval(t);
  }, [secondsLeft]);

  return (
    <SystemStateShell
      httpCode="429"
      badgeLabel="Rate Limit Protection Triggered"
      tone="amber"
      title="Too Many Requests — Cooldown Active"
      subtitle="Our edge rate-limiter temporarily throttled requests from your client session to protect SQLite WAL concurrency and SSH PM2 command queues."
      icon={Clock}
      metrics={[
        {
          label: "Retry Cooldown",
          value: secondsLeft > 0 ? `${secondsLeft}s remaining` : "Ready to Retry",
          status: secondsLeft > 0 ? "warn" : "ok",
        },
        { label: "Protection Tier", value: "Burst Guard Active", status: "ok" },
        { label: "PM2 Cooldown", value: "30s Window", status: "neutral" },
        { label: "Session Status", value: "Preserved", status: "ok" },
      ]}
      actions={[
        {
          label: secondsLeft > 0 ? `Retry in ${secondsLeft}s` : "Retry Request Now",
          onClick: () => router.back(),
          variant: "primary",
          icon: RefreshCw,
        },
        {
          label: "Return to Dashboard",
          href: "/admin",
          variant: "secondary",
          icon: Home,
        },
        {
          label: "System Status",
          href: "/status/system",
          variant: "ghost",
          icon: Activity,
        },
      ]}
    />
  );
}

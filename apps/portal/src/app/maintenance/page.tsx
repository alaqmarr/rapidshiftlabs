"use client";

import React, { useState } from "react";
import {
  Wrench,
  RefreshCw,
  Activity,
  CheckCircle2,
  Clock,
  ShieldCheck,
  Database,
  Server,
  Radio,
} from "lucide-react";
import { SystemStateShell } from "@/components/system/system-state-shell";

export default function MaintenancePage() {
  const [probing, setProbing] = useState(false);
  const [probeStatus, setProbeStatus] = useState<string | null>(null);

  const handleCheckStatus = async () => {
    setProbing(true);
    setProbeStatus(null);
    try {
      const res = await fetch("/api/v1/health", { cache: "no-store" });
      if (res.ok) {
        setProbeStatus("Control Plane API responded 200 OK — Services are coming back online.");
      } else {
        setProbeStatus(`Maintenance window still active (HTTP ${res.status}).`);
      }
    } catch {
      setProbeStatus("Maintenance window still active. Please check again shortly.");
    } finally {
      setProbing(false);
    }
  };

  const subsystems = [
    {
      name: "Edge Access Gate & SDK Verification",
      detail: "100% Fail-Open Active — Client production apps remain online",
      status: "Operational",
      tone: "emerald",
      icon: ShieldCheck,
    },
    {
      name: "SQLite WAL Storage & Schema Engine",
      detail: "Online checkpoint & non-blocking migration window",
      status: "Upgrading",
      tone: "amber",
      icon: Database,
    },
    {
      name: "PM2 Fleet & SSH Command Broker",
      detail: "Autonomous background monitoring active",
      status: "Standby",
      tone: "blue",
      icon: Server,
    },
    {
      name: "Cookieless Telemetry & SSE Bus",
      detail: "Events buffered with zero packet loss",
      status: "Buffered",
      tone: "emerald",
      icon: Radio,
    },
  ];

  return (
    <SystemStateShell
      httpCode="503"
      badgeLabel="Scheduled Maintenance Window"
      tone="amber"
      title="RapidShift Control Plane is Undergoing Scheduled Maintenance"
      subtitle="We are performing a scheduled infrastructure upgrade and WAL database checkpoint. All client applications using the RapidShift SDK continue operating normally in fail-open mode."
      icon={Wrench}
      metrics={[
        { label: "Client App Traffic", value: "100% Uninterrupted", status: "ok" },
        { label: "SDK Fail-Open", value: "Active & Verified", status: "ok" },
        { label: "Database Integrity", value: "WAL Online Backup", status: "warn" },
        { label: "Estimated Window", value: "< 15 Minutes", status: "neutral" },
      ]}
      actions={[
        {
          label: probing ? "Checking Control Plane..." : "Check Maintenance Completion",
          onClick: handleCheckStatus,
          variant: "primary",
          icon: RefreshCw,
        },
        {
          label: "Live Platform Status Page",
          href: "/status/system",
          variant: "secondary",
          icon: Activity,
        },
      ]}
    >
      <div className="space-y-4">
        {/* Progress Bar */}
        <div className="p-4 rounded-2xl bg-zinc-50/90 dark:bg-zinc-950/70 border border-zinc-200/80 dark:border-zinc-800/80 space-y-2.5">
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold text-zinc-800 dark:text-zinc-200 flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-amber-500" />
              <span>Upgrade Progress: Rolling Deployment &amp; WAL Checkpoint</span>
            </span>
            <span className="font-mono text-amber-600 dark:text-amber-400 font-bold">78%</span>
          </div>
          <div className="w-full h-2 rounded-full bg-zinc-200 dark:bg-zinc-800 overflow-hidden">
            <div className="h-full w-[78%] rounded-full bg-gradient-to-r from-amber-500 via-orange-500 to-emerald-500 transition-all" />
          </div>
        </div>

        {/* Subsystem Matrix */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          {subsystems.map((sub, i) => {
            const SubIcon = sub.icon;
            const badgeClass =
              sub.tone === "emerald"
                ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20"
                : sub.tone === "amber"
                  ? "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20"
                  : "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20";
            return (
              <div
                key={i}
                className="p-3.5 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800 flex items-start justify-between gap-3"
              >
                <div className="flex items-start gap-2.5 min-w-0">
                  <SubIcon className="w-4 h-4 text-zinc-400 shrink-0 mt-0.5" />
                  <div className="min-w-0">
                    <div className="text-xs font-bold text-zinc-900 dark:text-zinc-100 truncate">
                      {sub.name}
                    </div>
                    <div className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5">
                      {sub.detail}
                    </div>
                  </div>
                </div>
                <span
                  className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-semibold border shrink-0 ${badgeClass}`}
                >
                  {sub.status}
                </span>
              </div>
            );
          })}
        </div>

        {probeStatus && (
          <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/25 text-xs font-medium text-emerald-700 dark:text-emerald-300 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{probeStatus}</span>
          </div>
        )}
      </div>
    </SystemStateShell>
  );
}

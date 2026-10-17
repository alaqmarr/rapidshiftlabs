"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  AlertOctagon,
  RefreshCw,
  Activity,
  ShieldCheck,
  LifeBuoy,
  CheckCircle2,
  XCircle,
  Home,
} from "lucide-react";
import { SystemStateShell } from "@/components/system/system-state-shell";

export default function DowntimePage() {
  const [probing, setProbing] = useState(false);
  const [healthState, setHealthState] = useState<{
    reachable: boolean;
    latencyMs: number | null;
    checkedAt: string;
  }>({
    reachable: false,
    latencyMs: null,
    checkedAt: "Pending probe...",
  });

  const runLiveHealthProbe = useCallback(async () => {
    setProbing(true);
    const start = performance.now();
    try {
      const res = await fetch("/api/v1/health", { cache: "no-store" });
      const latency = Math.round(performance.now() - start);
      setHealthState({
        reachable: res.ok,
        latencyMs: latency,
        checkedAt: new Date().toLocaleTimeString(),
      });
    } catch {
      setHealthState({
        reachable: false,
        latencyMs: null,
        checkedAt: new Date().toLocaleTimeString(),
      });
    } finally {
      setProbing(false);
    }
  }, []);

  useEffect(() => {
    void runLiveHealthProbe();
    const timer = setInterval(() => {
      void runLiveHealthProbe();
    }, 15_000);
    return () => clearInterval(timer);
  }, [runLiveHealthProbe]);

  return (
    <SystemStateShell
      httpCode="503"
      badgeLabel={
        healthState.reachable
          ? "Service Recovered • Online"
          : "Service Outage • Fail-Open Active"
      }
      tone={healthState.reachable ? "emerald" : "rose"}
      title={
        healthState.reachable
          ? "Control Plane Connectivity Restored"
          : "Temporary Control Plane Service Interruption"
      }
      subtitle="Our autonomous PM2 self-healing daemon and SRE team are actively resolving a service interruption. All client applications integrated with @rapidshift/sdk automatically fail-open and remain 100% accessible to end-users."
      icon={healthState.reachable ? CheckCircle2 : AlertOctagon}
      metrics={[
        {
          label: "Live Health Probe",
          value: healthState.reachable ? "200 OK (Online)" : "Degraded / Recovering",
          status: healthState.reachable ? "ok" : "err",
        },
        {
          label: "Probe Latency",
          value: healthState.latencyMs != null ? `${healthState.latencyMs} ms` : "Timeout",
          status: healthState.reachable ? "ok" : "warn",
        },
        {
          label: "Client SDK Mode",
          value: "Fail-Open Guaranteed",
          status: "ok",
        },
        {
          label: "Last Checked",
          value: healthState.checkedAt,
          status: "neutral",
        },
      ]}
      actions={[
        {
          label: probing ? "Probing /api/v1/health..." : "Run Live Health Probe Now",
          onClick: runLiveHealthProbe,
          variant: "primary",
          icon: RefreshCw,
        },
        {
          label: "Return to Control Plane",
          href: "/admin",
          variant: "secondary",
          icon: Home,
        },
        {
          label: "Global Status Page",
          href: "/status/system",
          variant: "ghost",
          icon: Activity,
        },
        {
          label: "P1 Incident Desk",
          href: "/portal/support",
          variant: "ghost",
          icon: LifeBuoy,
        },
      ]}
    >
      {/* Fail-Open Architectural Guarantee Banner */}
      <div className="p-4 rounded-2xl bg-emerald-500/5 border border-emerald-500/20 flex items-start gap-3.5 text-xs">
        <ShieldCheck className="w-5 h-5 text-emerald-500 shrink-0 mt-0.5" />
        <div className="space-y-1">
          <div className="font-bold text-zinc-900 dark:text-zinc-100">
            Zero-Downtime Client SDK Fail-Open Architecture
          </div>
          <p className="text-zinc-600 dark:text-zinc-400 leading-relaxed">
            By design, the RapidShift Access Gate SDK (<code className="font-mono">@rapidshift/sdk</code>) caches Ed25519 access passes locally and fails open (`allowed: true, rapidshiftStatus: &quot;offline&quot;`) whenever the Control Plane is unreachable—ensuring client production traffic is never blocked by control plane maintenance or network partitions.
          </p>
        </div>
      </div>
    </SystemStateShell>
  );
}

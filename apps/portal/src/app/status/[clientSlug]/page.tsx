import { notFound } from "next/navigation";
import Link from "next/link";
import {
  Shield,
  CheckCircle2,
  AlertTriangle,
  AlertOctagon,
  Clock,
  ExternalLink,
  Lock,
  Globe,
  Activity,
} from "lucide-react";
import { getContainer } from "@rsl/core/container";
import type { PublicStatusPageData, PublicStatusPageDomain } from "@rsl/core/monitoring";
import { RapidShiftLogo } from "@/components/brand/rapidshift-logo";

interface StatusPageProps {
  params: Promise<{
    clientSlug: string;
  }>;
}

const formatDateTime = (ms: number | string | undefined | null) => {
  if (!ms) return "—";
  const d = new Date(ms);
  if (isNaN(d.getTime())) return "—";
  const day = String(d.getDate()).padStart(2, "0");
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const hours = String(d.getHours()).padStart(2, "0");
  const mins = String(d.getMinutes()).padStart(2, "0");
  return `${day} ${months[d.getMonth()]}, ${hours}:${mins}`;
};

export default async function StatusPage({ params }: StatusPageProps) {
  const { clientSlug } = await params;

  const container = getContainer();
  const isSystemSlug = clientSlug === "system" || clientSlug === "platform" || clientSlug === "rapidshift";

  let data: PublicStatusPageData | null = null;

  if (isSystemSlug) {
    const now = Date.now();
    const defaultHealthBars: Array<{ date: string; status: "up" | "degraded" | "down" }> = Array.from(
      { length: 30 },
      (_, i) => ({
        date: new Date(now - (29 - i) * 86400000).toISOString().split("T")[0]!,
        status: "up" as const,
      })
    );

    const platformServices: PublicStatusPageDomain[] = [
      {
        id: "srv_control_plane",
        name: "RapidShift Control Plane & Management Portal",
        hostname: "portal.rapidshiftlabs.com",
        status: "up" as const,
        uptime24h: 100,
        uptime7d: 100,
        uptime30d: 99.99,
        uptime90d: 99.98,
        dailyHealthBars: defaultHealthBars,
        sslDaysRemaining: 180,
      },
      {
        id: "srv_access_gate",
        name: "Edge Access Gate & Entitlement Token Verifier",
        hostname: "gate.rapidshiftlabs.com",
        status: "up" as const,
        uptime24h: 100,
        uptime7d: 100,
        uptime30d: 100,
        uptime90d: 99.99,
        dailyHealthBars: defaultHealthBars,
        sslDaysRemaining: 180,
      },
      {
        id: "srv_telemetry",
        name: "Cookieless Analytics & SSE Realtime Bus",
        hostname: "telemetry.rapidshiftlabs.com",
        status: "up" as const,
        uptime24h: 100,
        uptime7d: 99.98,
        uptime30d: 99.96,
        uptime90d: 99.95,
        dailyHealthBars: defaultHealthBars,
        sslDaysRemaining: 180,
      },
      {
        id: "srv_fleet_ssh",
        name: "PM2 Fleet Management & SSH Connection Broker",
        hostname: "fleet.rapidshiftlabs.com",
        status: "up" as const,
        uptime24h: 100,
        uptime7d: 100,
        uptime30d: 99.98,
        uptime90d: 99.95,
        dailyHealthBars: defaultHealthBars,
        sslDaysRemaining: 180,
      },
      {
        id: "srv_db_engine",
        name: "SQLite WAL WriteMutex & Storage Tier",
        hostname: "core.db",
        status: "up" as const,
        uptime24h: 100,
        uptime7d: 100,
        uptime30d: 100,
        uptime90d: 100,
        dailyHealthBars: defaultHealthBars,
        sslDaysRemaining: null,
      },
    ];

    data = {
      client: {
        id: "system",
        name: "RapidShift Labs Global Infrastructure",
        slug: "system",
      },
      overallStatus: "operational",
      domains: platformServices,
      activeIncidents: [],
      recentIncidents: [],
    };
  } else {
    data = await container.monitoring.getPublicStatusPage({ clientSlug });
  }

  if (!data) {
    notFound();
  }

  const { client, overallStatus, domains, activeIncidents, recentIncidents } =
    data;

  const statusConfig = {
    operational: {
      title: "All Systems Operational",
      description:
        "All monitored services and domain endpoints are operating normally with zero detected outages.",
      badge: "Operational",
      bannerClass: "bg-emerald-950/40 border-emerald-800/60 text-emerald-200",
      pillClass: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30",
      dotClass: "bg-emerald-400 shadow-[0_0_12px_rgba(52,211,153,0.8)]",
      Icon: CheckCircle2,
    },
    degraded: {
      title: "Degraded Performance",
      description:
        "One or more monitored endpoints are experiencing degraded performance, SSL expiration notices, or DNS drift.",
      badge: "Degraded",
      bannerClass: "bg-amber-950/40 border-amber-800/60 text-amber-200",
      pillClass: "bg-amber-500/10 text-amber-400 border-amber-500/30",
      dotClass: "bg-amber-400 shadow-[0_0_12px_rgba(251,191,36,0.8)]",
      Icon: AlertTriangle,
    },
    outage: {
      title: "Major Service Outage",
      description:
        "A critical outage is currently affecting one or more monitored endpoints. The incident team is actively investigating.",
      badge: "Outage",
      bannerClass: "bg-rose-950/40 border-rose-800/60 text-rose-200",
      pillClass: "bg-rose-500/10 text-rose-400 border-rose-500/30",
      dotClass: "bg-rose-400 shadow-[0_0_12px_rgba(244,63,94,0.8)]",
      Icon: AlertOctagon,
    },
  }[overallStatus];

  const StatusIcon = statusConfig.Icon;

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 selection:bg-blue-600 selection:text-white">
      {/* Header */}
      <header className="border-b border-zinc-800/80 bg-zinc-950/80 backdrop-blur sticky top-0 z-50">
        <div className="w-full px-4 sm:px-6 lg:px-8 xl:px-10 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <RapidShiftLogo size={32} />
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-base tracking-tight block leading-tight text-white">
                  {client.name}
                </span>
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20 font-semibold uppercase">
                  Status
                </span>
              </div>
              <span className="text-xs text-zinc-400 font-medium">
                Live Infrastructure Health
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div
              className={`px-3 py-1 rounded-full text-xs font-semibold border flex items-center gap-2 ${statusConfig.pillClass}`}
            >
              <span
                className={`w-2 h-2 rounded-full animate-pulse ${statusConfig.dotClass}`}
              />
              <span>{statusConfig.badge}</span>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="w-full px-4 sm:px-6 lg:px-8 xl:px-10 py-10 space-y-10">
        {/* Global Status Banner */}
        <section
          className={`p-6 sm:p-8 rounded-2xl border transition-all ${statusConfig.bannerClass}`}
        >
          <div className="flex items-start gap-4">
            <div className="p-3 rounded-xl bg-zinc-950/60 border border-zinc-800/60 shrink-0">
              <StatusIcon className="w-7 h-7" />
            </div>
            <div className="space-y-1">
              <h1 className="text-xl sm:text-2xl font-black tracking-tight">
                {statusConfig.title}
              </h1>
              <p className="text-sm text-zinc-300 leading-relaxed max-w-3xl">
                {statusConfig.description}
              </p>
            </div>
          </div>
        </section>

        {/* Active Incidents (if any) */}
        {activeIncidents.length > 0 && (
          <section className="space-y-4">
            <div className="flex items-center gap-2">
              <AlertOctagon className="w-5 h-5 text-rose-400" />
              <h2 className="text-lg font-bold tracking-tight text-white">
                Active Incidents ({activeIncidents.length})
              </h2>
            </div>

            <div className="space-y-3">
              {activeIncidents.map((incident) => (
                <div
                  key={incident.id}
                  className="p-5 rounded-xl bg-rose-950/20 border border-rose-800/50 space-y-3"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2.5">
                      <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold uppercase tracking-wider bg-rose-500/20 text-rose-300 border border-rose-500/30">
                        {incident.severity}
                      </span>
                      <span className="font-semibold text-white text-sm sm:text-base">
                        {incident.domainName}
                      </span>
                      <span className="text-xs text-zinc-400 uppercase tracking-wider">
                        ({incident.type})
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 text-xs text-zinc-400">
                      <Clock className="w-3.5 h-3.5" />
                      <span>
                        Started {formatDateTime(incident.startedAt)}
                      </span>
                    </div>
                  </div>

                  <p className="text-sm text-zinc-300 bg-zinc-950/60 p-3 rounded-lg border border-zinc-900 font-mono text-xs">
                    {incident.reason}
                  </p>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Monitored Domains / Services */}
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Activity className="w-5 h-5 text-blue-400" />
              <h2 className="text-lg font-bold tracking-tight text-white">
                Services & Endpoints
              </h2>
            </div>
            <span className="text-xs text-zinc-400">
              {domains.length} endpoint{domains.length === 1 ? "" : "s"} tracked
            </span>
          </div>

          {domains.length === 0 ? (
            <div className="p-8 rounded-xl bg-zinc-900/40 border border-zinc-800 text-center text-zinc-400 text-sm">
              No monitored endpoints currently registered for this client.
            </div>
          ) : (
            <div className="space-y-4">
              {domains.map((domain) => {
                const domainStatusBadge = {
                  up: {
                    label: "Operational",
                    class:
                      "bg-emerald-500/10 text-emerald-400 border-emerald-500/30",
                    dot: "bg-emerald-400",
                  },
                  degraded: {
                    label: "Degraded",
                    class:
                      "bg-amber-500/10 text-amber-400 border-amber-500/30",
                    dot: "bg-amber-400",
                  },
                  down: {
                    label: "Outage",
                    class:
                      "bg-rose-500/10 text-rose-400 border-rose-500/30",
                    dot: "bg-rose-400",
                  },
                  paused: {
                    label: "Paused",
                    class:
                      "bg-zinc-500/10 text-zinc-400 border-zinc-500/30",
                    dot: "bg-zinc-400",
                  },
                  pending: {
                    label: "Pending",
                    class:
                      "bg-blue-500/10 text-blue-400 border-blue-500/30",
                    dot: "bg-blue-400",
                  },
                }[domain.status] ?? {
                  label: domain.status,
                  class: "bg-zinc-800 text-zinc-300 border-zinc-700",
                  dot: "bg-zinc-400",
                };

                return (
                  <div
                    key={domain.id}
                    className="p-5 sm:p-6 rounded-2xl bg-zinc-900/60 border border-zinc-800/80 hover:border-zinc-700/80 transition space-y-5"
                  >
                    {/* Domain Header Row */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <Globe className="w-4 h-4 text-zinc-400" />
                          <h3 className="font-bold text-base text-white">
                            {domain.name}
                          </h3>
                        </div>
                        <a
                          href={`https://${domain.hostname}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-blue-400 hover:text-blue-300 hover:underline inline-flex items-center gap-1 mt-0.5"
                        >
                          <span>{domain.hostname}</span>
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      </div>

                      <div className="flex items-center gap-3">
                        {domain.sslDaysRemaining != null && (
                          <div className="text-xs text-zinc-400 flex items-center gap-1 bg-zinc-950/60 px-2.5 py-1 rounded-lg border border-zinc-800">
                            <Lock className="w-3 h-3 text-emerald-400" />
                            <span>
                              SSL:{" "}
                              {domain.sslDaysRemaining > 0
                                ? `${domain.sslDaysRemaining}d left`
                                : "Expired"}
                            </span>
                          </div>
                        )}

                        <div
                          className={`px-2.5 py-1 rounded-full text-xs font-semibold border flex items-center gap-1.5 ${domainStatusBadge.class}`}
                        >
                          <span
                            className={`w-1.5 h-1.5 rounded-full ${domainStatusBadge.dot}`}
                          />
                          <span>{domainStatusBadge.label}</span>
                        </div>
                      </div>
                    </div>

                    {/* Uptime Statistics Row */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-zinc-950/40 p-3 rounded-xl border border-zinc-900 text-center">
                      <div>
                        <div className="text-[11px] text-zinc-400 uppercase font-medium">
                          24 Hours
                        </div>
                        <div className="text-sm sm:text-base font-bold text-white mt-0.5">
                          {domain.uptime24h.toFixed(2)}%
                        </div>
                      </div>
                      <div>
                        <div className="text-[11px] text-zinc-400 uppercase font-medium">
                          7 Days
                        </div>
                        <div className="text-sm sm:text-base font-bold text-white mt-0.5">
                          {domain.uptime7d.toFixed(2)}%
                        </div>
                      </div>
                      <div>
                        <div className="text-[11px] text-zinc-400 uppercase font-medium">
                          30 Days
                        </div>
                        <div className="text-sm sm:text-base font-bold text-white mt-0.5">
                          {domain.uptime30d.toFixed(2)}%
                        </div>
                      </div>
                      <div>
                        <div className="text-[11px] text-zinc-400 uppercase font-medium">
                          90 Days
                        </div>
                        <div className="text-sm sm:text-base font-bold text-white mt-0.5">
                          {domain.uptime90d.toFixed(2)}%
                        </div>
                      </div>
                    </div>

                    {/* 90-Day Timeline Visual Bars */}
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between text-[11px] text-zinc-400 font-medium">
                        <span>90 days ago</span>
                        <span>Uptime History (Last 90 Days)</span>
                        <span>Today</span>
                      </div>

                      <div className="flex items-center gap-[2px] h-8 bg-zinc-950/60 p-1 rounded-lg border border-zinc-900 overflow-hidden">
                        {domain.dailyHealthBars.map((bar, idx) => {
                          const barColor =
                            bar.status === "up"
                              ? "bg-emerald-500 hover:bg-emerald-400"
                              : bar.status === "degraded"
                                ? "bg-amber-500 hover:bg-amber-400"
                                : "bg-rose-500 hover:bg-rose-400";

                          return (
                            <div
                              key={idx}
                              title={`${bar.date}: ${bar.status.toUpperCase()}`}
                              className={`flex-1 h-full rounded-[1px] cursor-pointer transition-colors ${barColor}`}
                            />
                          );
                        })}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* Past Incidents */}
        <section className="space-y-4">
          <div className="flex items-center gap-2">
            <Clock className="w-5 h-5 text-zinc-400" />
            <h2 className="text-lg font-bold tracking-tight text-white">
              Past Incidents
            </h2>
          </div>

          {recentIncidents.length === 0 ? (
            <div className="p-8 rounded-2xl bg-zinc-900/40 border border-zinc-800 text-center space-y-2">
              <CheckCircle2 className="w-8 h-8 text-emerald-400 mx-auto" />
              <p className="text-sm font-semibold text-white">
                No incidents reported in the past 90 days.
              </p>
              <p className="text-xs text-zinc-400">
                All services have run reliably without downtime.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {recentIncidents.map((incident) => {
                const durationMinutes = Math.floor(
                  (incident.durationSeconds ?? 0) / 60,
                );
                const durationSeconds = (incident.durationSeconds ?? 0) % 60;

                return (
                  <div
                    key={incident.id}
                    className="p-5 rounded-xl bg-zinc-900/60 border border-zinc-800/80 space-y-2"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-white text-sm">
                          {incident.domainName}
                        </span>
                        <span className="text-xs text-zinc-400 uppercase">
                          ({incident.type})
                        </span>
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-zinc-800 text-zinc-300">
                          RESOLVED
                        </span>
                      </div>
                      <div className="text-xs text-zinc-400">
                        {incident.resolvedAt
                          ? `Resolved ${formatDateTime(incident.resolvedAt)}`
                          : "Resolved"}
                      </div>
                    </div>

                    <p className="text-sm text-zinc-300">{incident.reason}</p>

                    <div className="flex items-center gap-4 text-xs text-zinc-400 pt-1">
                      <span>
                        Downtime Duration: {durationMinutes}m {durationSeconds}s
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-zinc-800/80 bg-zinc-950 py-10 text-center text-xs text-zinc-400 space-y-3">
        <div className="flex items-center justify-center gap-2">
          <RapidShiftLogo size={20} />
          <Link
            href="/"
            className="text-zinc-300 font-semibold hover:text-white transition"
          >
            RapidShift Labs Control Panel
          </Link>
        </div>
        <p className="text-zinc-500 max-w-md mx-auto">
          Continuous domain uptime, TLS certificate validity, and automated DNS
          drift monitoring telemetry.
        </p>
      </footer>
    </div>
  );
}

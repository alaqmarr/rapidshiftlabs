"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import {
  Server,
  Play,
  FileText,
  Clock,
  Cpu,
  HardDrive,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  ArrowLeft,
  X,
  Terminal,
  RotateCw,
  ShieldAlert,
  Zap,
  Layers,
  Activity,
  Gauge,
} from "lucide-react";
import { IosSpinner } from "@/components/ui/ios-spinner";
import { useAlert } from "@/components/ui/alert-popup";

export interface ServerHostingStats {
  serverId: string;
  serverName: string;
  status: "online" | "offline" | "unreachable" | "degraded";
  cpuUsagePercent: number;
  cpuCores: number;
  load1: number;
  load5: number;
  load15: number;
  activeThreads: number;
  totalThreads: number;
  memoryTotalMb: number;
  memoryUsedMb: number;
  memoryFreeMb: number;
  memoryAvailableMb: number;
  memoryUsagePercent: number;
  swapTotalMb: number;
  swapUsedMb: number;
  diskTotalGb: number;
  diskUsedGb: number;
  diskFreeGb: number;
  diskUsagePercent: number;
  diskMount: string;
  osPrettyName: string;
  kernelVersion: string;
  architecture: string;
  uptimeSeconds: number;
  uptimeFormatted: string;
  pm2ProcessCount: number;
  pm2OnlineCount: number;
  pm2TotalMemoryMb: number;
  pm2TotalCpuPercent: number;
  collectedAt: number;
}

export interface PortalProcess {
  id: string;
  serverId: string;
  serverName: string;
  pm2Id: number;
  name: string;
  clientId: string | null;
  allowClientRestart: boolean;
  restartCooldownSec: number;
  status: string;
  cpu: number;
  memory: number;
  restarts: number;
  uptimeMs: number;
  lastDiscoveredAt: number;
}

interface PortalFleetViewProps {
  clientId: string;
  processes: PortalProcess[];
}

export function PortalFleetView({ clientId, processes: initialProcesses }: PortalFleetViewProps) {
  const { showSuccess, showError, showWarning } = useAlert();
  const [processes, setProcesses] = useState<PortalProcess[]>(initialProcesses);
  const [restartingId, setRestartingId] = useState<string | null>(null);
  const [cooldownTimers, setCooldownTimers] = useState<Record<string, number>>({});
  const [serverStats, setServerStats] = useState<ServerHostingStats[]>([]);
  const [isLoadingStats, setIsLoadingStats] = useState<boolean>(true);

  // Fetch zero-overhead server stats for client hosting servers
  useEffect(() => {
    let isMounted = true;
    async function loadStats() {
      try {
        const res = await fetch(`/api/v1/portal/fleet/stats?clientId=${encodeURIComponent(clientId)}`);
        if (res.ok) {
          const data = await res.json();
          if (isMounted && data.stats) {
            setServerStats(data.stats);
          }
        }
      } catch (err) {
        console.error("Failed to load server stats", err);
      } finally {
        if (isMounted) setIsLoadingStats(false);
      }
    }
    loadStats();
    return () => {
      isMounted = false;
    };
  }, [clientId]);

  // Logs Modal State
  const [activeLogProcess, setActiveLogProcess] = useState<PortalProcess | null>(null);
  const [logLines, setLogLines] = useState<number>(100);
  const [logsContent, setLogsContent] = useState<string>("");
  const [isLoadingLogs, setIsLoadingLogs] = useState<boolean>(false);

  // Cooldown countdown tick
  useEffect(() => {
    const timer = setInterval(() => {
      setCooldownTimers((prev) => {
        const next: Record<string, number> = {};
        let changed = false;
        for (const [id, sec] of Object.entries(prev)) {
          if (sec > 1) {
            next[id] = sec - 1;
            changed = true;
          } else {
            changed = true;
          }
        }
        return changed ? next : prev;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  async function handleRestart(process: PortalProcess) {
    if (!process.allowClientRestart) {
      showError("Restart Not Permitted", "Self-service restart is not permitted for this process. Contact your RapidShift account manager to request authorization.", [
        { label: "Process Name", value: process.name },
        { label: "PM2 ID", value: String(process.pm2Id) },
      ]);
      return;
    }

    if (cooldownTimers[process.id] && cooldownTimers[process.id] > 0) {
      showWarning("Restart Cooldown Active", `Please wait ${cooldownTimers[process.id]}s before restarting "${process.name}" again. RapidShift enforces a cooldown window to protect against restart thrashing.`);
      return;
    }

    setRestartingId(process.id);

    try {
      const res = await fetch(`/api/v1/portal/fleet/processes/${process.id}/restart`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to restart process");
      }

      // Start cooldown timer
      setCooldownTimers((prev) => ({
        ...prev,
        [process.id]: process.restartCooldownSec || 60,
      }));

      showSuccess(
        "PM2 Process Restarted",
        `Process "${process.name}" (PM2 ID: ${process.pm2Id}) was successfully restarted on ${process.serverName}. Cooldown window is now active.`,
        [
          { label: "Process Name", value: process.name },
          { label: "Server", value: process.serverName },
          { label: "PM2 Process ID", value: String(process.pm2Id) },
          { label: "Cooldown", value: `${process.restartCooldownSec || 60} seconds` },
        ]
      );
    } catch (err: any) {
      showError("Process Restart Failed", err.message, [
        { label: "Process", value: process.name },
        { label: "Server", value: process.serverName },
      ]);
    } finally {
      setRestartingId(null);
    }
  }

  async function fetchLogs(process: PortalProcess, lines: number = 100) {
    setActiveLogProcess(process);
    setIsLoadingLogs(true);
    setLogsContent("");

    try {
      const res = await fetch(
        `/api/v1/portal/fleet/processes/${process.id}/logs?lines=${lines}&clientId=${clientId}`,
      );
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to fetch logs");
      }

      setLogsContent(data.logs || "(No log output returned)");
    } catch (err: any) {
      setLogsContent(`Error retrieving process logs: ${err.message}`);
    } finally {
      setIsLoadingLogs(false);
    }
  }

  function formatUptime(uptimeMs: number) {
    if (!uptimeMs) return "0s";
    const seconds = Math.floor(uptimeMs / 1000);
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);

    if (days > 0) return `${days}d ${hours}h`;
    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m`;
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 flex flex-col">
      {/* Main Content */}
      <main className="flex-1 w-full px-4 sm:px-6 lg:px-8 xl:px-10 py-8 space-y-6">
        {/* Page Action Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 flex items-center justify-center border border-blue-200/60 dark:border-blue-800/60 shadow-xs">
              <Server className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight text-zinc-900 dark:text-white">
                Infrastructure &amp; Services
              </h1>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                Live PM2 telemetry, isolated process restart controls, and real-time execution logs
              </p>
            </div>
          </div>

          <div className="text-xs font-mono px-3 py-1.5 rounded-lg bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 self-start sm:self-auto border border-zinc-200 dark:border-zinc-700">
            Tenant: {clientId}
          </div>
        </div>
        {/* Security Isolation Notice */}
        <div className="p-4 rounded-xl bg-blue-50/60 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900 text-xs text-blue-900 dark:text-blue-300 flex items-start gap-3">
          <ShieldAlert className="w-5 h-5 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
          <div>
            <span className="font-semibold">Scoped Multi-Tenant Isolation:</span> You can only access and restart
            processes explicitly mapped to your organization. SSH command templates are strictly allowlisted to prevent
            unauthorized shell access.
          </div>
        </div>

        {/* Hosting Infrastructure & Zero-Load System Telemetry */}
        {serverStats.length > 0 && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Activity className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                <h2 className="steel-heading text-sm text-zinc-900 dark:text-white">
                  Hosting Infrastructure Telemetry
                </h2>
                <span className="steel-pill inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20 font-tech">
                  <Zap className="w-2.5 h-2.5" /> ZERO-LOAD PROCFS
                </span>
              </div>
              <span className="text-xs font-tech text-zinc-400">
                Live hardware metrics from kernel /proc space
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {serverStats.map((srv) => (
                <div
                  key={srv.serverId}
                  className="col-span-1 md:col-span-2 lg:col-span-4 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-5 shadow-xs space-y-4"
                >
                  <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-zinc-100 dark:border-zinc-800">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 flex items-center justify-center border border-blue-200/60 dark:border-blue-800/60">
                        <Server className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="font-steel font-bold text-sm text-zinc-900 dark:text-white">{srv.serverName}</h3>
                          <span className="steel-pill inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 font-tech">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> ONLINE
                          </span>
                        </div>
                        <div className="flex items-center gap-2 text-xs font-tech text-zinc-500 mt-0.5">
                          <span>{srv.osPrettyName}</span>
                          <span>·</span>
                          <span>Kernel {srv.kernelVersion}</span>
                          <span>·</span>
                          <span className="uppercase">{srv.architecture}</span>
                        </div>
                      </div>
                    </div>

                    <div className="text-right">
                      <div className="text-xs font-tech text-zinc-500">System Uptime</div>
                      <div className="font-tech font-bold text-xs text-zinc-800 dark:text-zinc-200">{srv.uptimeFormatted}</div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    {/* CPU */}
                    <div className="p-4 rounded-xl bg-zinc-900/90 dark:bg-zinc-950/80 border border-zinc-200 dark:border-zinc-800 shadow-xs flex flex-col justify-between space-y-3">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-xs font-semibold uppercase tracking-wider font-tech text-zinc-400 flex items-center gap-1.5">
                          <Cpu className="w-4 h-4 text-blue-500" /> CPU Usage
                        </span>
                        <span className="font-tech text-zinc-400 font-medium">{srv.cpuCores} Cores</span>
                      </div>
                      <div>
                        <div className="text-3xl font-extrabold font-tech tabular-nums tracking-tight text-zinc-900 dark:text-zinc-50">
                          {srv.cpuUsagePercent}%
                        </div>
                        <div className="w-full bg-zinc-200 dark:bg-zinc-800/80 h-2 rounded-full overflow-hidden mt-2 border border-zinc-200/50 dark:border-zinc-700/40">
                          <div
                            className={`h-full transition-all duration-500 ${
                              srv.cpuUsagePercent > 85 ? "bg-rose-500" : srv.cpuUsagePercent > 70 ? "bg-amber-500" : "bg-blue-600 dark:bg-blue-500"
                            }`}
                            style={{ width: `${Math.min(100, Math.max(2, srv.cpuUsagePercent))}%` }}
                          />
                        </div>
                      </div>
                      <div className="pt-2.5 border-t border-zinc-200/60 dark:border-zinc-800/80 text-[11px] font-tech text-zinc-500 dark:text-zinc-400 space-y-1">
                        <div>Load: <span className="tabular-nums font-semibold text-zinc-800 dark:text-zinc-200">{srv.load1.toFixed(2)} · {srv.load5.toFixed(2)} · {srv.load15.toFixed(2)}</span></div>
                        <div>Threads: <span className="tabular-nums font-semibold text-zinc-800 dark:text-zinc-200">{srv.activeThreads} active / {srv.totalThreads}</span></div>
                      </div>
                    </div>

                    {/* RAM */}
                    <div className="p-4 rounded-xl bg-zinc-900/90 dark:bg-zinc-950/80 border border-zinc-200 dark:border-zinc-800 shadow-xs flex flex-col justify-between space-y-3">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-xs font-semibold uppercase tracking-wider font-tech text-zinc-400 flex items-center gap-1.5">
                          <Layers className="w-4 h-4 text-indigo-400" /> RAM Memory
                        </span>
                        <span className="font-tech text-zinc-400 font-medium">{(srv.memoryTotalMb / 1024).toFixed(1)} GB Total</span>
                      </div>
                      <div>
                        <div className="text-3xl font-extrabold font-tech tabular-nums tracking-tight text-zinc-900 dark:text-zinc-50">
                          {srv.memoryUsagePercent}%
                        </div>
                        <div className="w-full bg-zinc-200 dark:bg-zinc-800/80 h-2 rounded-full overflow-hidden mt-2 border border-zinc-200/50 dark:border-zinc-700/40">
                          <div
                            className={`h-full transition-all duration-500 ${
                              srv.memoryUsagePercent > 90 ? "bg-rose-500" : srv.memoryUsagePercent > 75 ? "bg-amber-500" : "bg-blue-600 dark:bg-blue-500"
                            }`}
                            style={{ width: `${Math.min(100, Math.max(2, srv.memoryUsagePercent))}%` }}
                          />
                        </div>
                      </div>
                      <div className="pt-2.5 border-t border-zinc-200/60 dark:border-zinc-800/80 text-[11px] font-tech text-zinc-500 dark:text-zinc-400 space-y-1">
                        <div>Used: <span className="tabular-nums font-semibold text-zinc-800 dark:text-zinc-200">{(srv.memoryUsedMb / 1024).toFixed(2)} GB</span></div>
                        <div>Avail: <span className="tabular-nums font-semibold text-zinc-800 dark:text-zinc-200">{(srv.memoryAvailableMb / 1024).toFixed(2)} GB</span></div>
                      </div>
                    </div>

                    {/* Disk */}
                    <div className="p-4 rounded-xl bg-zinc-900/90 dark:bg-zinc-950/80 border border-zinc-200 dark:border-zinc-800 shadow-xs flex flex-col justify-between space-y-3">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-xs font-semibold uppercase tracking-wider font-tech text-zinc-400 flex items-center gap-1.5">
                          <HardDrive className="w-4 h-4 text-amber-500" /> Storage ({srv.diskMount || "/"})
                        </span>
                        <span className="font-tech text-zinc-400 font-medium">{srv.diskTotalGb.toFixed(0)} GB</span>
                      </div>
                      <div>
                        <div className="text-3xl font-extrabold font-tech tabular-nums tracking-tight text-zinc-900 dark:text-zinc-50">
                          {srv.diskUsagePercent}%
                        </div>
                        <div className="w-full bg-zinc-200 dark:bg-zinc-800/80 h-2 rounded-full overflow-hidden mt-2 border border-zinc-200/50 dark:border-zinc-700/40">
                          <div
                            className={`h-full transition-all duration-500 ${
                              srv.diskUsagePercent > 90 ? "bg-rose-500" : srv.diskUsagePercent > 70 ? "bg-amber-500" : "bg-blue-600 dark:bg-blue-500"
                            }`}
                            style={{ width: `${Math.min(100, Math.max(2, srv.diskUsagePercent))}%` }}
                          />
                        </div>
                      </div>
                      <div className="pt-2.5 border-t border-zinc-200/60 dark:border-zinc-800/80 text-[11px] font-tech text-zinc-500 dark:text-zinc-400 space-y-1">
                        <div>Used: <span className="tabular-nums font-semibold text-zinc-800 dark:text-zinc-200">{srv.diskUsedGb.toFixed(1)} GB</span></div>
                        <div>Free: <span className="tabular-nums font-semibold text-zinc-800 dark:text-zinc-200">{srv.diskFreeGb.toFixed(1)} GB</span></div>
                      </div>
                    </div>

                    {/* PM2 */}
                    <div className="p-4 rounded-xl bg-zinc-900/90 dark:bg-zinc-950/80 border border-zinc-200 dark:border-zinc-800 shadow-xs flex flex-col justify-between space-y-3">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-xs font-semibold uppercase tracking-wider font-tech text-zinc-400 flex items-center gap-1.5">
                          <Gauge className="w-4 h-4 text-emerald-400" /> PM2 Footprint
                        </span>
                        <span className="font-tech text-emerald-400 font-semibold">{srv.pm2OnlineCount} Online</span>
                      </div>
                      <div>
                        <div className="text-3xl font-extrabold font-tech tabular-nums tracking-tight text-zinc-900 dark:text-zinc-50">
                          {srv.pm2TotalMemoryMb} <span className="text-xs font-normal text-zinc-400">MB</span>
                        </div>
                        <p className="text-[11px] font-tech text-zinc-400 mt-1">
                          Aggregated PM2 memory
                        </p>
                      </div>
                      <div className="pt-2.5 border-t border-zinc-200/60 dark:border-zinc-800/80 text-[11px] font-tech text-zinc-500 dark:text-zinc-400 space-y-1">
                        <div>Total Proc: <span className="tabular-nums font-semibold text-zinc-800 dark:text-zinc-200">{srv.pm2ProcessCount} registered</span></div>
                        <div>CPU Footprint: <span className="tabular-nums font-semibold text-zinc-800 dark:text-zinc-200">{srv.pm2TotalCpuPercent}% total</span></div>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {processes.length === 0 ? (
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-12 text-center text-zinc-400">
            <Server className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <h3 className="text-base font-bold text-zinc-800 dark:text-zinc-200">No Mapped Services Found</h3>
            <p className="text-xs text-zinc-500 mt-1 max-w-md mx-auto">
              Your account currently has no PM2 applications mapped. Please contact RapidShift Labs support to assign
              your application services.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {processes.map((proc) => {
              const cooldown = cooldownTimers[proc.id] || 0;
              const isRestarting = restartingId === proc.id;

              return (
                <div
                  key={proc.id}
                  className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 shadow-sm flex flex-col justify-between space-y-5"
                >
                  <div className="space-y-4">
                    <div className="flex items-start justify-between">
                      <div>
                        <h3 className="font-bold text-base text-zinc-900 dark:text-zinc-100">{proc.name}</h3>
                        <p className="text-xs text-zinc-500 font-mono mt-0.5">
                          {proc.serverName} • pm2_id: {proc.pm2Id}
                        </p>
                      </div>

                      <span
                        className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold ${
                          proc.status === "online"
                            ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20"
                            : "bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20"
                        }`}
                      >
                        <span
                          className={`w-1.5 h-1.5 rounded-full ${
                            proc.status === "online" ? "bg-emerald-500" : "bg-rose-500"
                          }`}
                        />
                        {proc.status}
                      </span>
                    </div>

                    {/* Telemetry Metrics */}
                    <div className="grid grid-cols-2 gap-3 pt-3 border-t border-zinc-100 dark:border-zinc-800/80">
                      <div className="p-3 rounded-xl bg-zinc-50 dark:bg-zinc-800/50">
                        <div className="flex items-center gap-1.5 text-zinc-400 text-[11px]">
                          <Cpu className="w-3.5 h-3.5" />
                          <span>CPU Load</span>
                        </div>
                        <div className="text-sm font-bold text-zinc-900 dark:text-zinc-100 mt-1">
                          {proc.cpu}%
                        </div>
                      </div>

                      <div className="p-3 rounded-xl bg-zinc-50 dark:bg-zinc-800/50">
                        <div className="flex items-center gap-1.5 text-zinc-400 text-[11px]">
                          <HardDrive className="w-3.5 h-3.5" />
                          <span>Memory</span>
                        </div>
                        <div className="text-sm font-bold text-zinc-900 dark:text-zinc-100 mt-1">
                          {(proc.memory / 1024 / 1024).toFixed(1)} MB
                        </div>
                      </div>

                      <div className="p-3 rounded-xl bg-zinc-50 dark:bg-zinc-800/50">
                        <div className="flex items-center gap-1.5 text-zinc-400 text-[11px]">
                          <Clock className="w-3.5 h-3.5" />
                          <span>Uptime</span>
                        </div>
                        <div className="text-sm font-bold text-zinc-900 dark:text-zinc-100 mt-1">
                          {formatUptime(proc.uptimeMs)}
                        </div>
                      </div>

                      <div className="p-3 rounded-xl bg-zinc-50 dark:bg-zinc-800/50">
                        <div className="flex items-center gap-1.5 text-zinc-400 text-[11px]">
                          <RotateCw className="w-3.5 h-3.5" />
                          <span>Restarts</span>
                        </div>
                        <div className="text-sm font-bold text-zinc-900 dark:text-zinc-100 mt-1 font-mono">
                          {proc.restarts}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Action Buttons */}
                  <div className="pt-4 border-t border-zinc-100 dark:border-zinc-800 flex items-center gap-3">
                    <button
                      onClick={() => handleRestart(proc)}
                      disabled={!proc.allowClientRestart || isRestarting || cooldown > 0}
                      className={`flex-1 inline-flex items-center justify-center gap-2 px-3 py-2 text-xs font-semibold rounded-lg transition ${
                        !proc.allowClientRestart
                          ? "bg-zinc-100 dark:bg-zinc-800 text-zinc-400 cursor-not-allowed"
                          : cooldown > 0
                          ? "bg-zinc-100 dark:bg-zinc-800 text-zinc-500 cursor-not-allowed"
                          : "bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm"
                      }`}
                      title={
                        !proc.allowClientRestart
                          ? "Self-service restart disabled"
                          : cooldown > 0
                          ? `Cooldown active (${cooldown}s)`
                          : "Restart process"
                      }
                    >
                      {isRestarting ? (
                        <IosSpinner size="sm" className="text-current" />
                      ) : (
                        <RotateCw className="w-3.5 h-3.5" />
                      )}
                      {isRestarting
                        ? "Restarting..."
                        : cooldown > 0
                        ? `Wait ${cooldown}s`
                        : "Restart"}
                    </button>

                    <button
                      onClick={() => fetchLogs(proc, 100)}
                      className="inline-flex items-center justify-center gap-2 px-3 py-2 border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-700 text-xs font-semibold rounded-lg transition"
                    >
                      <Terminal className="w-3.5 h-3.5 text-zinc-500" />
                      Logs
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>

      {/* Logs Modal */}
      {activeLogProcess && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-zinc-950 border border-zinc-800 rounded-2xl max-w-3xl w-full p-6 shadow-2xl space-y-4 text-zinc-100 flex flex-col max-h-[85vh]">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <div className="flex items-center gap-2">
                <Terminal className="w-5 h-5 text-indigo-400" />
                <div>
                  <h3 className="font-bold text-sm">
                    Live Logs: {activeLogProcess.name} (pm2_id: {activeLogProcess.pm2Id})
                  </h3>
                  <p className="text-[11px] text-zinc-400">Server: {activeLogProcess.serverName}</p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <select
                  value={logLines}
                  onChange={(e) => {
                    const l = Number(e.target.value);
                    setLogLines(l);
                    fetchLogs(activeLogProcess, l);
                  }}
                  className="px-2 py-1 bg-zinc-900 border border-zinc-800 rounded text-xs text-zinc-300 focus:outline-none"
                >
                  <option value={50}>Last 50 lines</option>
                  <option value={100}>Last 100 lines</option>
                  <option value={200}>Last 200 lines</option>
                  <option value={500}>Last 500 lines</option>
                </select>

                <button
                  onClick={() => fetchLogs(activeLogProcess, logLines)}
                  className="p-1.5 hover:bg-zinc-800 rounded transition text-zinc-400 hover:text-zinc-200"
                  title="Refresh Logs"
                >
                  {isLoadingLogs ? (
                    <IosSpinner size="sm" className="text-zinc-400" />
                  ) : (
                    <RefreshCw className="w-4 h-4" />
                  )}
                </button>

                <button
                  onClick={() => setActiveLogProcess(null)}
                  className="p-1.5 hover:bg-zinc-800 rounded transition text-zinc-400 hover:text-zinc-200"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Terminal Body */}
            <div className="flex-1 overflow-y-auto bg-black/80 rounded-xl p-4 font-mono text-xs text-zinc-300 border border-zinc-900 leading-relaxed whitespace-pre-wrap select-text">
              {isLoadingLogs ? (
                <div className="text-zinc-500 py-8 text-center animate-pulse">
                  Streaming logs from remote host over SSH...
                </div>
              ) : (
                logsContent
              )}
            </div>

            <div className="pt-2 border-t border-zinc-800/60 flex items-center justify-between text-[11px] text-zinc-500">
              <span>Sanitized query: pm2 logs --nostream --lines {logLines}</span>
              <button
                onClick={() => setActiveLogProcess(null)}
                className="px-3 py-1 bg-zinc-800 hover:bg-zinc-700 rounded text-xs text-zinc-200 transition"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import {
  Server,
  Clock,
  Cpu,
  HardDrive,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  X,
  Terminal,
  RotateCw,
  ShieldAlert,
  Zap,
  Layers,
  Activity,
  Gauge,
  Search,
  Copy,
  Check,
  Download,
  Stethoscope,
  Sparkles,
  LayoutGrid,
  Table as TableIcon,
  ArrowUpDown,
  Info,
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

interface DiagnosticResultPayload {
  diagnostic: {
    processId: string;
    pm2Id: number;
    processName: string;
    status: string;
    restarts: number;
    uptimeMs: number;
    severity: "HEALTHY" | "WARNING" | "CRITICAL";
    category: string;
    title: string;
    summary: string;
    recommendation: string;
    extractedError?: string;
    recoveryAction: string;
    isCrashLoop: boolean;
    timestamp: number;
  };
  healAttempted: boolean;
  healSuccess?: boolean;
  healMessage?: string;
  ticketCreatedId?: string;
}

interface PortalFleetViewProps {
  clientId: string;
  processes: PortalProcess[];
}

type StatusFilterTab = "all" | "online" | "crashing_down";
type SortField = "pm2Id" | "name" | "cpu" | "memory" | "uptime" | "restarts";
type ViewMode = "grid" | "table";

/**
 * Distinguishes actual crashing / crash-looping processes from stable online processes
 * that simply have a high cumulative restart count due to routine project updates/deployments.
 */
function isProcessCrashing(proc: {
  status: string;
  restarts: number;
  uptimeMs: number;
}): boolean {
  const status = String(proc.status || "").toLowerCase();
  if (status === "errored") return true;
  if (status === "online" && proc.uptimeMs > 0 && proc.uptimeMs < 30_000 && (proc.restarts || 0) >= 8) {
    return true;
  }
  return false;
}

export function PortalFleetView({
  clientId,
  processes: initialProcesses,
}: PortalFleetViewProps) {
  const { showSuccess, showError, showWarning } = useAlert();
  const [processes, setProcesses] = useState<PortalProcess[]>(initialProcesses);
  const [restartingId, setRestartingId] = useState<string | null>(null);
  const [cooldownTimers, setCooldownTimers] = useState<Record<string, number>>({});
  const [serverStats, setServerStats] = useState<ServerHostingStats[]>([]);
  const [isLoadingStats, setIsLoadingStats] = useState<boolean>(true);
  const [autoRefresh, setAutoRefresh] = useState<boolean>(false);

  // Filter, Search, Sort, View Mode
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilterTab>("all");
  const [sortField, setSortField] = useState<SortField>("pm2Id");
  const [sortAsc, setSortAsc] = useState<boolean>(true);
  const [viewMode, setViewMode] = useState<ViewMode>("grid");

  // Enhanced Logs Modal State
  const [activeLogProcess, setActiveLogProcess] = useState<PortalProcess | null>(null);
  const [logLines, setLogLines] = useState<number>(100);
  const [logsContent, setLogsContent] = useState<string>("");
  const [isLoadingLogs, setIsLoadingLogs] = useState<boolean>(false);
  const [logSearchQuery, setLogSearchQuery] = useState<string>("");
  const [copiedLogs, setCopiedLogs] = useState<boolean>(false);

  // AI Diagnostics & Self-Healing Drawer State
  const [activeDiagProcess, setActiveDiagProcess] = useState<PortalProcess | null>(null);
  const [diagResult, setDiagResult] = useState<DiagnosticResultPayload | null>(null);
  const [isRunningDiag, setIsRunningDiag] = useState<boolean>(false);
  const [isAutoHealing, setIsAutoHealing] = useState<boolean>(false);

  // Fetch zero-overhead server stats for client hosting servers
  const loadStats = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/v1/portal/fleet/stats?clientId=${encodeURIComponent(clientId)}`
      );
      if (res.ok) {
        const data = await res.json();
        if (data.stats) {
          setServerStats(data.stats);
        }
      }
    } catch (err) {
      console.error("Failed to load server stats", err);
    } finally {
      setIsLoadingStats(false);
    }
  }, [clientId]);

  useEffect(() => {
    void loadStats();
  }, [loadStats]);

  // Auto-Refresh interval (every 15s when enabled)
  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(() => {
      void loadStats();
    }, 15000);
    return () => clearInterval(interval);
  }, [autoRefresh, loadStats]);

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

  // Top Telemetry Aggregations
  const fleetTelemetry = useMemo(() => {
    const total = processes.length;
    const crashingCount = processes.filter(
      (p) => isProcessCrashing(p) || p.status !== "online"
    ).length;
    const onlineStableCount = processes.filter(
      (p) => p.status === "online" && !isProcessCrashing(p)
    ).length;
    const aggregateCpu = processes.reduce((sum, p) => sum + (p.cpu || 0), 0);
    const aggregateRamMb = processes.reduce(
      (sum, p) => sum + (p.memory || 0) / 1024 / 1024,
      0
    );

    return {
      total,
      onlineStableCount,
      crashingCount,
      aggregateCpu: Number(aggregateCpu.toFixed(1)),
      aggregateRamMb: Number(aggregateRamMb.toFixed(1)),
    };
  }, [processes]);

  const filteredAndSortedProcesses = useMemo(() => {
    const q = searchTerm.toLowerCase().trim();
    const list = processes.filter((p) => {
      const matchesSearch =
        !q ||
        p.name.toLowerCase().includes(q) ||
        p.serverName.toLowerCase().includes(q) ||
        String(p.pm2Id).includes(q);

      let matchesStatus = true;
      if (statusFilter === "online") {
        matchesStatus = p.status === "online" && !isProcessCrashing(p);
      } else if (statusFilter === "crashing_down") {
        matchesStatus = isProcessCrashing(p) || p.status !== "online";
      }

      return matchesSearch && matchesStatus;
    });

    list.sort((a, b) => {
      let cmp = 0;
      if (sortField === "pm2Id") cmp = a.pm2Id - b.pm2Id;
      else if (sortField === "name") cmp = a.name.localeCompare(b.name);
      else if (sortField === "cpu") cmp = (a.cpu || 0) - (b.cpu || 0);
      else if (sortField === "memory") cmp = (a.memory || 0) - (b.memory || 0);
      else if (sortField === "uptime") cmp = (a.uptimeMs || 0) - (b.uptimeMs || 0);
      else if (sortField === "restarts") cmp = (a.restarts || 0) - (b.restarts || 0);
      return sortAsc ? cmp : -cmp;
    });

    return list;
  }, [processes, searchTerm, statusFilter, sortField, sortAsc]);

  // Filtered log lines with keyword filter
  const displayedLogLines = useMemo(() => {
    if (!logsContent) return [];
    const lines = logsContent.split("\n");
    const q = logSearchQuery.toLowerCase().trim();
    if (!q) return lines;
    return lines.filter((line) => line.toLowerCase().includes(q));
  }, [logsContent, logSearchQuery]);

  async function handleRestart(process: PortalProcess) {
    if (!process.allowClientRestart) {
      showError(
        "Restart Not Permitted",
        "Self-service restart is not permitted for this process. Contact your RapidShift account manager to request authorization.",
        [
          { label: "Process Name", value: process.name },
          { label: "PM2 ID", value: String(process.pm2Id) },
        ]
      );
      return;
    }

    if (cooldownTimers[process.id] && cooldownTimers[process.id] > 0) {
      showWarning(
        "Restart Cooldown Active",
        `Please wait ${cooldownTimers[process.id]}s before restarting "${process.name}" again. RapidShift enforces a cooldown window to protect against restart thrashing.`
      );
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

      setProcesses((prev) =>
        prev.map((p) =>
          p.id === process.id
            ? {
                ...p,
                status: "online",
                restarts: (p.restarts || 0) + 1,
                uptimeMs: 5000,
              }
            : p
        )
      );

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
        `/api/v1/portal/fleet/processes/${process.id}/logs?lines=${lines}&clientId=${clientId}`
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

  async function runDiagnostics(process: PortalProcess, autoHeal: boolean = false) {
    setActiveDiagProcess(process);
    if (autoHeal) {
      setIsAutoHealing(true);
    } else {
      setIsRunningDiag(true);
      setDiagResult(null);
    }

    try {
      const res = await fetch(`/api/v1/portal/fleet/processes/${process.id}/diagnose`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId, autoHeal }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to run process diagnostics");
      }

      setDiagResult(data as DiagnosticResultPayload);

      if (autoHeal && data.healSuccess) {
        setProcesses((prev) =>
          prev.map((p) =>
            p.id === process.id
              ? { ...p, status: "online", restarts: (p.restarts || 0) + 1 }
              : p
          )
        );
        showSuccess(
          "Auto-Heal Recovery Executed",
          data.healMessage || `Successfully restarted and verified '${process.name}'.`
        );
      }
    } catch (err: any) {
      showError("Diagnostics Failed", err.message);
    } finally {
      setIsRunningDiag(false);
      setIsAutoHealing(false);
    }
  }

  function handleCopyLogs() {
    if (!logsContent) return;
    navigator.clipboard.writeText(displayedLogLines.join("\n"));
    setCopiedLogs(true);
    setTimeout(() => setCopiedLogs(false), 1800);
  }

  function handleDownloadLogs() {
    if (!activeLogProcess || !logsContent) return;
    const blob = new Blob([displayedLogLines.join("\n")], {
      type: "text/plain;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${activeLogProcess.name}-pm2-${activeLogProcess.pm2Id}.log`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function formatUptime(uptimeMs: number, status?: string) {
    if (status && status !== "online") return "—";
    if (!uptimeMs || uptimeMs <= 0) return "0s";
    const seconds = Math.floor(uptimeMs / 1000);
    if (seconds < 60) return `${seconds}s`;
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);

    if (days > 0) return `${days}d ${hours}h`;
    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m`;
  }

  function getLogLineStyle(line: string): string {
    const upper = line.toUpperCase();
    if (
      upper.includes("ERROR") ||
      upper.includes("FATAL") ||
      upper.includes("EXCEPTION") ||
      upper.includes("EADDRINUSE") ||
      upper.includes("ECONNREFUSED")
    ) {
      return "text-rose-400 bg-rose-950/30 px-1.5 py-0.5 rounded border-l-2 border-rose-500";
    }
    if (upper.includes("WARN") || upper.includes("TIMEOUT") || upper.includes("DEPRECATED")) {
      return "text-amber-300 bg-amber-950/20 px-1.5 py-0.5 rounded border-l-2 border-amber-500";
    }
    if (upper.includes("INFO") || upper.includes("READY") || upper.includes("LISTENING")) {
      return "text-emerald-300";
    }
    return "text-zinc-300";
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 flex flex-col">
      <main className="flex-1 w-full px-4 sm:px-6 lg:px-8 xl:px-10 py-8 space-y-6">
        {/* TOP EXECUTIVE TELEMETRY BAR & HEADER */}
        <div className="bg-white dark:bg-zinc-900/90 border border-zinc-200 dark:border-zinc-800/90 rounded-2xl p-5 shadow-xs space-y-5">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-center gap-3.5">
              <div className="w-11 h-11 rounded-xl bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 flex items-center justify-center border border-blue-200/60 dark:border-blue-800/60 shadow-xs shrink-0">
                <Server className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2.5">
                  <h1 className="text-lg sm:text-xl font-bold steel-heading text-zinc-900 dark:text-white">
                    Infrastructure &amp; PM2 Operations Suite
                  </h1>
                  <span className="steel-pill hidden sm:inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20 font-tech">
                    Tenant: {clientId}
                  </span>
                </div>
                <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                  Live PM2 telemetry, isolated self-service process controls, AI root-cause diagnostics, and real-time logs
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setAutoRefresh((prev) => !prev)}
                className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border text-xs font-tech font-semibold transition cursor-pointer ${
                  autoRefresh
                    ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-600 dark:text-emerald-400"
                    : "bg-zinc-100 dark:bg-zinc-800 border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300"
                }`}
              >
                <span
                  className={`w-2 h-2 rounded-full ${
                    autoRefresh ? "bg-emerald-500 animate-ping" : "bg-zinc-400"
                  }`}
                />
                <span>Auto-Refresh {autoRefresh ? "ON (15s)" : "OFF"}</span>
              </button>

              <button
                type="button"
                onClick={() => void loadStats()}
                disabled={isLoadingStats}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-xs font-tech font-semibold transition cursor-pointer"
              >
                {isLoadingStats ? (
                  <IosSpinner size="xs" className="text-blue-500" />
                ) : (
                  <RefreshCw className="w-3.5 h-3.5 text-blue-500" />
                )}
                <span>Refresh Telemetry</span>
              </button>
            </div>
          </div>

          {/* 5-Card Top Telemetry Strip */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 pt-3 border-t border-zinc-100 dark:border-zinc-800/80">
            <div className="p-3.5 rounded-xl bg-zinc-50/80 dark:bg-zinc-950/60 border border-zinc-200/70 dark:border-zinc-800/80 flex items-center justify-between">
              <div>
                <span className="steel-metric-label text-zinc-400 block text-[10px]">
                  Total Processes
                </span>
                <span className="text-lg font-extrabold font-tech tabular-nums text-zinc-900 dark:text-white mt-0.5 block">
                  {fleetTelemetry.total}
                </span>
              </div>
              <div className="w-8 h-8 rounded-lg bg-blue-500/10 text-blue-500 flex items-center justify-center">
                <Server className="w-4 h-4" />
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-zinc-50/80 dark:bg-zinc-950/60 border border-zinc-200/70 dark:border-zinc-800/80 flex items-center justify-between">
              <div>
                <span className="steel-metric-label text-zinc-400 block text-[10px]">
                  Online &amp; Stable
                </span>
                <span className="text-lg font-extrabold font-tech tabular-nums text-emerald-600 dark:text-emerald-400 mt-0.5 block">
                  {fleetTelemetry.onlineStableCount}
                </span>
              </div>
              <div className="w-8 h-8 rounded-lg bg-emerald-500/10 text-emerald-500 flex items-center justify-center">
                <CheckCircle2 className="w-4 h-4" />
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-zinc-50/80 dark:bg-zinc-950/60 border border-zinc-200/70 dark:border-zinc-800/80 flex items-center justify-between">
              <div>
                <span className="steel-metric-label text-zinc-400 block text-[10px]">
                  Crashing / Down
                </span>
                <span
                  className={`text-lg font-extrabold font-tech tabular-nums mt-0.5 block ${
                    fleetTelemetry.crashingCount > 0
                      ? "text-rose-500"
                      : "text-zinc-900 dark:text-white"
                  }`}
                >
                  {fleetTelemetry.crashingCount}
                </span>
              </div>
              <div className="w-8 h-8 rounded-lg bg-rose-500/10 text-rose-500 flex items-center justify-center">
                <AlertTriangle className="w-4 h-4" />
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-zinc-50/80 dark:bg-zinc-950/60 border border-zinc-200/70 dark:border-zinc-800/80 flex items-center justify-between">
              <div>
                <span className="steel-metric-label text-zinc-400 block text-[10px]">
                  Aggregate CPU Load
                </span>
                <span className="text-lg font-extrabold font-tech tabular-nums text-blue-600 dark:text-blue-400 mt-0.5 block">
                  {fleetTelemetry.aggregateCpu}%
                </span>
              </div>
              <div className="w-8 h-8 rounded-lg bg-blue-500/10 text-blue-500 flex items-center justify-center">
                <Cpu className="w-4 h-4" />
              </div>
            </div>

            <div className="col-span-2 sm:col-span-1 p-3.5 rounded-xl bg-zinc-50/80 dark:bg-zinc-950/60 border border-zinc-200/70 dark:border-zinc-800/80 flex items-center justify-between">
              <div>
                <span className="steel-metric-label text-zinc-400 block text-[10px]">
                  Aggregate RAM Usage
                </span>
                <span className="text-lg font-extrabold font-tech tabular-nums text-indigo-600 dark:text-indigo-400 mt-0.5 block">
                  {fleetTelemetry.aggregateRamMb} MB
                </span>
              </div>
              <div className="w-8 h-8 rounded-lg bg-indigo-500/10 text-indigo-500 flex items-center justify-center">
                <HardDrive className="w-4 h-4" />
              </div>
            </div>
          </div>
        </div>

        {/* Security Isolation Notice */}
        <div className="p-4 rounded-xl bg-blue-50/60 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900 text-xs text-blue-900 dark:text-blue-300 flex items-start gap-3">
          <ShieldAlert className="w-5 h-5 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
          <div>
            <span className="font-semibold">Scoped Multi-Tenant Isolation:</span> You can only
            access, diagnose, and restart processes explicitly mapped to your organization. SSH
            command templates are strictly allowlisted to prevent unauthorized shell access.
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
                          <h3 className="font-steel font-bold text-sm text-zinc-900 dark:text-white">
                            {srv.serverName}
                          </h3>
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
                      <div className="font-tech font-bold text-xs text-zinc-800 dark:text-zinc-200">
                        {srv.uptimeFormatted}
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    {/* CPU */}
                    <div className="p-4 rounded-xl bg-zinc-50 dark:bg-zinc-950/80 border border-zinc-200 dark:border-zinc-800 shadow-xs flex flex-col justify-between space-y-3">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-xs font-semibold uppercase tracking-wider font-tech text-zinc-400 flex items-center gap-1.5">
                          <Cpu className="w-4 h-4 text-blue-500" /> CPU Usage
                        </span>
                        <span className="font-tech text-zinc-400 font-medium">
                          {srv.cpuCores} Cores
                        </span>
                      </div>
                      <div>
                        <div className="text-3xl font-extrabold font-tech tabular-nums tracking-tight text-zinc-900 dark:text-zinc-50">
                          {srv.cpuUsagePercent}%
                        </div>
                        <div className="w-full bg-zinc-200 dark:bg-zinc-800/80 h-2 rounded-full overflow-hidden mt-2 border border-zinc-200/50 dark:border-zinc-700/40">
                          <div
                            className={`h-full transition-all duration-500 ${
                              srv.cpuUsagePercent > 85
                                ? "bg-rose-500"
                                : srv.cpuUsagePercent > 70
                                ? "bg-amber-500"
                                : "bg-blue-600 dark:bg-blue-500"
                            }`}
                            style={{ width: `${Math.min(100, Math.max(2, srv.cpuUsagePercent))}%` }}
                          />
                        </div>
                      </div>
                      <div className="pt-2.5 border-t border-zinc-200/60 dark:border-zinc-800/80 text-[11px] font-tech text-zinc-500 dark:text-zinc-400 space-y-1">
                        <div>
                          Load:{" "}
                          <span className="tabular-nums font-semibold text-zinc-800 dark:text-zinc-200">
                            {srv.load1.toFixed(2)} · {srv.load5.toFixed(2)} ·{" "}
                            {srv.load15.toFixed(2)}
                          </span>
                        </div>
                        <div>
                          Threads:{" "}
                          <span className="tabular-nums font-semibold text-zinc-800 dark:text-zinc-200">
                            {srv.activeThreads} active / {srv.totalThreads}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* RAM */}
                    <div className="p-4 rounded-xl bg-zinc-50 dark:bg-zinc-950/80 border border-zinc-200 dark:border-zinc-800 shadow-xs flex flex-col justify-between space-y-3">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-xs font-semibold uppercase tracking-wider font-tech text-zinc-400 flex items-center gap-1.5">
                          <Layers className="w-4 h-4 text-indigo-400" /> RAM Memory
                        </span>
                        <span className="font-tech text-zinc-400 font-medium">
                          {(srv.memoryTotalMb / 1024).toFixed(1)} GB Total
                        </span>
                      </div>
                      <div>
                        <div className="text-3xl font-extrabold font-tech tabular-nums tracking-tight text-zinc-900 dark:text-zinc-50">
                          {srv.memoryUsagePercent}%
                        </div>
                        <div className="w-full bg-zinc-200 dark:bg-zinc-800/80 h-2 rounded-full overflow-hidden mt-2 border border-zinc-200/50 dark:border-zinc-700/40">
                          <div
                            className={`h-full transition-all duration-500 ${
                              srv.memoryUsagePercent > 90
                                ? "bg-rose-500"
                                : srv.memoryUsagePercent > 75
                                ? "bg-amber-500"
                                : "bg-blue-600 dark:bg-blue-500"
                            }`}
                            style={{
                              width: `${Math.min(100, Math.max(2, srv.memoryUsagePercent))}%`,
                            }}
                          />
                        </div>
                      </div>
                      <div className="pt-2.5 border-t border-zinc-200/60 dark:border-zinc-800/80 text-[11px] font-tech text-zinc-500 dark:text-zinc-400 space-y-1">
                        <div>
                          Used:{" "}
                          <span className="tabular-nums font-semibold text-zinc-800 dark:text-zinc-200">
                            {(srv.memoryUsedMb / 1024).toFixed(2)} GB
                          </span>
                        </div>
                        <div>
                          Avail:{" "}
                          <span className="tabular-nums font-semibold text-zinc-800 dark:text-zinc-200">
                            {(srv.memoryAvailableMb / 1024).toFixed(2)} GB
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Disk */}
                    <div className="p-4 rounded-xl bg-zinc-50 dark:bg-zinc-950/80 border border-zinc-200 dark:border-zinc-800 shadow-xs flex flex-col justify-between space-y-3">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-xs font-semibold uppercase tracking-wider font-tech text-zinc-400 flex items-center gap-1.5">
                          <HardDrive className="w-4 h-4 text-amber-500" /> Storage (
                          {srv.diskMount || "/"})
                        </span>
                        <span className="font-tech text-zinc-400 font-medium">
                          {srv.diskTotalGb.toFixed(0)} GB
                        </span>
                      </div>
                      <div>
                        <div className="text-3xl font-extrabold font-tech tabular-nums tracking-tight text-zinc-900 dark:text-zinc-50">
                          {srv.diskUsagePercent}%
                        </div>
                        <div className="w-full bg-zinc-200 dark:bg-zinc-800/80 h-2 rounded-full overflow-hidden mt-2 border border-zinc-200/50 dark:border-zinc-700/40">
                          <div
                            className={`h-full transition-all duration-500 ${
                              srv.diskUsagePercent > 90
                                ? "bg-rose-500"
                                : srv.diskUsagePercent > 70
                                ? "bg-amber-500"
                                : "bg-blue-600 dark:bg-blue-500"
                            }`}
                            style={{ width: `${Math.min(100, Math.max(2, srv.diskUsagePercent))}%` }}
                          />
                        </div>
                      </div>
                      <div className="pt-2.5 border-t border-zinc-200/60 dark:border-zinc-800/80 text-[11px] font-tech text-zinc-500 dark:text-zinc-400 space-y-1">
                        <div>
                          Used:{" "}
                          <span className="tabular-nums font-semibold text-zinc-800 dark:text-zinc-200">
                            {srv.diskUsedGb.toFixed(1)} GB
                          </span>
                        </div>
                        <div>
                          Free:{" "}
                          <span className="tabular-nums font-semibold text-zinc-800 dark:text-zinc-200">
                            {srv.diskFreeGb.toFixed(1)} GB
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* PM2 */}
                    <div className="p-4 rounded-xl bg-zinc-50 dark:bg-zinc-950/80 border border-zinc-200 dark:border-zinc-800 shadow-xs flex flex-col justify-between space-y-3">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-xs font-semibold uppercase tracking-wider font-tech text-zinc-400 flex items-center gap-1.5">
                          <Gauge className="w-4 h-4 text-emerald-400" /> PM2 Footprint
                        </span>
                        <span className="font-tech text-emerald-500 font-semibold">
                          {srv.pm2OnlineCount} Online
                        </span>
                      </div>
                      <div>
                        <div className="text-3xl font-extrabold font-tech tabular-nums tracking-tight text-zinc-900 dark:text-zinc-50">
                          {srv.pm2TotalMemoryMb}{" "}
                          <span className="text-xs font-normal text-zinc-400">MB</span>
                        </div>
                        <p className="text-[11px] font-tech text-zinc-400 mt-1">
                          Aggregated PM2 memory
                        </p>
                      </div>
                      <div className="pt-2.5 border-t border-zinc-200/60 dark:border-zinc-800/80 text-[11px] font-tech text-zinc-500 dark:text-zinc-400 space-y-1">
                        <div>
                          Total Proc:{" "}
                          <span className="tabular-nums font-semibold text-zinc-800 dark:text-zinc-200">
                            {srv.pm2ProcessCount} registered
                          </span>
                        </div>
                        <div>
                          CPU Footprint:{" "}
                          <span className="tabular-nums font-semibold text-zinc-800 dark:text-zinc-200">
                            {srv.pm2TotalCpuPercent}% total
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* FILTER, SEARCH, SORT & VIEW MODE CONTROLS */}
        <div className="bg-white dark:bg-zinc-900/90 border border-zinc-200 dark:border-zinc-800/90 rounded-2xl p-3.5 shadow-xs flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            {/* Search Input */}
            <div className="relative w-full sm:w-64">
              <Search className="w-3.5 h-3.5 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search process name, server, PM2 ID..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 font-tech"
              />
            </div>

            {/* Status Filter Pills */}
            <div className="flex flex-wrap items-center gap-1">
              {(
                [
                  { id: "all", label: `All (${fleetTelemetry.total})` },
                  { id: "online", label: `Online (${fleetTelemetry.onlineStableCount})` },
                  {
                    id: "crashing_down",
                    label: `Crashing / Down (${fleetTelemetry.crashingCount})`,
                  },
                ] as const
              ).map((pill) => (
                <button
                  key={pill.id}
                  type="button"
                  onClick={() => setStatusFilter(pill.id)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-tech font-semibold transition cursor-pointer ${
                    statusFilter === pill.id
                      ? "bg-blue-600 text-white shadow-xs"
                      : "bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700"
                  }`}
                >
                  {pill.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Sort Selector */}
            <div className="flex items-center gap-1.5 text-xs font-tech">
              <span className="text-zinc-400">Sort:</span>
              <select
                value={sortField}
                onChange={(e) => setSortField(e.target.value as SortField)}
                className="px-2.5 py-1.5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 text-xs font-tech"
              >
                <option value="pm2Id">PM2 ID</option>
                <option value="name">Process Name</option>
                <option value="cpu">CPU Load</option>
                <option value="memory">Memory Usage</option>
                <option value="uptime">Uptime</option>
                <option value="restarts">Deploys / Restarts</option>
              </select>
              <button
                type="button"
                onClick={() => setSortAsc((prev) => !prev)}
                className="p-1.5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition cursor-pointer"
                title={sortAsc ? "Ascending" : "Descending"}
              >
                <ArrowUpDown className="w-3.5 h-3.5 text-zinc-500" />
              </button>
            </div>

            {/* Grid vs Table Toggle */}
            <div className="inline-flex items-center p-1 rounded-xl bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-xs font-tech">
              <button
                type="button"
                onClick={() => setViewMode("grid")}
                className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg font-semibold transition cursor-pointer ${
                  viewMode === "grid"
                    ? "bg-white dark:bg-zinc-900 text-blue-600 dark:text-blue-400 shadow-xs"
                    : "text-zinc-600 dark:text-zinc-400"
                }`}
              >
                <LayoutGrid className="w-3.5 h-3.5" />
                <span>Grid</span>
              </button>
              <button
                type="button"
                onClick={() => setViewMode("table")}
                className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg font-semibold transition cursor-pointer ${
                  viewMode === "table"
                    ? "bg-white dark:bg-zinc-900 text-blue-600 dark:text-blue-400 shadow-xs"
                    : "text-zinc-600 dark:text-zinc-400"
                }`}
              >
                <TableIcon className="w-3.5 h-3.5" />
                <span>Table</span>
              </button>
            </div>
          </div>
        </div>

        {/* PROCESSES DISPLAY */}
        {filteredAndSortedProcesses.length === 0 ? (
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-12 text-center text-zinc-400">
            <Server className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <h3 className="text-base font-bold text-zinc-800 dark:text-zinc-200">
              {processes.length === 0 ? "No Mapped Services Found" : "No Matching Processes"}
            </h3>
            <p className="text-xs text-zinc-500 mt-1 max-w-md mx-auto">
              {processes.length === 0
                ? "Your account currently has no PM2 applications mapped. Please contact RapidShift Labs support to assign your application services."
                : "No processes match your current search or status filter."}
            </p>
          </div>
        ) : viewMode === "grid" ? (
          /* GRID CARDS VIEW */
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredAndSortedProcesses.map((proc) => {
              const cooldown = cooldownTimers[proc.id] || 0;
              const isRestarting = restartingId === proc.id;
              const crashing = isProcessCrashing(proc);

              return (
                <div
                  key={proc.id}
                  className={`bg-white dark:bg-zinc-900 border rounded-2xl p-6 shadow-xs flex flex-col justify-between space-y-5 transition-all ${
                    crashing
                      ? "border-rose-500/60 dark:border-rose-500/50 ring-1 ring-rose-500/20"
                      : "border-zinc-200 dark:border-zinc-800"
                  }`}
                >
                  <div className="space-y-4">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <h3 className="font-bold text-base text-zinc-900 dark:text-zinc-100">
                          {proc.name}
                        </h3>
                        <p className="text-xs text-zinc-500 font-mono mt-0.5">
                          {proc.serverName} • pm2_id: {proc.pm2Id}
                        </p>
                      </div>

                      <div className="flex items-center gap-1.5">
                        {crashing && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-500/15 text-rose-500 border border-rose-500/30 font-tech">
                            <AlertTriangle className="w-3 h-3" /> Crash Loop
                          </span>
                        )}
                        <span
                          className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold font-tech ${
                            proc.status === "online" && !crashing
                              ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20"
                              : "bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20"
                          }`}
                        >
                          <span
                            className={`w-1.5 h-1.5 rounded-full ${
                              proc.status === "online" && !crashing
                                ? "bg-emerald-500"
                                : "bg-rose-500"
                            }`}
                          />
                          {proc.status}
                        </span>
                      </div>
                    </div>

                    {/* Telemetry Metrics */}
                    <div className="grid grid-cols-2 gap-3 pt-3 border-t border-zinc-100 dark:border-zinc-800/80">
                      <div className="p-3 rounded-xl bg-zinc-50 dark:bg-zinc-800/50">
                        <div className="flex items-center gap-1.5 text-zinc-400 text-[11px]">
                          <Cpu className="w-3.5 h-3.5" />
                          <span>CPU Load</span>
                        </div>
                        <div className="text-sm font-bold text-zinc-900 dark:text-zinc-100 mt-1 font-tech tabular-nums">
                          {proc.cpu}%
                        </div>
                      </div>

                      <div className="p-3 rounded-xl bg-zinc-50 dark:bg-zinc-800/50">
                        <div className="flex items-center gap-1.5 text-zinc-400 text-[11px]">
                          <HardDrive className="w-3.5 h-3.5" />
                          <span>Memory</span>
                        </div>
                        <div className="text-sm font-bold text-zinc-900 dark:text-zinc-100 mt-1 font-tech tabular-nums">
                          {(proc.memory / 1024 / 1024).toFixed(1)} MB
                        </div>
                      </div>

                      <div className="p-3 rounded-xl bg-zinc-50 dark:bg-zinc-800/50">
                        <div className="flex items-center gap-1.5 text-zinc-400 text-[11px]">
                          <Clock className="w-3.5 h-3.5" />
                          <span>Uptime</span>
                        </div>
                        <div className="text-sm font-bold text-zinc-900 dark:text-zinc-100 mt-1 font-tech tabular-nums">
                          {formatUptime(proc.uptimeMs, proc.status)}
                        </div>
                      </div>

                      <div
                        className="p-3 rounded-xl bg-zinc-50 dark:bg-zinc-800/50"
                        title="Cumulative restarts reflect routine project deployments and updates across the process lifecycle."
                      >
                        <div className="flex items-center gap-1 text-zinc-400 text-[11px]">
                          <RotateCw className="w-3.5 h-3.5" />
                          <span>Lifecycle</span>
                          <Info className="w-3 h-3 opacity-60" />
                        </div>
                        <div
                          className={`text-xs font-bold mt-1 font-mono ${
                            crashing
                              ? "text-rose-500"
                              : "text-zinc-700 dark:text-zinc-300"
                          }`}
                        >
                          {proc.restarts} deploys / restarts
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Action Buttons */}
                  <div className="pt-4 border-t border-zinc-100 dark:border-zinc-800 flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => void handleRestart(proc)}
                      disabled={!proc.allowClientRestart || isRestarting || cooldown > 0}
                      className={`flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-xl transition cursor-pointer ${
                        !proc.allowClientRestart
                          ? "bg-zinc-100 dark:bg-zinc-800 text-zinc-400 cursor-not-allowed"
                          : cooldown > 0
                          ? "bg-zinc-100 dark:bg-zinc-800 text-zinc-500 cursor-not-allowed"
                          : "bg-blue-600 hover:bg-blue-500 text-white shadow-xs"
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
                      <span>
                        {isRestarting
                          ? "Restarting..."
                          : cooldown > 0
                          ? `Wait ${cooldown}s`
                          : "Restart"}
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={() => void runDiagnostics(proc, false)}
                      className="inline-flex items-center justify-center gap-1.5 px-3 py-2 border border-indigo-500/30 bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-600 dark:text-indigo-300 text-xs font-semibold rounded-xl transition cursor-pointer"
                      title="Run AI Root-Cause Diagnostics & Self-Healing"
                    >
                      <Stethoscope className="w-3.5 h-3.5" />
                      <span>Diagnose</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => void fetchLogs(proc, logLines)}
                      className="inline-flex items-center justify-center gap-1.5 px-3 py-2 border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-700 text-xs font-semibold rounded-xl transition cursor-pointer"
                    >
                      <Terminal className="w-3.5 h-3.5 text-zinc-500" />
                      <span>Logs</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          /* COMPACT TECHNICAL TABLE VIEW */
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl overflow-hidden shadow-xs">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-zinc-50 dark:bg-zinc-800/40 text-zinc-500 border-b border-zinc-200 dark:border-zinc-800">
                  <tr>
                    <th className="steel-metric-label px-5 py-3.5">PM2 ID / Process</th>
                    <th className="steel-metric-label px-5 py-3.5">Server Host</th>
                    <th className="steel-metric-label px-5 py-3.5">Status</th>
                    <th className="steel-metric-label px-5 py-3.5">CPU / Memory</th>
                    <th className="steel-metric-label px-5 py-3.5">Uptime</th>
                    <th className="steel-metric-label px-5 py-3.5">Deploys / Restarts</th>
                    <th className="steel-metric-label px-5 py-3.5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800 font-tech">
                  {filteredAndSortedProcesses.map((proc) => {
                    const crashing = isProcessCrashing(proc);
                    const cooldown = cooldownTimers[proc.id] || 0;
                    const isRestarting = restartingId === proc.id;

                    return (
                      <tr
                        key={proc.id}
                        className="hover:bg-zinc-50/80 dark:hover:bg-zinc-800/30 transition"
                      >
                        <td className="px-5 py-4">
                          <div className="font-bold text-zinc-900 dark:text-white">
                            {proc.name}
                          </div>
                          <div className="text-[11px] text-zinc-400">pm2_id: {proc.pm2Id}</div>
                        </td>
                        <td className="px-5 py-4 text-zinc-600 dark:text-zinc-300">
                          {proc.serverName}
                        </td>
                        <td className="px-5 py-4">
                          <span
                            className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold ${
                              proc.status === "online" && !crashing
                                ? "bg-emerald-500/10 text-emerald-500 border border-emerald-500/20"
                                : "bg-rose-500/10 text-rose-500 border border-rose-500/20"
                            }`}
                          >
                            <span
                              className={`w-1.5 h-1.5 rounded-full ${
                                proc.status === "online" && !crashing
                                  ? "bg-emerald-500"
                                  : "bg-rose-500"
                              }`}
                            />
                            {crashing ? "crash-loop" : proc.status}
                          </span>
                        </td>
                        <td className="px-5 py-4 tabular-nums">
                          <span className="font-semibold text-zinc-900 dark:text-white">
                            {proc.cpu}%
                          </span>{" "}
                          <span className="text-zinc-400">·</span>{" "}
                          <span className="text-zinc-600 dark:text-zinc-300">
                            {(proc.memory / 1024 / 1024).toFixed(1)} MB
                          </span>
                        </td>
                        <td className="px-5 py-4 tabular-nums">
                          {formatUptime(proc.uptimeMs, proc.status)}
                        </td>
                        <td
                          className="px-5 py-4"
                          title="Cumulative restarts reflect routine deployments and updates."
                        >
                          <span
                            className={
                              crashing
                                ? "text-rose-500 font-bold"
                                : "text-zinc-600 dark:text-zinc-400"
                            }
                          >
                            {proc.restarts} deploys / restarts
                          </span>
                        </td>
                        <td className="px-5 py-4 text-right">
                          <div className="inline-flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => void handleRestart(proc)}
                              disabled={!proc.allowClientRestart || isRestarting || cooldown > 0}
                              className="px-2.5 py-1 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:bg-zinc-200 dark:disabled:bg-zinc-800 text-white disabled:text-zinc-400 text-xs font-semibold transition cursor-pointer"
                            >
                              {isRestarting
                                ? "..."
                                : cooldown > 0
                                ? `${cooldown}s`
                                : "Restart"}
                            </button>
                            <button
                              type="button"
                              onClick={() => void runDiagnostics(proc, false)}
                              className="px-2.5 py-1 rounded-lg bg-indigo-500/10 text-indigo-500 hover:bg-indigo-500/20 text-xs font-semibold transition cursor-pointer"
                            >
                              Diagnose
                            </button>
                            <button
                              type="button"
                              onClick={() => void fetchLogs(proc, logLines)}
                              className="px-2.5 py-1 rounded-lg border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-xs font-semibold transition cursor-pointer"
                            >
                              Logs
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>

      {/* ENHANCED LIVE LOG VIEWER MODAL */}
      {activeLogProcess && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-zinc-950 border border-zinc-800 rounded-2xl max-w-4xl w-full p-6 shadow-2xl space-y-4 text-zinc-100 flex flex-col max-h-[88vh]">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-zinc-800 pb-3">
              <div className="flex items-center gap-2.5">
                <Terminal className="w-5 h-5 text-blue-400 shrink-0" />
                <div>
                  <h3 className="font-bold text-sm">
                    Live Execution Logs: {activeLogProcess.name} (pm2_id:{" "}
                    {activeLogProcess.pm2Id})
                  </h3>
                  <p className="text-[11px] text-zinc-400 font-mono">
                    Host: {activeLogProcess.serverName} • Showing {displayedLogLines.length} line(s)
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {/* Line Count Selector (50, 100, 250, 500) */}
                <select
                  value={logLines}
                  onChange={(e) => {
                    const l = Number(e.target.value);
                    setLogLines(l);
                    void fetchLogs(activeLogProcess, l);
                  }}
                  className="px-2.5 py-1.5 bg-zinc-900 border border-zinc-800 rounded-lg text-xs text-zinc-300 focus:outline-none font-tech"
                >
                  <option value={50}>50 lines</option>
                  <option value={100}>100 lines</option>
                  <option value={250}>250 lines</option>
                  <option value={500}>500 lines</option>
                </select>

                <button
                  type="button"
                  onClick={handleCopyLogs}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 rounded-lg text-xs text-zinc-300 transition cursor-pointer font-tech"
                >
                  {copiedLogs ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-400" /> Copied
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" /> Copy
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={handleDownloadLogs}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 rounded-lg text-xs text-zinc-300 transition cursor-pointer font-tech"
                >
                  <Download className="w-3.5 h-3.5" /> .log
                </button>

                <button
                  type="button"
                  onClick={() => void fetchLogs(activeLogProcess, logLines)}
                  className="p-1.5 hover:bg-zinc-800 rounded-lg transition text-zinc-400 hover:text-zinc-200 cursor-pointer"
                  title="Refresh Logs"
                >
                  {isLoadingLogs ? (
                    <IosSpinner size="sm" className="text-zinc-400" />
                  ) : (
                    <RefreshCw className="w-4 h-4" />
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => setActiveLogProcess(null)}
                  className="p-1.5 hover:bg-zinc-800 rounded-lg transition text-zinc-400 hover:text-zinc-200 cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Keyword Filter Input */}
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Filter log output by keyword (e.g. ERROR, WARN, ECONNREFUSED, port)..."
                value={logSearchQuery}
                onChange={(e) => setLogSearchQuery(e.target.value)}
                className="w-full pl-9 pr-4 py-1.5 bg-zinc-900/90 border border-zinc-800 rounded-xl text-xs text-zinc-200 focus:outline-none focus:ring-1 focus:ring-blue-500 font-mono"
              />
            </div>

            {/* Severity Highlighted Terminal Body */}
            <div className="flex-1 overflow-y-auto bg-black/90 rounded-xl p-4 font-mono text-xs border border-zinc-900 leading-relaxed space-y-1 select-text">
              {isLoadingLogs ? (
                <div className="text-zinc-500 py-8 text-center animate-pulse">
                  Streaming logs from remote host over SSH...
                </div>
              ) : displayedLogLines.length === 0 ? (
                <div className="text-zinc-500 py-6 text-center">
                  No log lines match your filter.
                </div>
              ) : (
                displayedLogLines.map((line, idx) => (
                  <div key={idx} className={`whitespace-pre-wrap break-all ${getLogLineStyle(line)}`}>
                    {line}
                  </div>
                ))
              )}
            </div>

            <div className="pt-2 border-t border-zinc-800/60 flex items-center justify-between text-[11px] text-zinc-500 font-mono">
              <span>Sanitized query: pm2 logs --nostream --lines {logLines}</span>
              <button
                type="button"
                onClick={() => setActiveLogProcess(null)}
                className="px-3 py-1 bg-zinc-800 hover:bg-zinc-700 rounded-lg text-xs text-zinc-200 transition cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* AI DIAGNOSTICS & SELF-HEALING DRAWER */}
      {activeDiagProcess && (
        <div
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-end"
          onClick={() => setActiveDiagProcess(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-white dark:bg-zinc-900 border-l border-zinc-200 dark:border-zinc-800 w-full max-w-lg h-full overflow-y-auto p-6 shadow-2xl flex flex-col justify-between space-y-6"
          >
            <div className="space-y-5">
              {/* Drawer Header */}
              <div className="flex items-start justify-between gap-4 pb-4 border-b border-zinc-200 dark:border-zinc-800">
                <div className="flex items-center gap-2.5">
                  <div className="w-10 h-10 rounded-xl bg-indigo-500/10 text-indigo-500 flex items-center justify-center border border-indigo-500/20">
                    <Sparkles className="w-5 h-5" />
                  </div>
                  <div>
                    <h2 className="text-base font-bold steel-heading text-zinc-900 dark:text-white">
                      AI Root-Cause Diagnostics
                    </h2>
                    <p className="text-xs font-mono text-zinc-500">
                      {activeDiagProcess.name} (pm2_id: {activeDiagProcess.pm2Id})
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveDiagProcess(null)}
                  className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {isRunningDiag ? (
                <div className="p-10 text-center space-y-3">
                  <IosSpinner size="md" className="text-indigo-500 mx-auto" />
                  <div className="text-sm font-bold text-zinc-800 dark:text-zinc-200 font-tech">
                    Analyzing Process Telemetry &amp; Stderr Tail...
                  </div>
                  <p className="text-xs text-zinc-500">
                    Inspecting exit codes, memory footprint, and log signatures over SSH.
                  </p>
                </div>
              ) : diagResult ? (
                <div className="space-y-4">
                  {/* Severity & Root-Cause Category Header */}
                  <div className="p-4 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50/70 dark:bg-zinc-950/60 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <span
                        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-tech font-bold ${
                          diagResult.diagnostic.severity === "HEALTHY"
                            ? "bg-emerald-500/15 text-emerald-500 border border-emerald-500/30"
                            : diagResult.diagnostic.severity === "WARNING"
                            ? "bg-amber-500/15 text-amber-500 border border-amber-500/30"
                            : "bg-rose-500/15 text-rose-500 border border-rose-500/30"
                        }`}
                      >
                        {diagResult.diagnostic.severity}
                      </span>
                      <span className="text-xs font-mono px-2.5 py-0.5 rounded bg-zinc-200/70 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300">
                        Category: {diagResult.diagnostic.category}
                      </span>
                    </div>
                    <h3 className="text-sm font-bold text-zinc-900 dark:text-white pt-1">
                      {diagResult.diagnostic.title}
                    </h3>
                    <p className="text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed">
                      {diagResult.diagnostic.summary}
                    </p>
                  </div>

                  {/* Extracted Error Signature */}
                  {diagResult.diagnostic.extractedError && (
                    <div className="space-y-1.5">
                      <span className="text-[11px] font-bold uppercase tracking-wider font-tech text-rose-500">
                        Extracted Error Signature
                      </span>
                      <pre className="p-3.5 rounded-xl bg-zinc-950 text-rose-300 border border-rose-900/50 font-mono text-xs overflow-x-auto whitespace-pre-wrap">
                        {diagResult.diagnostic.extractedError}
                      </pre>
                    </div>
                  )}

                  {/* Recommendation */}
                  <div className="p-4 rounded-2xl bg-indigo-50/60 dark:bg-indigo-950/30 border border-indigo-200/80 dark:border-indigo-900/60 space-y-1.5">
                    <span className="text-[11px] font-bold uppercase tracking-wider font-tech text-indigo-600 dark:text-indigo-400">
                      Recommended Remediation
                    </span>
                    <p className="text-xs text-zinc-700 dark:text-zinc-300 leading-relaxed">
                      {diagResult.diagnostic.recommendation}
                    </p>
                  </div>

                  {/* One-Click Auto-Heal Restart Button */}
                  <div className="p-4 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-950/50 flex items-center justify-between gap-3">
                    <div className="text-xs">
                      <div className="font-bold text-zinc-900 dark:text-white">
                        Autonomous Self-Healing Restart
                      </div>
                      <div className="text-zinc-500 mt-0.5">
                        Executes verified PM2 recovery and opens a support ticket if recovery fails.
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => void runDiagnostics(activeDiagProcess, true)}
                      disabled={isAutoHealing || !activeDiagProcess.allowClientRestart}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-tech font-semibold transition cursor-pointer shrink-0 shadow-xs"
                    >
                      {isAutoHealing ? (
                        <IosSpinner size="xs" className="text-white" />
                      ) : (
                        <RotateCw className="w-3.5 h-3.5" />
                      )}
                      <span>
                        {isAutoHealing ? "Healing..." : "Run Auto-Heal Restart"}
                      </span>
                    </button>
                  </div>

                  {diagResult.healAttempted && (
                    <div
                      className={`p-3 rounded-xl text-xs font-tech border ${
                        diagResult.healSuccess
                          ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-600 dark:text-emerald-400"
                          : "bg-rose-500/10 border-rose-500/30 text-rose-600 dark:text-rose-400"
                      }`}
                    >
                      {diagResult.healMessage}
                    </div>
                  )}
                </div>
              ) : null}
            </div>

            <div className="pt-4 border-t border-zinc-200 dark:border-zinc-800 flex justify-end">
              <button
                type="button"
                onClick={() => setActiveDiagProcess(null)}
                className="px-4 py-2 rounded-xl bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-xs font-tech font-semibold transition cursor-pointer"
              >
                Close Diagnostics
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

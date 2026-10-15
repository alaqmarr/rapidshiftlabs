"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import {
  Server as ServerIcon,
  Plus,
  RefreshCw,
  Trash2,
  Cpu,
  HardDrive,
  Clock,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Link as LinkIcon,
  X,
  Play,
  Activity,
  Shield,
  Zap,
  Gauge,
  Layers,
  Terminal,
  Search,
  Copy,
  Check,
  Download,
  SlidersHorizontal,
  Stethoscope,
  Sparkles,
  ArrowUpDown,
  Users,
  RotateCw,
  Filter,
  ChevronRight,
} from "lucide-react";
import { useAlert } from "@/components/ui/alert-popup";
import { IosSpinner } from "@/components/ui/ios-spinner";

export interface SerializedProcess {
  id: string;
  serverId: string;
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

export interface ServerStatsData {
  serverId: string;
  serverName: string;
  host: string;
  port: number;
  username: string;
  status: string;
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
  recentMetrics?: Array<{
    cpuPercent: number;
    memoryUsedMb: number;
    timestamp: number;
  }>;
}

export interface SerializedServer {
  id: string;
  name: string;
  host: string;
  port: number;
  username: string;
  hostFingerprint: string | null;
  status: "online" | "offline" | "unreachable" | "degraded" | "pending";
  lastCheckedAt: number | null;
  errorMessage: string | null;
  createdAt: number;
  processes: SerializedProcess[];
}

export interface ClientOption {
  id: string;
  name: string;
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

interface ServerManagerProps {
  initialServers: SerializedServer[];
  clients: ClientOption[];
}

type ProcessFilterTab = "all" | "online" | "stopped" | "unstable" | "mapped" | "unassigned";
type ProcessSortKey = "pm2Id" | "name" | "status" | "memory" | "cpu" | "restarts" | "uptime";

function formatProcessUptime(uptimeMs: number, status: string): string {
  if (status !== "online" || !uptimeMs || uptimeMs <= 0) return "—";
  const totalSec = Math.floor(uptimeMs / 1000);
  if (totalSec < 60) return `${totalSec}s`;
  const days = Math.floor(totalSec / 86400);
  const hours = Math.floor((totalSec % 86400) / 3600);
  const mins = Math.floor((totalSec % 3600) / 60);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}

function MiniSparkline({
  values,
  colorClass = "stroke-blue-500",
}: {
  values: number[];
  colorClass?: string;
}) {
  if (!values || values.length < 2) return null;
  const max = Math.max(100, ...values);
  const min = 0;
  const width = 96;
  const height = 24;
  const points = values
    .map((v, i) => {
      const x = (i / (values.length - 1)) * width;
      const y = height - ((Math.min(max, Math.max(min, v)) - min) / (max - min || 1)) * (height - 4) - 2;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  return (
    <svg width={width} height={height} className="overflow-visible shrink-0 opacity-85">
      <polyline
        fill="none"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={colorClass}
        points={points}
      />
    </svg>
  );
}

export function ServerManager({ initialServers, clients }: ServerManagerProps) {
  const { showSuccess, showError } = useAlert();
  const [servers, setServers] = useState<SerializedServer[]>(initialServers);
  const [selectedServerId, setSelectedServerId] = useState<string | null>(
    initialServers[0]?.id ?? null
  );
  const [serverSearch, setServerSearch] = useState("");
  const [serverStats, setServerStats] = useState<Record<string, ServerStatsData>>({});
  const [loadingStatsId, setLoadingStatsId] = useState<string | null>(null);
  const [discoveringId, setDiscoveringId] = useState<string | null>(null);
  const [isSyncingAll, setIsSyncingAll] = useState(false);
  const [autoPollEnabled, setAutoPollEnabled] = useState(false);
  const [copiedText, setCopiedText] = useState<string | null>(null);

  // Process Filter, Search, Sort & Bulk Selection
  const [processFilter, setProcessFilter] = useState<ProcessFilterTab>("all");
  const [processSearch, setProcessSearch] = useState("");
  const [tenantFilter, setTenantFilter] = useState<string>("all");
  const [sortKey, setSortKey] = useState<ProcessSortKey>("pm2Id");
  const [sortAsc, setSortAsc] = useState<boolean>(true);
  const [selectedProcessIds, setSelectedProcessIds] = useState<string[]>([]);

  // Per-process action loading states
  const [restartingProcIds, setRestartingProcIds] = useState<Record<string, boolean>>({});
  const [isBulkRestarting, setIsBulkRestarting] = useState(false);

  // Modals & Drawers
  const [isRegisterOpen, setIsRegisterOpen] = useState(false);
  const [isMappingOpen, setIsMappingOpen] = useState(false);
  const [mappingProcess, setMappingProcess] = useState<SerializedProcess | null>(null);
  const [isBulkMappingOpen, setIsBulkMappingOpen] = useState(false);

  // Live Logs Drawer State
  const [logsTarget, setLogsTarget] = useState<SerializedProcess | null>(null);
  const [logsContent, setLogsContent] = useState<string>("");
  const [logsLines, setLogsLines] = useState<number>(100);
  const [logsSearch, setLogsSearch] = useState<string>("");
  const [isLoadingLogs, setIsLoadingLogs] = useState<boolean>(false);
  const [autoRefreshLogs, setAutoRefreshLogs] = useState<boolean>(false);

  // Smart Diagnostics Drawer State
  const [diagTarget, setDiagTarget] = useState<SerializedProcess | null>(null);
  const [diagReport, setDiagReport] = useState<DiagnosticResultPayload | null>(null);
  const [isDiagnosing, setIsDiagnosing] = useState<boolean>(false);
  const [isHealing, setIsHealing] = useState<boolean>(false);

  // Register Form State
  const [formName, setFormName] = useState("");
  const [formHost, setFormHost] = useState("");
  const [formPort, setFormPort] = useState("22");
  const [formUsername, setFormUsername] = useState("ubuntu");
  const [formPrivateKey, setFormPrivateKey] = useState("");
  const [formPassphrase, setFormPassphrase] = useState("");
  const [formFingerprint, setFormFingerprint] = useState("");
  const [formError, setFormError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Mapping Form State
  const [mapClientId, setMapClientId] = useState<string>("");
  const [mapAllowRestart, setMapAllowRestart] = useState(true);
  const [mapCooldown, setMapCooldown] = useState("60");
  const [isSavingMap, setIsSavingMap] = useState(false);

  const selectedServer = useMemo(
    () => servers.find((s) => s.id === selectedServerId) ?? null,
    [servers, selectedServerId]
  );
  const selectedStats = selectedServerId ? serverStats[selectedServerId] : null;

  // Clear bulk selection when switching servers
  useEffect(() => {
    setSelectedProcessIds([]);
  }, [selectedServerId]);

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopiedText(label);
    setTimeout(() => setCopiedText(null), 1800);
  };

  const fetchStats = useCallback(async (serverId: string, force = false) => {
    if (!serverId) return;
    setLoadingStatsId(serverId);
    try {
      const res = await fetch(`/api/v1/admin/servers/${serverId}/stats`, {
        method: force ? "POST" : "GET",
      });
      if (res.ok) {
        const data = await res.json();
        if (data.stats) {
          setServerStats((prev) => ({ ...prev, [serverId]: data.stats }));
        }
      }
    } catch (err) {
      console.error("Failed to load server stats:", err);
    } finally {
      setLoadingStatsId((prev) => (prev === serverId ? null : prev));
    }
  }, []);

  // Load initial stats for all servers in background so left rail cards show live bars
  useEffect(() => {
    servers.forEach((srv) => {
      if (!serverStats[srv.id]) {
        fetch(`/api/v1/admin/servers/${srv.id}/stats`)
          .then((res) => (res.ok ? res.json() : null))
          .then((data) => {
            if (data?.stats) {
              setServerStats((prev) => ({ ...prev, [srv.id]: data.stats }));
            }
          })
          .catch(() => {});
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [servers.length]);

  // Auto-poll live stats when toggled on
  useEffect(() => {
    if (!autoPollEnabled || !selectedServerId) return;
    const interval = setInterval(() => {
      void fetchStats(selectedServerId, true);
    }, 30_000);
    return () => clearInterval(interval);
  }, [autoPollEnabled, selectedServerId, fetchStats]);

  // Auto-refresh logs when drawer is open and live tail is enabled
  const fetchProcessLogs = useCallback(
    async (proc: SerializedProcess, linesCount: number) => {
      setIsLoadingLogs(true);
      try {
        const res = await fetch(
          `/api/v1/admin/servers/processes/${proc.id}/logs?lines=${linesCount}`
        );
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || "Failed to fetch process logs");
        }
        setLogsContent(data.logs || "No log output returned by PM2.");
      } catch (err: any) {
        setLogsContent(`[Error loading logs]: ${err.message}`);
      } finally {
        setIsLoadingLogs(false);
      }
    },
    []
  );

  useEffect(() => {
    if (!logsTarget || !autoRefreshLogs) return;
    const timer = setInterval(() => {
      void fetchProcessLogs(logsTarget, logsLines);
    }, 5000);
    return () => clearInterval(timer);
  }, [logsTarget, autoRefreshLogs, logsLines, fetchProcessLogs]);

  // Global Fleet Summary Metrics
  const fleetSummary = useMemo(() => {
    const totalServers = servers.length;
    const onlineServers = servers.filter((s) => s.status === "online").length;
    const allProcs = servers.flatMap((s) => s.processes);
    const totalProcs = allProcs.length;
    const onlineProcs = allProcs.filter((p) => p.status === "online").length;
    const stoppedProcs = totalProcs - onlineProcs;
    const mappedProcs = allProcs.filter((p) => Boolean(p.clientId)).length;
    const totalMemMb = Math.round(
      allProcs.reduce((acc, p) => acc + (p.memory || 0), 0) / (1024 * 1024)
    );
    return {
      totalServers,
      onlineServers,
      totalProcs,
      onlineProcs,
      stoppedProcs,
      mappedProcs,
      unassignedProcs: totalProcs - mappedProcs,
      totalMemMb,
    };
  }, [servers]);

  // Filtered servers for the left rail
  const filteredServers = useMemo(() => {
    const q = serverSearch.trim().toLowerCase();
    if (!q) return servers;
    return servers.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        s.host.toLowerCase().includes(q) ||
        s.processes.some((p) => p.name.toLowerCase().includes(q))
    );
  }, [servers, serverSearch]);

  // Process counts on the currently selected server
  const serverProcessCounts = useMemo(() => {
    const list = selectedServer?.processes ?? [];
    return {
      all: list.length,
      online: list.filter((p) => p.status === "online").length,
      stopped: list.filter((p) => p.status !== "online").length,
      unstable: list.filter((p) => p.restarts >= 20 || p.status === "errored").length,
      mapped: list.filter((p) => Boolean(p.clientId)).length,
      unassigned: list.filter((p) => !p.clientId).length,
    };
  }, [selectedServer]);

  // Filtered and sorted processes for the selected server
  const displayedProcesses = useMemo(() => {
    if (!selectedServer) return [];
    let list = [...selectedServer.processes];

    if (processFilter === "online") {
      list = list.filter((p) => p.status === "online");
    } else if (processFilter === "stopped") {
      list = list.filter((p) => p.status !== "online");
    } else if (processFilter === "unstable") {
      list = list.filter((p) => p.restarts >= 20 || p.status === "errored");
    } else if (processFilter === "mapped") {
      list = list.filter((p) => Boolean(p.clientId));
    } else if (processFilter === "unassigned") {
      list = list.filter((p) => !p.clientId);
    }

    if (tenantFilter !== "all") {
      if (tenantFilter === "__unassigned__") {
        list = list.filter((p) => !p.clientId);
      } else {
        list = list.filter((p) => p.clientId === tenantFilter);
      }
    }

    const q = processSearch.trim().toLowerCase();
    if (q) {
      list = list.filter((p) => {
        const clientName = clients.find((c) => c.id === p.clientId)?.name?.toLowerCase() ?? "";
        return (
          p.name.toLowerCase().includes(q) ||
          String(p.pm2Id).includes(q) ||
          clientName.includes(q)
        );
      });
    }

    list.sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case "pm2Id":
          cmp = a.pm2Id - b.pm2Id;
          break;
        case "name":
          cmp = a.name.localeCompare(b.name);
          break;
        case "status":
          cmp = a.status.localeCompare(b.status);
          break;
        case "memory":
          cmp = (a.memory || 0) - (b.memory || 0);
          break;
        case "cpu":
          cmp = (a.cpu || 0) - (b.cpu || 0);
          break;
        case "restarts":
          cmp = (a.restarts || 0) - (b.restarts || 0);
          break;
        case "uptime":
          cmp = (a.uptimeMs || 0) - (b.uptimeMs || 0);
          break;
      }
      return sortAsc ? cmp : -cmp;
    });

    return list;
  }, [selectedServer, processFilter, tenantFilter, processSearch, sortKey, sortAsc, clients]);

  const toggleSort = (key: ProcessSortKey) => {
    if (sortKey === key) {
      setSortAsc(!sortAsc);
    } else {
      setSortKey(key);
      setSortAsc(key === "pm2Id" || key === "name");
    }
  };

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    setFormError("");
    setIsSubmitting(true);

    try {
      const res = await fetch("/api/v1/admin/servers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: formName,
          host: formHost,
          port: Number(formPort),
          username: formUsername,
          privateKey: formPrivateKey,
          keyPassphrase: formPassphrase || undefined,
          hostFingerprint: formFingerprint || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to register server");
      }

      const newServer: SerializedServer = {
        id: data.server.id,
        name: data.server.name,
        host: data.server.host,
        port: data.server.port,
        username: data.server.username,
        hostFingerprint: data.server.hostFingerprint,
        status: data.server.status,
        lastCheckedAt: data.server.lastCheckedAt
          ? new Date(data.server.lastCheckedAt).getTime()
          : null,
        errorMessage: null,
        createdAt: Date.now(),
        processes: [],
      };

      setServers((prev) => [...prev, newServer]);
      setSelectedServerId(newServer.id);
      setIsRegisterOpen(false);
      showSuccess(
        "Server Registered in Fleet Vault",
        `Server '${data.server.name}' (${data.server.host}:${data.server.port}) is securely registered. Private key is encrypted at rest using AES-256-GCM.`,
        [
          { label: "Server Name", value: data.server.name },
          { label: "Host Address", value: `${data.server.host}:${data.server.port}`, copyable: true },
          { label: "SSH Username", value: data.server.username },
          { label: "Encryption", value: "AES-256-GCM at rest" },
        ]
      );
      resetRegisterForm();
    } catch (err: any) {
      setFormError(err.message);
      showError("Server Registration Failed", err.message);
    } finally {
      setIsSubmitting(false);
    }
  }

  function resetRegisterForm() {
    setFormName("");
    setFormHost("");
    setFormPort("22");
    setFormUsername("ubuntu");
    setFormPrivateKey("");
    setFormPassphrase("");
    setFormFingerprint("");
    setFormError("");
  }

  async function handleDiscover(serverId: string, silent = false) {
    setDiscoveringId(serverId);
    const targetServer = servers.find((s) => s.id === serverId);
    try {
      const res = await fetch(`/api/v1/admin/servers/${serverId}/discover`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to discover PM2 processes");
      }

      const mappedProcesses: SerializedProcess[] = (data.processes || []).map((p: any) => ({
        id: p.id,
        serverId: p.serverId,
        pm2Id: p.pm2Id,
        name: p.name,
        clientId: p.clientId,
        allowClientRestart: p.allowClientRestart,
        restartCooldownSec: p.restartCooldownSec,
        status: p.status,
        cpu: p.cpu,
        memory: p.memory,
        restarts: p.restarts,
        uptimeMs: p.uptimeMs,
        lastDiscoveredAt: Date.now(),
      }));

      setServers((prev) =>
        prev.map((s) =>
          s.id === serverId
            ? { ...s, status: "online", lastCheckedAt: Date.now(), processes: mappedProcesses }
            : s
        )
      );

      void fetchStats(serverId, true);

      if (!silent) {
        showSuccess(
          "PM2 Discovery Complete",
          `Scanned ${targetServer?.name || "Server"}. Synced ${mappedProcesses.length} active PM2 process(es) and pruned any stale entries.`,
          [
            { label: "Server", value: targetServer?.name || "Server" },
            { label: "Processes Synced", value: `${mappedProcesses.length} processes` },
            { label: "Server Status", value: "ONLINE" },
          ]
        );
      }
    } catch (err: any) {
      if (!silent) {
        showError("PM2 Discovery Failed", err.message, [{ label: "Server ID", value: serverId }]);
      }
    } finally {
      setDiscoveringId(null);
    }
  }

  async function handleSyncEntireFleet() {
    if (servers.length === 0) return;
    setIsSyncingAll(true);
    try {
      await Promise.all(
        servers.map(async (srv) => {
          await handleDiscover(srv.id, true);
        })
      );
      showSuccess(
        "Fleet Sync Complete",
        `Refreshed PM2 process tables and procfs telemetry across all ${servers.length} registered servers.`
      );
    } catch (err: any) {
      showError("Fleet Sync Error", err.message);
    } finally {
      setIsSyncingAll(false);
    }
  }

  async function handleDeleteServer(serverId: string) {
    const targetServer = servers.find((s) => s.id === serverId);
    if (
      !confirm(
        `Are you sure you want to remove '${targetServer?.name || serverId}' from the fleet vault?`
      )
    )
      return;

    try {
      const res = await fetch(`/api/v1/admin/servers/${serverId}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to delete server");
      }

      setServers((prev) => prev.filter((s) => s.id !== serverId));
      if (selectedServerId === serverId) {
        setSelectedServerId(servers.find((s) => s.id !== serverId)?.id ?? null);
      }
      showSuccess(
        "Server Removed",
        `Server '${targetServer?.name || serverId}' was removed from the fleet.`
      );
    } catch (err: any) {
      showError("Delete Server Failed", err.message);
    }
  }

  async function handleRestartProcess(proc: SerializedProcess, silent = false) {
    setRestartingProcIds((prev) => ({ ...prev, [proc.id]: true }));
    try {
      const res = await fetch(`/api/v1/admin/servers/processes/${proc.id}/restart`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to restart process");
      }

      // Optimistically mark online & increment restart count, then trigger discovery
      setServers((prev) =>
        prev.map((s) =>
          s.id === proc.serverId
            ? {
                ...s,
                processes: s.processes.map((p) =>
                  p.id === proc.id
                    ? { ...p, status: "online", restarts: (p.restarts || 0) + 1 }
                    : p
                ),
              }
            : s
        )
      );

      if (!silent) {
        showSuccess(
          proc.status === "online" ? "Process Restarted" : "Process Started",
          `Executed 'pm2 restart ${proc.pm2Id}' for '${proc.name}'. Refreshing live PM2 state...`,
          [
            { label: "Process", value: `${proc.name} (pm2_id: ${proc.pm2Id})` },
            { label: "Status", value: "ONLINE" },
          ]
        );
        void handleDiscover(proc.serverId, true);
      }
    } catch (err: any) {
      if (!silent) {
        showError("Process Action Failed", err.message);
      }
      throw err;
    } finally {
      setRestartingProcIds((prev) => ({ ...prev, [proc.id]: false }));
    }
  }

  async function handleBulkRestart(targetProcs: SerializedProcess[]) {
    if (targetProcs.length === 0 || !selectedServer) return;
    setIsBulkRestarting(true);
    let succeeded = 0;
    let failed = 0;

    for (const proc of targetProcs) {
      try {
        await handleRestartProcess(proc, true);
        succeeded++;
      } catch {
        failed++;
      }
    }

    await handleDiscover(selectedServer.id, true);
    setIsBulkRestarting(false);
    setSelectedProcessIds([]);

    if (failed === 0) {
      showSuccess(
        "Batch Restart Complete",
        `Successfully restarted ${succeeded} PM2 process(es) on ${selectedServer.name}.`
      );
    } else {
      showError(
        "Batch Restart Partially Completed",
        `Restarted ${succeeded} process(es), ${failed} failed (check cooldown or SSH status).`
      );
    }
  }

  async function handleQuickAssignTenant(proc: SerializedProcess, newClientId: string) {
    const resolvedClientId = newClientId || null;
    try {
      const res = await fetch(`/api/v1/admin/servers/processes/${proc.id}/map`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientId: resolvedClientId,
          allowClientRestart: proc.allowClientRestart,
          restartCooldownSec: proc.restartCooldownSec || 60,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to assign tenant");
      }

      setServers((prev) =>
        prev.map((s) => ({
          ...s,
          processes: s.processes.map((p) =>
            p.id === proc.id ? { ...p, clientId: resolvedClientId } : p
          ),
        }))
      );
    } catch (err: any) {
      showError("Tenant Mapping Failed", err.message);
    }
  }

  async function handleSaveMapping(e: React.FormEvent) {
    e.preventDefault();
    if (!mappingProcess) return;
    setIsSavingMap(true);

    try {
      const res = await fetch(`/api/v1/admin/servers/processes/${mappingProcess.id}/map`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientId: mapClientId || null,
          allowClientRestart: mapAllowRestart,
          restartCooldownSec: Number(mapCooldown) || 60,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to map process");
      }

      setServers((prev) =>
        prev.map((s) => ({
          ...s,
          processes: s.processes.map((p) =>
            p.id === mappingProcess.id
              ? {
                  ...p,
                  clientId: mapClientId || null,
                  allowClientRestart: mapAllowRestart,
                  restartCooldownSec: Number(mapCooldown) || 60,
                }
              : p
          ),
        }))
      );

      const targetClient = clients.find((c) => c.id === mapClientId);
      showSuccess(
        "Process Mapping Updated",
        `PM2 process '${mappingProcess.name}' (ID: ${mappingProcess.pm2Id}) configuration saved.`,
        [
          { label: "Process Name", value: mappingProcess.name },
          { label: "PM2 Process ID", value: String(mappingProcess.pm2Id) },
          { label: "Mapped Client", value: targetClient?.name || "Unassigned" },
          {
            label: "Client Restart",
            value: mapAllowRestart ? `Allowed (Cooldown: ${mapCooldown}s)` : "Disabled",
          },
        ]
      );

      setIsMappingOpen(false);
      setMappingProcess(null);
    } catch (err: any) {
      showError("Process Mapping Failed", err.message);
    } finally {
      setIsSavingMap(false);
    }
  }

  async function handleSaveBulkMapping(e: React.FormEvent) {
    e.preventDefault();
    if (selectedProcessIds.length === 0) return;
    setIsSavingMap(true);

    try {
      await Promise.all(
        selectedProcessIds.map((procId) =>
          fetch(`/api/v1/admin/servers/processes/${procId}/map`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              clientId: mapClientId || null,
              allowClientRestart: mapAllowRestart,
              restartCooldownSec: Number(mapCooldown) || 60,
            }),
          })
        )
      );

      const idSet = new Set(selectedProcessIds);
      setServers((prev) =>
        prev.map((s) => ({
          ...s,
          processes: s.processes.map((p) =>
            idSet.has(p.id)
              ? {
                  ...p,
                  clientId: mapClientId || null,
                  allowClientRestart: mapAllowRestart,
                  restartCooldownSec: Number(mapCooldown) || 60,
                }
              : p
          ),
        }))
      );

      const targetClient = clients.find((c) => c.id === mapClientId);
      showSuccess(
        "Bulk Tenant Mapping Complete",
        `Assigned ${selectedProcessIds.length} PM2 processes to ${targetClient?.name || "Unassigned"}.`
      );
      setIsBulkMappingOpen(false);
      setSelectedProcessIds([]);
    } catch (err: any) {
      showError("Bulk Mapping Failed", err.message);
    } finally {
      setIsSavingMap(false);
    }
  }

  function openLogsDrawer(proc: SerializedProcess) {
    setLogsTarget(proc);
    setLogsContent("");
    setLogsSearch("");
    void fetchProcessLogs(proc, logsLines);
  }

  async function runDiagnostics(proc: SerializedProcess, autoHeal = false) {
    setDiagTarget(proc);
    if (autoHeal) {
      setIsHealing(true);
    } else {
      setIsDiagnosing(true);
      setDiagReport(null);
    }

    try {
      const res = await fetch(`/api/v1/admin/servers/processes/${proc.id}/diagnose`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ autoHeal }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Diagnostics failed");
      }
      setDiagReport(data);
      if (autoHeal && data.healSuccess) {
        void handleDiscover(proc.serverId, true);
      }
    } catch (err: any) {
      showError("Diagnostics Error", err.message);
    } finally {
      setIsDiagnosing(false);
      setIsHealing(false);
    }
  }

  function getStatusBadge(status: string, compact = false) {
    const base = compact
      ? "steel-pill inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px]"
      : "steel-pill inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs";
    switch (status) {
      case "online":
        return (
          <span
            className={`${base} bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20`}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            Online
          </span>
        );
      case "degraded":
        return (
          <span
            className={`${base} bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20`}
          >
            <AlertTriangle className="w-3 h-3" /> Degraded
          </span>
        );
      case "unreachable":
      case "errored":
        return (
          <span
            className={`${base} bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20`}
          >
            <XCircle className="w-3 h-3" /> Unreachable
          </span>
        );
      default:
        return (
          <span
            className={`${base} bg-zinc-500/10 text-zinc-500 border border-zinc-500/20`}
          >
            <Clock className="w-3 h-3" /> {status}
          </span>
        );
    }
  }

  const filteredLogLines = useMemo(() => {
    if (!logsContent) return [];
    const lines = logsContent.split("\n");
    const q = logsSearch.trim().toLowerCase();
    if (!q) return lines;
    return lines.filter((line) => line.toLowerCase().includes(q));
  }, [logsContent, logsSearch]);

  const allDisplayedSelected =
    displayedProcesses.length > 0 &&
    displayedProcesses.every((p) => selectedProcessIds.includes(p.id));

  const toggleSelectAllDisplayed = () => {
    if (allDisplayedSelected) {
      const displayedSet = new Set(displayedProcesses.map((p) => p.id));
      setSelectedProcessIds((prev) => prev.filter((id) => !displayedSet.has(id)));
    } else {
      const merged = new Set([...selectedProcessIds, ...displayedProcesses.map((p) => p.id)]);
      setSelectedProcessIds(Array.from(merged));
    }
  };

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 flex flex-col">
      <main className="flex-1 w-full max-w-[1680px] mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-5">
        {/* Top Command Header & Global Fleet KPI Strip */}
        <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4 bg-white dark:bg-zinc-900/90 border border-zinc-200 dark:border-zinc-800/90 rounded-2xl p-4 sm:p-5 shadow-xs">
          <div className="flex items-start sm:items-center gap-3.5">
            <div className="w-11 h-11 rounded-xl bg-blue-600/10 dark:bg-blue-500/15 text-blue-600 dark:text-blue-400 flex items-center justify-center border border-blue-500/20 shrink-0 shadow-xs">
              <ServerIcon className="w-5 h-5" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2.5">
                <h1 className="text-lg sm:text-xl font-bold steel-heading text-zinc-900 dark:text-white">
                  Fleet Operations &amp; PM2 Control Suite
                </h1>
                <span className="steel-pill inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20 font-tech">
                  <Shield className="w-3 h-3" /> AES-256-GCM SSH VAULT
                </span>
              </div>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                Real-time procfs telemetry, multi-tenant PM2 process orchestration, live log streaming &amp; autonomous diagnostics
              </p>
            </div>
          </div>

          {/* Global KPI Pills + Action Toolbar */}
          <div className="flex flex-wrap items-center gap-2.5 sm:gap-3">
            {/* Compact Fleet KPIs */}
            <div className="hidden sm:flex items-center divide-x divide-zinc-200 dark:divide-zinc-800 bg-zinc-50 dark:bg-zinc-950/80 border border-zinc-200 dark:border-zinc-800 rounded-xl px-3 py-1.5 text-xs font-tech">
              <div className="pr-3">
                <span className="text-zinc-400 text-[10px] block uppercase">Hosts</span>
                <span className="font-bold text-zinc-900 dark:text-zinc-100">
                  {fleetSummary.onlineServers}/{fleetSummary.totalServers} Online
                </span>
              </div>
              <div className="px-3">
                <span className="text-zinc-400 text-[10px] block uppercase">PM2 Processes</span>
                <span className="font-bold text-emerald-600 dark:text-emerald-400">
                  {fleetSummary.onlineProcs} up
                </span>
                {fleetSummary.stoppedProcs > 0 && (
                  <span className="text-rose-500 font-bold ml-1.5">
                    · {fleetSummary.stoppedProcs} down
                  </span>
                )}
              </div>
              <div className="px-3">
                <span className="text-zinc-400 text-[10px] block uppercase">Tenant Mapped</span>
                <span className="font-bold text-blue-600 dark:text-blue-400">
                  {fleetSummary.mappedProcs}/{fleetSummary.totalProcs}
                </span>
              </div>
              <div className="pl-3">
                <span className="text-zinc-400 text-[10px] block uppercase">PM2 Memory</span>
                <span className="font-bold text-zinc-900 dark:text-zinc-100">
                  {(fleetSummary.totalMemMb / 1024).toFixed(2)} GB
                </span>
              </div>
            </div>

            {/* Auto-Poll Toggle */}
            <button
              type="button"
              onClick={() => setAutoPollEnabled(!autoPollEnabled)}
              className={`inline-flex items-center gap-2 px-3 py-2 rounded-xl border text-xs font-tech font-semibold transition cursor-pointer ${
                autoPollEnabled
                  ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-600 dark:text-emerald-400"
                  : "bg-zinc-100 dark:bg-zinc-800/70 border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200"
              }`}
              title="Automatically poll live server stats every 30 seconds"
            >
              <span
                className={`w-2 h-2 rounded-full ${
                  autoPollEnabled ? "bg-emerald-500 animate-ping" : "bg-zinc-400"
                }`}
              />
              Auto-Poll {autoPollEnabled ? "ON (30s)" : "OFF"}
            </button>

            {/* Sync All Fleet Button */}
            <button
              type="button"
              onClick={handleSyncEntireFleet}
              disabled={isSyncingAll || servers.length === 0}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-800 dark:text-zinc-200 text-xs font-tech font-semibold rounded-xl border border-zinc-200 dark:border-zinc-700/80 transition cursor-pointer disabled:opacity-50"
            >
              {isSyncingAll ? (
                <IosSpinner size="xs" className="text-current" />
              ) : (
                <RefreshCw className="w-3.5 h-3.5" />
              )}
              {isSyncingAll ? "Syncing Fleet..." : "Sync All Hosts"}
            </button>

            {/* Register Server Button */}
            <button
              type="button"
              onClick={() => setIsRegisterOpen(true)}
              className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 active:scale-[0.99] text-white font-semibold text-xs rounded-xl transition shadow-xs cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span className="font-tech font-bold">Register Server</span>
            </button>
          </div>
        </div>

        {/* Mobile / Tablet Quick Server Switcher Strip (< lg) */}
        {servers.length > 0 && (
          <div className="flex lg:hidden items-center gap-2 overflow-x-auto pb-1 no-scrollbar">
            {servers.map((srv) => {
              const isSelected = srv.id === selectedServerId;
              const onlineCount = srv.processes.filter((p) => p.status === "online").length;
              return (
                <button
                  key={srv.id}
                  type="button"
                  onClick={() => setSelectedServerId(srv.id)}
                  className={`flex items-center gap-2.5 px-3.5 py-2 rounded-xl border text-xs font-tech shrink-0 transition cursor-pointer ${
                    isSelected
                      ? "bg-blue-600 text-white border-blue-500 shadow-xs"
                      : "bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300"
                  }`}
                >
                  <span
                    className={`w-2 h-2 rounded-full ${
                      srv.status === "online" ? "bg-emerald-400" : "bg-rose-400"
                    }`}
                  />
                  <span className="font-bold">{srv.name}</span>
                  <span
                    className={`px-1.5 py-0.5 rounded text-[10px] ${
                      isSelected ? "bg-white/20 text-white" : "bg-zinc-100 dark:bg-zinc-800 text-zinc-400"
                    }`}
                  >
                    {onlineCount}/{srv.processes.length}
                  </span>
                </button>
              );
            })}
          </div>
        )}

        {/* Split-Pane Master-Detail Layout:
            Left Server Rail is sticky & independently scrollable on lg+ screens so it NEVER scrolls out of view when browsing processes on the right! */}
        <div className="flex flex-col lg:flex-row items-start gap-6">
          {/* LEFT RAIL: Sticky Registered Servers Panel */}
          <aside className="w-full lg:w-80 xl:w-96 shrink-0 lg:sticky lg:top-[7.5rem] lg:max-h-[calc(100vh-8.5rem)] flex flex-col bg-white dark:bg-zinc-900/90 border border-zinc-200 dark:border-zinc-800/90 rounded-2xl shadow-xs overflow-hidden">
            {/* Rail Header + Search */}
            <div className="p-4 border-b border-zinc-200 dark:border-zinc-800 space-y-3 shrink-0">
              <div className="flex items-center justify-between">
                <span className="steel-metric-label text-zinc-500 dark:text-zinc-400">
                  Registered Servers ({servers.length})
                </span>
                <span className="text-[11px] font-tech text-emerald-500 font-semibold">
                  {fleetSummary.onlineServers} Active
                </span>
              </div>

              {servers.length > 1 && (
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={serverSearch}
                    onChange={(e) => setServerSearch(e.target.value)}
                    placeholder="Filter servers or processes..."
                    className="w-full pl-8 pr-3 py-1.5 text-xs rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 focus:outline-none focus:ring-1 focus:ring-blue-500 font-tech"
                  />
                </div>
              )}
            </div>

            {/* Independently Scrollable Server Cards List */}
            <div className="flex-1 overflow-y-auto p-3 space-y-2.5 max-h-[380px] lg:max-h-none">
              {filteredServers.length === 0 ? (
                <div className="p-6 text-center text-zinc-500">
                  <ServerIcon className="w-7 h-7 mx-auto mb-2 opacity-40" />
                  <p className="text-xs">No matching servers found.</p>
                </div>
              ) : (
                filteredServers.map((s) => {
                  const isSelected = selectedServerId === s.id;
                  const st = serverStats[s.id];
                  const onlineCount = s.processes.filter((p) => p.status === "online").length;
                  const stoppedCount = s.processes.length - onlineCount;
                  const mappedCount = s.processes.filter((p) => Boolean(p.clientId)).length;

                  return (
                    <div
                      key={s.id}
                      onClick={() => setSelectedServerId(s.id)}
                      className={`group rounded-xl p-3.5 border transition-all cursor-pointer ${
                        isSelected
                          ? "bg-blue-50/50 dark:bg-blue-950/25 border-blue-500/80 dark:border-blue-500/70 shadow-sm ring-1 ring-blue-500/30"
                          : "bg-zinc-50/60 dark:bg-zinc-950/50 border-zinc-200/80 dark:border-zinc-800/80 hover:border-zinc-300 dark:hover:border-zinc-700"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <h3 className="font-steel font-bold text-sm text-zinc-900 dark:text-zinc-100 truncate">
                              {s.name}
                            </h3>
                            <ChevronRight
                              className={`w-3.5 h-3.5 transition-transform shrink-0 ${
                                isSelected
                                  ? "text-blue-500 translate-x-0.5"
                                  : "text-zinc-400 opacity-0 group-hover:opacity-100"
                              }`}
                            />
                          </div>
                          <p className="text-[11px] text-zinc-500 font-tech truncate mt-0.5">
                            {s.username}@{s.host}:{s.port}
                          </p>
                        </div>
                        {getStatusBadge(s.status, true)}
                      </div>

                      {/* Mini Live Resource Bars inside each Server Card */}
                      {st && (
                        <div className="mt-3 grid grid-cols-3 gap-2 pt-2.5 border-t border-zinc-200/60 dark:border-zinc-800/70 text-[10px] font-tech">
                          <div>
                            <div className="flex justify-between text-zinc-400 mb-1">
                              <span>CPU</span>
                              <span
                                className={
                                  st.cpuUsagePercent > 80
                                    ? "text-rose-400 font-bold"
                                    : "text-zinc-200 font-semibold"
                                }
                              >
                                {st.cpuUsagePercent}%
                              </span>
                            </div>
                            <div className="h-1 w-full bg-zinc-200 dark:bg-zinc-800 rounded-full overflow-hidden">
                              <div
                                className={`h-full rounded-full ${
                                  st.cpuUsagePercent > 85
                                    ? "bg-rose-500"
                                    : st.cpuUsagePercent > 70
                                    ? "bg-amber-500"
                                    : "bg-blue-500"
                                }`}
                                style={{ width: `${Math.max(3, st.cpuUsagePercent)}%` }}
                              />
                            </div>
                          </div>

                          <div>
                            <div className="flex justify-between text-zinc-400 mb-1">
                              <span>RAM</span>
                              <span className="text-zinc-200 font-semibold">
                                {st.memoryUsagePercent}%
                              </span>
                            </div>
                            <div className="h-1 w-full bg-zinc-200 dark:bg-zinc-800 rounded-full overflow-hidden">
                              <div
                                className={`h-full rounded-full ${
                                  st.memoryUsagePercent > 85
                                    ? "bg-rose-500"
                                    : st.memoryUsagePercent > 70
                                    ? "bg-amber-500"
                                    : "bg-indigo-500"
                                }`}
                                style={{ width: `${Math.max(3, st.memoryUsagePercent)}%` }}
                              />
                            </div>
                          </div>

                          <div>
                            <div className="flex justify-between text-zinc-400 mb-1">
                              <span>DISK</span>
                              <span
                                className={
                                  st.diskUsagePercent > 80
                                    ? "text-amber-400 font-bold"
                                    : "text-zinc-200 font-semibold"
                                }
                              >
                                {st.diskUsagePercent}%
                              </span>
                            </div>
                            <div className="h-1 w-full bg-zinc-200 dark:bg-zinc-800 rounded-full overflow-hidden">
                              <div
                                className={`h-full rounded-full ${
                                  st.diskUsagePercent > 90
                                    ? "bg-rose-500"
                                    : st.diskUsagePercent > 75
                                    ? "bg-amber-500"
                                    : "bg-emerald-500"
                                }`}
                                style={{ width: `${Math.max(3, st.diskUsagePercent)}%` }}
                              />
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Process Status Footer & Quick Server Actions */}
                      <div className="mt-3 pt-2.5 border-t border-zinc-200/60 dark:border-zinc-800/70 flex items-center justify-between text-[11px] font-tech">
                        <div className="flex items-center gap-2">
                          <span className="text-emerald-600 dark:text-emerald-400 font-semibold">
                            {onlineCount} online
                          </span>
                          {stoppedCount > 0 && (
                            <span className="px-1.5 py-0.5 rounded bg-rose-500/10 text-rose-500 font-semibold text-[10px]">
                              {stoppedCount} stopped
                            </span>
                          )}
                          <span className="text-zinc-400 text-[10px]">· {mappedCount} mapped</span>
                        </div>

                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              void handleDiscover(s.id);
                            }}
                            disabled={discoveringId === s.id}
                            className="p-1.5 rounded-lg hover:bg-zinc-200/70 dark:hover:bg-zinc-800 text-zinc-400 hover:text-blue-500 transition cursor-pointer"
                            title="Discover PM2 Processes & Poll Stats"
                          >
                            {discoveringId === s.id ? (
                              <IosSpinner size="xs" className="text-blue-500" />
                            ) : (
                              <RefreshCw className="w-3.5 h-3.5" />
                            )}
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              void handleDeleteServer(s.id);
                            }}
                            className="p-1.5 rounded-lg hover:bg-rose-500/10 text-zinc-400 hover:text-rose-500 transition cursor-pointer"
                            title="Remove Server from Fleet"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </aside>

          {/* RIGHT WORKSPACE: Selected Server Telemetry + PM2 Suite */}
          <section className="flex-1 min-w-0 w-full space-y-5">
            {selectedServer ? (
              <>
                {/* 1. Selected Server Command Banner & Telemetry Suite */}
                <div className="bg-white dark:bg-zinc-900/90 border border-zinc-200 dark:border-zinc-800/90 rounded-2xl p-5 shadow-xs space-y-4">
                  {/* Server Identity & Action Bar */}
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-zinc-200 dark:border-zinc-800">
                    <div className="space-y-1.5">
                      <div className="flex flex-wrap items-center gap-2.5">
                        <h2 className="text-xl font-bold steel-heading text-zinc-900 dark:text-white">
                          {selectedServer.name}
                        </h2>
                        {getStatusBadge(selectedServer.status)}
                        <span className="steel-pill inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20 font-tech">
                          <Zap className="w-2.5 h-2.5" /> ZERO-LOAD PROCFS
                        </span>
                      </div>

                      <div className="flex flex-wrap items-center gap-2 text-xs font-tech text-zinc-400">
                        <span>
                          Host: <strong className="text-zinc-200">{selectedServer.host}</strong>
                        </span>
                        <span>·</span>
                        <span>Port: {selectedServer.port}</span>
                        <span>·</span>
                        <span>User: {selectedServer.username}</span>
                        <button
                          type="button"
                          onClick={() =>
                            copyToClipboard(
                              `ssh -p ${selectedServer.port} ${selectedServer.username}@${selectedServer.host}`,
                              `ssh-${selectedServer.id}`
                            )
                          }
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-[11px] text-zinc-600 dark:text-zinc-300 transition cursor-pointer"
                          title="Copy SSH command"
                        >
                          {copiedText === `ssh-${selectedServer.id}` ? (
                            <>
                              <Check className="w-3 h-3 text-emerald-400" /> Copied SSH
                            </>
                          ) : (
                            <>
                              <Copy className="w-3 h-3" /> Copy SSH
                            </>
                          )}
                        </button>
                      </div>
                    </div>

                    {/* Server-Level Action Buttons */}
                    <div className="flex flex-wrap items-center gap-2">
                      {selectedStats?.collectedAt && (
                        <span className="text-[11px] font-tech text-zinc-400 mr-1">
                          Polled{" "}
                          {Math.max(1, Math.round((Date.now() - selectedStats.collectedAt) / 1000))}s
                          ago
                        </span>
                      )}

                      {serverProcessCounts.stopped > 0 && (
                        <button
                          type="button"
                          onClick={() =>
                            handleBulkRestart(
                              selectedServer.processes.filter((p) => p.status !== "online")
                            )
                          }
                          disabled={isBulkRestarting}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/30 text-amber-400 text-xs font-semibold rounded-xl transition font-tech cursor-pointer disabled:opacity-50"
                        >
                          {isBulkRestarting ? (
                            <IosSpinner size="xs" className="text-amber-400" />
                          ) : (
                            <Play className="w-3.5 h-3.5" />
                          )}
                          Start All Stopped ({serverProcessCounts.stopped})
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() => handleDiscover(selectedServer.id)}
                        disabled={discoveringId === selectedServer.id}
                        className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-800 dark:text-zinc-200 text-xs font-semibold rounded-xl border border-zinc-200 dark:border-zinc-700 transition font-tech cursor-pointer disabled:opacity-50"
                      >
                        {discoveringId === selectedServer.id ? (
                          <IosSpinner size="xs" className="text-current" />
                        ) : (
                          <RefreshCw className="w-3.5 h-3.5" />
                        )}
                        {discoveringId === selectedServer.id ? "Discovering..." : "Discover PM2"}
                      </button>

                      <button
                        type="button"
                        onClick={() => fetchStats(selectedServer.id, true)}
                        disabled={loadingStatsId === selectedServer.id}
                        className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-blue-600 hover:bg-blue-500 active:scale-[0.98] text-white text-xs font-semibold rounded-xl shadow-xs transition font-tech cursor-pointer disabled:opacity-50"
                      >
                        {loadingStatsId === selectedServer.id ? (
                          <IosSpinner size="xs" className="text-white" />
                        ) : (
                          <Activity className="w-3.5 h-3.5" />
                        )}
                        {loadingStatsId === selectedServer.id ? "Probing..." : "Poll Live Stats"}
                      </button>
                    </div>
                  </div>

                  {selectedServer.errorMessage && (
                    <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-xs text-rose-600 dark:text-rose-400 font-tech">
                      {selectedServer.errorMessage}
                    </div>
                  )}

                  {/* OS & Kernel Specs Strip */}
                  {selectedStats ? (
                    <div className="space-y-4">
                      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5 rounded-xl bg-zinc-950 border border-zinc-800/90 text-xs font-tech text-zinc-300">
                        <div className="flex flex-wrap items-center gap-2">
                          <Terminal className="w-4 h-4 text-blue-400 shrink-0" />
                          <span className="font-semibold text-zinc-100">
                            {selectedStats.osPrettyName || "Ubuntu Linux"}
                          </span>
                          <span className="text-zinc-600">·</span>
                          <span>Kernel {selectedStats.kernelVersion}</span>
                          <span className="text-zinc-600">·</span>
                          <span className="uppercase px-1.5 py-0.5 rounded bg-zinc-900 border border-zinc-800 text-zinc-300 text-[10px]">
                            {selectedStats.architecture}
                          </span>
                          {selectedServer.hostFingerprint && (
                            <>
                              <span className="text-zinc-600 hidden sm:inline">·</span>
                              <span className="hidden sm:inline-flex items-center gap-1 text-zinc-400 text-[11px]">
                                <Shield className="w-3 h-3 text-blue-400" />
                                {selectedServer.hostFingerprint.slice(0, 24)}...
                              </span>
                            </>
                          )}
                        </div>
                        <div className="flex items-center gap-2 text-zinc-400">
                          <span>System Uptime:</span>
                          <strong className="font-tech text-emerald-400">
                            {selectedStats.uptimeFormatted}
                          </strong>
                        </div>
                      </div>

                      {/* 4 Telemetry Metric Cards with Sparklines */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3.5">
                        {/* CPU Usage Card */}
                        <div className="p-4 rounded-xl bg-zinc-50/70 dark:bg-zinc-950/80 border border-zinc-200 dark:border-zinc-800/90 flex flex-col justify-between space-y-3">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-semibold uppercase tracking-wider font-tech text-zinc-400 flex items-center gap-1.5">
                              <Cpu className="w-4 h-4 text-blue-500" /> CPU Usage
                            </span>
                            <span className="text-xs font-tech text-zinc-400 font-medium">
                              {selectedStats.cpuCores} Cores
                            </span>
                          </div>
                          <div>
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-3xl font-extrabold font-tech tabular-nums tracking-tight text-zinc-900 dark:text-zinc-50">
                                {selectedStats.cpuUsagePercent}%
                              </span>
                              {selectedStats.recentMetrics &&
                                selectedStats.recentMetrics.length > 1 && (
                                  <MiniSparkline
                                    values={selectedStats.recentMetrics.map((m) => m.cpuPercent)}
                                    colorClass={
                                      selectedStats.cpuUsagePercent > 80
                                        ? "stroke-rose-500"
                                        : "stroke-blue-500"
                                    }
                                  />
                                )}
                            </div>
                            <div className="w-full bg-zinc-200 dark:bg-zinc-800/80 h-2 rounded-full overflow-hidden mt-2">
                              <div
                                className={`h-full transition-all duration-500 ${
                                  selectedStats.cpuUsagePercent > 85
                                    ? "bg-rose-500"
                                    : selectedStats.cpuUsagePercent > 70
                                    ? "bg-amber-500"
                                    : "bg-blue-600 dark:bg-blue-500"
                                }`}
                                style={{
                                  width: `${Math.min(100, Math.max(2, selectedStats.cpuUsagePercent))}%`,
                                }}
                              />
                            </div>
                          </div>
                          <div className="pt-2.5 border-t border-zinc-200/60 dark:border-zinc-800/80 text-[11px] font-tech text-zinc-500 dark:text-zinc-400 space-y-1">
                            <div className="flex justify-between">
                              <span>Load (1/5/15m):</span>
                              <span className="tabular-nums font-semibold text-zinc-800 dark:text-zinc-200">
                                {selectedStats.load1.toFixed(2)} · {selectedStats.load5.toFixed(2)} ·{" "}
                                {selectedStats.load15.toFixed(2)}
                              </span>
                            </div>
                            <div className="flex justify-between">
                              <span>Threads:</span>
                              <span className="tabular-nums font-semibold text-zinc-800 dark:text-zinc-200">
                                {selectedStats.activeThreads} active / {selectedStats.totalThreads}
                              </span>
                            </div>
                          </div>
                        </div>

                        {/* RAM & Swap Card */}
                        <div className="p-4 rounded-xl bg-zinc-50/70 dark:bg-zinc-950/80 border border-zinc-200 dark:border-zinc-800/90 flex flex-col justify-between space-y-3">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-semibold uppercase tracking-wider font-tech text-zinc-400 flex items-center gap-1.5">
                              <Layers className="w-4 h-4 text-indigo-400" /> RAM Memory
                            </span>
                            <span className="text-xs font-tech text-zinc-400 font-medium">
                              {(selectedStats.memoryTotalMb / 1024).toFixed(1)} GB Total
                            </span>
                          </div>
                          <div>
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-3xl font-extrabold font-tech tabular-nums tracking-tight text-zinc-900 dark:text-zinc-50">
                                {selectedStats.memoryUsagePercent}%
                              </span>
                              {selectedStats.recentMetrics &&
                                selectedStats.recentMetrics.length > 1 && (
                                  <MiniSparkline
                                    values={selectedStats.recentMetrics.map((m) =>
                                      Math.round(
                                        (m.memoryUsedMb / Math.max(1, selectedStats.memoryTotalMb)) *
                                          100
                                      )
                                    )}
                                    colorClass="stroke-indigo-400"
                                  />
                                )}
                            </div>
                            <div className="w-full bg-zinc-200 dark:bg-zinc-800/80 h-2 rounded-full overflow-hidden mt-2">
                              <div
                                className={`h-full transition-all duration-500 ${
                                  selectedStats.memoryUsagePercent > 90
                                    ? "bg-rose-500"
                                    : selectedStats.memoryUsagePercent > 75
                                    ? "bg-amber-500"
                                    : "bg-indigo-500"
                                }`}
                                style={{
                                  width: `${Math.min(100, Math.max(2, selectedStats.memoryUsagePercent))}%`,
                                }}
                              />
                            </div>
                          </div>
                          <div className="pt-2.5 border-t border-zinc-200/60 dark:border-zinc-800/80 text-[11px] font-tech text-zinc-500 dark:text-zinc-400 space-y-1">
                            <div className="flex justify-between">
                              <span>Used / Avail:</span>
                              <span className="tabular-nums font-semibold text-zinc-800 dark:text-zinc-200">
                                {(selectedStats.memoryUsedMb / 1024).toFixed(2)} /{" "}
                                {(selectedStats.memoryAvailableMb / 1024).toFixed(2)} GB
                              </span>
                            </div>
                            <div className="flex justify-between">
                              <span>Swap Used:</span>
                              <span className="tabular-nums font-semibold text-zinc-800 dark:text-zinc-200">
                                {selectedStats.swapUsedMb} / {selectedStats.swapTotalMb} MB
                              </span>
                            </div>
                          </div>
                        </div>

                        {/* Disk Storage Card */}
                        <div className="p-4 rounded-xl bg-zinc-50/70 dark:bg-zinc-950/80 border border-zinc-200 dark:border-zinc-800/90 flex flex-col justify-between space-y-3">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-semibold uppercase tracking-wider font-tech text-zinc-400 flex items-center gap-1.5">
                              <HardDrive className="w-4 h-4 text-amber-500" /> Storage (
                              {selectedStats.diskMount || "/"})
                            </span>
                            <span className="text-xs font-tech text-zinc-400 font-medium">
                              {selectedStats.diskTotalGb.toFixed(0)} GB
                            </span>
                          </div>
                          <div>
                            <div className="flex items-baseline gap-2">
                              <span className="text-3xl font-extrabold font-tech tabular-nums tracking-tight text-zinc-900 dark:text-zinc-50">
                                {selectedStats.diskUsagePercent}%
                              </span>
                            </div>
                            <div className="w-full bg-zinc-200 dark:bg-zinc-800/80 h-2 rounded-full overflow-hidden mt-2">
                              <div
                                className={`h-full transition-all duration-500 ${
                                  selectedStats.diskUsagePercent > 90
                                    ? "bg-rose-500"
                                    : selectedStats.diskUsagePercent > 75
                                    ? "bg-amber-500"
                                    : "bg-emerald-500"
                                }`}
                                style={{
                                  width: `${Math.min(100, Math.max(2, selectedStats.diskUsagePercent))}%`,
                                }}
                              />
                            </div>
                          </div>
                          <div className="pt-2.5 border-t border-zinc-200/60 dark:border-zinc-800/80 text-[11px] font-tech text-zinc-500 dark:text-zinc-400 space-y-1">
                            <div className="flex justify-between">
                              <span>Used Space:</span>
                              <span className="tabular-nums font-semibold text-zinc-800 dark:text-zinc-200">
                                {selectedStats.diskUsedGb.toFixed(1)} GB
                              </span>
                            </div>
                            <div className="flex justify-between">
                              <span>Free Space:</span>
                              <span className="tabular-nums font-semibold text-zinc-800 dark:text-zinc-200">
                                {selectedStats.diskFreeGb.toFixed(1)} GB
                              </span>
                            </div>
                          </div>
                        </div>

                        {/* PM2 Runtime Footprint Card */}
                        <div className="p-4 rounded-xl bg-zinc-50/70 dark:bg-zinc-950/80 border border-zinc-200 dark:border-zinc-800/90 flex flex-col justify-between space-y-3">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-semibold uppercase tracking-wider font-tech text-zinc-400 flex items-center gap-1.5">
                              <Gauge className="w-4 h-4 text-emerald-400" /> PM2 Footprint
                            </span>
                            <span className="text-xs font-tech text-emerald-400 font-semibold">
                              {serverProcessCounts.online}/{serverProcessCounts.all} Online
                            </span>
                          </div>
                          <div>
                            <div className="flex items-baseline gap-2">
                              <span className="text-3xl font-extrabold font-tech tabular-nums tracking-tight text-zinc-900 dark:text-zinc-50">
                                {Math.round(
                                  selectedServer.processes.reduce(
                                    (acc, p) => acc + (p.memory || 0),
                                    0
                                  ) /
                                    (1024 * 1024)
                                )}{" "}
                                <span className="text-xs font-normal text-zinc-400">MB</span>
                              </span>
                            </div>
                            <p className="text-[11px] text-zinc-400 font-tech mt-1">
                              Aggregated PM2 process memory
                            </p>
                          </div>
                          <div className="pt-2.5 border-t border-zinc-200/60 dark:border-zinc-800/80 text-[11px] font-tech text-zinc-500 dark:text-zinc-400 space-y-1">
                            <div className="flex justify-between">
                              <span>Mapped Tenants:</span>
                              <span className="tabular-nums font-semibold text-blue-400">
                                {serverProcessCounts.mapped} assigned
                              </span>
                            </div>
                            <div className="flex justify-between">
                              <span>PM2 CPU Sum:</span>
                              <span className="tabular-nums font-semibold text-zinc-800 dark:text-zinc-200">
                                {selectedServer.processes
                                  .reduce((acc, p) => acc + (p.cpu || 0), 0)
                                  .toFixed(0)}
                                % total
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="p-6 text-center rounded-xl bg-zinc-50 dark:bg-zinc-950/50 border border-dashed border-zinc-200 dark:border-zinc-800">
                      <IosSpinner size="sm" className="mx-auto mb-2 text-blue-500" />
                      <p className="text-xs text-zinc-400 font-tech">
                        Loading live procfs telemetry for {selectedServer.name}...
                      </p>
                    </div>
                  )}
                </div>

                {/* 2. All-in-One PM2 Process Orchestration Suite */}
                <div className="bg-white dark:bg-zinc-900/90 border border-zinc-200 dark:border-zinc-800/90 rounded-2xl overflow-hidden shadow-xs">
                  {/* Suite Filter & Search Toolbar */}
                  <div className="p-4 sm:p-5 border-b border-zinc-200 dark:border-zinc-800 space-y-4">
                    <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-3">
                      {/* Filter Tabs */}
                      <div className="flex flex-wrap items-center gap-1.5">
                        {(
                          [
                            { id: "all", label: "All Processes", count: serverProcessCounts.all },
                            { id: "online", label: "Online", count: serverProcessCounts.online },
                            {
                              id: "stopped",
                              label: "Stopped / Down",
                              count: serverProcessCounts.stopped,
                            },
                            {
                              id: "unstable",
                              label: "High Restarts",
                              count: serverProcessCounts.unstable,
                            },
                            { id: "mapped", label: "Mapped", count: serverProcessCounts.mapped },
                            {
                              id: "unassigned",
                              label: "Unassigned",
                              count: serverProcessCounts.unassigned,
                            },
                          ] as Array<{ id: ProcessFilterTab; label: string; count: number }>
                        ).map((tab) => {
                          const active = processFilter === tab.id;
                          return (
                            <button
                              key={tab.id}
                              type="button"
                              onClick={() => setProcessFilter(tab.id)}
                              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-tech font-semibold transition cursor-pointer ${
                                active
                                  ? "bg-blue-600 text-white shadow-xs"
                                  : "bg-zinc-100 dark:bg-zinc-800/70 text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200"
                              }`}
                            >
                              <span>{tab.label}</span>
                              <span
                                className={`px-1.5 py-0.2 rounded-full text-[10px] ${
                                  active
                                    ? "bg-white/20 text-white"
                                    : tab.id === "stopped" && tab.count > 0
                                    ? "bg-rose-500/20 text-rose-400"
                                    : tab.id === "unstable" && tab.count > 0
                                    ? "bg-amber-500/20 text-amber-400"
                                    : "bg-zinc-200 dark:bg-zinc-700 text-zinc-500 dark:text-zinc-300"
                                }`}
                              >
                                {tab.count}
                              </span>
                            </button>
                          );
                        })}
                      </div>

                      {/* Search + Tenant Filter */}
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="relative flex-1 sm:w-60">
                          <Search className="w-3.5 h-3.5 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
                          <input
                            type="text"
                            value={processSearch}
                            onChange={(e) => setProcessSearch(e.target.value)}
                            placeholder="Search process, pm2_id, tenant..."
                            className="w-full pl-8 pr-7 py-1.5 text-xs rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 focus:outline-none focus:ring-1 focus:ring-blue-500 font-tech"
                          />
                          {processSearch && (
                            <button
                              type="button"
                              onClick={() => setProcessSearch("")}
                              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-200"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>

                        <div className="relative">
                          <Filter className="w-3.5 h-3.5 text-zinc-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                          <select
                            value={tenantFilter}
                            onChange={(e) => setTenantFilter(e.target.value)}
                            className="pl-8 pr-6 py-1.5 text-xs rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 focus:outline-none focus:ring-1 focus:ring-blue-500 font-tech"
                          >
                            <option value="all">All Tenants</option>
                            <option value="__unassigned__">Unassigned Only</option>
                            {clients.map((c) => (
                              <option key={c.id} value={c.id}>
                                {c.name}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>
                    </div>

                    {/* Bulk Selection Action Bar */}
                    {selectedProcessIds.length > 0 && (
                      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5 rounded-xl bg-blue-600/10 border border-blue-500/30 text-xs font-tech">
                        <div className="flex items-center gap-2 text-blue-400 font-semibold">
                          <span>{selectedProcessIds.length} process(es) selected</span>
                          <button
                            type="button"
                            onClick={() => setSelectedProcessIds([])}
                            className="text-zinc-400 hover:text-white underline ml-2"
                          >
                            Clear
                          </button>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              setMapClientId("");
                              setMapAllowRestart(true);
                              setMapCooldown("60");
                              setIsBulkMappingOpen(true);
                            }}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-semibold transition cursor-pointer"
                          >
                            <Users className="w-3.5 h-3.5" /> Bulk Assign Tenant
                          </button>
                          <button
                            type="button"
                            disabled={isBulkRestarting}
                            onClick={() => {
                              const procs = selectedServer.processes.filter((p) =>
                                selectedProcessIds.includes(p.id)
                              );
                              void handleBulkRestart(procs);
                            }}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-100 border border-zinc-700 font-semibold transition cursor-pointer disabled:opacity-50"
                          >
                            {isBulkRestarting ? (
                              <IosSpinner size="xs" className="text-white" />
                            ) : (
                              <RotateCw className="w-3.5 h-3.5" />
                            )}
                            Restart Selected ({selectedProcessIds.length})
                          </button>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* PM2 Processes Table */}
                  {displayedProcesses.length === 0 ? (
                    <div className="p-10 text-center text-zinc-400 text-xs font-tech space-y-2">
                      <p>No PM2 processes match the active filter on {selectedServer.name}.</p>
                      {processFilter !== "all" || processSearch || tenantFilter !== "all" ? (
                        <button
                          type="button"
                          onClick={() => {
                            setProcessFilter("all");
                            setProcessSearch("");
                            setTenantFilter("all");
                          }}
                          className="text-blue-400 hover:underline font-semibold"
                        >
                          Reset process filters
                        </button>
                      ) : null}
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-zinc-50 dark:bg-zinc-950/60 text-zinc-400 border-b border-zinc-200 dark:border-zinc-800 select-none">
                          <tr>
                            <th className="pl-5 pr-2 py-3 w-8">
                              <input
                                type="checkbox"
                                checked={allDisplayedSelected}
                                onChange={toggleSelectAllDisplayed}
                                className="rounded border-zinc-700 text-blue-600 focus:ring-0 cursor-pointer"
                              />
                            </th>
                            <th
                              onClick={() => toggleSort("name")}
                              className="steel-metric-label px-4 py-3 cursor-pointer hover:text-zinc-200"
                            >
                              <span className="inline-flex items-center gap-1">
                                Process / PM2 ID <ArrowUpDown className="w-3 h-3 opacity-60" />
                              </span>
                            </th>
                            <th
                              onClick={() => toggleSort("status")}
                              className="steel-metric-label px-4 py-3 cursor-pointer hover:text-zinc-200"
                            >
                              <span className="inline-flex items-center gap-1">
                                Status <ArrowUpDown className="w-3 h-3 opacity-60" />
                              </span>
                            </th>
                            <th
                              onClick={() => toggleSort("memory")}
                              className="steel-metric-label px-4 py-3 cursor-pointer hover:text-zinc-200"
                            >
                              <span className="inline-flex items-center gap-1">
                                CPU / Memory <ArrowUpDown className="w-3 h-3 opacity-60" />
                              </span>
                            </th>
                            <th
                              onClick={() => toggleSort("restarts")}
                              className="steel-metric-label px-4 py-3 cursor-pointer hover:text-zinc-200"
                            >
                              <span className="inline-flex items-center gap-1">
                                Uptime &amp; Restarts <ArrowUpDown className="w-3 h-3 opacity-60" />
                              </span>
                            </th>
                            <th className="steel-metric-label px-4 py-3">Tenant Assignment</th>
                            <th className="steel-metric-label px-5 py-3 text-right">
                              Operations Suite
                            </th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-zinc-200/70 dark:divide-zinc-800/80">
                          {displayedProcesses.map((proc) => {
                            const memMb = proc.memory / (1024 * 1024);
                            const isOnline = proc.status === "online";
                            const isRestarting = Boolean(restartingProcIds[proc.id]);
                            const isChecked = selectedProcessIds.includes(proc.id);
                            const highRestarts = proc.restarts >= 20;

                            return (
                              <tr
                                key={proc.id}
                                className={`transition-colors ${
                                  isChecked
                                    ? "bg-blue-500/5"
                                    : "hover:bg-zinc-50/80 dark:hover:bg-zinc-800/30"
                                }`}
                              >
                                <td className="pl-5 pr-2 py-3.5">
                                  <input
                                    type="checkbox"
                                    checked={isChecked}
                                    onChange={(e) => {
                                      if (e.target.checked) {
                                        setSelectedProcessIds((prev) => [...prev, proc.id]);
                                      } else {
                                        setSelectedProcessIds((prev) =>
                                          prev.filter((id) => id !== proc.id)
                                        );
                                      }
                                    }}
                                    className="rounded border-zinc-700 text-blue-600 focus:ring-0 cursor-pointer"
                                  />
                                </td>

                                {/* Process Name & PM2 ID */}
                                <td className="px-4 py-3.5">
                                  <div className="flex items-center gap-2">
                                    <span className="font-steel font-bold text-zinc-900 dark:text-zinc-100 text-sm">
                                      {proc.name}
                                    </span>
                                    {highRestarts && (
                                      <span
                                        className="px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-400 border border-amber-500/30 text-[10px] font-tech"
                                        title={`High restart count (${proc.restarts}) — click Diagnose to inspect logs`}
                                      >
                                        ⚡ {proc.restarts}x
                                      </span>
                                    )}
                                  </div>
                                  <div className="text-[11px] text-zinc-400 font-tech flex items-center gap-2 mt-0.5">
                                    <span>pm2_id: {proc.pm2Id}</span>
                                    {proc.allowClientRestart && proc.clientId && (
                                      <span className="text-[10px] text-emerald-400/90">
                                        · Client Restart ON ({proc.restartCooldownSec}s)
                                      </span>
                                    )}
                                  </div>
                                </td>

                                {/* Status */}
                                <td className="px-4 py-3.5">
                                  <span
                                    className={`steel-pill inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-tech ${
                                      isOnline
                                        ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20"
                                        : "bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20"
                                    }`}
                                  >
                                    <span
                                      className={`w-1.5 h-1.5 rounded-full ${
                                        isOnline ? "bg-emerald-500 animate-pulse" : "bg-rose-500"
                                      }`}
                                    />
                                    {proc.status}
                                  </span>
                                </td>

                                {/* CPU / Memory */}
                                <td className="px-4 py-3.5 font-tech tabular-nums">
                                  <div className="flex items-center gap-2">
                                    <span
                                      className={`font-bold ${
                                        proc.cpu > 50
                                          ? "text-amber-400"
                                          : "text-zinc-900 dark:text-zinc-100"
                                      }`}
                                    >
                                      {proc.cpu}% CPU
                                    </span>
                                    <span className="text-zinc-500">·</span>
                                    <span className="text-zinc-400 font-semibold">
                                      {memMb.toFixed(1)} MB
                                    </span>
                                  </div>
                                  <div className="w-28 bg-zinc-200 dark:bg-zinc-800 h-1 rounded-full overflow-hidden mt-1.5">
                                    <div
                                      className={`h-full rounded-full ${
                                        memMb > 400
                                          ? "bg-amber-500"
                                          : isOnline
                                          ? "bg-blue-500"
                                          : "bg-zinc-600"
                                      }`}
                                      style={{
                                        width: `${Math.min(100, Math.max(4, (memMb / 512) * 100))}%`,
                                      }}
                                    />
                                  </div>
                                </td>

                                {/* Uptime & Restarts */}
                                <td className="px-4 py-3.5 font-tech tabular-nums">
                                  <div className="font-semibold text-zinc-800 dark:text-zinc-200">
                                    {formatProcessUptime(proc.uptimeMs, proc.status)}
                                  </div>
                                  <div
                                    className={`text-[11px] ${
                                      highRestarts
                                        ? "text-amber-400 font-semibold"
                                        : "text-zinc-400"
                                    }`}
                                  >
                                    {proc.restarts} restarts
                                  </div>
                                </td>

                                {/* Inline Quick Tenant Assignment */}
                                <td className="px-4 py-3.5">
                                  <div className="flex items-center gap-1.5">
                                    <select
                                      value={proc.clientId || ""}
                                      onChange={(e) => handleQuickAssignTenant(proc, e.target.value)}
                                      className={`max-w-[175px] px-2.5 py-1 rounded-lg border text-xs font-tech transition cursor-pointer focus:outline-none focus:ring-1 focus:ring-blue-500 ${
                                        proc.clientId
                                          ? "bg-blue-500/10 border-blue-500/30 text-blue-600 dark:text-blue-400 font-semibold"
                                          : "bg-zinc-100 dark:bg-zinc-800/60 border-zinc-200 dark:border-zinc-800 text-zinc-400 italic"
                                      }`}
                                    >
                                      <option value="">Unassigned</option>
                                      {clients.map((c) => (
                                        <option key={c.id} value={c.id}>
                                          {c.name}
                                        </option>
                                      ))}
                                    </select>
                                  </div>
                                </td>

                                {/* Operations Suite Action Buttons */}
                                <td className="px-5 py-3.5 text-right">
                                  <div className="inline-flex items-center justify-end gap-1.5">
                                    {/* 1. Start / Restart Button */}
                                    <button
                                      type="button"
                                      disabled={isRestarting}
                                      onClick={() => handleRestartProcess(proc)}
                                      className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-tech font-semibold border transition cursor-pointer disabled:opacity-50 ${
                                        isOnline
                                          ? "bg-zinc-100 dark:bg-zinc-800 hover:bg-blue-600 hover:text-white hover:border-blue-500 border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-200"
                                          : "bg-emerald-500/15 hover:bg-emerald-600 hover:text-white border-emerald-500/30 text-emerald-400"
                                      }`}
                                      title={
                                        isOnline
                                          ? `Restart ${proc.name} (pm2 restart ${proc.pm2Id})`
                                          : `Start ${proc.name} (pm2 restart ${proc.pm2Id})`
                                      }
                                    >
                                      {isRestarting ? (
                                        <IosSpinner size="xs" className="text-current" />
                                      ) : isOnline ? (
                                        <RotateCw className="w-3.5 h-3.5" />
                                      ) : (
                                        <Play className="w-3.5 h-3.5" />
                                      )}
                                      <span className="hidden sm:inline">
                                        {isOnline ? "Restart" : "Start"}
                                      </span>
                                    </button>

                                    {/* 2. Live Terminal Logs Button */}
                                    <button
                                      type="button"
                                      onClick={() => openLogsDrawer(proc)}
                                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-tech font-semibold bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 border border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-200 transition cursor-pointer"
                                      title="View Live PM2 Process Logs"
                                    >
                                      <Terminal className="w-3.5 h-3.5 text-blue-400" />
                                      <span className="hidden md:inline">Logs</span>
                                    </button>

                                    {/* 3. Smart Diagnose & Auto-Heal Button */}
                                    <button
                                      type="button"
                                      onClick={() => runDiagnostics(proc, false)}
                                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-tech font-semibold bg-indigo-500/10 hover:bg-indigo-500/20 border border-indigo-500/25 text-indigo-400 transition cursor-pointer"
                                      title="Run Autonomous Diagnostics & Log Analysis"
                                    >
                                      <Stethoscope className="w-3.5 h-3.5" />
                                      <span className="hidden xl:inline">Diagnose</span>
                                    </button>

                                    {/* 4. Advanced Policy Configuration */}
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setMappingProcess(proc);
                                        setMapClientId(proc.clientId || "");
                                        setMapAllowRestart(proc.allowClientRestart);
                                        setMapCooldown(String(proc.restartCooldownSec));
                                        setIsMappingOpen(true);
                                      }}
                                      className="p-1.5 rounded-lg bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 border border-zinc-200 dark:border-zinc-700 text-zinc-400 hover:text-zinc-100 transition cursor-pointer"
                                      title="Configure Self-Service Restart & Cooldown Policy"
                                    >
                                      <SlidersHorizontal className="w-3.5 h-3.5" />
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </>
            ) : (
              <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-12 text-center text-zinc-400">
                Select a server from the left rail to inspect live telemetry and manage PM2 processes.
              </div>
            )}
          </section>
        </div>
      </main>

      {/* =====================================================================
          SLIDE-OVER DRAWER 1: LIVE PM2 TERMINAL LOGS VIEWER
         ===================================================================== */}
      {logsTarget && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex justify-end">
          <div className="bg-zinc-950 border-l border-zinc-800 w-full max-w-3xl h-full flex flex-col shadow-2xl">
            {/* Drawer Header */}
            <div className="px-6 py-4 border-b border-zinc-800 flex items-center justify-between gap-4">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-9 h-9 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400 shrink-0">
                  <Terminal className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="font-steel font-bold text-base text-white truncate">
                      {logsTarget.name}
                    </h3>
                    <span className="px-2 py-0.5 rounded bg-zinc-800 text-zinc-300 font-tech text-[11px]">
                      pm2_id: {logsTarget.pm2Id}
                    </span>
                  </div>
                  <p className="text-xs text-zinc-400 font-tech">
                    Non-streaming stdout/stderr tail via sanitized SSH channel
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => {
                  setAutoRefreshLogs(false);
                  setLogsTarget(null);
                }}
                className="p-2 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Drawer Controls Bar */}
            <div className="px-6 py-3 bg-zinc-900/80 border-b border-zinc-800 flex flex-wrap items-center justify-between gap-3 text-xs font-tech">
              <div className="flex items-center gap-2 flex-1 min-w-[200px]">
                <div className="relative flex-1">
                  <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={logsSearch}
                    onChange={(e) => setLogsSearch(e.target.value)}
                    placeholder="Filter log lines (e.g. error, warn, port)..."
                    className="w-full pl-8 pr-3 py-1.5 rounded-lg bg-zinc-950 border border-zinc-800 text-zinc-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>

                <select
                  value={logsLines}
                  onChange={(e) => {
                    const n = Number(e.target.value);
                    setLogsLines(n);
                    void fetchProcessLogs(logsTarget, n);
                  }}
                  className="px-2.5 py-1.5 rounded-lg bg-zinc-950 border border-zinc-800 text-zinc-200"
                >
                  <option value={50}>50 lines</option>
                  <option value={100}>100 lines</option>
                  <option value={250}>250 lines</option>
                  <option value={500}>500 lines</option>
                </select>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setAutoRefreshLogs(!autoRefreshLogs)}
                  className={`px-2.5 py-1.5 rounded-lg border transition cursor-pointer flex items-center gap-1.5 ${
                    autoRefreshLogs
                      ? "bg-emerald-500/15 border-emerald-500/30 text-emerald-400"
                      : "bg-zinc-950 border-zinc-800 text-zinc-400 hover:text-zinc-200"
                  }`}
                >
                  <span
                    className={`w-2 h-2 rounded-full ${
                      autoRefreshLogs ? "bg-emerald-400 animate-ping" : "bg-zinc-500"
                    }`}
                  />
                  Live Tail (5s)
                </button>

                <button
                  type="button"
                  onClick={() => fetchProcessLogs(logsTarget, logsLines)}
                  disabled={isLoadingLogs}
                  className="px-2.5 py-1.5 rounded-lg bg-zinc-950 border border-zinc-800 text-zinc-300 hover:text-white transition cursor-pointer"
                  title="Refresh Logs"
                >
                  {isLoadingLogs ? (
                    <IosSpinner size="xs" className="text-blue-400" />
                  ) : (
                    <RefreshCw className="w-3.5 h-3.5" />
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => copyToClipboard(logsContent, "logs-copy")}
                  className="px-2.5 py-1.5 rounded-lg bg-zinc-950 border border-zinc-800 text-zinc-300 hover:text-white transition cursor-pointer inline-flex items-center gap-1"
                >
                  {copiedText === "logs-copy" ? (
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
                  onClick={() => {
                    const blob = new Blob([logsContent], { type: "text/plain;charset=utf-8" });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement("a");
                    a.href = url;
                    a.download = `${logsTarget.name}-pm2-${logsTarget.pm2Id}.log`;
                    a.click();
                    URL.revokeObjectURL(url);
                  }}
                  className="px-2.5 py-1.5 rounded-lg bg-zinc-950 border border-zinc-800 text-zinc-300 hover:text-white transition cursor-pointer inline-flex items-center gap-1"
                  title="Download .log file"
                >
                  <Download className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* Terminal Output Viewport */}
            <div className="flex-1 overflow-y-auto p-5 font-mono text-[11px] leading-relaxed bg-zinc-950 text-zinc-300 selection:bg-blue-500/30">
              {isLoadingLogs && !logsContent ? (
                <div className="h-full flex flex-col items-center justify-center text-zinc-500 gap-2">
                  <IosSpinner size="md" className="text-blue-500" />
                  <span className="font-tech text-xs">
                    Fetching last {logsLines} lines from PM2 daemon...
                  </span>
                </div>
              ) : filteredLogLines.length === 0 ? (
                <div className="text-zinc-500 italic">No matching log lines found.</div>
              ) : (
                <div className="space-y-0.5">
                  {filteredLogLines.map((line, idx) => {
                    const lower = line.toLowerCase();
                    const isErr =
                      lower.includes("error") ||
                      lower.includes("exception") ||
                      lower.includes("fatal") ||
                      lower.includes("eaddrinuse");
                    const isWarn = lower.includes("warn");
                    return (
                      <div
                        key={idx}
                        className={`px-2 py-0.5 rounded whitespace-pre-wrap break-all ${
                          isErr
                            ? "bg-rose-500/10 text-rose-300"
                            : isWarn
                            ? "bg-amber-500/10 text-amber-300"
                            : "hover:bg-zinc-900/80"
                        }`}
                      >
                        {line}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          MODAL 2: SMART DIAGNOSTICS & AUTO-HEAL ENGINE
         ===================================================================== */}
      {diagTarget && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl max-w-xl w-full p-6 shadow-2xl space-y-5">
            <div className="flex items-center justify-between border-b border-zinc-200 dark:border-zinc-800 pb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400">
                  <Sparkles className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-steel font-bold text-base text-zinc-900 dark:text-white">
                    Autonomous Process Diagnostics
                  </h3>
                  <p className="text-xs text-zinc-400 font-tech">
                    {diagTarget.name} (pm2_id: {diagTarget.pm2Id})
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setDiagTarget(null);
                  setDiagReport(null);
                }}
                className="text-zinc-400 hover:text-zinc-200 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {isDiagnosing ? (
              <div className="py-10 text-center space-y-3">
                <IosSpinner size="md" className="mx-auto text-indigo-500" />
                <p className="text-xs font-tech text-zinc-400">
                  Inspecting recent stdout/stderr streams, exit codes, and crash-loop signatures...
                </p>
              </div>
            ) : diagReport ? (
              <div className="space-y-4 text-xs">
                <div className="flex items-center justify-between p-3.5 rounded-xl bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800">
                  <div>
                    <div className="text-[10px] font-tech uppercase text-zinc-400">
                      Diagnostic Verdict
                    </div>
                    <div className="font-bold text-sm text-zinc-900 dark:text-white mt-0.5">
                      {diagReport.diagnostic.title}
                    </div>
                  </div>
                  <span
                    className={`px-2.5 py-1 rounded-full text-[11px] font-tech font-bold ${
                      diagReport.diagnostic.severity === "HEALTHY"
                        ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30"
                        : diagReport.diagnostic.severity === "WARNING"
                        ? "bg-amber-500/15 text-amber-400 border border-amber-500/30"
                        : "bg-rose-500/15 text-rose-400 border border-rose-500/30"
                    }`}
                  >
                    {diagReport.diagnostic.severity} · {diagReport.diagnostic.category}
                  </span>
                </div>

                <div className="space-y-2">
                  <div className="font-semibold text-zinc-300">Summary Analysis</div>
                  <p className="text-zinc-400 leading-relaxed bg-zinc-50 dark:bg-zinc-950/60 p-3 rounded-xl border border-zinc-200 dark:border-zinc-800">
                    {diagReport.diagnostic.summary}
                  </p>
                </div>

                {diagReport.diagnostic.extractedError && (
                  <div className="space-y-1.5">
                    <div className="font-semibold text-rose-400">Extracted Error Signature</div>
                    <pre className="p-3 rounded-xl bg-rose-950/30 border border-rose-900/50 text-rose-200 font-mono text-[11px] overflow-x-auto whitespace-pre-wrap">
                      {diagReport.diagnostic.extractedError}
                    </pre>
                  </div>
                )}

                <div className="space-y-1.5">
                  <div className="font-semibold text-blue-400">Recommended Remediation</div>
                  <p className="text-zinc-300 bg-blue-500/5 border border-blue-500/20 p-3 rounded-xl">
                    {diagReport.diagnostic.recommendation}
                  </p>
                </div>

                {diagReport.healAttempted && (
                  <div
                    className={`p-3 rounded-xl border font-tech ${
                      diagReport.healSuccess
                        ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-300"
                        : "bg-amber-500/10 border-amber-500/30 text-amber-300"
                    }`}
                  >
                    {diagReport.healMessage || "Auto-heal executed."}
                  </div>
                )}

                <div className="pt-3 border-t border-zinc-200 dark:border-zinc-800 flex items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      const target = diagTarget;
                      setDiagTarget(null);
                      openLogsDrawer(target);
                    }}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-zinc-700 hover:bg-zinc-800 text-zinc-300 font-tech font-semibold transition cursor-pointer"
                  >
                    <Terminal className="w-3.5 h-3.5" /> Open Full Terminal Logs
                  </button>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      disabled={isHealing}
                      onClick={() => runDiagnostics(diagTarget, true)}
                      className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-tech font-semibold transition cursor-pointer disabled:opacity-50"
                    >
                      {isHealing ? (
                        <IosSpinner size="xs" className="text-white" />
                      ) : (
                        <Zap className="w-3.5 h-3.5" />
                      )}
                      {isHealing ? "Healing..." : "Execute Auto-Heal & Restart"}
                    </button>
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      )}

      {/* =====================================================================
          MODAL 3: REGISTER NEW FLEET SERVER
         ===================================================================== */}
      {isRegisterOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl max-w-lg w-full p-6 shadow-xl space-y-4">
            <div className="flex items-center justify-between border-b border-zinc-200 dark:border-zinc-800 pb-3">
              <h3 className="font-bold text-lg">Register New Fleet Server</h3>
              <button
                type="button"
                onClick={() => setIsRegisterOpen(false)}
                className="text-zinc-400 hover:text-zinc-600 transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {formError && (
              <div className="p-3 rounded-lg bg-rose-50 dark:bg-rose-950/40 text-xs text-rose-600 border border-rose-200 dark:border-rose-900">
                {formError}
              </div>
            )}

            <form onSubmit={handleRegister} className="space-y-3 text-xs">
              <div>
                <label className="block font-semibold mb-1">Server Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. prod-oracle-vm-01"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div className="col-span-2">
                  <label className="block font-semibold mb-1">Host / IP *</label>
                  <input
                    type="text"
                    required
                    placeholder="192.168.1.100 or fqdn"
                    value={formHost}
                    onChange={(e) => setFormHost(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block font-semibold mb-1">SSH Port</label>
                  <input
                    type="number"
                    value={formPort}
                    onChange={(e) => setFormPort(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold mb-1">SSH Username</label>
                <input
                  type="text"
                  value={formUsername}
                  onChange={(e) => setFormUsername(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block font-semibold mb-1">
                  SSH Private Key (OpenSSH RSA/Ed25519) *
                </label>
                <textarea
                  required
                  rows={4}
                  placeholder="-----BEGIN OPENSSH PRIVATE KEY-----..."
                  value={formPrivateKey}
                  onChange={(e) => setFormPrivateKey(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 font-mono text-[11px] focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block font-semibold mb-1">Passphrase (optional)</label>
                  <input
                    type="password"
                    value={formPassphrase}
                    onChange={(e) => setFormPassphrase(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block font-semibold mb-1">Host Fingerprint (optional)</label>
                  <input
                    type="text"
                    placeholder="SHA256:..."
                    value={formFingerprint}
                    onChange={(e) => setFormFingerprint(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div className="pt-3 border-t border-zinc-200 dark:border-zinc-800 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsRegisterOpen(false)}
                  className="px-4 py-2 border border-zinc-300 dark:border-zinc-700 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white font-semibold rounded-lg transition cursor-pointer"
                >
                  {isSubmitting ? "Encrypting & Saving..." : "Register Server"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =====================================================================
          MODAL 4: SINGLE PROCESS POLICY & TENANT CONFIGURATION
         ===================================================================== */}
      {isMappingOpen && mappingProcess && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl max-w-md w-full p-6 shadow-xl space-y-4">
            <div className="flex items-center justify-between border-b border-zinc-200 dark:border-zinc-800 pb-3">
              <h3 className="font-bold text-base">Configure Process Ownership &amp; Policy</h3>
              <button
                type="button"
                onClick={() => setIsMappingOpen(false)}
                className="text-zinc-400 hover:text-zinc-600 transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-3 bg-zinc-50 dark:bg-zinc-800/60 rounded-lg text-xs space-y-1">
              <div className="font-semibold text-zinc-900 dark:text-zinc-100">
                {mappingProcess.name}
              </div>
              <div className="text-zinc-500 font-mono">pm2_id: {mappingProcess.pm2Id}</div>
            </div>

            <form onSubmit={handleSaveMapping} className="space-y-4 text-xs">
              <div>
                <label className="block font-semibold mb-1">Assign to Client Organization</label>
                <select
                  value={mapClientId}
                  onChange={(e) => setMapClientId(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">-- No Client (Unassigned) --</option>
                  {clients.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({c.id})
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="allowRestart"
                  checked={mapAllowRestart}
                  onChange={(e) => setMapAllowRestart(e.target.checked)}
                  className="rounded text-blue-600"
                />
                <label htmlFor="allowRestart" className="font-medium cursor-pointer">
                  Allow Client Self-Service Restart in Portal
                </label>
              </div>

              <div>
                <label className="block font-semibold mb-1">Restart Cooldown (seconds)</label>
                <input
                  type="number"
                  min="10"
                  max="3600"
                  value={mapCooldown}
                  onChange={(e) => setMapCooldown(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950"
                />
                <span className="text-[11px] text-zinc-400 mt-1 block">
                  Enforces rate-limiting on client restarts to prevent abuse.
                </span>
              </div>

              <div className="pt-3 border-t border-zinc-200 dark:border-zinc-800 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsMappingOpen(false)}
                  className="px-4 py-2 border border-zinc-300 dark:border-zinc-700 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSavingMap}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white font-semibold rounded-lg transition cursor-pointer"
                >
                  {isSavingMap ? "Saving..." : "Save Configuration"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =====================================================================
          MODAL 5: BULK TENANT ASSIGNMENT
         ===================================================================== */}
      {isBulkMappingOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl max-w-md w-full p-6 shadow-xl space-y-4">
            <div className="flex items-center justify-between border-b border-zinc-200 dark:border-zinc-800 pb-3">
              <h3 className="font-bold text-base">
                Bulk Assign {selectedProcessIds.length} Processes
              </h3>
              <button
                type="button"
                onClick={() => setIsBulkMappingOpen(false)}
                className="text-zinc-400 hover:text-zinc-600 transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveBulkMapping} className="space-y-4 text-xs">
              <div>
                <label className="block font-semibold mb-1">Assign to Client Organization</label>
                <select
                  value={mapClientId}
                  onChange={(e) => setMapClientId(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">-- Unassign All Selected --</option>
                  {clients.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({c.id})
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="bulkAllowRestart"
                  checked={mapAllowRestart}
                  onChange={(e) => setMapAllowRestart(e.target.checked)}
                  className="rounded text-blue-600"
                />
                <label htmlFor="bulkAllowRestart" className="font-medium cursor-pointer">
                  Allow Client Self-Service Restart
                </label>
              </div>

              <div>
                <label className="block font-semibold mb-1">Restart Cooldown (seconds)</label>
                <input
                  type="number"
                  min="10"
                  max="3600"
                  value={mapCooldown}
                  onChange={(e) => setMapCooldown(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950"
                />
              </div>

              <div className="pt-3 border-t border-zinc-200 dark:border-zinc-800 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsBulkMappingOpen(false)}
                  className="px-4 py-2 border border-zinc-300 dark:border-zinc-700 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSavingMap}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white font-semibold rounded-lg transition cursor-pointer"
                >
                  {isSavingMap ? "Applying..." : `Apply to ${selectedProcessIds.length} Processes`}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

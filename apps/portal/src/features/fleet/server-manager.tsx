"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
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
  ArrowLeft,
  X,
  Play,
  Activity,
  Shield,
  Radio,
  Zap,
  Gauge,
  Layers,
  Terminal,
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

interface ServerManagerProps {
  initialServers: SerializedServer[];
  clients: ClientOption[];
}

export function ServerManager({ initialServers, clients }: ServerManagerProps) {
  const { showSuccess, showError } = useAlert();
  const [servers, setServers] = useState<SerializedServer[]>(initialServers);
  const [selectedServerId, setSelectedServerId] = useState<string | null>(
    initialServers[0]?.id ?? null,
  );
  const [serverStats, setServerStats] = useState<Record<string, ServerStatsData>>({});
  const [loadingStatsId, setLoadingStatsId] = useState<string | null>(null);
  const [isRegisterOpen, setIsRegisterOpen] = useState(false);
  const [isMappingOpen, setIsMappingOpen] = useState(false);
  const [mappingProcess, setMappingProcess] = useState<SerializedProcess | null>(null);

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

  const selectedServer = servers.find((s) => s.id === selectedServerId);
  const selectedStats = selectedServerId ? serverStats[selectedServerId] : null;

  const fetchStats = async (serverId: string, force = false) => {
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
      setLoadingStatsId(null);
    }
  };

  useEffect(() => {
    if (!selectedServerId || serverStats[selectedServerId]) return;
    let isCancelled = false;

    fetch(`/api/v1/admin/servers/${selectedServerId}/stats`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!isCancelled && data?.stats) {
          setServerStats((prev) => ({ ...prev, [selectedServerId]: data.stats }));
        }
      })
      .catch((err) => console.error("Failed to load server stats:", err));

    return () => {
      isCancelled = true;
    };
  }, [selectedServerId, serverStats]);

  // Loading states
  const [discoveringId, setDiscoveringId] = useState<string | null>(null);

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
        lastCheckedAt: data.server.lastCheckedAt ? new Date(data.server.lastCheckedAt).getTime() : null,
        errorMessage: null,
        createdAt: Date.now(),
        processes: [],
      };

      setServers((prev) => [...prev, newServer]);
      setSelectedServerId(newServer.id);
      setIsRegisterOpen(false);
      showSuccess(
        "Server Registered in Fleet Vault",
        `Server '${data.server.name}' (${data.server.host}:${data.server.port}) is securely registered. Private key is encrypted at rest using AES-256-GCM. Run PM2 discovery to link running processes.`,
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

  async function handleDiscover(serverId: string) {
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
            : s,
        ),
      );

      // Trigger stats poll concurrently
      fetchStats(serverId, true);

      showSuccess(
        "PM2 Discovery Complete",
        `Successfully scanned ${targetServer?.name || "Server"}. Found ${mappedProcesses.length} managed process(es). Live telemetry and client mapping updated.`,
        [
          { label: "Server", value: targetServer?.name || "Server" },
          { label: "Active Processes", value: `${mappedProcesses.length} processes` },
          { label: "Server Status", value: "ONLINE" },
        ]
      );
    } catch (err: any) {
      showError("PM2 Discovery Failed", err.message, [
        { label: "Server ID", value: serverId },
      ]);
    } finally {
      setDiscoveringId(null);
    }
  }

  async function handleDeleteServer(serverId: string) {
    const targetServer = servers.find((s) => s.id === serverId);
    if (!confirm(`Are you sure you want to remove '${targetServer?.name || serverId}' from the fleet vault?`)) return;

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
      showSuccess("Server Removed", `Server '${targetServer?.name || serverId}' was removed from the fleet.`);
    } catch (err: any) {
      showError("Delete Server Failed", err.message);
    }
  }

  async function handleSaveMapping(e: React.FormEvent) {
    e.preventDefault();
    if (!mappingProcess) return;

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

      // Update in local state
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
              : p,
          ),
        })),
      );

      const targetClient = clients.find((c) => c.id === mapClientId);
      showSuccess(
        "Process Mapping Updated",
        `PM2 process '${mappingProcess.name}' (ID: ${mappingProcess.pm2Id}) is now assigned.`,
        [
          { label: "Process Name", value: mappingProcess.name },
          { label: "PM2 Process ID", value: String(mappingProcess.pm2Id) },
          { label: "Mapped Client", value: targetClient?.name || "Unassigned" },
          { label: "Client Restart", value: mapAllowRestart ? `Allowed (Cooldown: ${mapCooldown}s)` : "Disabled" },
        ]
      );

      setIsMappingOpen(false);
      setMappingProcess(null);
    } catch (err: any) {
      showError("Process Mapping Failed", err.message);
    }
  }

  function getStatusBadge(status: string) {
    switch (status) {
      case "online":
        return (
          <span className="steel-pill inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
            <CheckCircle2 className="w-3.5 h-3.5" /> Online
          </span>
        );
      case "degraded":
        return (
          <span className="steel-pill inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
            <AlertTriangle className="w-3.5 h-3.5" /> Degraded
          </span>
        );
      case "unreachable":
      case "errored":
        return (
          <span className="steel-pill inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20">
            <XCircle className="w-3.5 h-3.5" /> Unreachable
          </span>
        );
      default:
        return (
          <span className="steel-pill inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-zinc-500/10 text-zinc-500 border border-zinc-500/20">
            <Clock className="w-3.5 h-3.5" /> {status}
          </span>
        );
    }
  }

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 flex flex-col">
      {/* Main Grid */}
      <main className="flex-1 w-full px-4 sm:px-6 lg:px-8 xl:px-10 py-8 space-y-6">
        {/* Page Action Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 flex items-center justify-center border border-blue-200/60 dark:border-blue-800/60 shadow-xs">
              <ServerIcon className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-fluid-title steel-heading text-zinc-900 dark:text-white">
                Fleet Operations &amp; PM2
              </h1>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 font-sans">
                Manage remote servers, execute SSH telemetry, discover and map PM2 processes to tenants
              </p>
            </div>
          </div>

          <button
            onClick={() => setIsRegisterOpen(true)}
            className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 active:scale-[0.99] text-white font-semibold text-xs rounded-lg transition shadow-xs self-start sm:self-auto cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span className="font-tech font-bold">Register Server</span>
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Server List Column */}
          <div className="lg:col-span-1 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="steel-metric-label text-zinc-500">
                Registered Servers ({servers.length})
              </h2>
            </div>

            {servers.length === 0 ? (
              <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-8 text-center text-zinc-500 font-sans">
                <ServerIcon className="w-8 h-8 mx-auto mb-2 opacity-40" />
                <p className="text-sm">No servers registered yet.</p>
                <button
                  onClick={() => setIsRegisterOpen(true)}
                  className="mt-4 text-xs font-semibold text-blue-600 hover:underline font-tech"
                >
                  Register your first server
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                {servers.map((s) => (
                  <div
                    key={s.id}
                    onClick={() => setSelectedServerId(s.id)}
                    className={`p-4 rounded-xl border transition cursor-pointer ${
                      selectedServerId === s.id
                        ? "bg-white dark:bg-zinc-900 border-blue-600 shadow-sm"
                        : "bg-white/60 dark:bg-zinc-900/40 border-zinc-200 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700"
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div>
                        <h3 className="font-steel font-bold text-zinc-900 dark:text-zinc-100">{s.name}</h3>
                        <p className="text-xs text-zinc-500 font-tech mt-0.5">
                          {s.username}@{s.host}:{s.port}
                        </p>
                      </div>
                      {getStatusBadge(s.status)}
                    </div>

                    <div className="mt-4 pt-3 border-t border-zinc-100 dark:border-zinc-800 flex items-center justify-between text-xs text-zinc-400 font-tech">
                      <span>{s.processes.length} Processes</span>
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDiscover(s.id);
                          }}
                          disabled={discoveringId === s.id}
                          className="p-1 hover:text-blue-600 transition"
                          title="Discover PM2 Processes"
                        >
                          {discoveringId === s.id ? (
                            <IosSpinner size="xs" className="text-blue-600" />
                          ) : (
                            <RefreshCw className="w-3.5 h-3.5" />
                          )}
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteServer(s.id);
                          }}
                          className="p-1 hover:text-rose-600 transition"
                          title="Delete Server"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Server Details & Processes Column */}
          <div className="lg:col-span-2 space-y-6">
            {selectedServer ? (
              <>
                {/* Server Overview Card */}
                <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-6 shadow-sm space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="flex items-center gap-3">
                        <h2 className="text-fluid-title steel-heading">{selectedServer.name}</h2>
                        {getStatusBadge(selectedServer.status)}
                      </div>
                      <p className="font-tech text-xs text-zinc-500 mt-1">
                        Host: {selectedServer.host} • Port: {selectedServer.port} • User: {selectedServer.username}
                      </p>
                    </div>

                    <button
                      onClick={() => handleDiscover(selectedServer.id)}
                      disabled={discoveringId === selectedServer.id}
                      className="inline-flex items-center gap-2 px-3 py-1.5 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-xs font-semibold rounded-lg transition font-tech"
                    >
                      {discoveringId === selectedServer.id ? (
                        <IosSpinner size="xs" className="text-current" />
                      ) : (
                        <RefreshCw className="w-3.5 h-3.5" />
                      )}
                      {discoveringId === selectedServer.id ? "Discovering..." : "Discover PM2"}
                    </button>
                  </div>

                  {selectedServer.hostFingerprint && (
                    <div className="p-2.5 rounded-lg bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-800 text-xs font-tech flex items-center gap-2">
                      <Shield className="w-4 h-4 text-blue-500 shrink-0" />
                      <span className="truncate">Fingerprint: {selectedServer.hostFingerprint}</span>
                    </div>
                  )}

                  {selectedServer.errorMessage && (
                    <div className="p-3 rounded-lg bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-xs text-rose-600 dark:text-rose-400 font-tech">
                      {selectedServer.errorMessage}
                    </div>
                  )}
                </div>

                {/* Live Server Telemetry (Zero-Load procfs) */}
                <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-6 shadow-sm space-y-5">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-zinc-100 dark:border-zinc-800">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <Activity className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                        <h3 className="steel-heading text-sm">Server Telemetry &amp; System Health</h3>
                        <span className="steel-pill inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20 font-tech">
                          <Zap className="w-2.5 h-2.5" /> ZERO-LOAD PROCFS
                        </span>
                      </div>
                      <p className="text-xs text-zinc-500 font-sans">
                        Non-invasive runtime telemetry polled via virtual filesystems (/proc/loadavg, /proc/meminfo, df -Pk)
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      {selectedStats?.collectedAt && (
                        <span className="text-[11px] font-tech text-zinc-400">
                          Polled {Math.max(1, Math.round((Date.now() - selectedStats.collectedAt) / 1000))}s ago
                        </span>
                      )}
                      <button
                        onClick={() => fetchStats(selectedServer.id, true)}
                        disabled={loadingStatsId === selectedServer.id}
                        className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-blue-600 hover:bg-blue-500 active:scale-[0.98] text-white text-xs font-semibold rounded-lg shadow-sm transition font-tech cursor-pointer disabled:opacity-50"
                      >
                        {loadingStatsId === selectedServer.id ? (
                          <IosSpinner size="xs" className="text-white" />
                        ) : (
                          <RefreshCw className="w-3.5 h-3.5" />
                        )}
                        {loadingStatsId === selectedServer.id ? "Probing..." : "Poll Live Stats"}
                      </button>
                    </div>
                  </div>

                  {selectedStats ? (
                    <div className="space-y-4">
                      {/* Host Specs Banner */}
                      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5 rounded-xl bg-zinc-950 border border-zinc-800 text-xs font-tech text-zinc-300 shadow-inner">
                        <div className="flex items-center gap-2">
                          <Terminal className="w-4 h-4 text-blue-400 shrink-0" />
                          <span className="font-semibold text-zinc-200">{selectedStats.osPrettyName || "Linux OS"}</span>
                          <span className="text-zinc-600">·</span>
                          <span>Kernel {selectedStats.kernelVersion}</span>
                          <span className="text-zinc-600">·</span>
                          <span className="uppercase text-zinc-400">{selectedStats.architecture}</span>
                        </div>
                        <div className="flex items-center gap-2 text-zinc-400">
                          <span>Uptime:</span>
                          <strong className="font-tech text-emerald-400">{selectedStats.uptimeFormatted}</strong>
                        </div>
                      </div>

                      {/* 4 Telemetry Metric Cards */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                        {/* CPU & Load Card */}
                        <div className="p-4 rounded-xl bg-zinc-900/90 dark:bg-zinc-950/80 border border-zinc-200 dark:border-zinc-800 shadow-xs flex flex-col justify-between space-y-3">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-semibold uppercase tracking-wider font-tech text-zinc-400 flex items-center gap-1.5">
                              <Cpu className="w-4 h-4 text-blue-500" /> CPU Usage
                            </span>
                            <span className="text-xs font-tech text-zinc-400 font-medium">
                              {selectedStats.cpuCores} Cores
                            </span>
                          </div>
                          <div>
                            <div className="flex items-baseline gap-2">
                              <span className="text-3xl font-extrabold font-tech tabular-nums tracking-tight text-zinc-900 dark:text-zinc-50">
                                {selectedStats.cpuUsagePercent}%
                              </span>
                            </div>
                            <div className="w-full bg-zinc-200 dark:bg-zinc-800/80 h-2 rounded-full overflow-hidden mt-2 border border-zinc-200/50 dark:border-zinc-700/40">
                              <div
                                className={`h-full transition-all duration-500 ${
                                  selectedStats.cpuUsagePercent > 85
                                    ? "bg-rose-500"
                                    : selectedStats.cpuUsagePercent > 70
                                    ? "bg-amber-500"
                                    : "bg-blue-600 dark:bg-blue-500"
                                }`}
                                style={{ width: `${Math.min(100, Math.max(2, selectedStats.cpuUsagePercent))}%` }}
                              />
                            </div>
                          </div>
                          <div className="pt-2.5 border-t border-zinc-200/60 dark:border-zinc-800/80 text-[11px] font-tech text-zinc-500 dark:text-zinc-400 space-y-1">
                            <div>Load: <span className="tabular-nums font-semibold text-zinc-800 dark:text-zinc-200">{selectedStats.load1.toFixed(2)} · {selectedStats.load5.toFixed(2)} · {selectedStats.load15.toFixed(2)}</span></div>
                            <div>Threads: <span className="tabular-nums font-semibold text-zinc-800 dark:text-zinc-200">{selectedStats.activeThreads} active / {selectedStats.totalThreads}</span></div>
                          </div>
                        </div>

                        {/* RAM & Swap Card */}
                        <div className="p-4 rounded-xl bg-zinc-900/90 dark:bg-zinc-950/80 border border-zinc-200 dark:border-zinc-800 shadow-xs flex flex-col justify-between space-y-3">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-semibold uppercase tracking-wider font-tech text-zinc-400 flex items-center gap-1.5">
                              <Layers className="w-4 h-4 text-indigo-400" /> RAM Memory
                            </span>
                            <span className="text-xs font-tech text-zinc-400 font-medium">
                              {(selectedStats.memoryTotalMb / 1024).toFixed(1)} GB Total
                            </span>
                          </div>
                          <div>
                            <div className="flex items-baseline gap-2">
                              <span className="text-3xl font-extrabold font-tech tabular-nums tracking-tight text-zinc-900 dark:text-zinc-50">
                                {selectedStats.memoryUsagePercent}%
                              </span>
                            </div>
                            <div className="w-full bg-zinc-200 dark:bg-zinc-800/80 h-2 rounded-full overflow-hidden mt-2 border border-zinc-200/50 dark:border-zinc-700/40">
                              <div
                                className={`h-full transition-all duration-500 ${
                                  selectedStats.memoryUsagePercent > 90
                                    ? "bg-rose-500"
                                    : selectedStats.memoryUsagePercent > 75
                                    ? "bg-amber-500"
                                    : "bg-blue-600 dark:bg-blue-500"
                                }`}
                                style={{ width: `${Math.min(100, Math.max(2, selectedStats.memoryUsagePercent))}%` }}
                              />
                            </div>
                          </div>
                          <div className="pt-2.5 border-t border-zinc-200/60 dark:border-zinc-800/80 text-[11px] font-tech text-zinc-500 dark:text-zinc-400 space-y-1">
                            <div>Used: <span className="tabular-nums font-semibold text-zinc-800 dark:text-zinc-200">{(selectedStats.memoryUsedMb / 1024).toFixed(2)} GB</span></div>
                            <div>Avail: <span className="tabular-nums font-semibold text-zinc-800 dark:text-zinc-200">{(selectedStats.memoryAvailableMb / 1024).toFixed(2)} GB</span></div>
                          </div>
                        </div>

                        {/* Disk Storage Card */}
                        <div className="p-4 rounded-xl bg-zinc-900/90 dark:bg-zinc-950/80 border border-zinc-200 dark:border-zinc-800 shadow-xs flex flex-col justify-between space-y-3">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-semibold uppercase tracking-wider font-tech text-zinc-400 flex items-center gap-1.5">
                              <HardDrive className="w-4 h-4 text-amber-500" /> Storage ({selectedStats.diskMount || "/"})
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
                            <div className="w-full bg-zinc-200 dark:bg-zinc-800/80 h-2 rounded-full overflow-hidden mt-2 border border-zinc-200/50 dark:border-zinc-700/40">
                              <div
                                className={`h-full transition-all duration-500 ${
                                  selectedStats.diskUsagePercent > 90
                                    ? "bg-rose-500"
                                    : selectedStats.diskUsagePercent > 70
                                    ? "bg-amber-500"
                                    : "bg-blue-600 dark:bg-blue-500"
                                }`}
                                style={{ width: `${Math.min(100, Math.max(2, selectedStats.diskUsagePercent))}%` }}
                              />
                            </div>
                          </div>
                          <div className="pt-2.5 border-t border-zinc-200/60 dark:border-zinc-800/80 text-[11px] font-tech text-zinc-500 dark:text-zinc-400 space-y-1">
                            <div>Used: <span className="tabular-nums font-semibold text-zinc-800 dark:text-zinc-200">{selectedStats.diskUsedGb.toFixed(1)} GB</span></div>
                            <div>Free: <span className="tabular-nums font-semibold text-zinc-800 dark:text-zinc-200">{selectedStats.diskFreeGb.toFixed(1)} GB</span></div>
                          </div>
                        </div>

                        {/* PM2 Runtime Footprint Card */}
                        <div className="p-4 rounded-xl bg-zinc-900/90 dark:bg-zinc-950/80 border border-zinc-200 dark:border-zinc-800 shadow-xs flex flex-col justify-between space-y-3">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-semibold uppercase tracking-wider font-tech text-zinc-400 flex items-center gap-1.5">
                              <Gauge className="w-4 h-4 text-emerald-400" /> PM2 Footprint
                            </span>
                            <span className="text-xs font-tech text-emerald-400 font-semibold">
                              {selectedStats.pm2OnlineCount} Online
                            </span>
                          </div>
                          <div>
                            <div className="flex items-baseline gap-2">
                              <span className="text-3xl font-extrabold font-tech tabular-nums tracking-tight text-zinc-900 dark:text-zinc-50">
                                {selectedStats.pm2TotalMemoryMb} <span className="text-xs font-normal text-zinc-400">MB</span>
                              </span>
                            </div>
                            <p className="text-[11px] text-zinc-400 font-tech mt-1">
                              Aggregated PM2 memory
                            </p>
                          </div>
                          <div className="pt-2.5 border-t border-zinc-200/60 dark:border-zinc-800/80 text-[11px] font-tech text-zinc-500 dark:text-zinc-400 space-y-1">
                            <div>Total Proc: <span className="tabular-nums font-semibold text-zinc-800 dark:text-zinc-200">{selectedStats.pm2ProcessCount} registered</span></div>
                            <div>CPU Footprint: <span className="tabular-nums font-semibold text-zinc-800 dark:text-zinc-200">{selectedStats.pm2TotalCpuPercent}% total</span></div>
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="p-6 text-center rounded-xl bg-zinc-50 dark:bg-zinc-800/30 border border-dashed border-zinc-200 dark:border-zinc-800">
                      <Gauge className="w-8 h-8 mx-auto text-zinc-400 mb-2 opacity-50" />
                      <p className="text-xs text-zinc-500 font-sans mb-3">
                        No telemetry cached yet for this server. Query procfs to fetch real-time CPU, RAM, disk, and load averages.
                      </p>
                      <button
                        onClick={() => fetchStats(selectedServer.id, true)}
                        disabled={loadingStatsId === selectedServer.id}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white text-xs font-semibold rounded-lg hover:bg-blue-700 transition font-tech cursor-pointer"
                      >
                        {loadingStatsId === selectedServer.id ? (
                          <IosSpinner size="xs" className="text-white" />
                        ) : (
                          <RefreshCw className="w-3.5 h-3.5" />
                        )}
                        {loadingStatsId === selectedServer.id ? "Probing..." : "Probe Server Telemetry"}
                      </button>
                    </div>
                  )}
                </div>

                {/* PM2 Processes Table */}
                <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl overflow-hidden shadow-sm">
                  <div className="px-6 py-4 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
                    <h3 className="steel-heading text-sm">Discovered PM2 Processes ({selectedServer.processes.length})</h3>
                    <span className="font-tech text-xs text-zinc-400">Multi-tenant mapping controls</span>
                  </div>

                  {selectedServer.processes.length === 0 ? (
                    <div className="p-8 text-center text-zinc-400 text-sm font-sans">
                      No PM2 processes discovered on this server yet. Click &quot;Discover PM2&quot; above to poll over SSH.
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-zinc-50 dark:bg-zinc-800/40 text-zinc-500 border-b border-zinc-200 dark:border-zinc-800">
                          <tr>
                            <th className="steel-metric-label px-6 py-3">PM2 ID / Name</th>
                            <th className="steel-metric-label px-6 py-3">Status</th>
                            <th className="steel-metric-label px-6 py-3">CPU / Memory</th>
                            <th className="steel-metric-label px-6 py-3">Restarts</th>
                            <th className="steel-metric-label px-6 py-3">Mapped Tenant</th>
                            <th className="steel-metric-label px-6 py-3 text-right">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                          {selectedServer.processes.map((proc) => {
                            const mappedClient = clients.find((c) => c.id === proc.clientId);
                            return (
                              <tr key={proc.id} className="hover:bg-zinc-50/50 dark:hover:bg-zinc-800/30">
                                <td className="px-6 py-4">
                                  <div className="font-steel font-bold text-zinc-900 dark:text-zinc-100">{proc.name}</div>
                                  <div className="text-[11px] text-zinc-400 font-tech">pm2_id: {proc.pm2Id}</div>
                                </td>
                                <td className="px-6 py-4">
                                  <span
                                    className={`steel-pill inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] ${
                                      proc.status === "online"
                                        ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                                        : "bg-rose-500/10 text-rose-600 dark:text-rose-400"
                                    }`}
                                  >
                                    <span
                                      className={`w-1.5 h-1.5 rounded-full ${
                                        proc.status === "online" ? "bg-emerald-500" : "bg-rose-500"
                                      }`}
                                    />
                                    {proc.status}
                                  </span>
                                </td>
                                <td className="px-6 py-4 font-tech tabular-nums">
                                  <div className="font-semibold">{proc.cpu}% CPU</div>
                                  <div className="text-[11px] text-zinc-400">
                                    {(proc.memory / 1024 / 1024).toFixed(1)} MB
                                  </div>
                                </td>
                                <td className="px-6 py-4 font-tech font-semibold tabular-nums">{proc.restarts}</td>
                                <td className="px-6 py-4">
                                  {mappedClient ? (
                                    <span className="inline-flex items-center gap-1 text-blue-600 dark:text-blue-400 font-semibold font-tech">
                                      <LinkIcon className="w-3 h-3" />
                                      {mappedClient.name}
                                    </span>
                                  ) : (
                                    <span className="text-zinc-400 italic">Unassigned</span>
                                  )}
                                </td>
                                <td className="px-6 py-4 text-right">
                                  <button
                                    onClick={() => {
                                      setMappingProcess(proc);
                                      setMapClientId(proc.clientId || "");
                                      setMapAllowRestart(proc.allowClientRestart);
                                      setMapCooldown(String(proc.restartCooldownSec));
                                      setIsMappingOpen(true);
                                    }}
                                    className="px-2.5 py-1 text-xs font-semibold bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded transition"
                                  >
                                    Configure
                                  </button>
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
              <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-12 text-center text-zinc-400">
                Select a server on the left to view details and PM2 process status.
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Register Server Modal */}
      {isRegisterOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl max-w-lg w-full p-6 shadow-xl space-y-4">
            <div className="flex items-center justify-between border-b border-zinc-200 dark:border-zinc-800 pb-3">
              <h3 className="font-bold text-lg">Register New Fleet Server</h3>
              <button
                onClick={() => setIsRegisterOpen(false)}
                className="text-zinc-400 hover:text-zinc-600 transition"
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
                  className="w-full px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 focus:outline-none focus:ring-2 focus:ring-indigo-500"
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
                    className="w-full px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="block font-semibold mb-1">SSH Port</label>
                  <input
                    type="number"
                    value={formPort}
                    onChange={(e) => setFormPort(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold mb-1">SSH Username</label>
                <input
                  type="text"
                  value={formUsername}
                  onChange={(e) => setFormUsername(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block font-semibold mb-1">SSH Private Key (OpenSSH RSA/Ed25519) *</label>
                <textarea
                  required
                  rows={4}
                  placeholder="-----BEGIN OPENSSH PRIVATE KEY-----..."
                  value={formPrivateKey}
                  onChange={(e) => setFormPrivateKey(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 font-mono text-[11px] focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block font-semibold mb-1">Passphrase (optional)</label>
                  <input
                    type="password"
                    value={formPassphrase}
                    onChange={(e) => setFormPassphrase(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="block font-semibold mb-1">Host Fingerprint (optional)</label>
                  <input
                    type="text"
                    placeholder="SHA256:..."
                    value={formFingerprint}
                    onChange={(e) => setFormFingerprint(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>

              <div className="pt-3 border-t border-zinc-200 dark:border-zinc-800 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsRegisterOpen(false)}
                  className="px-4 py-2 border rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded-lg transition"
                >
                  {isSubmitting ? "Encrypting & Saving..." : "Register Server"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Map Process Modal */}
      {isMappingOpen && mappingProcess && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl max-w-md w-full p-6 shadow-xl space-y-4">
            <div className="flex items-center justify-between border-b border-zinc-200 dark:border-zinc-800 pb-3">
              <h3 className="font-bold text-base">Configure Process Ownership</h3>
              <button
                onClick={() => setIsMappingOpen(false)}
                className="text-zinc-400 hover:text-zinc-600 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-3 bg-zinc-50 dark:bg-zinc-800/60 rounded-lg text-xs space-y-1">
              <div className="font-semibold text-zinc-900 dark:text-zinc-100">{mappingProcess.name}</div>
              <div className="text-zinc-500 font-mono">Process ID: {mappingProcess.pm2Id}</div>
            </div>

            <form onSubmit={handleSaveMapping} className="space-y-4 text-xs">
              <div>
                <label className="block font-semibold mb-1">Assign to Client Organization</label>
                <select
                  value={mapClientId}
                  onChange={(e) => setMapClientId(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 focus:outline-none focus:ring-2 focus:ring-indigo-500"
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
                  className="rounded text-indigo-600"
                />
                <label htmlFor="allowRestart" className="font-medium cursor-pointer">
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
                <span className="text-[11px] text-zinc-400 mt-1 block">
                  Enforces rate-limiting to prevent restart abuse.
                </span>
              </div>

              <div className="pt-3 border-t border-zinc-200 dark:border-zinc-800 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsMappingOpen(false)}
                  className="px-4 py-2 border rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded-lg transition"
                >
                  Save Configuration
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

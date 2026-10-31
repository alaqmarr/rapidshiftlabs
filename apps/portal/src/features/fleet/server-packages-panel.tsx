"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import {
  Package,
  ShieldAlert,
  CheckCircle2,
  RefreshCw,
  ArrowUpCircle,
  Search,
  AlertTriangle,
  Terminal,
  X,
} from "lucide-react";
import { useAlert } from "@/components/ui/alert-popup";
import { IosSpinner } from "@/components/ui/ios-spinner";

export interface OutdatedPackageItem {
  name: string;
  ecosystem: "apt" | "dnf" | "apk" | "npm-global" | "project-npm";
  currentVersion: string;
  latestVersion: string;
  wantedVersion?: string;
  architecture?: string;
  repository?: string;
  isSecurity: boolean;
  severity: "critical" | "major" | "minor" | "patch";
  projectPath?: string;
}

export interface ServerOutdatedPackagesReport {
  serverId: string;
  collectedAt: number;
  packageManager: "apt" | "dnf" | "apk" | "unknown";
  rebootRequired: boolean;
  totalCount: number;
  securityCount: number;
  osCount: number;
  globalNodeCount: number;
  projectCount: number;
  packages: OutdatedPackageItem[];
  simulatedFallback?: boolean;
}

interface ServerPackagesPanelProps {
  serverId: string;
  serverName: string;
  initialReport?: ServerOutdatedPackagesReport | null;
  onReportUpdated?: (report: ServerOutdatedPackagesReport) => void;
}

export function OutdatedPackagesSummaryStrip({
  report,
  loading,
  onOpenPackagesTab,
}: {
  report: ServerOutdatedPackagesReport | null;
  loading: boolean;
  onOpenPackagesTab: () => void;
}) {
  if (loading && !report) {
    return (
      <div className="flex items-center justify-between gap-3 px-4 py-2.5 rounded-xl bg-zinc-50 dark:bg-zinc-950/70 border border-zinc-200 dark:border-zinc-800/80 text-xs font-tech text-zinc-400">
        <div className="flex items-center gap-2">
          <IosSpinner size="xs" className="text-blue-500" />
          <span>Scanning system &amp; runtime packages for updates...</span>
        </div>
      </div>
    );
  }

  if (!report) return null;

  if (report.totalCount === 0) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5 rounded-xl bg-emerald-500/5 border border-emerald-500/20 text-xs font-tech">
        <div className="flex items-center gap-2 text-emerald-400">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span className="font-semibold">All OS &amp; global Node packages are up to date</span>
        </div>
        <button
          type="button"
          onClick={onOpenPackagesTab}
          className="text-[11px] text-zinc-400 hover:text-white underline cursor-pointer"
        >
          Inspect Package Scanner →
        </button>
      </div>
    );
  }

  const hasSecurity = report.securityCount > 0;

  return (
    <div
      className={`flex flex-wrap items-center justify-between gap-3 px-4 py-2.5 rounded-xl border text-xs font-tech transition ${
        hasSecurity
          ? "bg-amber-500/10 border-amber-500/30 text-amber-200"
          : "bg-blue-500/5 border-blue-500/20 text-zinc-200"
      }`}
    >
      <div className="flex flex-wrap items-center gap-2.5">
        <Package className={`w-4 h-4 shrink-0 ${hasSecurity ? "text-amber-400" : "text-blue-400"}`} />
        <span className="font-bold">
          {report.totalCount} Outdated Package{report.totalCount === 1 ? "" : "s"} Detected
        </span>
        {hasSecurity && (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-500/20 text-rose-300 border border-rose-500/30">
            <ShieldAlert className="w-3 h-3" /> {report.securityCount} Security Critical
          </span>
        )}
        <span className="text-zinc-400 text-[11px]">
          ({report.osCount} {report.packageManager.toUpperCase()} · {report.globalNodeCount} Global NPM)
        </span>
        {report.rebootRequired && (
          <span className="px-2 py-0.5 rounded-full text-[10px] bg-amber-500/20 text-amber-300 border border-amber-500/30">
            Kernel Reboot Pending
          </span>
        )}
      </div>

      <button
        type="button"
        onClick={onOpenPackagesTab}
        className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-white border border-zinc-700 text-[11px] font-semibold transition cursor-pointer"
      >
        <span>View &amp; Upgrade Packages</span>
        <ArrowUpCircle className="w-3.5 h-3.5 text-blue-400" />
      </button>
    </div>
  );
}

export function ServerPackagesPanel({
  serverId,
  serverName,
  initialReport,
  onReportUpdated,
}: ServerPackagesPanelProps) {
  const { showSuccess, showError } = useAlert();
  const [report, setReport] = useState<ServerOutdatedPackagesReport | null>(initialReport || null);
  const [loading, setLoading] = useState(!initialReport);
  const [upgradingKey, setUpgradingKey] = useState<string | null>(null);
  const [filterTab, setFilterTab] = useState<"all" | "security" | "os" | "npm">("all");
  const [search, setSearch] = useState("");
  const [selectedNames, setSelectedNames] = useState<string[]>([]);
  const [upgradeLog, setUpgradeLog] = useState<string | null>(null);

  const scanPackages = useCallback(
    async (refresh = false) => {
      setLoading(true);
      try {
        const res = await fetch(
          `/api/v1/admin/servers/${serverId}/packages${refresh ? "?refresh=1" : ""}`
        );
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Failed to scan outdated packages");
        setReport(data.report);
        onReportUpdated?.(data.report);
      } catch (err: any) {
        showError("Package Scan Failed", err.message);
      } finally {
        setLoading(false);
      }
    },
    [serverId, onReportUpdated, showError]
  );

  useEffect(() => {
    if (initialReport && initialReport.serverId === serverId) {
      return;
    }
    let active = true;
    fetch(`/api/v1/admin/servers/${serverId}/packages`)
      .then((res) => res.json().then((d) => ({ ok: res.ok, d })))
      .then(({ ok, d }) => {
        if (!active) return;
        if (!ok) throw new Error(d.error || "Failed to scan outdated packages");
        setReport(d.report);
        onReportUpdated?.(d.report);
      })
      .catch((err: any) => {
        if (active) showError("Package Scan Failed", err.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [serverId, initialReport, onReportUpdated, showError]);

  const filteredPackages = useMemo(() => {
    if (!report) return [];
    const q = search.trim().toLowerCase();
    return report.packages.filter((pkg) => {
      if (filterTab === "security" && !pkg.isSecurity) return false;
      if (filterTab === "os" && pkg.ecosystem !== "apt" && pkg.ecosystem !== "dnf") return false;
      if (filterTab === "npm" && !pkg.ecosystem.includes("npm")) return false;
      if (
        q &&
        !pkg.name.toLowerCase().includes(q) &&
        !(pkg.repository || "").toLowerCase().includes(q)
      ) {
        return false;
      }
      return true;
    });
  }, [report, filterTab, search]);

  async function handleUpgrade(params: {
    ecosystem: "apt" | "dnf" | "npm-global";
    packages?: string[];
    securityOnly?: boolean;
    label: string;
  }) {
    setUpgradingKey(params.label);
    try {
      const res = await fetch(`/api/v1/admin/servers/${serverId}/packages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ecosystem: params.ecosystem,
          packages: params.packages,
          securityOnly: params.securityOnly,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Upgrade failed");

      if (data.result?.output) {
        setUpgradeLog(`$ ${data.result.commandSummary}\n\n${data.result.output}`);
      }
      if (data.report) {
        setReport(data.report);
        onReportUpdated?.(data.report);
      }
      setSelectedNames([]);
      showSuccess("Packages Upgraded", data.result?.commandSummary || "Upgrade completed.");
    } catch (err: any) {
      showError("Package Upgrade Failed", err.message);
    } finally {
      setUpgradingKey(null);
    }
  }

  const securityAptNames = useMemo(
    () =>
      (report?.packages || [])
        .filter((p) => p.ecosystem === "apt" && p.isSecurity)
        .map((p) => p.name),
    [report]
  );

  return (
    <div className="bg-white dark:bg-zinc-900/90 border border-zinc-200 dark:border-zinc-800/90 rounded-2xl overflow-hidden shadow-xs">
      {/* Header & Bulk Actions */}
      <div className="p-4 sm:p-5 border-b border-zinc-200 dark:border-zinc-800 space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-2.5">
              <h3 className="text-base font-bold steel-heading text-zinc-900 dark:text-white flex items-center gap-2">
                <Package className="w-4 h-4 text-blue-500" />
                Outdated Server Packages &amp; Security Advisory ({serverName})
              </h3>
              {report?.simulatedFallback && (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-tech bg-amber-500/10 text-amber-400 border border-amber-500/30">
                  Sandbox Preview
                </span>
              )}
              {report?.rebootRequired && (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-tech font-bold bg-amber-500/15 text-amber-400 border border-amber-500/30">
                  <AlertTriangle className="w-3 h-3" /> System Reboot Required (/var/run/reboot-required)
                </span>
              )}
            </div>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
              Live audit of upgradable OS packages (<code className="font-mono">apt</code>) and global runtime tools (<code className="font-mono">npm -g</code>) with non-interactive safe patching.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {securityAptNames.length > 0 && (
              <button
                type="button"
                disabled={Boolean(upgradingKey)}
                onClick={() =>
                  handleUpgrade({
                    ecosystem: "apt",
                    packages: securityAptNames,
                    securityOnly: true,
                    label: "security-all",
                  })
                }
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-tech font-bold shadow-xs transition cursor-pointer disabled:opacity-50"
              >
                {upgradingKey === "security-all" ? (
                  <IosSpinner size="xs" className="text-white" />
                ) : (
                  <ShieldAlert className="w-3.5 h-3.5" />
                )}
                Patch Security Updates ({securityAptNames.length})
              </button>
            )}

            {(report?.osCount || 0) > 0 && (
              <button
                type="button"
                disabled={Boolean(upgradingKey)}
                onClick={() =>
                  handleUpgrade({
                    ecosystem: "apt",
                    label: "apt-all",
                  })
                }
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-tech font-bold transition cursor-pointer disabled:opacity-50"
              >
                {upgradingKey === "apt-all" ? (
                  <IosSpinner size="xs" className="text-white" />
                ) : (
                  <ArrowUpCircle className="w-3.5 h-3.5" />
                )}
                Upgrade All APT ({report?.osCount})
              </button>
            )}

            <button
              type="button"
              disabled={loading || Boolean(upgradingKey)}
              onClick={() => scanPackages(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-xs font-tech font-semibold text-zinc-700 dark:text-zinc-200 transition cursor-pointer disabled:opacity-50"
            >
              {loading ? <IosSpinner size="xs" className="text-blue-400" /> : <RefreshCw className="w-3.5 h-3.5" />}
              Refresh `apt update`
            </button>
          </div>
        </div>

        {/* Summary KPI Strip */}
        {report && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs font-tech">
            <div className="p-3 rounded-xl bg-zinc-50 dark:bg-zinc-950/80 border border-zinc-200 dark:border-zinc-800">
              <div className="text-[10px] uppercase text-zinc-400">Total Outdated</div>
              <div className="text-2xl font-extrabold text-zinc-900 dark:text-white mt-0.5">
                {report.totalCount}
              </div>
            </div>
            <div className="p-3 rounded-xl bg-zinc-50 dark:bg-zinc-950/80 border border-zinc-200 dark:border-zinc-800">
              <div className="text-[10px] uppercase text-zinc-400">Security Advisories</div>
              <div
                className={`text-2xl font-extrabold mt-0.5 ${
                  report.securityCount > 0 ? "text-rose-400" : "text-emerald-400"
                }`}
              >
                {report.securityCount}
              </div>
            </div>
            <div className="p-3 rounded-xl bg-zinc-50 dark:bg-zinc-950/80 border border-zinc-200 dark:border-zinc-800">
              <div className="text-[10px] uppercase text-zinc-400">OS Packages (APT)</div>
              <div className="text-2xl font-extrabold text-blue-400 mt-0.5">{report.osCount}</div>
            </div>
            <div className="p-3 rounded-xl bg-zinc-50 dark:bg-zinc-950/80 border border-zinc-200 dark:border-zinc-800">
              <div className="text-[10px] uppercase text-zinc-400">Global Node / CLI</div>
              <div className="text-2xl font-extrabold text-indigo-400 mt-0.5">
                {report.globalNodeCount}
              </div>
            </div>
          </div>
        )}

        {/* Filter & Search Bar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-1.5">
            {(
              [
                { id: "all", label: "All Outdated", count: report?.totalCount ?? 0 },
                { id: "security", label: "Security Critical", count: report?.securityCount ?? 0 },
                { id: "os", label: "OS / APT", count: report?.osCount ?? 0 },
                { id: "npm", label: "Global Node", count: report?.globalNodeCount ?? 0 },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setFilterTab(tab.id)}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-tech font-semibold transition cursor-pointer ${
                  filterTab === tab.id
                    ? "bg-blue-600 text-white"
                    : "bg-zinc-100 dark:bg-zinc-800/70 text-zinc-400 hover:text-white"
                }`}
              >
                <span>{tab.label}</span>
                <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-black/20">
                  {tab.count}
                </span>
              </button>
            ))}
          </div>

          <div className="relative w-full sm:w-64">
            <Search className="w-3.5 h-3.5 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Filter package name or repo..."
              className="w-full pl-8 pr-3 py-1.5 text-xs rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 font-tech focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
        </div>

        {/* Selected APT Batch Bar */}
        {selectedNames.length > 0 && (
          <div className="flex items-center justify-between px-4 py-2 rounded-xl bg-blue-600/10 border border-blue-500/30 text-xs font-tech">
            <span className="text-blue-300 font-semibold">
              {selectedNames.length} APT package(s) selected
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setSelectedNames([])}
                className="text-zinc-400 hover:text-white underline cursor-pointer"
              >
                Clear
              </button>
              <button
                type="button"
                disabled={Boolean(upgradingKey)}
                onClick={() =>
                  handleUpgrade({
                    ecosystem: "apt",
                    packages: selectedNames,
                    label: "selected-apt",
                  })
                }
                className="px-3 py-1 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-bold cursor-pointer"
              >
                Upgrade Selected
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Upgrade Command Output Drawer Banner */}
      {upgradeLog && (
        <div className="p-4 bg-zinc-950 border-b border-zinc-800 space-y-2">
          <div className="flex items-center justify-between text-xs font-tech text-emerald-400">
            <span className="inline-flex items-center gap-1.5 font-bold">
              <Terminal className="w-3.5 h-3.5" /> Last Upgrade Output
            </span>
            <button
              type="button"
              onClick={() => setUpgradeLog(null)}
              className="text-zinc-400 hover:text-white cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <pre className="font-mono text-[11px] text-zinc-300 max-h-40 overflow-y-auto whitespace-pre-wrap">
            {upgradeLog}
          </pre>
        </div>
      )}

      {/* Packages Table */}
      {loading && !report ? (
        <div className="p-12 text-center space-y-2">
          <IosSpinner size="md" className="mx-auto text-blue-500" />
          <p className="text-xs font-tech text-zinc-400">
            Querying server package manager &amp; npm registry...
          </p>
        </div>
      ) : filteredPackages.length === 0 ? (
        <div className="p-12 text-center space-y-2">
          <CheckCircle2 className="w-8 h-8 mx-auto text-emerald-400" />
          <p className="text-sm font-semibold text-zinc-200">
            No outdated packages match this filter
          </p>
          <p className="text-xs text-zinc-400 font-tech">
            {serverName} is clean and up to date.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs font-tech">
            <thead className="bg-zinc-50 dark:bg-zinc-950/70 text-zinc-400 border-b border-zinc-200 dark:border-zinc-800">
              <tr>
                <th className="pl-5 pr-2 py-3 w-8" />
                <th className="px-4 py-3 uppercase text-[10px]">Package</th>
                <th className="px-4 py-3 uppercase text-[10px]">Ecosystem / Repo</th>
                <th className="px-4 py-3 uppercase text-[10px]">Installed → Available</th>
                <th className="px-4 py-3 uppercase text-[10px]">Severity</th>
                <th className="px-5 py-3 text-right uppercase text-[10px]">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-200/70 dark:divide-zinc-800/80">
              {filteredPackages.map((pkg) => {
                const rowKey = `${pkg.ecosystem}:${pkg.name}`;
                const isUpgradingThis = upgradingKey === rowKey;
                const isApt = pkg.ecosystem === "apt";
                const checked = selectedNames.includes(pkg.name);

                return (
                  <tr
                    key={rowKey}
                    className="hover:bg-zinc-50/80 dark:hover:bg-zinc-800/30 transition"
                  >
                    <td className="pl-5 pr-2 py-3">
                      {isApt && (
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedNames((prev) => [...prev, pkg.name]);
                            } else {
                              setSelectedNames((prev) => prev.filter((n) => n !== pkg.name));
                            }
                          }}
                          className="rounded border-zinc-700 text-blue-600 cursor-pointer"
                        />
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-bold text-zinc-900 dark:text-zinc-100 text-sm">
                        {pkg.name}
                      </div>
                      {pkg.architecture && (
                        <div className="text-[10px] text-zinc-500">arch: {pkg.architecture}</div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase border ${
                          pkg.ecosystem === "apt"
                            ? "bg-blue-500/10 text-blue-400 border-blue-500/20"
                            : "bg-indigo-500/10 text-indigo-400 border-indigo-500/20"
                        }`}
                      >
                        {pkg.ecosystem}
                      </span>
                      {pkg.repository && (
                        <span className="ml-2 text-[11px] text-zinc-400">{pkg.repository}</span>
                      )}
                    </td>
                    <td className="px-4 py-3 tabular-nums">
                      <span className="text-zinc-400 line-through mr-1.5">
                        {pkg.currentVersion}
                      </span>
                      <span className="text-zinc-500 mr-1.5">→</span>
                      <span className="text-emerald-400 font-bold">{pkg.latestVersion}</span>
                    </td>
                    <td className="px-4 py-3">
                      {pkg.isSecurity ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-500/15 text-rose-400 border border-rose-500/30">
                          <ShieldAlert className="w-3 h-3" /> SECURITY
                        </span>
                      ) : pkg.severity === "major" ? (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/15 text-amber-400 border border-amber-500/30">
                          MAJOR
                        </span>
                      ) : pkg.severity === "minor" ? (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-blue-500/10 text-blue-400 border border-blue-500/20">
                          MINOR
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded-full text-[10px] text-zinc-400 bg-zinc-800 border border-zinc-700">
                          PATCH
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-3 text-right">
                      <button
                        type="button"
                        disabled={Boolean(upgradingKey)}
                        onClick={() =>
                          handleUpgrade({
                            ecosystem: pkg.ecosystem === "npm-global" ? "npm-global" : "apt",
                            packages: [pkg.name],
                            label: rowKey,
                          })
                        }
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-zinc-100 dark:bg-zinc-800 hover:bg-blue-600 hover:text-white text-zinc-700 dark:text-zinc-200 border border-zinc-200 dark:border-zinc-700 text-[11px] font-semibold transition cursor-pointer disabled:opacity-50"
                      >
                        {isUpgradingThis ? (
                          <IosSpinner size="xs" className="text-current" />
                        ) : (
                          <ArrowUpCircle className="w-3.5 h-3.5" />
                        )}
                        Upgrade
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
  );
}

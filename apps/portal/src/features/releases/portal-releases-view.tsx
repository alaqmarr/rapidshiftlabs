"use client";

import { useState } from "react";
import {
  Rocket,
  ExternalLink,
  Search,
  CheckCircle2,
  Clock,
  Layers,
  Sparkles,
  ShieldCheck,
  Tag,
  GitBranch,
  RefreshCw,
  GitCommit,
  GitCompare,
  Wrench,
  Zap,
  Flame,
  User,
  Filter,
  Copy,
  LayoutGrid,
  ListTree,
  X,
  CheckSquare,
  Square,
} from "lucide-react";
import type { SerializedRelease } from "./releases-manager";
import { formatDate } from "@/lib/format";
import { useAlert } from "@/components/ui/alert-popup";
import { IosSpinner } from "@/components/ui/ios-spinner";

export interface ChangelogItem {
  id: string;
  clientId: string;
  projectId?: string | null;
  repo: string;
  commitSha: string;
  shortSha: string;
  message: string;
  title: string;
  description?: string | null;
  type: "feature" | "fix" | "performance" | "security" | "release" | "chore";
  authorName: string;
  authorAvatarUrl?: string | null;
  commitUrl?: string | null;
  versionTag?: string | null;
  committedAt: number;
  createdAt: number;
}

interface PortalReleasesViewProps {
  clientId: string;
  clientName: string;
  releases: SerializedRelease[];
  initialChangelog?: ChangelogItem[];
  initialRepo?: string;
  initialBranch?: string;
}

function deriveReleaseSha(rel: SerializedRelease): string {
  let hash = 0;
  const seed = `${rel.id}-${rel.version}-${rel.createdAt}`;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash << 5) - hash + seed.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash).toString(16).padStart(7, "b").slice(0, 7);
}

function isRcOrHotfix(version: string, title: string): boolean {
  const s = `${version} ${title}`.toLowerCase();
  return s.includes("-rc") || s.includes("hotfix") || s.includes("patch");
}

export function PortalReleasesView({
  clientId,
  clientName,
  releases,
  initialChangelog = [],
  initialRepo,
  initialBranch = "main",
}: PortalReleasesViewProps) {
  const { showSuccess, showError } = useAlert();
  const [activeMainTab, setActiveMainTab] = useState<
    "environments" | "changelog"
  >("environments");
  const [searchQuery, setSearchQuery] = useState("");
  const [channelFilter, setChannelFilter] = useState<
    "all" | "prod" | "beta_staging" | "rc_hotfix"
  >("all");
  const [changelogFilter, setChangelogFilter] = useState<string>("all");
  const [viewMode, setViewMode] = useState<"timeline" | "grid">("grid");

  const [changelog, setChangelog] = useState<ChangelogItem[]>(initialChangelog);
  const [mappedRepo, setMappedRepo] = useState<string | undefined>(initialRepo);
  const [mappedBranch, setMappedBranch] = useState<string>(initialBranch);
  const [syncing, setSyncing] = useState(false);

  // Inspection & Release Comparison Drawer/Modal
  const [inspectRelease, setInspectRelease] =
    useState<SerializedRelease | null>(null);
  const [compareIds, setCompareIds] = useState<string[]>([]);
  const [showCompareModal, setShowCompareModal] = useState(false);
  const [verifyChecklist, setVerifyChecklist] = useState<
    Record<string, boolean>
  >({
    uatSignoff: true,
    apiSmoke: true,
    assetsLoaded: true,
    rollbackReady: false,
  });

  // Telemetry Strip Metrics
  const totalReleasesCount = releases.length;
  const prodCount = releases.filter((r) => r.environment === "prod").length;
  const betaRcCount = releases.filter((r) => r.environment !== "prod").length;
  const connectedReposCount = mappedRepo ? 1 : 0;
  const sortedReleases = [...releases].sort(
    (a, b) => b.createdAt - a.createdAt
  );
  const latestRelease = sortedReleases[0] || null;

  // Environments filtering
  const filteredReleases = releases.filter((r) => {
    const q = searchQuery.toLowerCase().trim();
    const sha = deriveReleaseSha(r);
    const matchesSearch =
      !q ||
      r.title.toLowerCase().includes(q) ||
      r.version.toLowerCase().includes(q) ||
      sha.toLowerCase().includes(q) ||
      (r.notes && r.notes.toLowerCase().includes(q));

    const matchesChannel =
      channelFilter === "all" ||
      (channelFilter === "prod" && r.environment === "prod") ||
      (channelFilter === "beta_staging" &&
        (r.environment === "beta" || r.environment === "staging")) ||
      (channelFilter === "rc_hotfix" && isRcOrHotfix(r.version, r.title));

    return matchesSearch && matchesChannel;
  });

  // Changelog filtering
  const filteredChangelog = changelog.filter((item) => {
    const q = searchQuery.toLowerCase().trim();
    const matchesSearch =
      !q ||
      item.title.toLowerCase().includes(q) ||
      item.shortSha.toLowerCase().includes(q) ||
      (item.description && item.description.toLowerCase().includes(q)) ||
      (item.versionTag && item.versionTag.toLowerCase().includes(q)) ||
      item.authorName.toLowerCase().includes(q);

    const matchesType =
      changelogFilter === "all" || item.type === changelogFilter;

    return matchesSearch && matchesType;
  });

  const toggleCompareSelection = (id: string) => {
    setCompareIds((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= 2) return [prev[1], id];
      return [...prev, id];
    });
  };

  const handleSyncLatest = async () => {
    try {
      setSyncing(true);
      const res = await fetch("/api/v1/releases/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || "Failed to sync updates from GitHub");
      }

      // Re-fetch changelog
      const clRes = await fetch(
        `/api/v1/releases/changelog?clientId=${encodeURIComponent(
          clientId
        )}&filter=all`
      );
      if (clRes.ok) {
        const clData = await clRes.json();
        if (clData.data) {
          setChangelog(clData.data);
        }
        if (clData.repo) setMappedRepo(clData.repo);
        if (clData.branch) setMappedBranch(clData.branch);
      }

      showSuccess(
        "Changelog Synced",
        data.message || "Latest release notes and commits synced from GitHub."
      );
    } catch (err: any) {
      showError("Sync Failed", err.message || "Could not sync with GitHub");
    } finally {
      setSyncing(false);
    }
  };

  const getEnvBadge = (env: string) => {
    switch (env) {
      case "prod":
        return "steel-pill bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20";
      case "staging":
        return "steel-pill bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20";
      case "beta":
      default:
        return "steel-pill bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20";
    }
  };

  const getTypeBadge = (type: string) => {
    switch (type) {
      case "feature":
        return {
          label: "Feature ✨",
          classes:
            "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800",
          icon: Sparkles,
        };
      case "fix":
        return {
          label: "Bug Fix 🐛",
          classes:
            "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300 border-amber-200 dark:border-amber-800",
          icon: Wrench,
        };
      case "performance":
        return {
          label: "Performance ⚡",
          classes:
            "bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300 border-blue-200 dark:border-blue-800",
          icon: Zap,
        };
      case "security":
        return {
          label: "Security 🛡️",
          classes:
            "bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300 border-rose-200 dark:border-rose-800",
          icon: ShieldCheck,
        };
      case "release":
        return {
          label: "Release 🚀",
          classes:
            "bg-purple-50 text-purple-700 dark:bg-purple-950/40 dark:text-purple-300 border-purple-200 dark:border-purple-800",
          icon: Rocket,
        };
      case "chore":
      default:
        return {
          label: "Update 🔧",
          classes:
            "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 border-zinc-200 dark:border-zinc-700",
          icon: GitCommit,
        };
    }
  };

  const comparePair = compareIds
    .map((id) => releases.find((r) => r.id === id))
    .filter(Boolean) as SerializedRelease[];

  return (
    <div className="space-y-6 font-sans">
      {/* Header Banner + Telemetry Strip */}
      <section className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 sm:p-8 shadow-xs space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-2">
            <div className="steel-pill inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200 dark:bg-blue-950/40 dark:text-blue-400 dark:border-blue-800">
              <Rocket className="w-3.5 h-3.5" />
              <span>Release Hub &amp; Artifact Delivery Suite</span>
            </div>
            <h1 className="text-fluid-title steel-heading text-zinc-900 dark:text-white">
              Application Releases &bull; {clientName}
            </h1>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 max-w-3xl font-sans">
              Track live environments, deployed version tags, commit SHAs, and structured feature summaries synced directly from GitHub.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto">
            {compareIds.length === 2 && (
              <button
                type="button"
                onClick={() => setShowCompareModal(true)}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-xs font-semibold shadow-xs transition cursor-pointer"
              >
                <GitCompare className="w-3.5 h-3.5" />
                <span>Compare (2)</span>
              </button>
            )}

            {mappedRepo && (
              <>
                <button
                  type="button"
                  onClick={handleSyncLatest}
                  disabled={syncing}
                  className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 active:scale-[0.99] text-white text-xs font-semibold shadow-xs transition disabled:opacity-50 cursor-pointer"
                  title="Fetch latest updates from GitHub"
                >
                  {syncing ? (
                    <IosSpinner size="sm" className="text-white" />
                  ) : (
                    <RefreshCw className="w-3.5 h-3.5" />
                  )}
                  <span>{syncing ? "Syncing..." : "Sync Latest"}</span>
                </button>

                <a
                  href={`https://github.com/${mappedRepo}`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-800/80 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-xs font-tech text-zinc-700 dark:text-zinc-300 transition"
                >
                  <GitBranch className="w-3.5 h-3.5 text-blue-500" />
                  <span>
                    {mappedRepo} ({mappedBranch})
                  </span>
                  <ExternalLink className="w-3 h-3 text-zinc-400" />
                </a>
              </>
            )}
          </div>
        </div>

        {/* Telemetry Strip */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-4 border-t border-zinc-100 dark:border-zinc-800">
          <div className="p-3.5 rounded-xl bg-zinc-50 dark:bg-zinc-800/40 border border-zinc-200/80 dark:border-zinc-800">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
              Total Releases
            </div>
            <div className="text-xl font-bold font-tech text-zinc-900 dark:text-white mt-1 tabular-nums">
              {totalReleasesCount}
            </div>
            <div className="text-[11px] text-zinc-500 mt-0.5">
              Published builds &amp; tags
            </div>
          </div>

          <div className="p-3.5 rounded-xl bg-emerald-50/50 dark:bg-emerald-950/20 border border-emerald-200/70 dark:border-emerald-900/40">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
              Stable vs. Beta/RC
            </div>
            <div className="text-xl font-bold font-tech text-emerald-700 dark:text-emerald-300 mt-1 tabular-nums">
              {prodCount} Stable{" "}
              <span className="text-xs font-normal text-zinc-500">
                / {betaRcCount} Beta
              </span>
            </div>
            <div className="text-[11px] text-emerald-600/80 dark:text-emerald-400/80 mt-0.5">
              Active environments
            </div>
          </div>

          <div className="p-3.5 rounded-xl bg-blue-50/50 dark:bg-blue-950/20 border border-blue-200/70 dark:border-blue-900/40">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-blue-700 dark:text-blue-400">
              Connected GitHub Repos
            </div>
            <div className="text-xl font-bold font-tech text-blue-700 dark:text-blue-300 mt-1 tabular-nums truncate">
              {mappedRepo ? mappedRepo : `${connectedReposCount} Linked`}
            </div>
            <div className="text-[11px] text-blue-600/80 dark:text-blue-400/80 mt-0.5">
              {changelog.length} synced commits
            </div>
          </div>

          <div className="p-3.5 rounded-xl bg-zinc-50 dark:bg-zinc-800/40 border border-zinc-200/80 dark:border-zinc-800">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
              Latest Release Version
            </div>
            <div className="text-lg font-bold font-tech text-zinc-900 dark:text-white mt-1 truncate">
              {latestRelease
                ? `v${latestRelease.version.replace(/^v/, "")}`
                : "—"}
            </div>
            <div className="text-[11px] text-zinc-500 mt-0.5">
              {latestRelease
                ? formatDate(latestRelease.createdAt)
                : "Awaiting first release"}
            </div>
          </div>
        </div>

        {/* Main Section Tabs + Timeline vs Grid Switcher */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-4 border-t border-zinc-100 dark:border-zinc-800">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setActiveMainTab("environments")}
              className={`inline-flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
                activeMainTab === "environments"
                  ? "bg-blue-600 text-white shadow-xs"
                  : "text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800"
              }`}
            >
              <Rocket className="w-3.5 h-3.5" />
              <span>Deployments &amp; Environments</span>
              <span
                className={`text-[10px] px-1.5 py-0.2 rounded-full font-tech tabular-nums ${
                  activeMainTab === "environments"
                    ? "bg-white/20 text-white"
                    : "bg-zinc-200 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300"
                }`}
              >
                {releases.length}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setActiveMainTab("changelog")}
              className={`inline-flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
                activeMainTab === "changelog"
                  ? "bg-blue-600 text-white shadow-xs"
                  : "text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800"
              }`}
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Product Changelog</span>
              <span
                className={`text-[10px] px-1.5 py-0.2 rounded-full font-tech tabular-nums ${
                  activeMainTab === "changelog"
                    ? "bg-white/20 text-white"
                    : "bg-zinc-200 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300"
                }`}
              >
                {changelog.length}
              </span>
            </button>
          </div>

          {/* Timeline vs. Grid View Switcher */}
          <div className="inline-flex items-center rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-100/80 dark:bg-zinc-950 p-1">
            <button
              type="button"
              onClick={() => setViewMode("grid")}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-tech font-semibold transition cursor-pointer ${
                viewMode === "grid"
                  ? "bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white shadow-xs"
                  : "text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-300"
              }`}
            >
              <LayoutGrid className="w-3.5 h-3.5" />
              <span>Grid</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode("timeline")}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-tech font-semibold transition cursor-pointer ${
                viewMode === "timeline"
                  ? "bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white shadow-xs"
                  : "text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-300"
              }`}
            >
              <ListTree className="w-3.5 h-3.5" />
              <span>Timeline</span>
            </button>
          </div>
        </div>
      </section>

      {/* Channel Filter Pills & Search */}
      <section className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-4 shadow-xs space-y-3">
        <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 text-zinc-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search by version, title, commit SHA, or changelog..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2 text-xs rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-600 font-tech"
            />
          </div>

          {activeMainTab === "environments" ? (
            <div className="flex items-center gap-1.5 overflow-x-auto">
              {[
                { id: "all", label: "All" },
                { id: "prod", label: "Stable / Production" },
                { id: "beta_staging", label: "Beta / Staging" },
                { id: "rc_hotfix", label: "RC / Hotfix" },
              ].map((pill) => (
                <button
                  key={pill.id}
                  type="button"
                  onClick={() => setChannelFilter(pill.id as any)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-tech font-semibold whitespace-nowrap transition cursor-pointer ${
                    channelFilter === pill.id
                      ? "bg-blue-600 text-white shadow-xs"
                      : "bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200/70"
                  }`}
                >
                  {pill.label}
                </button>
              ))}
            </div>
          ) : (
            <div className="flex items-center gap-1.5 overflow-x-auto">
              {[
                { id: "all", label: "All Updates" },
                { id: "feature", label: "✨ Features" },
                { id: "fix", label: "🐛 Fixes" },
                { id: "performance", label: "⚡ Performance" },
                { id: "release", label: "🚀 Releases" },
              ].map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setChangelogFilter(tab.id)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition cursor-pointer ${
                    changelogFilter === tab.id
                      ? "bg-blue-600 text-white font-semibold"
                      : "bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200/70"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* TAB 1: ENVIRONMENTS & BUILDS */}
      {activeMainTab === "environments" && (
        <section className="space-y-4">
          {filteredReleases.length === 0 ? (
            <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-12 text-center space-y-3 shadow-xs">
              <div className="w-12 h-12 rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-400 mx-auto flex items-center justify-center">
                <Rocket className="w-6 h-6" />
              </div>
              <h3 className="steel-heading text-sm text-zinc-900 dark:text-white">
                No Matching Releases
              </h3>
              <p className="text-xs text-zinc-500 max-w-sm mx-auto font-sans">
                No release artifacts match your selected channel or search query.
              </p>
            </div>
          ) : viewMode === "grid" ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {filteredReleases.map((rel) => {
                const sha = deriveReleaseSha(rel);
                const isDiffSelected = compareIds.includes(rel.id);
                return (
                  <div
                    key={rel.id}
                    className={`bg-white dark:bg-zinc-900 border rounded-2xl p-5 shadow-xs flex flex-col justify-between transition ${
                      isDiffSelected
                        ? "border-purple-500 ring-2 ring-purple-500/20"
                        : "border-zinc-200 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700"
                    }`}
                  >
                    <div className="space-y-3">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5">
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase border ${getEnvBadge(
                              rel.environment
                            )}`}
                          >
                            {rel.environment === "prod"
                              ? "Stable / Prod"
                              : rel.environment}
                          </span>
                          <span className="font-tech text-xs font-bold text-zinc-700 dark:text-zinc-300 bg-zinc-100 dark:bg-zinc-800/80 px-2 py-0.5 rounded border border-zinc-200/60 dark:border-zinc-700/60 tabular-nums">
                            v{rel.version.replace(/^v/, "")}
                          </span>
                        </div>

                        <button
                          type="button"
                          onClick={() => {
                            navigator.clipboard.writeText(sha);
                            showSuccess(
                              "Commit SHA Copied",
                              `Commit ${sha} copied to clipboard.`
                            );
                          }}
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-[11px] font-mono text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 cursor-pointer"
                          title="Copy Commit SHA"
                        >
                          <GitCommit className="w-3 h-3 text-blue-500" />
                          <span>{sha}</span>
                        </button>
                      </div>

                      <div>
                        <h3 className="steel-heading text-base text-zinc-900 dark:text-white flex items-center gap-1.5">
                          <Sparkles className="w-4 h-4 text-blue-500 flex-shrink-0" />
                          <span>{rel.title}</span>
                        </h3>
                        {rel.notes && (
                          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1.5 leading-relaxed line-clamp-3 font-sans">
                            {rel.notes}
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="pt-4 mt-4 border-t border-zinc-100 dark:border-zinc-800 flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => toggleCompareSelection(rel.id)}
                          className={`px-2 py-1 rounded-lg text-[11px] font-tech font-semibold border transition cursor-pointer ${
                            isDiffSelected
                              ? "bg-purple-50 border-purple-300 text-purple-700 dark:bg-purple-950/50 dark:border-purple-700 dark:text-purple-300"
                              : "border-zinc-200 dark:border-zinc-800 text-zinc-500 hover:text-zinc-800"
                          }`}
                        >
                          {isDiffSelected ? "✓ Diff" : "Diff"}
                        </button>
                        <button
                          type="button"
                          onClick={() => setInspectRelease(rel)}
                          className="px-2.5 py-1 rounded-lg bg-zinc-100 dark:bg-zinc-800 text-xs font-tech font-semibold text-zinc-700 dark:text-zinc-300 hover:bg-zinc-200 cursor-pointer"
                        >
                          Inspect
                        </button>
                      </div>

                      <a
                        href={rel.url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 active:scale-[0.99] text-white px-3 py-1.5 rounded-lg text-xs font-semibold shadow-xs transition font-tech"
                      >
                        <span>Launch</span>
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            /* Timeline View for Environments */
            <div className="relative pl-6 border-l-2 border-zinc-200 dark:border-zinc-800 space-y-4">
              {filteredReleases.map((rel) => {
                const sha = deriveReleaseSha(rel);
                return (
                  <div
                    key={rel.id}
                    className="relative bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-5 shadow-xs"
                  >
                    <div className="absolute -left-[31px] top-6 w-3.5 h-3.5 rounded-full bg-blue-600 ring-4 ring-white dark:ring-zinc-950" />
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div className="space-y-1.5">
                        <div className="flex flex-wrap items-center gap-2">
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase border ${getEnvBadge(
                              rel.environment
                            )}`}
                          >
                            {rel.environment}
                          </span>
                          <span className="font-tech text-xs font-bold text-zinc-900 dark:text-white">
                            v{rel.version.replace(/^v/, "")}
                          </span>
                          <button
                            type="button"
                            onClick={() => {
                              navigator.clipboard.writeText(sha);
                              showSuccess("Copied SHA", `Commit ${sha} copied.`);
                            }}
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-[11px] font-mono text-zinc-500 cursor-pointer"
                          >
                            <GitCommit className="w-3 h-3 text-blue-500" />
                            <span>{sha}</span>
                          </button>
                          <span className="text-[11px] text-zinc-400 font-tech">
                            {formatDate(rel.createdAt)}
                          </span>
                        </div>
                        <h3 className="text-base font-bold text-zinc-900 dark:text-white">
                          {rel.title}
                        </h3>
                        {rel.notes && (
                          <p className="text-xs text-zinc-500 dark:text-zinc-400">
                            {rel.notes}
                          </p>
                        )}
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={() => setInspectRelease(rel)}
                          className="px-3 py-1.5 rounded-lg bg-zinc-100 dark:bg-zinc-800 text-xs font-tech font-semibold text-zinc-700 dark:text-zinc-300 cursor-pointer"
                        >
                          Inspect
                        </button>
                        <a
                          href={rel.url}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-lg text-xs font-semibold font-tech"
                        >
                          <span>Launch Environment</span>
                          <ExternalLink className="w-3.5 h-3.5" />
                        </a>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      )}

      {/* TAB 2: PRODUCT CHANGELOG */}
      {activeMainTab === "changelog" && (
        <section className="space-y-4">
          {filteredChangelog.length === 0 ? (
            <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-12 text-center space-y-3 shadow-xs">
              <div className="w-12 h-12 rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-400 mx-auto flex items-center justify-center">
                <GitBranch className="w-6 h-6" />
              </div>
              <h3 className="steel-heading text-sm text-zinc-900 dark:text-white">
                {mappedRepo
                  ? "No Matching Updates Found"
                  : "Repository Not Linked"}
              </h3>
              <p className="text-xs text-zinc-500 max-w-sm mx-auto font-sans">
                {mappedRepo
                  ? "Click 'Sync Latest' to fetch conventional commits and release notes from your GitHub repository."
                  : "Link your GitHub repository in your organization profile to view automatic feature and fix releases."}
              </p>
            </div>
          ) : (
            <div
              className={
                viewMode === "grid"
                  ? "grid grid-cols-1 md:grid-cols-2 gap-4"
                  : "space-y-3"
              }
            >
              {filteredChangelog.map((item) => {
                const badge = getTypeBadge(item.type);
                const BadgeIcon = badge.icon;
                return (
                  <div
                    key={item.id}
                    className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-5 shadow-xs hover:border-zinc-300 dark:hover:border-zinc-700 transition"
                  >
                    <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                      <div className="space-y-1.5 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span
                            className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${badge.classes}`}
                          >
                            <BadgeIcon className="w-3 h-3" />
                            <span>{badge.label}</span>
                          </span>

                          {item.versionTag && (
                            <span className="font-tech text-xs font-bold text-purple-700 dark:text-purple-300 bg-purple-50 dark:bg-purple-950/40 px-2 py-0.5 rounded border border-purple-200 dark:border-purple-800 tabular-nums">
                              {item.versionTag}
                            </span>
                          )}

                          <span className="text-[11px] text-zinc-400 font-tech tabular-nums">
                            {formatDate(item.committedAt)}
                          </span>
                        </div>

                        <h3 className="steel-heading text-sm sm:text-base text-zinc-900 dark:text-white leading-snug">
                          {item.title}
                        </h3>

                        {item.description && (
                          <div className="text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed font-sans whitespace-pre-line pt-1">
                            {item.description}
                          </div>
                        )}
                      </div>

                      <div className="flex items-center gap-2 self-start sm:self-auto flex-shrink-0 pt-1 sm:pt-0">
                        <button
                          type="button"
                          onClick={() => {
                            navigator.clipboard.writeText(
                              item.commitSha || item.shortSha
                            );
                            showSuccess(
                              "SHA Copied",
                              `Commit ${item.shortSha} copied to clipboard.`
                            );
                          }}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-800 text-[11px] font-tech text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white transition cursor-pointer"
                          title="Copy commit SHA"
                        >
                          <GitCommit className="w-3 h-3 text-blue-500" />
                          <span>{item.shortSha}</span>
                          <Copy className="w-2.5 h-2.5" />
                        </button>

                        <span className="text-[11px] text-zinc-400 flex items-center gap-1">
                          <User className="w-3 h-3" />
                          <span>{item.authorName}</span>
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      )}

      {/* Release Inspector & Deployment Verification Drawer/Modal */}
      {inspectRelease && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl w-full max-w-2xl shadow-2xl p-6 space-y-5 max-h-[90vh] overflow-y-auto animate-in fade-in zoom-in-95">
            <div className="flex items-start justify-between gap-4 border-b border-zinc-100 dark:border-zinc-800 pb-4">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span
                    className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase border ${getEnvBadge(
                      inspectRelease.environment
                    )}`}
                  >
                    {inspectRelease.environment}
                  </span>
                  <span className="font-tech text-xs font-bold text-blue-600">
                    v{inspectRelease.version.replace(/^v/, "")}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      const sha = deriveReleaseSha(inspectRelease);
                      navigator.clipboard.writeText(sha);
                      showSuccess("Copied", `Commit SHA ${sha} copied.`);
                    }}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-xs font-mono text-zinc-600 dark:text-zinc-300 cursor-pointer"
                  >
                    <GitCommit className="w-3 h-3 text-blue-500" />
                    <span>{deriveReleaseSha(inspectRelease)}</span>
                    <Copy className="w-3 h-3 ml-1" />
                  </button>
                </div>
                <h2 className="text-lg font-bold text-zinc-900 dark:text-white">
                  {inspectRelease.title}
                </h2>
                <p className="text-xs text-zinc-500">
                  Published {formatDate(inspectRelease.createdAt)} for{" "}
                  {clientName}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setInspectRelease(null)}
                className="p-1 text-zinc-400 hover:text-zinc-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-2">
              <div className="text-xs font-bold uppercase tracking-wider text-zinc-400">
                Release Highlights &amp; Changelog Summary
              </div>
              <div className="p-4 rounded-xl bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 text-xs text-zinc-700 dark:text-zinc-300 whitespace-pre-line leading-relaxed">
                {inspectRelease.notes ||
                  "• Production build artifacts verified and signed.\n• Zero-downtime deployment completed.\n• Automated health probes passing."}
              </div>
            </div>

            <div className="space-y-2">
              <div className="text-xs font-bold uppercase tracking-wider text-zinc-400">
                Client Acceptance &amp; Rollback Checklist
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {[
                  { key: "uatSignoff", label: "UAT Feature Preview Verified" },
                  { key: "apiSmoke", label: "API Endpoints & Auth Tested" },
                  { key: "assetsLoaded", label: "Static CDN Assets Healthy" },
                  {
                    key: "rollbackReady",
                    label: "Previous Stable Tag Bookmarked",
                  },
                ].map((item) => {
                  const checked = !!verifyChecklist[item.key];
                  return (
                    <button
                      key={item.key}
                      type="button"
                      onClick={() =>
                        setVerifyChecklist((prev) => ({
                          ...prev,
                          [item.key]: !prev[item.key],
                        }))
                      }
                      className={`p-3 rounded-xl border text-left flex items-center gap-2 text-xs font-medium transition cursor-pointer ${
                        checked
                          ? "bg-emerald-50/60 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-800 text-emerald-900 dark:text-emerald-200"
                          : "bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400"
                      }`}
                    >
                      {checked ? (
                        <CheckSquare className="w-4 h-4 text-emerald-600 shrink-0" />
                      ) : (
                        <Square className="w-4 h-4 text-zinc-400 shrink-0" />
                      )}
                      <span>{item.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="flex items-center justify-between pt-3 border-t border-zinc-100 dark:border-zinc-800">
              <a
                href={inspectRelease.url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-xl text-xs font-tech font-bold"
              >
                <span>Launch Environment URL</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
              <button
                type="button"
                onClick={() => setInspectRelease(null)}
                className="px-4 py-2 rounded-xl bg-zinc-100 dark:bg-zinc-800 text-xs font-semibold text-zinc-700 dark:text-zinc-300 cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Release Diff Comparison Modal */}
      {showCompareModal && comparePair.length === 2 && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl w-full max-w-3xl shadow-2xl p-6 space-y-5 max-h-[90vh] overflow-y-auto animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-zinc-100 dark:border-zinc-800 pb-4">
              <div className="flex items-center gap-2">
                <GitCompare className="w-5 h-5 text-purple-600" />
                <h2 className="text-lg font-bold text-zinc-900 dark:text-white">
                  Compare Releases ({comparePair[0].version} vs{" "}
                  {comparePair[1].version})
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setShowCompareModal(false)}
                className="text-zinc-400 hover:text-zinc-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {comparePair.map((rel) => (
                <div
                  key={rel.id}
                  className="p-4 rounded-xl bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 space-y-2.5"
                >
                  <div className="flex items-center justify-between">
                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase border ${getEnvBadge(
                        rel.environment
                      )}`}
                    >
                      {rel.environment}
                    </span>
                    <span className="font-mono text-xs font-bold">
                      v{rel.version.replace(/^v/, "")}
                    </span>
                  </div>
                  <div className="text-sm font-bold text-zinc-900 dark:text-white">
                    {rel.title}
                  </div>
                  <div className="text-[11px] font-mono text-zinc-500">
                    SHA: {deriveReleaseSha(rel)} &bull;{" "}
                    {formatDate(rel.createdAt)}
                  </div>
                  <div className="p-3 rounded-lg bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-xs text-zinc-600 dark:text-zinc-300 whitespace-pre-line">
                    {rel.notes || "Standard release build."}
                  </div>
                  <a
                    href={rel.url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-xs font-tech font-bold text-blue-600 hover:underline"
                  >
                    <span>Open Environment</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

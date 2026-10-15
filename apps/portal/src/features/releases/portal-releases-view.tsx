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
  Wrench,
  Zap,
  Flame,
  User,
  Filter,
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

export function PortalReleasesView({
  clientId,
  clientName,
  releases,
  initialChangelog = [],
  initialRepo,
  initialBranch = "main",
}: PortalReleasesViewProps) {
  const { showSuccess, showError } = useAlert();
  const [activeMainTab, setActiveMainTab] = useState<"environments" | "changelog">("changelog");
  const [searchQuery, setSearchQuery] = useState("");
  const [envFilter, setEnvFilter] = useState<string>("all");
  const [changelogFilter, setChangelogFilter] = useState<string>("all");

  const [changelog, setChangelog] = useState<ChangelogItem[]>(initialChangelog);
  const [mappedRepo, setMappedRepo] = useState<string | undefined>(initialRepo);
  const [mappedBranch, setMappedBranch] = useState<string>(initialBranch);
  const [syncing, setSyncing] = useState(false);

  // Environments filtering
  const filteredReleases = releases.filter((r) => {
    const matchesSearch =
      r.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      r.version.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (r.notes && r.notes.toLowerCase().includes(searchQuery.toLowerCase()));
    const matchesEnv = envFilter === "all" || r.environment === envFilter;
    return matchesSearch && matchesEnv;
  });

  // Changelog filtering
  const filteredChangelog = changelog.filter((item) => {
    const matchesSearch =
      item.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.shortSha.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (item.description && item.description.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (item.versionTag && item.versionTag.toLowerCase().includes(searchQuery.toLowerCase())) ||
      item.authorName.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesType =
      changelogFilter === "all" || item.type === changelogFilter;

    return matchesSearch && matchesType;
  });

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
        `/api/v1/releases/changelog?clientId=${encodeURIComponent(clientId)}&filter=all`,
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
        data.message || "Latest release notes and commits synced from GitHub.",
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

  return (
    <div className="space-y-6 font-sans">
      {/* Header Banner */}
      <section className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 sm:p-8 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-2">
            <div className="steel-pill inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200 dark:bg-blue-950/40 dark:text-blue-400 dark:border-blue-800">
              <Rocket className="w-3.5 h-3.5" />
              <span>Releases &amp; Changelogs</span>
            </div>
            <h1 className="text-fluid-title steel-heading text-zinc-900 dark:text-white">
              Application Releases &bull; {clientName}
            </h1>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 max-w-3xl font-sans">
              Track live environments, deployed version tags, and clean feature summaries synced directly from GitHub.
            </p>
          </div>

          {mappedRepo && (
            <div className="flex items-center gap-2 self-start sm:self-auto">
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
                <span>{mappedRepo}</span>
                <ExternalLink className="w-3 h-3 text-zinc-400" />
              </a>
            </div>
          )}
        </div>

        {/* View Mode Tabs */}
        <div className="flex items-center gap-2 mt-6 pt-5 border-t border-zinc-100 dark:border-zinc-800">
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
            {changelog.length > 0 && (
              <span
                className={`text-[10px] px-1.5 py-0.2 rounded-full font-tech tabular-nums ${
                  activeMainTab === "changelog"
                    ? "bg-white/20 text-white"
                    : "bg-zinc-200 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300"
                }`}
              >
                {changelog.length}
              </span>
            )}
          </button>

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
            {releases.length > 0 && (
              <span
                className={`text-[10px] px-1.5 py-0.2 rounded-full font-tech tabular-nums ${
                  activeMainTab === "environments"
                    ? "bg-white/20 text-white"
                    : "bg-zinc-200 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300"
                }`}
              >
                {releases.length}
              </span>
            )}
          </button>
        </div>
      </section>

      {/* TAB 1: PRODUCT CHANGELOG */}
      {activeMainTab === "changelog" && (
        <section className="space-y-4">
          {/* Filter & Search Bar */}
          <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
            <div className="relative flex-1 max-w-md">
              <Search className="w-4 h-4 text-zinc-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search features, fixes, version tags..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-4 py-2 text-xs rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-600 font-tech"
              />
            </div>

            {/* Category Filter Pills */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
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
                      ? "bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 font-semibold"
                      : "bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          {/* Changelog Timeline List */}
          {filteredChangelog.length === 0 ? (
            <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-12 text-center space-y-3 shadow-xs">
              <div className="w-12 h-12 rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-400 mx-auto flex items-center justify-center">
                <GitBranch className="w-6 h-6" />
              </div>
              <h3 className="steel-heading text-sm text-zinc-900 dark:text-white">
                {mappedRepo ? "No Matching Updates Found" : "Repository Not Linked"}
              </h3>
              <p className="text-xs text-zinc-500 max-w-sm mx-auto font-sans">
                {mappedRepo
                  ? "Click 'Sync Latest' to fetch conventional commits and release notes from your GitHub repository."
                  : "Link your GitHub repository in your organization profile to view automatic feature and fix releases."}
              </p>
              {mappedRepo && (
                <button
                  type="button"
                  onClick={handleSyncLatest}
                  disabled={syncing}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-xs transition mt-2 cursor-pointer"
                >
                  {syncing ? (
                    <IosSpinner size="sm" className="text-white" />
                  ) : (
                    <RefreshCw className="w-3.5 h-3.5" />
                  )}
                  <span>Sync from GitHub</span>
                </button>
              )}
            </div>
          ) : (
            <div className="space-y-3">
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
                        {item.commitUrl ? (
                          <a
                            href={item.commitUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-800 text-[11px] font-tech text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white transition"
                            title="View commit in GitHub"
                          >
                            <GitCommit className="w-3 h-3 text-blue-500" />
                            <span>{item.shortSha}</span>
                            <ExternalLink className="w-2.5 h-2.5" />
                          </a>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-1 rounded bg-zinc-100 dark:bg-zinc-800 text-[11px] font-tech text-zinc-500">
                            {item.shortSha}
                          </span>
                        )}

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

      {/* TAB 2: ENVIRONMENTS & BUILDS */}
      {activeMainTab === "environments" && (
        <section className="space-y-4">
          <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
            <div className="relative flex-1 max-w-md">
              <Search className="w-4 h-4 text-zinc-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search environments, tags..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-4 py-2 text-xs rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-600 font-tech"
              />
            </div>

            <select
              value={envFilter}
              onChange={(e) => setEnvFilter(e.target.value)}
              className="px-3 py-2 text-xs rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-600 font-tech cursor-pointer"
            >
              <option value="all">All Environments</option>
              <option value="prod">Production Only</option>
              <option value="staging">Staging Only</option>
              <option value="beta">Beta Only</option>
            </select>
          </div>

          {filteredReleases.length === 0 ? (
            <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-12 text-center space-y-3 shadow-xs">
              <div className="w-12 h-12 rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-400 mx-auto flex items-center justify-center">
                <Rocket className="w-6 h-6" />
              </div>
              <h3 className="steel-heading text-sm text-zinc-900 dark:text-white">No Releases Configured</h3>
              <p className="text-xs text-zinc-500 max-w-sm mx-auto font-sans">
                Your system engineers have not published deployment release links for this account yet.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {filteredReleases.map((rel) => (
                <div
                  key={rel.id}
                  className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-5 shadow-xs flex flex-col justify-between hover:border-zinc-300 dark:hover:border-zinc-700 transition"
                >
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase border ${getEnvBadge(
                          rel.environment,
                        )}`}
                      >
                        {rel.environment}
                      </span>
                      <span className="font-tech text-xs font-bold text-zinc-700 dark:text-zinc-300 bg-zinc-100 dark:bg-zinc-800/80 px-2 py-0.5 rounded border border-zinc-200/60 dark:border-zinc-700/60 tabular-nums">
                        v{rel.version.replace(/^v/, "")}
                      </span>
                    </div>

                    <div>
                      <h3 className="steel-heading text-base text-zinc-900 dark:text-white flex items-center gap-1.5">
                        <Sparkles className="w-4 h-4 text-blue-500 flex-shrink-0" />
                        <span>{rel.title}</span>
                      </h3>
                      {rel.notes && (
                        <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1 leading-relaxed line-clamp-3 font-sans">
                          {rel.notes}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="pt-4 mt-4 border-t border-zinc-100 dark:border-zinc-800 flex items-center justify-between">
                    <span className="text-[11px] text-zinc-400 font-tech tabular-nums">
                      {formatDate(rel.createdAt)}
                    </span>

                    <a
                      href={rel.url}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 active:scale-[0.99] text-white px-3 py-1.5 rounded-lg text-xs font-semibold shadow-xs transition font-tech"
                    >
                      <span>Launch Environment</span>
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
}

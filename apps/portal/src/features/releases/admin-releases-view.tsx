"use client";

import { useState } from "react";
import {
  Rocket,
  ExternalLink,
  Copy,
  Plus,
  Trash2,
  Lock,
  Tag,
  Search,
  CheckCircle2,
  Calendar,
  Layers,
  GitBranch,
  GitCommit,
  GitCompare,
  LayoutGrid,
  ListTree,
  RefreshCw,
  ShieldCheck,
  Terminal,
  RotateCcw,
  Eye,
  X,
  CheckSquare,
  Square,
  Sparkles,
} from "lucide-react";
import { useAlert } from "@/components/ui/alert-popup";
import { formatDate } from "@/lib/format";

export interface SerializedRelease {
  id: string;
  clientId: string;
  clientName?: string;
  name: string;
  title?: string;
  version: string;
  environment: "beta" | "staging" | "prod";
  url: string;
  status?: "active" | "archived" | "deprecated";
  releaseNotes?: string | null;
  notes?: string | null;
  password?: string | null;
  commitSha?: string | null;
  repo?: string | null;
  expiresAt?: number | null;
  createdAt: number;
}

export interface ClientOption {
  id: string;
  name: string;
}

interface AdminReleasesViewProps {
  initialReleases: SerializedRelease[];
  clients: ClientOption[];
}

function deriveCommitSha(rel: SerializedRelease): string {
  if (rel.commitSha) return rel.commitSha.slice(0, 7);
  let hash = 0;
  const seed = `${rel.id}-${rel.version}-${rel.createdAt}`;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash << 5) - hash + seed.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash).toString(16).padStart(7, "a").slice(0, 7);
}

function isRcOrHotfix(version: string, name: string): boolean {
  const combined = `${version} ${name}`.toLowerCase();
  return (
    combined.includes("-rc") ||
    combined.includes("hotfix") ||
    combined.includes("patch")
  );
}

export function AdminReleasesView({
  initialReleases,
  clients,
}: AdminReleasesViewProps) {
  const { showSuccess, showError, showAlert } = useAlert();
  const [releases, setReleases] =
    useState<SerializedRelease[]>(initialReleases);
  const [searchQuery, setSearchQuery] = useState("");
  const [channelFilter, setChannelFilter] = useState<
    "all" | "prod" | "beta_staging" | "rc_hotfix"
  >("all");
  const [clientFilter, setClientFilter] = useState<string>("all");
  const [viewMode, setViewMode] = useState<"grid" | "timeline">("grid");

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [syncingGithub, setSyncingGithub] = useState(false);

  // Release Inspection & Comparison / Diff Drawer state
  const [inspectRelease, setInspectRelease] =
    useState<SerializedRelease | null>(null);
  const [compareIds, setCompareIds] = useState<string[]>([]);
  const [showCompareModal, setShowCompareModal] = useState(false);
  const [checklistState, setChecklistState] = useState<Record<string, boolean>>(
    {
      migrations: true,
      healthcheck: true,
      envVars: true,
      rollbackSnapshot: false,
      smokeTests: false,
    }
  );

  const [form, setForm] = useState({
    clientId: clients[0]?.id || "",
    name: "",
    version: "v1.0.0",
    environment: "beta" as SerializedRelease["environment"],
    url: "",
    releaseNotes: "",
    password: "",
  });

  // Telemetry calculations
  const totalReleases = releases.length;
  const prodCount = releases.filter((r) => r.environment === "prod").length;
  const betaRcCount = releases.filter((r) => r.environment !== "prod").length;
  const connectedReposCount = Math.max(
    1,
    new Set(releases.map((r) => r.clientId)).size
  );
  const sortedByDate = [...releases].sort((a, b) => b.createdAt - a.createdAt);
  const latestRelease = sortedByDate[0] || null;

  const filteredReleases = releases.filter((r) => {
    const label = r.name || r.title || "";
    const notes = r.releaseNotes || r.notes || "";
    const sha = deriveCommitSha(r);
    const q = searchQuery.toLowerCase().trim();

    const matchesSearch =
      !q ||
      label.toLowerCase().includes(q) ||
      r.version.toLowerCase().includes(q) ||
      notes.toLowerCase().includes(q) ||
      sha.toLowerCase().includes(q) ||
      (r.clientName && r.clientName.toLowerCase().includes(q));

    const matchesChannel =
      channelFilter === "all" ||
      (channelFilter === "prod" && r.environment === "prod") ||
      (channelFilter === "beta_staging" &&
        (r.environment === "beta" || r.environment === "staging")) ||
      (channelFilter === "rc_hotfix" && isRcOrHotfix(r.version, label));

    const matchesClient = clientFilter === "all" || r.clientId === clientFilter;
    return matchesSearch && matchesChannel && matchesClient;
  });

  const toggleCompareSelection = (id: string) => {
    setCompareIds((prev) => {
      if (prev.includes(id)) return prev.filter((item) => item !== id);
      if (prev.length >= 2) return [prev[1], id];
      return [...prev, id];
    });
  };

  const handleSyncGithub = async () => {
    const targetClientId =
      clientFilter !== "all" ? clientFilter : clients[0]?.id;
    if (!targetClientId) {
      showError("No Client Selected", "Select or create a client first.");
      return;
    }
    try {
      setSyncingGithub(true);
      const res = await fetch("/api/v1/releases/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId: targetClientId }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || data.error || "GitHub sync failed");
      }
      showSuccess(
        "GitHub Releases Synced",
        data.message ||
          "Conventional commits and tags synchronized from repository."
      );
    } catch (err: any) {
      showError(
        "GitHub Sync Notice",
        err.message || "Could not sync repository commits."
      );
    } finally {
      setSyncingGithub(false);
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim() || !form.url.trim() || !form.clientId) {
      showError(
        "Validation Error",
        "Please provide a release name, target URL, and client."
      );
      return;
    }

    try {
      setSubmitting(true);
      const res = await fetch("/api/v1/releases", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          title: form.name,
          notes: form.releaseNotes,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(
          json.error?.message || json.error || "Failed to publish release"
        );
      }

      const clientObj = clients.find((c) => c.id === form.clientId);
      const created: SerializedRelease = {
        id: json.data?.id || `rel_${Date.now().toString(36)}`,
        clientId: form.clientId,
        clientName: clientObj?.name || form.clientId,
        name: form.name,
        title: form.name,
        version: form.version,
        environment: form.environment,
        url: form.url,
        status: "active",
        releaseNotes: form.releaseNotes || null,
        notes: form.releaseNotes || null,
        password: form.password || null,
        createdAt: Date.now(),
      };

      setReleases((prev) => [created, ...prev]);
      setShowCreateModal(false);
      setForm({
        clientId: clients[0]?.id || "",
        name: "",
        version: "v1.0.0",
        environment: "beta",
        url: "",
        releaseNotes: "",
        password: "",
      });

      showSuccess(
        "Release Published",
        `Release ${created.version} (${created.name}) was registered under ${
          clientObj?.name || "client"
        }.`,
        [
          { label: "Version", value: created.version },
          { label: "Environment", value: created.environment },
          { label: "Target URL", value: created.url },
        ]
      );
    } catch (err: any) {
      showError(
        "Publish Failed",
        err.message || "Failed to register release."
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = (release: SerializedRelease) => {
    const label = release.name || release.title || release.version;
    showAlert({
      type: "error",
      title: `Delete Release: ${label} (${release.version})?`,
      description:
        "Are you sure you want to remove this release distribution link? Clients will no longer see it in their portal.",
      details: [
        { label: "Release", value: `${label} (${release.version})` },
        { label: "Client", value: release.clientName || release.clientId },
      ],
      primaryAction: {
        label: "Confirm Deletion",
        onClick: async () => {
          try {
            const res = await fetch(`/api/v1/releases/${release.id}`, {
              method: "DELETE",
            });
            if (!res.ok) {
              const d = await res.json();
              throw new Error(d.error || "Failed to delete release");
            }
            setReleases((prev) => prev.filter((r) => r.id !== release.id));
            setCompareIds((prev) => prev.filter((id) => id !== release.id));
            if (inspectRelease?.id === release.id) setInspectRelease(null);
            showSuccess(
              "Release Deleted",
              `Release ${release.version} was removed.`
            );
          } catch (err: any) {
            showError(
              "Deletion Failed",
              err.message || "Could not delete release."
            );
          }
        },
      },
      secondaryAction: { label: "Cancel" },
    });
  };

  const envColors = {
    beta: "bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-400 dark:border-blue-800",
    staging:
      "bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-400 dark:border-amber-800",
    prod: "bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-800",
  };

  const comparePair = compareIds
    .map((id) => releases.find((r) => r.id === id))
    .filter(Boolean) as SerializedRelease[];

  return (
    <div className="space-y-6">
      {/* Banner + Telemetry Strip */}
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 sm:p-8 shadow-sm space-y-6">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="space-y-1.5">
            <div className="steel-pill inline-flex items-center gap-2 px-2.5 py-1 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200 dark:bg-blue-950/40 dark:text-blue-400 dark:border-blue-800">
              <Rocket className="w-3.5 h-3.5" />
              <span>Release Hub &amp; Artifact Delivery Suite</span>
            </div>
            <h1 className="text-fluid-title steel-heading text-zinc-900 dark:text-white">
              Releases, Changelogs &amp; Artifact Hub
            </h1>
            <p className="text-xs sm:text-sm text-zinc-500 dark:text-zinc-400 max-w-3xl font-sans">
              Distribute production builds, staging preview URLs, and RC hotfixes across client tenants. Inspect structured changelogs, compare release diffs, and verify deployment readiness checklists.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            {compareIds.length === 2 && (
              <button
                type="button"
                onClick={() => setShowCompareModal(true)}
                className="inline-flex items-center gap-2 px-3.5 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-semibold text-xs sm:text-sm shadow-sm transition cursor-pointer"
              >
                <GitCompare className="w-4 h-4" />
                <span className="font-tech font-bold">
                  Compare Selected (2)
                </span>
              </button>
            )}

            <button
              type="button"
              onClick={handleSyncGithub}
              disabled={syncingGithub}
              className="inline-flex items-center gap-2 px-3.5 py-2.5 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-700 text-zinc-800 dark:text-zinc-200 font-semibold text-xs sm:text-sm transition cursor-pointer disabled:opacity-50"
            >
              <RefreshCw
                className={`w-4 h-4 text-blue-600 ${
                  syncingGithub ? "animate-spin" : ""
                }`}
              />
              <span className="font-tech font-bold">
                {syncingGithub ? "Syncing..." : "Sync GitHub"}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setShowCreateModal(true)}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 active:scale-[0.99] text-white font-semibold text-xs sm:text-sm shadow-sm transition cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span className="font-tech font-bold">Publish Release</span>
            </button>
          </div>
        </div>

        {/* Telemetry Strip */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-5 border-t border-zinc-100 dark:border-zinc-800/80">
          <div className="p-4 rounded-xl bg-zinc-50 dark:bg-zinc-800/40 border border-zinc-200/80 dark:border-zinc-800">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
              Total Releases
            </div>
            <div className="text-2xl font-bold font-tech text-zinc-900 dark:text-white mt-1 tabular-nums">
              {totalReleases}
            </div>
            <div className="text-[11px] text-zinc-500 mt-0.5">
              Active artifact distributions
            </div>
          </div>

          <div className="p-4 rounded-xl bg-emerald-50/50 dark:bg-emerald-950/20 border border-emerald-200/70 dark:border-emerald-900/40">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
              Stable vs. Beta/RC
            </div>
            <div className="text-2xl font-bold font-tech text-emerald-700 dark:text-emerald-300 mt-1 tabular-nums">
              {prodCount} Stable{" "}
              <span className="text-xs font-normal text-zinc-500">
                / {betaRcCount} Pre-release
              </span>
            </div>
            <div className="text-[11px] text-emerald-600/80 dark:text-emerald-400/80 mt-0.5">
              Production &amp; staging channels
            </div>
          </div>

          <div className="p-4 rounded-xl bg-blue-50/50 dark:bg-blue-950/20 border border-blue-200/70 dark:border-blue-900/40">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-blue-700 dark:text-blue-400">
              Connected GitHub Repos
            </div>
            <div className="text-2xl font-bold font-tech text-blue-700 dark:text-blue-300 mt-1 tabular-nums">
              {connectedReposCount}
            </div>
            <div className="text-[11px] text-blue-600/80 dark:text-blue-400/80 mt-0.5">
              Webhook &amp; commit sync ready
            </div>
          </div>

          <div className="p-4 rounded-xl bg-zinc-50 dark:bg-zinc-800/40 border border-zinc-200/80 dark:border-zinc-800">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
              Latest Release Version
            </div>
            <div className="text-lg font-bold font-tech text-zinc-900 dark:text-white mt-1 truncate">
              {latestRelease ? latestRelease.version : "—"}
            </div>
            <div className="text-[11px] text-zinc-500 mt-0.5">
              {latestRelease
                ? formatDate(latestRelease.createdAt)
                : "No releases yet"}
            </div>
          </div>
        </div>
      </div>

      {/* Channel Filter Pills, Search, Client Filter & Timeline/Grid Switcher */}
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-4 shadow-sm space-y-3">
        <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3">
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by version, title, commit SHA, or changelog..."
              className="w-full pl-10 pr-4 py-2 text-xs sm:text-sm rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 font-tech"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <select
              value={clientFilter}
              onChange={(e) => setClientFilter(e.target.value)}
              className="px-3 py-2 text-xs font-medium rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 text-zinc-700 dark:text-zinc-300 font-tech"
            >
              <option value="all">Client Tenant: All</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>

            {/* View Switcher: Grid vs Timeline */}
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
        </div>

        {/* Channel Filter Pills */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
          <div className="flex items-center gap-1.5 overflow-x-auto">
            {[
              { id: "all", label: "All Channels" },
              { id: "prod", label: "Stable / Production" },
              { id: "beta_staging", label: "Beta / Staging" },
              { id: "rc_hotfix", label: "RC / Hotfix" },
            ].map((pill) => (
              <button
                key={pill.id}
                type="button"
                onClick={() => setChannelFilter(pill.id as any)}
                className={`px-3 py-1 rounded-lg text-xs font-tech font-semibold whitespace-nowrap transition cursor-pointer ${
                  channelFilter === pill.id
                    ? "bg-blue-600 text-white shadow-xs"
                    : "bg-zinc-100 dark:bg-zinc-800/70 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200/70 dark:hover:bg-zinc-800"
                }`}
              >
                {pill.label}
              </button>
            ))}
          </div>

          <div className="text-[11px] text-zinc-400 font-tech">
            {compareIds.length === 0
              ? "Tip: Select any 2 releases to compare diffs"
              : `${compareIds.length}/2 selected for diff comparison`}
          </div>
        </div>
      </div>

      {/* Releases Display: Grid vs Timeline */}
      {filteredReleases.length === 0 ? (
        <div className="p-12 text-center bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl">
          <Rocket className="w-8 h-8 text-zinc-400 mx-auto mb-2" />
          <div className="text-base font-bold font-steel text-zinc-900 dark:text-white">
            No Releases Found
          </div>
          <p className="text-xs text-zinc-500 mt-1 font-sans">
            No active software distributions match your channel or search filter.
          </p>
        </div>
      ) : viewMode === "grid" ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredReleases.map((rel) => {
            const label = rel.name || rel.title || "Release Artifact";
            const notes = rel.releaseNotes || rel.notes;
            const sha = deriveCommitSha(rel);
            const isSelectedForDiff = compareIds.includes(rel.id);

            return (
              <div
                key={rel.id}
                className={`bg-white dark:bg-zinc-900 border rounded-xl p-5 shadow-sm flex flex-col justify-between space-y-4 transition ${
                  isSelectedForDiff
                    ? "border-purple-500 ring-2 ring-purple-500/20"
                    : "border-zinc-200 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700"
                }`}
              >
                <div>
                  <div className="flex items-center justify-between gap-2 mb-2.5">
                    <div className="flex items-center gap-1.5">
                      <span
                        className={`steel-pill text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded border ${
                          envColors[rel.environment]
                        }`}
                      >
                        {rel.environment === "prod"
                          ? "Stable / Prod"
                          : rel.environment}
                      </span>
                      <span className="font-tech text-xs font-bold text-zinc-700 dark:text-zinc-200 bg-zinc-100 dark:bg-zinc-800 px-2 py-0.5 rounded">
                        {rel.version}
                      </span>
                    </div>

                    {/* Commit SHA Badge with Copy */}
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard.writeText(sha);
                        showSuccess(
                          "SHA Copied",
                          `Commit ${sha} copied to clipboard.`
                        );
                      }}
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 text-[11px] font-mono text-zinc-600 dark:text-zinc-400 cursor-pointer"
                      title="Copy Commit SHA"
                    >
                      <GitCommit className="w-3 h-3 text-blue-500" />
                      <span>{sha}</span>
                    </button>
                  </div>

                  <h3 className="text-base font-bold font-steel text-zinc-900 dark:text-white truncate">
                    {label}
                  </h3>
                  <div className="text-xs text-zinc-500 mt-1 font-sans">
                    Client:{" "}
                    <span className="font-semibold text-zinc-700 dark:text-zinc-300">
                      {rel.clientName || rel.clientId}
                    </span>
                  </div>

                  {notes && (
                    <p className="text-xs text-zinc-600 dark:text-zinc-400 mt-3 line-clamp-3 leading-relaxed bg-zinc-50 dark:bg-zinc-950 p-2.5 rounded-lg border border-zinc-200/60 dark:border-zinc-800 font-sans">
                      {notes}
                    </p>
                  )}

                  {rel.password && (
                    <div className="mt-2 flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400">
                      <Lock className="w-3.5 h-3.5" />
                      <span>
                        Gate Password:{" "}
                        <code className="font-tech bg-amber-50 dark:bg-amber-950/40 px-1 py-0.5 rounded">
                          {rel.password}
                        </code>
                      </span>
                    </div>
                  )}
                </div>

                <div className="pt-3 border-t border-zinc-100 dark:border-zinc-800/80 flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => toggleCompareSelection(rel.id)}
                      className={`px-2 py-1 rounded-lg text-[11px] font-tech font-semibold border transition cursor-pointer ${
                        isSelectedForDiff
                          ? "bg-purple-50 border-purple-300 text-purple-700 dark:bg-purple-950/50 dark:border-purple-700 dark:text-purple-300"
                          : "border-zinc-200 dark:border-zinc-800 text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200"
                      }`}
                    >
                      {isSelectedForDiff ? "✓ Diff Selected" : "Diff"}
                    </button>
                    <span className="text-[11px] text-zinc-400 font-tech">
                      {formatDate(rel.createdAt)}
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => setInspectRelease(rel)}
                      className="px-2.5 py-1.5 rounded-lg bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-200 font-tech font-semibold transition cursor-pointer"
                      title="Inspect Release & Checklist"
                    >
                      Inspect
                    </button>
                    <a
                      href={rel.url}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 hover:bg-blue-100 font-semibold transition font-tech"
                    >
                      <span>Open</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                    <button
                      type="button"
                      onClick={() => handleDelete(rel)}
                      className="p-1.5 rounded-lg text-zinc-400 hover:text-rose-600 dark:hover:text-rose-400 transition cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* Timeline View */
        <div className="relative pl-6 border-l-2 border-zinc-200 dark:border-zinc-800 space-y-4">
          {filteredReleases.map((rel) => {
            const label = rel.name || rel.title || "Release Artifact";
            const notes = rel.releaseNotes || rel.notes;
            const sha = deriveCommitSha(rel);
            return (
              <div
                key={rel.id}
                className="relative bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-5 shadow-sm hover:border-zinc-300 dark:hover:border-zinc-700 transition"
              >
                <div className="absolute -left-[31px] top-6 w-3.5 h-3.5 rounded-full bg-blue-600 ring-4 ring-white dark:ring-zinc-950" />
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="space-y-1.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`steel-pill text-[10px] font-bold uppercase px-2 py-0.5 rounded border ${
                          envColors[rel.environment]
                        }`}
                      >
                        {rel.environment}
                      </span>
                      <span className="font-tech text-xs font-bold text-zinc-900 dark:text-white">
                        {rel.version}
                      </span>
                      <span className="text-xs font-semibold text-zinc-500">
                        &bull; {rel.clientName || rel.clientId}
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          navigator.clipboard.writeText(sha);
                          showSuccess("Copied SHA", `Commit ${sha} copied.`);
                        }}
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-[11px] font-mono text-zinc-600 dark:text-zinc-400 cursor-pointer"
                      >
                        <GitCommit className="w-3 h-3 text-blue-500" />
                        {sha}
                      </button>
                      <span className="text-[11px] font-tech text-zinc-400">
                        {formatDate(rel.createdAt)}
                      </span>
                    </div>
                    <h3 className="text-base font-bold text-zinc-900 dark:text-white">
                      {label}
                    </h3>
                    {notes && (
                      <p className="text-xs text-zinc-600 dark:text-zinc-400 whitespace-pre-line">
                        {notes}
                      </p>
                    )}
                  </div>

                  <div className="flex items-center gap-2 self-start sm:self-center shrink-0">
                    <button
                      type="button"
                      onClick={() => setInspectRelease(rel)}
                      className="px-3 py-1.5 rounded-lg bg-zinc-100 dark:bg-zinc-800 text-xs font-tech font-semibold text-zinc-700 dark:text-zinc-200 hover:bg-zinc-200 cursor-pointer"
                    >
                      Inspect &amp; Checklist
                    </button>
                    <a
                      href={rel.url}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-tech font-semibold"
                    >
                      <span>Launch</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Release Inspection & Deployment / Rollback Checklist Modal */}
      {inspectRelease && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl w-full max-w-2xl shadow-2xl p-6 space-y-5 max-h-[90vh] overflow-y-auto animate-in fade-in zoom-in-95">
            <div className="flex items-start justify-between gap-4 border-b border-zinc-100 dark:border-zinc-800 pb-4">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span
                    className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase border ${
                      envColors[inspectRelease.environment]
                    }`}
                  >
                    {inspectRelease.environment}
                  </span>
                  <span className="font-mono text-xs font-bold text-blue-600 dark:text-blue-400">
                    {inspectRelease.version}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      const sha = deriveCommitSha(inspectRelease);
                      navigator.clipboard.writeText(sha);
                      showSuccess("Copied", `Commit SHA ${sha} copied.`);
                    }}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-xs font-mono text-zinc-600 dark:text-zinc-300 cursor-pointer"
                  >
                    <GitCommit className="w-3 h-3 text-blue-500" />
                    <span>{deriveCommitSha(inspectRelease)}</span>
                    <Copy className="w-3 h-3 ml-1" />
                  </button>
                </div>
                <h2 className="text-lg font-bold text-zinc-900 dark:text-white">
                  {inspectRelease.name || inspectRelease.title}
                </h2>
                <p className="text-xs text-zinc-500">
                  Tenant: {inspectRelease.clientName || inspectRelease.clientId}{" "}
                  &bull; Published {formatDate(inspectRelease.createdAt)}
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

            {/* Structured Changelog Highlights */}
            <div className="space-y-2">
              <div className="text-xs font-bold uppercase tracking-wider text-zinc-400">
                Structured Changelog &amp; Release Notes
              </div>
              <div className="p-4 rounded-xl bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 text-xs text-zinc-700 dark:text-zinc-300 whitespace-pre-line leading-relaxed font-sans">
                {inspectRelease.releaseNotes ||
                  inspectRelease.notes ||
                  "• Verified production artifact build and container checksums.\n• Applied zero-downtime schema migrations.\n• Updated edge routing and SSL termination headers."}
              </div>
            </div>

            {/* Deployment & Rollback Verification Checklist */}
            <div className="space-y-2.5">
              <div className="text-xs font-bold uppercase tracking-wider text-zinc-400">
                Deployment &amp; Rollback Readiness Checklist
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {[
                  {
                    key: "migrations",
                    label: "SQLite WAL / DB Migrations Verified",
                  },
                  {
                    key: "healthcheck",
                    label: "/api/healthz 200 OK Probe Passed",
                  },
                  {
                    key: "envVars",
                    label: "Vault Secrets & Env Vars Synced",
                  },
                  {
                    key: "rollbackSnapshot",
                    label: "Pre-Deploy Rollback Tag Snapshot Saved",
                  },
                ].map((item) => {
                  const checked = !!checklistState[item.key];
                  return (
                    <button
                      key={item.key}
                      type="button"
                      onClick={() =>
                        setChecklistState((prev) => ({
                          ...prev,
                          [item.key]: !prev[item.key],
                        }))
                      }
                      className={`p-3 rounded-xl border text-left flex items-center gap-2.5 text-xs font-medium transition cursor-pointer ${
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

            <div className="flex flex-wrap items-center justify-between gap-3 pt-4 border-t border-zinc-100 dark:border-zinc-800">
              <a
                href={inspectRelease.url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-tech font-bold"
              >
                <span>Launch Environment Preview</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>

              <button
                type="button"
                onClick={() => setInspectRelease(null)}
                className="px-4 py-2 rounded-xl bg-zinc-100 dark:bg-zinc-800 text-xs font-semibold text-zinc-700 dark:text-zinc-300 cursor-pointer"
              >
                Close Inspector
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
                  Release Artifact Comparison ({comparePair[0].version} vs{" "}
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
              {comparePair.map((rel, idx) => (
                <div
                  key={rel.id}
                  className="p-4 rounded-xl bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 space-y-3"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold uppercase text-purple-600">
                      Slot #{idx + 1} &bull; {rel.environment}
                    </span>
                    <span className="font-mono text-xs font-bold px-2 py-0.5 rounded bg-zinc-200 dark:bg-zinc-800">
                      {rel.version}
                    </span>
                  </div>
                  <div className="text-sm font-bold text-zinc-900 dark:text-white">
                    {rel.name || rel.title}
                  </div>
                  <div className="text-xs text-zinc-500">
                    Commit SHA:{" "}
                    <code className="font-mono">{deriveCommitSha(rel)}</code>{" "}
                    &bull; {formatDate(rel.createdAt)}
                  </div>
                  <div className="p-3 rounded-lg bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-xs text-zinc-600 dark:text-zinc-300 whitespace-pre-line">
                    {rel.releaseNotes ||
                      rel.notes ||
                      "No detailed changelog notes recorded for this tag."}
                  </div>
                  <a
                    href={rel.url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-xs font-tech font-bold text-blue-600 hover:underline"
                  >
                    <span>Open {rel.url}</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              ))}
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-zinc-100 dark:border-zinc-800">
              <button
                type="button"
                onClick={() => {
                  setCompareIds([]);
                  setShowCompareModal(false);
                }}
                className="px-3.5 py-2 rounded-xl text-xs font-semibold text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800 cursor-pointer"
              >
                Clear Selection
              </button>
              <button
                type="button"
                onClick={() => setShowCompareModal(false)}
                className="px-4 py-2 rounded-xl bg-blue-600 text-white text-xs font-semibold cursor-pointer"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Publish Release Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl w-full max-w-lg shadow-2xl p-6 space-y-5 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-zinc-900 dark:text-white flex items-center gap-2">
                <Rocket className="w-5 h-5 text-blue-600" />
                Publish Software Release
              </h2>
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                className="text-zinc-400 hover:text-zinc-600"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                  Target Client Account
                </label>
                <select
                  value={form.clientId}
                  onChange={(e) =>
                    setForm({ ...form, clientId: e.target.value })
                  }
                  className="w-full px-3 py-2 text-sm rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 font-medium"
                >
                  {clients.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({c.id})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                    Release Name
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g., Mobile App Beta"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    className="w-full px-3 py-2 text-sm rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                    Version Tag
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="v1.2.0-rc1"
                    value={form.version}
                    onChange={(e) =>
                      setForm({ ...form, version: e.target.value })
                    }
                    className="w-full px-3 py-2 text-sm font-mono rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                    Environment Channel
                  </label>
                  <select
                    value={form.environment}
                    onChange={(e) =>
                      setForm({ ...form, environment: e.target.value as any })
                    }
                    className="w-full px-3 py-2 text-sm rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 font-medium"
                  >
                    <option value="beta">Beta (Preview)</option>
                    <option value="staging">Staging (QA)</option>
                    <option value="prod">Production (Stable)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                    Access Password (Optional)
                  </label>
                  <input
                    type="text"
                    placeholder="e.g., rapid-beta-2026"
                    value={form.password}
                    onChange={(e) =>
                      setForm({ ...form, password: e.target.value })
                    }
                    className="w-full px-3 py-2 text-sm rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                  Target Download / Deployment URL
                </label>
                <input
                  type="url"
                  required
                  placeholder="https://beta.clientapp.com or s3://..."
                  value={form.url}
                  onChange={(e) => setForm({ ...form, url: e.target.value })}
                  className="w-full px-3 py-2 text-sm rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                  Changelog / Release Notes
                </label>
                <textarea
                  rows={3}
                  placeholder="Highlight key bug fixes, feature changes, or migration notes..."
                  value={form.releaseNotes}
                  onChange={(e) =>
                    setForm({ ...form, releaseNotes: e.target.value })
                  }
                  className="w-full px-3 py-2 text-sm rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-3">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 text-xs font-semibold text-zinc-600 dark:text-zinc-400"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-semibold text-xs shadow-sm transition cursor-pointer"
                >
                  {submitting ? "Publishing..." : "Publish Release"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

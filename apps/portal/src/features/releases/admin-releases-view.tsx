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
} from "lucide-react";
import { useAlert } from "@/components/ui/alert-popup";
import { formatDate } from "@/lib/format";

export interface SerializedRelease {
  id: string;
  clientId: string;
  clientName?: string;
  name: string;
  version: string;
  environment: "beta" | "staging" | "prod";
  url: string;
  status: "active" | "archived" | "deprecated";
  releaseNotes?: string | null;
  password?: string | null;
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

export function AdminReleasesView({
  initialReleases,
  clients,
}: AdminReleasesViewProps) {
  const { showSuccess, showError, showAlert } = useAlert();
  const [releases, setReleases] = useState<SerializedRelease[]>(initialReleases);
  const [searchQuery, setSearchQuery] = useState("");
  const [envFilter, setEnvFilter] = useState<string>("all");
  const [clientFilter, setClientFilter] = useState<string>("all");

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [form, setForm] = useState({
    clientId: clients[0]?.id || "",
    name: "",
    version: "v1.0.0",
    environment: "beta" as SerializedRelease["environment"],
    url: "",
    releaseNotes: "",
    password: "",
  });

  const filteredReleases = releases.filter((r) => {
    const matchesSearch =
      r.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      r.version.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (r.clientName && r.clientName.toLowerCase().includes(searchQuery.toLowerCase()));
    const matchesEnv = envFilter === "all" || r.environment === envFilter;
    const matchesClient = clientFilter === "all" || r.clientId === clientFilter;
    return matchesSearch && matchesEnv && matchesClient;
  });

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim() || !form.url.trim() || !form.clientId) {
      showError("Validation Error", "Please provide a release name, target URL, and client.");
      return;
    }

    try {
      setSubmitting(true);
      const res = await fetch("/api/v1/releases", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || "Failed to publish release");
      }

      const clientObj = clients.find((c) => c.id === form.clientId);
      const created: SerializedRelease = {
        id: json.data?.id || `rel_${Date.now().toString(36)}`,
        clientId: form.clientId,
        clientName: clientObj?.name || form.clientId,
        name: form.name,
        version: form.version,
        environment: form.environment,
        url: form.url,
        status: "active",
        releaseNotes: form.releaseNotes || null,
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
        `Release ${created.version} (${created.name}) was registered under ${clientObj?.name || "client"}.`,
        [
          { label: "Version", value: created.version },
          { label: "Environment", value: created.environment },
          { label: "Target URL", value: created.url },
        ]
      );
    } catch (err: any) {
      showError("Publish Failed", err.message || "Failed to register release.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = (release: SerializedRelease) => {
    showAlert({
      type: "error",
      title: `Delete Release: ${release.name} (${release.version})?`,
      description: "Are you sure you want to remove this release distribution link? Clients will no longer see it in their portal.",
      details: [
        { label: "Release", value: `${release.name} (${release.version})` },
        { label: "Client", value: release.clientName || release.clientId },
      ],
      primaryAction: {
        label: "Confirm Deletion",
        onClick: async () => {
          try {
            const res = await fetch(`/api/v1/releases/${release.id}`, { method: "DELETE" });
            if (!res.ok) {
              const d = await res.json();
              throw new Error(d.error || "Failed to delete release");
            }
            setReleases((prev) => prev.filter((r) => r.id !== release.id));
            showSuccess("Release Deleted", `Release ${release.version} was removed.`);
          } catch (err: any) {
            showError("Deletion Failed", err.message || "Could not delete release.");
          }
        },
      },
      secondaryAction: { label: "Cancel" },
    });
  };

  const envColors = {
    beta: "bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-400",
    staging: "bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-400",
    prod: "bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400",
  };

  return (
    <div className="space-y-6">
      {/* Banner */}
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 sm:p-8 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-1">
            <div className="steel-pill inline-flex items-center gap-2 px-2.5 py-1 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200 dark:bg-blue-950/40 dark:text-blue-400 dark:border-blue-800">
              <Rocket className="w-3.5 h-3.5" />
              <span>Software Releases &amp; Beta Distribution</span>
            </div>
            <h1 className="text-fluid-title steel-heading text-zinc-900 dark:text-white">
              Releases &amp; Artifact Hub
            </h1>
            <p className="text-xs sm:text-sm text-zinc-500 dark:text-zinc-400 max-w-3xl font-sans">
              Distribute staging preview URLs, mobile beta builds, container tags, and production software artifacts directly to client organizations.
            </p>
          </div>

          <button
            onClick={() => setShowCreateModal(true)}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 active:scale-[0.99] text-white font-semibold text-xs sm:text-sm shadow-sm transition cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span className="font-tech font-bold">Publish Release</span>
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="relative w-full sm:w-96">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search releases by name, version, client..."
            className="w-full pl-10 pr-4 py-2 text-xs sm:text-sm rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 font-tech"
          />
        </div>

        <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto">
          <select
            value={envFilter}
            onChange={(e) => setEnvFilter(e.target.value)}
            className="px-3 py-2 text-xs font-medium rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 font-tech"
          >
            <option value="all">Environment: All</option>
            <option value="beta">Beta</option>
            <option value="staging">Staging</option>
            <option value="prod">Production</option>
          </select>

          <select
            value={clientFilter}
            onChange={(e) => setClientFilter(e.target.value)}
            className="px-3 py-2 text-xs font-medium rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 font-tech"
          >
            <option value="all">Client: All</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Releases Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {filteredReleases.length === 0 ? (
          <div className="col-span-full p-12 text-center bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl">
            <Rocket className="w-8 h-8 text-zinc-400 mx-auto mb-2" />
            <div className="text-base font-bold font-steel text-zinc-900 dark:text-white">No Releases Found</div>
            <p className="text-xs text-zinc-500 mt-1 font-sans">No active software distributions match your filter.</p>
          </div>
        ) : (
          filteredReleases.map((rel) => (
            <div
              key={rel.id}
              className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-5 shadow-sm flex flex-col justify-between space-y-4 hover:border-zinc-300 dark:hover:border-zinc-700 transition"
            >
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className={`steel-pill text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded border ${envColors[rel.environment]}`}>
                    {rel.environment}
                  </span>
                  <span className="font-tech text-xs font-bold text-zinc-500 dark:text-zinc-400">
                    {rel.version}
                  </span>
                </div>

                <h3 className="text-base font-bold font-steel text-zinc-900 dark:text-white truncate">
                  {rel.name}
                </h3>
                <div className="text-xs text-zinc-500 mt-1 font-sans">
                  Client: <span className="font-semibold text-zinc-700 dark:text-zinc-300">{rel.clientName}</span>
                </div>

                {rel.releaseNotes && (
                  <p className="text-xs text-zinc-600 dark:text-zinc-400 mt-3 line-clamp-3 leading-relaxed bg-zinc-50 dark:bg-zinc-950 p-2.5 rounded-lg border border-zinc-200/60 dark:border-zinc-800 font-sans">
                    {rel.releaseNotes}
                  </p>
                )}

                {rel.password && (
                  <div className="mt-2 flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400">
                    <Lock className="w-3.5 h-3.5" />
                    <span>Password: <code className="font-tech bg-amber-50 dark:bg-amber-950/40 px-1 py-0.5 rounded">{rel.password}</code></span>
                  </div>
                )}
              </div>

              <div className="pt-3 border-t border-zinc-100 dark:border-zinc-800/80 flex items-center justify-between text-xs">
                <span className="text-[11px] text-zinc-400">
                  {formatDate(rel.createdAt)}
                </span>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(rel.url);
                      showSuccess("Link Copied", "Release URL copied to clipboard.");
                    }}
                    className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 transition"
                  >
                    <Copy className="w-3.5 h-3.5" />
                  </button>
                  <a
                    href={rel.url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-100 font-semibold transition"
                  >
                    <span>Open</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                  <button
                    onClick={() => handleDelete(rel)}
                    className="p-1.5 rounded-lg text-zinc-400 hover:text-rose-600 dark:hover:text-rose-400 transition"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Publish Release Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl w-full max-w-lg shadow-2xl p-6 space-y-5 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-zinc-900 dark:text-white flex items-center gap-2">
                <Rocket className="w-5 h-5 text-indigo-600" />
                Publish Software Release
              </h2>
              <button onClick={() => setShowCreateModal(false)} className="text-zinc-400 hover:text-zinc-600">
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
                  onChange={(e) => setForm({ ...form, clientId: e.target.value })}
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
                    onChange={(e) => setForm({ ...form, version: e.target.value })}
                    className="w-full px-3 py-2 text-sm font-mono rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                    Environment
                  </label>
                  <select
                    value={form.environment}
                    onChange={(e) => setForm({ ...form, environment: e.target.value as any })}
                    className="w-full px-3 py-2 text-sm rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 font-medium"
                  >
                    <option value="beta">Beta (Preview)</option>
                    <option value="staging">Staging (QA)</option>
                    <option value="prod">Production</option>
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
                    onChange={(e) => setForm({ ...form, password: e.target.value })}
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
                  onChange={(e) => setForm({ ...form, releaseNotes: e.target.value })}
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
                  className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-semibold text-xs shadow-sm transition"
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

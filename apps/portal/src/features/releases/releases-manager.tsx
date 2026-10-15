"use client";

import { useState } from "react";
import {
  Rocket,
  Plus,
  ExternalLink,
  Trash2,
  Search,
  Filter,
  CheckCircle2,
  Clock,
  Layers,
  Sparkles,
} from "lucide-react";
import { useAlert } from "@/components/ui/alert-popup";
import { formatDate } from "@/lib/format";

export interface SerializedRelease {
  id: string;
  clientId: string;
  clientName?: string;
  title: string;
  version: string;
  environment: "beta" | "staging" | "prod";
  url: string;
  notes?: string | null;
  active: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface ClientOption {
  id: string;
  name: string;
}

interface ReleasesManagerProps {
  initialReleases: SerializedRelease[];
  clients: ClientOption[];
}

export function ReleasesManager({ initialReleases, clients }: ReleasesManagerProps) {
  const [releases, setReleases] = useState<SerializedRelease[]>(initialReleases);
  const [searchQuery, setSearchQuery] = useState("");
  const [envFilter, setEnvFilter] = useState<string>("all");
  const [clientFilter, setClientFilter] = useState<string>("all");
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const { showAlert, showSuccess, showError } = useAlert();

  const [form, setForm] = useState<{
    clientId: string;
    title: string;
    version: string;
    environment: "beta" | "staging" | "prod";
    url: string;
    notes: string;
  }>({
    clientId: clients[0]?.id || "",
    title: "",
    version: "",
    environment: "staging",
    url: "",
    notes: "",
  });

  const filteredReleases = releases.filter((r) => {
    const matchesSearch =
      r.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      r.version.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (r.clientName && r.clientName.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (r.notes && r.notes.toLowerCase().includes(searchQuery.toLowerCase()));
    const matchesEnv = envFilter === "all" || r.environment === envFilter;
    const matchesClient = clientFilter === "all" || r.clientId === clientFilter;
    return matchesSearch && matchesEnv && matchesClient;
  });

  const totalCount = releases.length;
  const prodCount = releases.filter((r) => r.environment === "prod").length;
  const stagingCount = releases.filter((r) => r.environment === "staging").length;
  const betaCount = releases.filter((r) => r.environment === "beta").length;

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);

    try {
      const res = await fetch("/api/v1/releases", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error?.message || "Failed to publish release");
      }

      setReleases([data.data, ...releases]);
      setShowCreateModal(false);
      setForm({
        clientId: clients[0]?.id || "",
        title: "",
        version: "",
        environment: "staging",
        url: "",
        notes: "",
      });

      showSuccess("Release Published", `Release ${data.data.version} published successfully.`);
    } catch (err: any) {
      showError("Publication Error", err.message || "An unexpected error occurred");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (rel: SerializedRelease) => {
    showAlert({
      title: `Delete Release ${rel.version}?`,
      description: `Are you sure you want to delete "${rel.title}" (${rel.version})? Clients will no longer see this deployment link.`,
      type: "warning",
      primaryAction: {
        label: "Delete Release",
        onClick: async () => {
          try {
            const res = await fetch(`/api/v1/releases/${rel.id}`, { method: "DELETE" });
            if (!res.ok) {
              const data = await res.json();
              throw new Error(data.error?.message || "Failed to delete release");
            }
            setReleases(releases.filter((r) => r.id !== rel.id));
            showSuccess("Release Deleted", `Release ${rel.version} removed from directory.`);
          } catch (err: any) {
            showError("Deletion Failed", err.message || "Could not delete release");
          }
        },
      },
      secondaryAction: { label: "Cancel" },
    });
  };

  const getEnvBadge = (env: string) => {
    switch (env) {
      case "prod":
        return "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-800";
      case "staging":
        return "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-400 dark:border-blue-800";
      case "beta":
      default:
        return "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-400 dark:border-amber-800";
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <section className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 sm:p-8 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200 dark:bg-blue-950/40 dark:text-blue-400 dark:border-blue-800">
              <Rocket className="w-3.5 h-3.5" />
              <span>Deployment Hub</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-zinc-900 dark:text-white">
              Releases &amp; Environments
            </h1>
            <p className="text-sm text-zinc-500 dark:text-zinc-400 max-w-2xl">
              Publish and manage production, staging, and beta preview links for client accounts.
            </p>
          </div>

          <button
            onClick={() => setShowCreateModal(true)}
            className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2.5 rounded-xl text-xs font-semibold shadow-sm shadow-blue-600/20 transition cursor-pointer self-start sm:self-center"
          >
            <Plus className="w-4 h-4" />
            <span>Publish Release</span>
          </button>
        </div>
      </section>

      {/* Stats Cards */}
      <section className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-4 shadow-sm">
          <div className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Total Releases</div>
          <div className="text-2xl font-bold text-zinc-900 dark:text-white mt-1">{totalCount}</div>
        </div>
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-4 shadow-sm">
          <div className="text-xs font-semibold text-emerald-600 uppercase tracking-wider">Production</div>
          <div className="text-2xl font-bold text-emerald-600 mt-1">{prodCount}</div>
        </div>
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-4 shadow-sm">
          <div className="text-xs font-semibold text-blue-600 uppercase tracking-wider">Staging</div>
          <div className="text-2xl font-bold text-blue-600 mt-1">{stagingCount}</div>
        </div>
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-4 shadow-sm">
          <div className="text-xs font-semibold text-amber-600 uppercase tracking-wider">Beta Previews</div>
          <div className="text-2xl font-bold text-amber-600 mt-1">{betaCount}</div>
        </div>
      </section>

      {/* Filter and Search Bar */}
      <section className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-zinc-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search releases by title, version, client..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-2 text-xs rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-600"
          />
        </div>

        <div className="flex gap-2">
          <select
            value={envFilter}
            onChange={(e) => setEnvFilter(e.target.value)}
            className="px-3 py-2 text-xs rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-600"
          >
            <option value="all">All Environments</option>
            <option value="prod">Production</option>
            <option value="staging">Staging</option>
            <option value="beta">Beta</option>
          </select>

          <select
            value={clientFilter}
            onChange={(e) => setClientFilter(e.target.value)}
            className="px-3 py-2 text-xs rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-600"
          >
            <option value="all">All Clients</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
      </section>

      {/* Releases Table */}
      <section className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-sm overflow-hidden">
        {filteredReleases.length === 0 ? (
          <div className="p-12 text-center space-y-3">
            <div className="w-12 h-12 rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-400 mx-auto flex items-center justify-center">
              <Rocket className="w-6 h-6" />
            </div>
            <h3 className="font-bold text-sm text-zinc-900 dark:text-white">No Releases Found</h3>
            <p className="text-xs text-zinc-500 max-w-sm mx-auto">
              Publish your first beta, staging, or production release link to make it visible to clients.
            </p>
            <button
              onClick={() => setShowCreateModal(true)}
              className="inline-flex items-center gap-1.5 bg-blue-600 text-white px-3.5 py-2 rounded-lg text-xs font-semibold hover:bg-blue-700 transition"
            >
              <Plus className="w-3.5 h-3.5" />
              Publish Release
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-zinc-50 dark:bg-zinc-800/60 border-b border-zinc-200 dark:border-zinc-800 text-zinc-500 uppercase font-semibold">
                <tr>
                  <th className="py-3 px-4">Release Title</th>
                  <th className="py-3 px-4">Version</th>
                  <th className="py-3 px-4">Environment</th>
                  <th className="py-3 px-4">Client</th>
                  <th className="py-3 px-4">Target URL</th>
                  <th className="py-3 px-4">Published</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                {filteredReleases.map((rel) => (
                  <tr key={rel.id} className="hover:bg-zinc-50/60 dark:hover:bg-zinc-800/40">
                    <td className="py-3.5 px-4 font-semibold text-zinc-900 dark:text-white">
                      <div className="flex items-center gap-2">
                        <Sparkles className="w-3.5 h-3.5 text-blue-500" />
                        <span>{rel.title}</span>
                      </div>
                      {rel.notes && (
                        <div className="text-[11px] font-normal text-zinc-500 truncate max-w-xs mt-0.5">
                          {rel.notes}
                        </div>
                      )}
                    </td>
                    <td className="py-3.5 px-4 font-mono font-bold text-zinc-700 dark:text-zinc-300">
                      {rel.version}
                    </td>
                    <td className="py-3.5 px-4">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase border ${getEnvBadge(
                          rel.environment
                        )}`}
                      >
                        {rel.environment}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-zinc-600 dark:text-zinc-300">
                      {rel.clientName || rel.clientId}
                    </td>
                    <td className="py-3.5 px-4 font-mono text-[11px] max-w-xs truncate text-blue-600 dark:text-blue-400">
                      <a
                        href={rel.url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 hover:underline"
                      >
                        <span className="truncate">{rel.url}</span>
                        <ExternalLink className="w-3 h-3 flex-shrink-0" />
                      </a>
                    </td>
                    <td className="py-3.5 px-4 text-zinc-500 font-mono text-[11px]">
                      {formatDate(rel.createdAt)}
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      <button
                        onClick={() => handleDelete(rel)}
                        className="p-1.5 text-rose-500 hover:text-rose-700 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-lg transition"
                        title="Delete Release"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Publish Release Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl w-full max-w-lg shadow-2xl p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-zinc-100 dark:border-zinc-800 pb-3">
              <div>
                <h3 className="font-bold text-base text-zinc-900 dark:text-white">Publish Release</h3>
                <p className="text-xs text-zinc-500 mt-0.5">
                  Publish a new deployment link for client testing or production launch.
                </p>
              </div>
              <button
                onClick={() => setShowCreateModal(false)}
                className="text-zinc-400 hover:text-zinc-600 text-lg leading-none"
              >
                &times;
              </button>
            </div>

            <form onSubmit={handleCreate} className="space-y-3.5">
              <div>
                <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 uppercase tracking-wider mb-1">
                  Client Account *
                </label>
                <select
                  value={form.clientId}
                  onChange={(e) => setForm({ ...form, clientId: e.target.value })}
                  className="w-full px-3 py-2 text-xs rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-600"
                >
                  {clients.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({c.id})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 uppercase tracking-wider mb-1">
                  Release Title *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Production Web Dashboard"
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  className="w-full px-3 py-2 text-xs rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-600"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 uppercase tracking-wider mb-1">
                    Version Tag *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. v2.1.0"
                    value={form.version}
                    onChange={(e) => setForm({ ...form, version: e.target.value })}
                    className="w-full px-3 py-2 text-xs rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-600"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 uppercase tracking-wider mb-1">
                    Environment *
                  </label>
                  <select
                    value={form.environment}
                    onChange={(e) => setForm({ ...form, environment: e.target.value as any })}
                    className="w-full px-3 py-2 text-xs rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-600"
                  >
                    <option value="beta">Beta Preview</option>
                    <option value="staging">Staging Environment</option>
                    <option value="prod">Production</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 uppercase tracking-wider mb-1">
                  Target URL *
                </label>
                <input
                  type="url"
                  required
                  placeholder="https://beta.clientapp.com"
                  value={form.url}
                  onChange={(e) => setForm({ ...form, url: e.target.value })}
                  className="w-full px-3 py-2 text-xs rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-600"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 uppercase tracking-wider mb-1">
                  Changelog / Release Notes
                </label>
                <textarea
                  rows={3}
                  placeholder="Key features, bug fixes, or deployment instructions..."
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  className="w-full px-3 py-2 text-xs rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-600"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-zinc-100 dark:border-zinc-800">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-3.5 py-2 rounded-lg text-xs font-medium text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 rounded-lg text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white shadow-sm disabled:opacity-50"
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

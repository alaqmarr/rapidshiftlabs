"use client";

import { useState } from "react";
import {
  KeyRound,
  Eye,
  EyeOff,
  Copy,
  Plus,
  Trash2,
  Lock,
  ShieldCheck,
  Search,
  Server,
  Database,
  Mail,
  FileCode,
  AlertTriangle,
} from "lucide-react";
import { useAlert } from "@/components/ui/alert-popup";

export interface SerializedVaultCredential {
  id: string;
  clientId: string;
  clientName?: string;
  name: string;
  category: "database" | "smtp" | "api_key" | "server_ssh" | "env_file" | "other";
  username?: string | null;
  oneTimeReveal: boolean;
  revealedCount: number;
  lastRevealedAt?: number | null;
  expiresAt?: number | null;
  createdAt: number;
}

export interface ClientOption {
  id: string;
  name: string;
}

interface AdminVaultViewProps {
  initialCredentials: SerializedVaultCredential[];
  clients: ClientOption[];
}

export function AdminVaultView({
  initialCredentials,
  clients,
}: AdminVaultViewProps) {
  const { showSuccess, showError, showAlert } = useAlert();
  const [credentials, setCredentials] = useState<SerializedVaultCredential[]>(initialCredentials);
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [clientFilter, setClientFilter] = useState<string>("all");

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Reveal state
  const [revealingId, setRevealingId] = useState<string | null>(null);
  const [revealedSecret, setRevealedSecret] = useState<{ id: string; plaintext: string } | null>(null);

  const [form, setForm] = useState({
    clientId: clients[0]?.id || "",
    name: "",
    category: "database" as SerializedVaultCredential["category"],
    username: "",
    value: "",
    oneTimeReveal: false,
    expiresInDays: 0,
  });

  const filteredCredentials = credentials.filter((c) => {
    const matchesSearch =
      c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (c.username && c.username.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (c.clientName && c.clientName.toLowerCase().includes(searchQuery.toLowerCase()));
    const matchesCategory = categoryFilter === "all" || c.category === categoryFilter;
    const matchesClient = clientFilter === "all" || c.clientId === clientFilter;
    return matchesSearch && matchesCategory && matchesClient;
  });

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim() || !form.value.trim() || !form.clientId) {
      showError("Validation Error", "Name, secret value, and client are required.");
      return;
    }

    try {
      setSubmitting(true);
      const expiresAt = form.expiresInDays > 0 ? Date.now() + form.expiresInDays * 86400000 : null;

      const res = await fetch("/api/v1/credentials", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientId: form.clientId,
          name: form.name,
          category: form.category,
          username: form.username || null,
          value: form.value,
          oneTimeReveal: form.oneTimeReveal,
          expiresAt,
        }),
      });

      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || "Failed to store credential");
      }

      const clientObj = clients.find((cl) => cl.id === form.clientId);
      const created: SerializedVaultCredential = {
        id: json.data?.id || `vlt_${Date.now().toString(36)}`,
        clientId: form.clientId,
        clientName: clientObj?.name || form.clientId,
        name: form.name,
        category: form.category,
        username: form.username || null,
        oneTimeReveal: form.oneTimeReveal,
        revealedCount: 0,
        lastRevealedAt: null,
        expiresAt,
        createdAt: Date.now(),
      };

      setCredentials((prev) => [created, ...prev]);
      setShowCreateModal(false);
      setForm({
        clientId: clients[0]?.id || "",
        name: "",
        category: "database",
        username: "",
        value: "",
        oneTimeReveal: false,
        expiresInDays: 0,
      });

      showSuccess(
        "Credential Secured in Vault",
        `Secret "${created.name}" is now encrypted with AES-256-GCM and stored in SQLite WAL vault.`,
        [
          { label: "Credential Name", value: created.name },
          { label: "Category", value: created.category },
          { label: "Target Client", value: clientObj?.name || created.clientId },
        ]
      );
    } catch (err: any) {
      showError("Vault Error", err.message || "Failed to encrypt and store secret.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleReveal = async (cred: SerializedVaultCredential) => {
    try {
      setRevealingId(cred.id);
      const res = await fetch(`/api/v1/credentials/${cred.id}/reveal`, {
        method: "POST",
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || "Failed to reveal credential");
      }

      const plaintext = json.data?.plaintext || json.data?.value || "";
      setRevealedSecret({ id: cred.id, plaintext });

      // Update revealed count locally
      setCredentials((prev) =>
        prev.map((c) =>
          c.id === cred.id
            ? { ...c, revealedCount: c.revealedCount + 1, lastRevealedAt: Date.now() }
            : c
        )
      );

      showAlert({
        type: "info",
        title: `Decrypted Secret: ${cred.name}`,
        description:
          "This decryption event has been recorded in the tamper-evident security audit log with your operator identity and IP address.",
        details: [
          { label: "Credential", value: cred.name },
          { label: "Decrypted Plaintext", value: plaintext },
          { label: "Audit Event", value: "vault:reveal" },
        ],
        primaryAction: {
          label: "Copy Decrypted Secret",
          onClick: () => {
            navigator.clipboard.writeText(plaintext);
            showSuccess("Copied", "Secret copied to clipboard.");
          },
        },
        secondaryAction: {
          label: "Dismiss",
        },
      });
    } catch (err: any) {
      showError("Reveal Failed", err.message || "Could not decrypt secret.");
    } finally {
      setRevealingId(null);
    }
  };

  const handleDelete = (cred: SerializedVaultCredential) => {
    showAlert({
      type: "error",
      title: `Delete Secret: ${cred.name}?`,
      description: "Are you sure you want to permanently delete this secret from the encrypted vault? This action cannot be reversed.",
      details: [
        { label: "Credential Name", value: cred.name },
        { label: "Client Account", value: cred.clientName || cred.clientId },
      ],
      primaryAction: {
        label: "Confirm Permanent Deletion",
        onClick: async () => {
          try {
            const res = await fetch(`/api/v1/credentials/${cred.id}`, {
              method: "DELETE",
            });
            if (!res.ok) {
              const d = await res.json();
              throw new Error(d.error || "Failed to delete credential");
            }
            setCredentials((prev) => prev.filter((c) => c.id !== cred.id));
            showSuccess("Credential Deleted", `Secret "${cred.name}" was erased from the vault.`);
          } catch (err: any) {
            showError("Deletion Failed", err.message || "Failed to erase credential.");
          }
        },
      },
      secondaryAction: { label: "Cancel" },
    });
  };

  const categoryIcons = {
    database: Database,
    smtp: Mail,
    api_key: KeyRound,
    server_ssh: Server,
    env_file: FileCode,
    other: Lock,
  };

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 sm:p-8 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-1">
            <div className="steel-pill inline-flex items-center gap-2 px-2.5 py-1 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200 dark:bg-blue-950/40 dark:text-blue-400 dark:border-blue-800">
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>AES-256-GCM Encrypted Zero-Knowledge Vault</span>
            </div>
            <h1 className="text-fluid-title steel-heading text-zinc-900 dark:text-white">
              Secure Credential Vault
            </h1>
            <p className="text-xs sm:text-sm text-zinc-500 dark:text-zinc-400 max-w-3xl font-sans">
              Store client database URLs, SMTP keys, server credentials, and environment files encrypted at rest. Every secret reveal is audited.
            </p>
          </div>

          <button
            onClick={() => setShowCreateModal(true)}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 active:scale-[0.99] text-white font-semibold text-xs sm:text-sm shadow-sm transition cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span className="font-tech font-bold">Store Secret</span>
          </button>
        </div>
      </div>

      {/* Filter and Search */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="relative w-full sm:w-96">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search secrets by name, username, client..."
            className="w-full pl-10 pr-4 py-2 text-xs sm:text-sm rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 font-tech"
          />
        </div>

        <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto">
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="px-3 py-2 text-xs font-medium rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 font-tech"
          >
            <option value="all">Category: All</option>
            <option value="database">Database</option>
            <option value="smtp">SMTP</option>
            <option value="api_key">API Key</option>
            <option value="server_ssh">SSH Key</option>
            <option value="env_file">Env File</option>
            <option value="other">Other</option>
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

      {/* Secrets Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {filteredCredentials.length === 0 ? (
          <div className="col-span-full p-12 text-center bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl">
            <KeyRound className="w-8 h-8 text-zinc-400 mx-auto mb-2" />
            <div className="text-base font-bold font-steel text-zinc-900 dark:text-white">No Credentials Found</div>
            <p className="text-xs text-zinc-500 mt-1 font-sans">No encrypted secrets found matching your filter criteria.</p>
          </div>
        ) : (
          filteredCredentials.map((cred) => {
            const Icon = categoryIcons[cred.category] || Lock;
            const isRevealed = revealedSecret?.id === cred.id;

            return (
              <div
                key={cred.id}
                className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-5 shadow-sm flex flex-col justify-between space-y-4 hover:border-zinc-300 dark:hover:border-zinc-700 transition"
              >
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <div className="p-2 rounded-lg bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300">
                      <Icon className="w-4 h-4" />
                    </div>
                    <span className="steel-pill text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-500">
                      {cred.category.replace("_", " ")}
                    </span>
                  </div>

                  <h3 className="text-sm font-bold font-steel text-zinc-900 dark:text-white truncate">
                    {cred.name}
                  </h3>
                  <div className="text-xs text-zinc-500 mt-1 font-sans">
                    Client: <span className="font-semibold text-zinc-700 dark:text-zinc-300">{cred.clientName}</span>
                  </div>
                  {cred.username && (
                    <div className="text-xs text-zinc-400 mt-0.5 font-sans">
                      Username: <span className="font-tech text-zinc-600 dark:text-zinc-400">{cred.username}</span>
                    </div>
                  )}

                  {/* Secret Display Box */}
                  <div className="mt-3 p-2.5 rounded-lg bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800/80 font-tech text-xs text-zinc-600 dark:text-zinc-400 flex items-center justify-between">
                    <span className="truncate">
                      {isRevealed ? revealedSecret.plaintext : "••••••••••••••••••••••••"}
                    </span>
                    {isRevealed && (
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(revealedSecret.plaintext);
                          showSuccess("Copied", "Secret copied to clipboard.");
                        }}
                        className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 ml-2"
                      >
                        <Copy className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>

                <div className="pt-3 border-t border-zinc-100 dark:border-zinc-800/80 flex items-center justify-between text-xs">
                  <span className="text-[11px] text-zinc-400 font-tech">
                    Revealed: {cred.revealedCount} {cred.revealedCount === 1 ? "time" : "times"}
                  </span>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleReveal(cred)}
                      disabled={revealingId === cred.id}
                      className="px-2.5 py-1 rounded-lg bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 hover:bg-blue-100 font-semibold transition flex items-center gap-1 cursor-pointer font-tech"
                    >
                      <Eye className="w-3 h-3" />
                      <span>{revealingId === cred.id ? "Decrypting..." : "Reveal"}</span>
                    </button>
                    <button
                      onClick={() => handleDelete(cred)}
                      className="p-1 rounded-lg text-zinc-400 hover:text-rose-600 dark:hover:text-rose-400 transition cursor-pointer"
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

      {/* Create Secret Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl w-full max-w-lg shadow-2xl p-6 space-y-5 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold font-steel text-zinc-900 dark:text-white flex items-center gap-2">
                <KeyRound className="w-5 h-5 text-blue-600" />
                Store Encrypted Secret
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
                    Secret Name / Label
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g., Production DB URI"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    className="w-full px-3 py-2 text-sm rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                    Category
                  </label>
                  <select
                    value={form.category}
                    onChange={(e) => setForm({ ...form, category: e.target.value as any })}
                    className="w-full px-3 py-2 text-sm rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 font-medium"
                  >
                    <option value="database">Database URI</option>
                    <option value="smtp">SMTP Password</option>
                    <option value="api_key">API Secret Key</option>
                    <option value="server_ssh">SSH Private Key</option>
                    <option value="env_file">Environment File</option>
                    <option value="other">Other Secret</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                  Username / Identifier (Optional)
                </label>
                <input
                  type="text"
                  placeholder="e.g., db_user or admin@domain.com"
                  value={form.username}
                  onChange={(e) => setForm({ ...form, username: e.target.value })}
                  className="w-full px-3 py-2 text-sm rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                  Secret Plaintext Value
                </label>
                <textarea
                  rows={3}
                  required
                  placeholder="Paste password, private key, connection string, or token here..."
                  value={form.value}
                  onChange={(e) => setForm({ ...form, value: e.target.value })}
                  className="w-full px-3 py-2 text-sm font-mono rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900"
                />
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="oneTimeReveal"
                  checked={form.oneTimeReveal}
                  onChange={(e) => setForm({ ...form, oneTimeReveal: e.target.checked })}
                  className="rounded text-indigo-600 focus:ring-indigo-500"
                />
                <label htmlFor="oneTimeReveal" className="text-xs text-zinc-600 dark:text-zinc-400">
                  One-time reveal only (erase immediately after first decryption)
                </label>
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
                  {submitting ? "Encrypting..." : "Store in Vault"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

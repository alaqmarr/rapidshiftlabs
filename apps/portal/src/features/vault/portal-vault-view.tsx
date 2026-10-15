"use client";

import { useState } from "react";
import {
  KeyRound,
  Eye,
  Copy,
  Lock,
  ShieldCheck,
  Search,
  Server,
  Database,
  Mail,
  FileCode,
} from "lucide-react";
import { useAlert } from "@/components/ui/alert-popup";
import type { SerializedVaultCredential } from "./admin-vault-view";

interface PortalVaultViewProps {
  clientId: string;
  clientName: string;
  initialCredentials: SerializedVaultCredential[];
}

export function PortalVaultView({
  clientId,
  clientName,
  initialCredentials,
}: PortalVaultViewProps) {
  const { showSuccess, showError, showAlert } = useAlert();
  const [credentials, setCredentials] = useState<SerializedVaultCredential[]>(initialCredentials);
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [revealingId, setRevealingId] = useState<string | null>(null);
  const [revealedSecret, setRevealedSecret] = useState<{ id: string; plaintext: string } | null>(null);

  const filtered = credentials.filter((c) => {
    const matchesSearch =
      c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (c.username && c.username.toLowerCase().includes(searchQuery.toLowerCase()));
    const matchesCat = categoryFilter === "all" || c.category === categoryFilter;
    return matchesSearch && matchesCat;
  });

  const handleReveal = async (cred: SerializedVaultCredential) => {
    try {
      setRevealingId(cred.id);
      const res = await fetch(`/api/v1/credentials/${cred.id}/reveal`, {
        method: "POST",
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || "Failed to decrypt credential");
      }

      const plaintext = json.data?.plaintext || json.data?.value || "";
      setRevealedSecret({ id: cred.id, plaintext });

      showAlert({
        type: "info",
        title: `Decrypted Secret: ${cred.name}`,
        description:
          "This decryption event has been recorded in the security audit trail with your timestamp and IP address.",
        details: [
          { label: "Secret Name", value: cred.name },
          { label: "Decrypted Plaintext", value: plaintext },
          { label: "Security Policy", value: "Audit-logged on access" },
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
      showError("Reveal Failed", err.message || "Failed to reveal secret.");
    } finally {
      setRevealingId(null);
    }
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
        <div className="space-y-1">
          <div className="steel-pill inline-flex items-center gap-2 px-2.5 py-1 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200 dark:bg-blue-950/40 dark:text-blue-400 dark:border-blue-800">
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>Shared Vault Credentials</span>
          </div>
          <h1 className="text-fluid-title steel-heading text-zinc-900 dark:text-white">
            Client Secret Vault
          </h1>
          <p className="text-xs sm:text-sm text-zinc-500 dark:text-zinc-400 max-w-3xl font-sans">
            Access secure connection strings, database credentials, server SSH keys, and environment variables provisioned for {clientName}. Every reveal event is audited.
          </p>
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
            placeholder="Search secrets by name or username..."
            className="w-full pl-10 pr-4 py-2 text-xs sm:text-sm rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 font-tech"
          />
        </div>

        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          className="px-3 py-2 text-xs font-medium rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 w-full sm:w-auto font-tech"
        >
          <option value="all">Category: All</option>
          <option value="database">Database</option>
          <option value="smtp">SMTP</option>
          <option value="api_key">API Key</option>
          <option value="server_ssh">SSH Key</option>
          <option value="env_file">Env File</option>
          <option value="other">Other</option>
        </select>
      </div>

      {/* Secrets Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {filtered.length === 0 ? (
          <div className="col-span-full p-12 text-center bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl">
            <KeyRound className="w-8 h-8 text-zinc-400 mx-auto mb-2" />
            <div className="text-base font-bold font-steel text-zinc-900 dark:text-white">No Shared Credentials</div>
            <p className="text-xs text-zinc-500 mt-1 font-sans">There are no encrypted secrets shared with your organization yet.</p>
          </div>
        ) : (
          filtered.map((cred) => {
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
                  {cred.username && (
                    <div className="text-xs text-zinc-500 mt-1 font-sans">
                      Username: <span className="font-tech text-zinc-700 dark:text-zinc-300">{cred.username}</span>
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
                  <span className="text-[11px] text-zinc-400 font-sans">
                    Encrypted at rest
                  </span>

                  <button
                    onClick={() => handleReveal(cred)}
                    disabled={revealingId === cred.id}
                    className="px-3 py-1.5 rounded-lg bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 hover:bg-blue-100 font-semibold transition flex items-center gap-1 cursor-pointer font-tech"
                  >
                    <Eye className="w-3.5 h-3.5" />
                    <span>{revealingId === cred.id ? "Decrypting..." : "Reveal Secret"}</span>
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

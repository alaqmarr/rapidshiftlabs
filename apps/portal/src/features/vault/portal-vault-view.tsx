"use client";

import { useState, useEffect } from "react";
import {
  KeyRound,
  Eye,
  EyeOff,
  Copy,
  Lock,
  ShieldCheck,
  Search,
  Server,
  Database,
  Mail,
  FileCode,
  Terminal,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Globe,
} from "lucide-react";
import { useAlert } from "@/components/ui/alert-popup";
import type { SerializedVaultCredential } from "./admin-vault-view";

interface PortalVaultViewProps {
  clientId: string;
  clientName: string;
  initialCredentials: SerializedVaultCredential[];
}

function toEnvKeyName(label: string): string {
  return (
    label
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "") || "SECRET_KEY"
  );
}

export function PortalVaultView({
  clientId,
  clientName,
  initialCredentials,
}: PortalVaultViewProps) {
  const { showSuccess, showError, showAlert } = useAlert();
  const [credentials, setCredentials] =
    useState<SerializedVaultCredential[]>(initialCredentials);
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [revealingId, setRevealingId] = useState<string | null>(null);
  const [revealedSecret, setRevealedSecret] = useState<{
    id: string;
    plaintext: string;
    expiresAt: number;
  } | null>(null);
  const [countdownSeconds, setCountdownSeconds] = useState<number>(0);

  useEffect(() => {
    if (!revealedSecret) {
      setCountdownSeconds(0);
      return;
    }

    const updateTimer = () => {
      const remaining = Math.max(
        0,
        Math.ceil((revealedSecret.expiresAt - Date.now()) / 1000)
      );
      setCountdownSeconds(remaining);
      if (remaining <= 0) {
        setRevealedSecret(null);
      }
    };

    updateTimer();
    const interval = setInterval(updateTimer, 250);
    return () => clearInterval(interval);
  }, [revealedSecret]);

  const filtered = credentials.filter((c) => {
    const q = searchQuery.toLowerCase().trim();
    const matchesSearch =
      !q ||
      c.name.toLowerCase().includes(q) ||
      (c.username && c.username.toLowerCase().includes(q)) ||
      c.category.toLowerCase().includes(q);

    const matchesCat =
      categoryFilter === "all" ||
      c.category === categoryFilter ||
      (categoryFilter === "cloud_dns" &&
        (c.category === "env_file" || c.category === "other")) ||
      (categoryFilter === "app_login" &&
        (c.category === "smtp" || c.category === "other"));

    return matchesSearch && matchesCat;
  });

  const handleReveal = async (cred: SerializedVaultCredential) => {
    if (revealedSecret?.id === cred.id) {
      setRevealedSecret(null);
      return;
    }

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
      setRevealedSecret({
        id: cred.id,
        plaintext,
        expiresAt: Date.now() + 30000,
      });

      setCredentials((prev) =>
        prev.map((c) =>
          c.id === cred.id
            ? {
                ...c,
                revealedCount: (c.revealedCount || 0) + 1,
                lastRevealedAt: Date.now(),
              }
            : c
        )
      );

      showAlert({
        type: "info",
        title: `Decrypted Secret: ${cred.name}`,
        description:
          "This decryption event has been recorded in the security audit trail with your timestamp and IP address. Plaintext auto-masks after 30 seconds.",
        details: [
          { label: "Secret Name", value: cred.name },
          { label: "Decrypted Plaintext", value: plaintext },
          { label: "Security Policy", value: "Audit-logged (30s auto-mask)" },
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

  const handleCopyEnvSnippet = (
    cred: SerializedVaultCredential,
    plaintext?: string
  ) => {
    const key = toEnvKeyName(cred.name);
    const val =
      plaintext ||
      (revealedSecret?.id === cred.id
        ? revealedSecret.plaintext
        : "<REVEAL_SECRET_FIRST>");
    const snippet = `${key}="${val.replace(/"/g, '\\"')}"`;
    navigator.clipboard.writeText(snippet);
    showSuccess(
      "Copied .env Snippet",
      plaintext || revealedSecret?.id === cred.id
        ? `Copied ${key}="***" to clipboard.`
        : `Copied ${key} variable template. Reveal the credential first to copy the decrypted value.`
    );
  };

  const categoryIcons = {
    database: Database,
    smtp: Mail,
    api_key: KeyRound,
    server_ssh: Server,
    env_file: FileCode,
    other: Globe,
  };

  const categoryLabels: Record<SerializedVaultCredential["category"], string> =
    {
      database: "Database",
      server_ssh: "SSH / Server",
      api_key: "API Key / Token",
      env_file: "Cloud / DNS (.env)",
      smtp: "App Login / SMTP",
      other: "Other Secret",
    };

  const categoryPills = [
    { id: "all", label: "All" },
    { id: "database", label: "Database" },
    { id: "server_ssh", label: "SSH / Server" },
    { id: "api_key", label: "API Key / Token" },
    { id: "cloud_dns", label: "Cloud / DNS" },
    { id: "app_login", label: "App Login" },
  ];

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 sm:p-8 shadow-sm space-y-5">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <div className="steel-pill inline-flex items-center gap-2 px-2.5 py-1 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200 dark:bg-blue-950/40 dark:text-blue-400 dark:border-blue-800">
                <ShieldCheck className="w-3.5 h-3.5" />
                <span>Zero-Knowledge Shared Vault</span>
              </div>
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-tech font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-800">
                <Lock className="w-3 h-3" />
                AES-256-GCM Protected
              </span>
            </div>
            <h1 className="text-fluid-title steel-heading text-zinc-900 dark:text-white">
              Client Secret Vault &bull; {clientName}
            </h1>
            <p className="text-xs sm:text-sm text-zinc-500 dark:text-zinc-400 max-w-3xl font-sans">
              Access encrypted database connection strings, SSH keys, API tokens, and environment variables provisioned for {clientName}.
            </p>
          </div>

          <div className="flex items-center gap-3 self-start md:self-center">
            <div className="px-4 py-2.5 rounded-xl bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-200 dark:border-zinc-800 text-right">
              <div className="text-[10px] font-tech uppercase tracking-wider text-zinc-400">
                Provisioned Secrets
              </div>
              <div className="text-lg font-bold font-tech text-zinc-900 dark:text-white tabular-nums">
                {credentials.length}
              </div>
            </div>
          </div>
        </div>

        {/* Security & Audit Notice Banner */}
        <div className="p-4 rounded-xl bg-blue-50/60 dark:bg-blue-950/20 border border-blue-200/80 dark:border-blue-900/50 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-start sm:items-center gap-3">
            <div className="p-2 rounded-lg bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300 shrink-0">
              <ShieldCheck className="w-4 h-4" />
            </div>
            <div className="text-xs text-zinc-700 dark:text-zinc-300 leading-relaxed">
              <span className="font-bold text-zinc-900 dark:text-white">
                Security &amp; Audit Governance Notice:
              </span>{" "}
              Every credential decryption is cryptographically signed and recorded in the tamper-evident security audit log for tenant{" "}
              <code className="font-tech text-[11px] px-1.5 py-0.5 rounded bg-white dark:bg-zinc-900 border border-blue-200 dark:border-blue-800">
                {clientId}
              </code>
              . Revealed secrets automatically re-mask after 30 seconds.
            </div>
          </div>

          {revealedSecret && (
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 text-xs font-tech font-bold shrink-0">
              <Clock className="w-3.5 h-3.5 animate-spin" />
              <span>Auto-mask in {countdownSeconds}s</span>
            </div>
          )}
        </div>
      </div>

      {/* Filter and Search */}
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-4 shadow-sm space-y-3">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search secrets by label, username, or category..."
              className="w-full pl-10 pr-4 py-2 text-xs sm:text-sm rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 font-tech"
            />
          </div>

          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="px-3 py-2 text-xs font-medium rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 text-zinc-700 dark:text-zinc-300 w-full sm:w-auto font-tech"
          >
            <option value="all">Category: All</option>
            <option value="database">Database</option>
            <option value="server_ssh">SSH / Server</option>
            <option value="api_key">API Key / Token</option>
            <option value="cloud_dns">Cloud / DNS (.env)</option>
            <option value="app_login">App Login / SMTP</option>
            <option value="other">Other</option>
          </select>
        </div>

        <div className="flex items-center gap-1.5 overflow-x-auto pt-1">
          {categoryPills.map((pill) => (
            <button
              key={pill.id}
              type="button"
              onClick={() => setCategoryFilter(pill.id)}
              className={`px-3 py-1 rounded-lg text-xs font-tech font-semibold whitespace-nowrap transition cursor-pointer ${
                categoryFilter === pill.id
                  ? "bg-blue-600 text-white shadow-xs"
                  : "bg-zinc-100 dark:bg-zinc-800/70 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200/70 dark:hover:bg-zinc-800"
              }`}
            >
              {pill.label}
            </button>
          ))}
        </div>
      </div>

      {/* Secrets Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {filtered.length === 0 ? (
          <div className="col-span-full p-12 text-center bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl">
            <KeyRound className="w-8 h-8 text-zinc-400 mx-auto mb-2" />
            <div className="text-base font-bold font-steel text-zinc-900 dark:text-white">
              No Shared Credentials
            </div>
            <p className="text-xs text-zinc-500 mt-1 font-sans">
              There are no encrypted secrets matching your filter criteria.
            </p>
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
                  <div className="flex items-center justify-between mb-2.5">
                    <div className="p-2 rounded-lg bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300">
                      <Icon className="w-4 h-4" />
                    </div>
                    <span className="steel-pill text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-500">
                      {categoryLabels[cred.category] ||
                        cred.category.replace("_", " ")}
                    </span>
                  </div>

                  <h3 className="text-sm font-bold font-steel text-zinc-900 dark:text-white truncate">
                    {cred.name}
                  </h3>
                  <div className="text-[11px] font-mono text-zinc-400 mt-0.5">
                    {toEnvKeyName(cred.name)}
                  </div>
                  {cred.username && (
                    <div className="text-xs text-zinc-500 mt-1 font-sans truncate">
                      Username:{" "}
                      <span className="font-tech text-zinc-700 dark:text-zinc-300">
                        {cred.username}
                      </span>
                    </div>
                  )}

                  {/* Secret Display Box with 30-second countdown */}
                  <div className="mt-3 p-2.5 rounded-lg bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800/80 font-tech text-xs text-zinc-600 dark:text-zinc-400 space-y-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate select-all">
                        {isRevealed
                          ? revealedSecret.plaintext
                          : "••••••••••••••••••••••••"}
                      </span>
                      {isRevealed && (
                        <span className="text-[10px] font-bold text-amber-600 dark:text-amber-400 shrink-0 tabular-nums">
                          {countdownSeconds}s
                        </span>
                      )}
                    </div>
                    {isRevealed && (
                      <div className="w-full h-1 rounded-full bg-zinc-200 dark:bg-zinc-800 overflow-hidden">
                        <div
                          className="h-full bg-blue-600 transition-all duration-300"
                          style={{
                            width: `${Math.min(100, (countdownSeconds / 30) * 100)}%`,
                          }}
                        />
                      </div>
                    )}
                  </div>

                  {/* Copy Secret & Copy .env Snippet Buttons */}
                  <div className="mt-2.5 flex items-center gap-2">
                    {isRevealed && (
                      <button
                        type="button"
                        onClick={() => {
                          navigator.clipboard.writeText(
                            revealedSecret.plaintext
                          );
                          showSuccess(
                            "Copied Secret",
                            "Decrypted secret copied to clipboard."
                          );
                        }}
                        className="flex-1 inline-flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-200 text-[11px] font-tech font-semibold transition cursor-pointer"
                      >
                        <Copy className="w-3 h-3" />
                        <span>Copy Secret</span>
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() =>
                        handleCopyEnvSnippet(
                          cred,
                          isRevealed ? revealedSecret.plaintext : undefined
                        )
                      }
                      className="flex-1 inline-flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-800/60 text-zinc-600 dark:text-zinc-300 text-[11px] font-tech font-semibold transition cursor-pointer"
                      title={`Copy as ${toEnvKeyName(cred.name)}="value"`}
                    >
                      <Terminal className="w-3 h-3 text-blue-500" />
                      <span>Copy .env Snippet</span>
                    </button>
                  </div>
                </div>

                <div className="pt-3 border-t border-zinc-100 dark:border-zinc-800/80 flex items-center justify-between text-xs">
                  <span className="text-[11px] text-zinc-400 font-sans">
                    {isRevealed
                      ? `Masks in ${countdownSeconds}s`
                      : "Encrypted at rest"}
                  </span>

                  <button
                    type="button"
                    onClick={() => handleReveal(cred)}
                    disabled={revealingId === cred.id}
                    className={`px-3 py-1.5 rounded-lg font-semibold transition flex items-center gap-1 cursor-pointer font-tech ${
                      isRevealed
                        ? "bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300"
                        : "bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 hover:bg-blue-100"
                    }`}
                  >
                    {isRevealed ? (
                      <>
                        <EyeOff className="w-3.5 h-3.5" />
                        <span>Hide Secret</span>
                      </>
                    ) : (
                      <>
                        <Eye className="w-3.5 h-3.5" />
                        <span>
                          {revealingId === cred.id
                            ? "Decrypting..."
                            : "Reveal Secret"}
                        </span>
                      </>
                    )}
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

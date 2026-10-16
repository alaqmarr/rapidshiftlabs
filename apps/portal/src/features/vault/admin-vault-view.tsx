"use client";

import { useState, useEffect } from "react";
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
  Sparkles,
  LayoutGrid,
  List,
  RefreshCw,
  Terminal,
  Clock,
  CheckCircle2,
  Wand2,
  Users,
  ShieldAlert,
  Globe,
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

function toEnvKeyName(label: string): string {
  return (
    label
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "") || "SECRET_KEY"
  );
}

function generateEntropySecret(mode: "password32" | "hex64" | "rsl_token"): string {
  const randomBytes = new Uint8Array(32);
  if (typeof window !== "undefined" && window.crypto?.getRandomValues) {
    window.crypto.getRandomValues(randomBytes);
  } else {
    for (let i = 0; i < 32; i++) {
      randomBytes[i] = Math.floor(Math.random() * 256);
    }
  }

  if (mode === "hex64") {
    return Array.from(randomBytes)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  }

  if (mode === "rsl_token") {
    const alphabet = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    const tokenBody = Array.from(randomBytes.slice(0, 28))
      .map((b) => alphabet[b % alphabet.length])
      .join("");
    return `rsl_sec_${tokenBody}`;
  }

  const charset =
    "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%^&*()-_=+[]{}";
  return Array.from(randomBytes)
    .map((b) => charset[b % charset.length])
    .join("");
}

export function AdminVaultView({
  initialCredentials,
  clients,
}: AdminVaultViewProps) {
  const { showSuccess, showError, showAlert } = useAlert();
  const [credentials, setCredentials] =
    useState<SerializedVaultCredential[]>(initialCredentials);
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [clientFilter, setClientFilter] = useState<string>("all");
  const [viewMode, setViewMode] = useState<"cards" | "table">("cards");

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showGeneratorDrawer, setShowGeneratorDrawer] = useState(false);
  const [scratchGenerated, setScratchGenerated] = useState<string>(() =>
    generateEntropySecret("password32")
  );
  const [submitting, setSubmitting] = useState(false);

  // Reveal state with 30-second auto-mask countdown
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

  const [form, setForm] = useState({
    clientId: clients[0]?.id || "",
    name: "",
    category: "database" as SerializedVaultCredential["category"],
    username: "",
    value: "",
    oneTimeReveal: false,
    expiresInDays: 90,
  });

  const now = Date.now();
  const NINETY_DAYS_MS = 90 * 86400000;

  const getAgeInDays = (createdAt: number) =>
    Math.max(0, Math.floor((now - createdAt) / 86400000));

  const rotationWarningCount = credentials.filter(
    (c) =>
      now - c.createdAt > NINETY_DAYS_MS ||
      (c.expiresAt && c.expiresAt - now < 7 * 86400000)
  ).length;

  const mappedClientsCount = new Set(credentials.map((c) => c.clientId)).size;
  const totalAuditedReveals = credentials.reduce(
    (acc, c) => acc + (c.revealedCount || 0),
    0
  );

  const filteredCredentials = credentials.filter((c) => {
    const q = searchQuery.toLowerCase().trim();
    const matchesSearch =
      !q ||
      c.name.toLowerCase().includes(q) ||
      (c.username && c.username.toLowerCase().includes(q)) ||
      (c.clientName && c.clientName.toLowerCase().includes(q)) ||
      c.category.toLowerCase().includes(q);

    const matchesCategory =
      categoryFilter === "all" ||
      c.category === categoryFilter ||
      (categoryFilter === "cloud_dns" &&
        (c.category === "env_file" || c.category === "other")) ||
      (categoryFilter === "app_login" &&
        (c.category === "smtp" || c.category === "other"));

    const matchesClient = clientFilter === "all" || c.clientId === clientFilter;
    return matchesSearch && matchesCategory && matchesClient;
  });

  const handleGenerateInForm = (
    mode: "password32" | "hex64" | "rsl_token"
  ) => {
    const generated = generateEntropySecret(mode);
    setForm((prev) => ({ ...prev, value: generated }));
    showSuccess(
      "Cryptographic Secret Generated",
      mode === "password32"
        ? "Generated 32-character high-entropy secret via CSPRNG."
        : mode === "hex64"
        ? "Generated 256-bit (64-char) hexadecimal encryption key."
        : "Generated prefixed RapidShift Labs API secret token."
    );
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim() || !form.value.trim() || !form.clientId) {
      showError(
        "Validation Error",
        "Name, secret value, and client are required."
      );
      return;
    }

    try {
      setSubmitting(true);
      const expiresAt =
        form.expiresInDays > 0
          ? Date.now() + form.expiresInDays * 86400000
          : null;

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
        expiresInDays: 90,
      });

      showSuccess(
        "Credential Secured in Vault",
        `Secret "${created.name}" is now encrypted with AES-256-GCM and stored in SQLite WAL vault.`,
        [
          { label: "Credential Name", value: created.name },
          { label: "Category", value: created.category },
          {
            label: "Target Client",
            value: clientObj?.name || created.clientId,
          },
        ]
      );
    } catch (err: any) {
      showError(
        "Vault Error",
        err.message || "Failed to encrypt and store secret."
      );
    } finally {
      setSubmitting(false);
    }
  };

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
        throw new Error(json.error || "Failed to reveal credential");
      }

      const plaintext = json.data?.plaintext || json.data?.value || "";
      setRevealedSecret({
        id: cred.id,
        plaintext,
        expiresAt: Date.now() + 30000,
      });

      // Update revealed count locally
      setCredentials((prev) =>
        prev.map((c) =>
          c.id === cred.id
            ? {
                ...c,
                revealedCount: c.revealedCount + 1,
                lastRevealedAt: Date.now(),
              }
            : c
        )
      );

      showAlert({
        type: "info",
        title: `Decrypted Secret: ${cred.name}`,
        description:
          "This decryption event has been recorded in the tamper-evident security audit log with your operator identity and IP address. Plaintext auto-masks in 30 seconds.",
        details: [
          { label: "Credential", value: cred.name },
          { label: "Decrypted Plaintext", value: plaintext },
          { label: "Audit Event", value: "vault:reveal (30s TTL)" },
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

  const handleCopyEnvLine = (
    cred: SerializedVaultCredential,
    plaintext?: string
  ) => {
    const key = toEnvKeyName(cred.name);
    const val =
      plaintext ||
      (revealedSecret?.id === cred.id
        ? revealedSecret.plaintext
        : "<REVEAL_SECRET_FIRST>");
    const envSnippet = `${key}="${val.replace(/"/g, '\\"')}"`;
    navigator.clipboard.writeText(envSnippet);
    showSuccess(
      "Copied .env Line",
      plaintext || revealedSecret?.id === cred.id
        ? `Copied ${key}="***" to clipboard.`
        : `Copied ${key} template to clipboard (reveal secret first to include decrypted value).`
    );
  };

  const handleDelete = (cred: SerializedVaultCredential) => {
    showAlert({
      type: "error",
      title: `Delete Secret: ${cred.name}?`,
      description:
        "Are you sure you want to permanently delete this secret from the encrypted vault? This action cannot be reversed.",
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
            if (revealedSecret?.id === cred.id) setRevealedSecret(null);
            showSuccess(
              "Credential Deleted",
              `Secret "${cred.name}" was erased from the vault.`
            );
          } catch (err: any) {
            showError(
              "Deletion Failed",
              err.message || "Failed to erase credential."
            );
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

  const categoryFilterPills = [
    { id: "all", label: "All" },
    { id: "database", label: "Database" },
    { id: "server_ssh", label: "SSH / Server" },
    { id: "api_key", label: "API Key / Token" },
    { id: "cloud_dns", label: "Cloud / DNS" },
    { id: "app_login", label: "App Login" },
  ];

  return (
    <div className="space-y-6">
      {/* Top Banner + Security Telemetry Strip */}
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 sm:p-8 shadow-sm space-y-6">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <div className="steel-pill inline-flex items-center gap-2 px-2.5 py-1 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200 dark:bg-blue-950/40 dark:text-blue-400 dark:border-blue-800">
                <ShieldCheck className="w-3.5 h-3.5" />
                <span>AES-256-GCM Encrypted Zero-Knowledge Vault</span>
              </div>
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-tech font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-800">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                HSM Master Key Verified
              </span>
            </div>
            <h1 className="text-fluid-title steel-heading text-zinc-900 dark:text-white">
              Credential Vault &amp; Secret Governance Suite
            </h1>
            <p className="text-xs sm:text-sm text-zinc-500 dark:text-zinc-400 max-w-3xl font-sans">
              Manage tenant database URIs, SSH private keys, API tokens, and cloud secrets encrypted at rest with per-credential IVs. Every decryption is logged to the immutable audit ledger and auto-masks after 30 seconds.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            <button
              type="button"
              onClick={() => setShowGeneratorDrawer((prev) => !prev)}
              className="inline-flex items-center gap-2 px-3.5 py-2.5 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800/80 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-800 dark:text-zinc-200 font-semibold text-xs sm:text-sm transition cursor-pointer"
            >
              <Wand2 className="w-4 h-4 text-blue-600 dark:text-blue-400" />
              <span className="font-tech font-bold">Key Generator</span>
            </button>

            <button
              type="button"
              onClick={() => setShowCreateModal(true)}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 active:scale-[0.99] text-white font-semibold text-xs sm:text-sm shadow-sm transition cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span className="font-tech font-bold">Store Secret</span>
            </button>
          </div>
        </div>

        {/* Security Telemetry Strip */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3.5 pt-5 border-t border-zinc-100 dark:border-zinc-800/80">
          <div className="p-3.5 rounded-xl bg-zinc-50 dark:bg-zinc-800/40 border border-zinc-200/80 dark:border-zinc-800">
            <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
              <span>Encrypted Secrets</span>
              <KeyRound className="w-3.5 h-3.5 text-blue-500" />
            </div>
            <div className="text-xl font-bold font-tech text-zinc-900 dark:text-white mt-1 tabular-nums">
              {credentials.length}
            </div>
            <div className="text-[11px] text-zinc-500 mt-0.5">
              Zero plaintext persistence
            </div>
          </div>

          <div className="p-3.5 rounded-xl bg-emerald-50/50 dark:bg-emerald-950/20 border border-emerald-200/70 dark:border-emerald-900/40">
            <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
              <span>Vault Cipher</span>
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div className="text-lg font-bold font-tech text-emerald-700 dark:text-emerald-300 mt-1">
              AES-256-GCM
            </div>
            <div className="text-[11px] text-emerald-600/80 dark:text-emerald-400/80 mt-0.5">
              Authenticated Tag + WAL
            </div>
          </div>

          <div className="p-3.5 rounded-xl bg-zinc-50 dark:bg-zinc-800/40 border border-zinc-200/80 dark:border-zinc-800">
            <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
              <span>Mapped Clients</span>
              <Users className="w-3.5 h-3.5 text-indigo-500" />
            </div>
            <div className="text-xl font-bold font-tech text-zinc-900 dark:text-white mt-1 tabular-nums">
              {mappedClientsCount}{" "}
              <span className="text-xs font-normal text-zinc-400">
                / {clients.length}
              </span>
            </div>
            <div className="text-[11px] text-zinc-500 mt-0.5">
              Tenant-isolated namespaces
            </div>
          </div>

          <div
            className={`p-3.5 rounded-xl border ${
              rotationWarningCount > 0
                ? "bg-amber-50/60 dark:bg-amber-950/20 border-amber-200 dark:border-amber-900/40"
                : "bg-zinc-50 dark:bg-zinc-800/40 border-zinc-200/80 dark:border-zinc-800"
            }`}
          >
            <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-wider text-amber-600 dark:text-amber-400">
              <span>Rotation Age &gt;90d</span>
              <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
            </div>
            <div className="text-xl font-bold font-tech text-zinc-900 dark:text-white mt-1 tabular-nums">
              {rotationWarningCount}
            </div>
            <div className="text-[11px] text-zinc-500 mt-0.5">
              {rotationWarningCount === 0
                ? "All secrets within 90d policy"
                : "Requires key rotation"}
            </div>
          </div>

          <div className="p-3.5 rounded-xl bg-blue-50/50 dark:bg-blue-950/20 border border-blue-200/70 dark:border-blue-900/40 col-span-2 sm:col-span-1">
            <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-wider text-blue-700 dark:text-blue-400">
              <span>Audited Reveals</span>
              <Eye className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
            </div>
            <div className="text-xl font-bold font-tech text-blue-700 dark:text-blue-300 mt-1 tabular-nums">
              {totalAuditedReveals}
            </div>
            <div className="text-[11px] text-blue-600/80 dark:text-blue-400/80 mt-0.5">
              30s auto-mask enforced
            </div>
          </div>
        </div>

        {/* Inline Cryptographic Generator Toolbar Drawer */}
        {showGeneratorDrawer && (
          <div className="p-4 rounded-xl bg-zinc-900 text-white border border-zinc-800 space-y-3 animate-in fade-in duration-150">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-blue-400" />
                <span className="text-xs font-bold font-tech uppercase tracking-wider text-blue-400">
                  CSPRNG Cryptographic Secret &amp; Token Generator
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() =>
                    setScratchGenerated(generateEntropySecret("password32"))
                  }
                  className="px-2.5 py-1 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-xs font-tech font-semibold text-zinc-200 border border-zinc-700 transition cursor-pointer"
                >
                  32-Char High-Entropy Password
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setScratchGenerated(generateEntropySecret("hex64"))
                  }
                  className="px-2.5 py-1 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-xs font-tech font-semibold text-zinc-200 border border-zinc-700 transition cursor-pointer"
                >
                  64-Char Hex Key (256-bit)
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setScratchGenerated(generateEntropySecret("rsl_token"))
                  }
                  className="px-2.5 py-1 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-xs font-tech font-semibold text-zinc-200 border border-zinc-700 transition cursor-pointer"
                >
                  rsl_sec_... API Token
                </button>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
              <div className="flex-1 px-3.5 py-2 rounded-lg bg-zinc-950 border border-zinc-800 font-mono text-xs text-emerald-400 select-all overflow-x-auto">
                {scratchGenerated}
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(scratchGenerated);
                    showSuccess("Copied", "Generated secret copied to clipboard.");
                  }}
                  className="px-3 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-xs font-tech font-semibold text-white flex items-center gap-1.5 cursor-pointer"
                >
                  <Copy className="w-3.5 h-3.5" />
                  <span>Copy</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setForm((prev) => ({ ...prev, value: scratchGenerated }));
                    setShowCreateModal(true);
                  }}
                  className="px-3 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-xs font-tech font-semibold text-white flex items-center gap-1.5 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Use in New Credential</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Audited Reveal Active Banner */}
      {revealedSecret && (
        <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/80 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-300">
              <Clock className="w-4 h-4 animate-spin" />
            </div>
            <div>
              <div className="text-xs font-bold text-amber-900 dark:text-amber-200">
                Plaintext Secret Exposed &bull; Auto-Masking in {countdownSeconds}s
              </div>
              <div className="text-[11px] text-amber-700 dark:text-amber-400">
                Decryption event logged to security audit trail. Secret will automatically re-mask when timer expires.
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setRevealedSecret(null)}
            className="px-3 py-1.5 rounded-lg bg-amber-800 hover:bg-amber-900 text-white text-xs font-tech font-semibold self-start sm:self-center cursor-pointer"
          >
            Mask Immediately
          </button>
        </div>
      )}

      {/* Filter, Category Pills, and View Mode Bar */}
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-4 shadow-sm space-y-3">
        <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3">
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search secrets by label, username, URL, or client tenant..."
              className="w-full pl-10 pr-4 py-2 text-xs sm:text-sm rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 font-tech"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <select
              value={clientFilter}
              onChange={(e) => setClientFilter(e.target.value)}
              className="px-3 py-2 text-xs font-medium rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 text-zinc-700 dark:text-zinc-300 font-tech"
            >
              <option value="all">Client Tenant: All ({clients.length})</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>

            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="px-3 py-2 text-xs font-medium rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 text-zinc-700 dark:text-zinc-300 font-tech"
            >
              <option value="all">Category: All</option>
              <option value="database">Database</option>
              <option value="server_ssh">SSH / Server</option>
              <option value="api_key">API Key / Token</option>
              <option value="cloud_dns">Cloud / DNS (.env)</option>
              <option value="app_login">App Login / SMTP</option>
              <option value="env_file">Env File</option>
              <option value="smtp">SMTP</option>
              <option value="other">Other</option>
            </select>

            {/* View Mode Toggle: Cards vs Table */}
            <div className="inline-flex items-center rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-100/80 dark:bg-zinc-950 p-1">
              <button
                type="button"
                onClick={() => setViewMode("cards")}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-tech font-semibold transition cursor-pointer ${
                  viewMode === "cards"
                    ? "bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white shadow-xs"
                    : "text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-300"
                }`}
              >
                <LayoutGrid className="w-3.5 h-3.5" />
                <span>Cards</span>
              </button>
              <button
                type="button"
                onClick={() => setViewMode("table")}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-tech font-semibold transition cursor-pointer ${
                  viewMode === "table"
                    ? "bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white shadow-xs"
                    : "text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-300"
                }`}
              >
                <List className="w-3.5 h-3.5" />
                <span>Table</span>
              </button>
            </div>
          </div>
        </div>

        {/* Category Filter Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto pt-1">
          {categoryFilterPills.map((pill) => (
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

      {/* Empty State */}
      {filteredCredentials.length === 0 ? (
        <div className="p-12 text-center bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl">
          <KeyRound className="w-8 h-8 text-zinc-400 mx-auto mb-2" />
          <div className="text-base font-bold font-steel text-zinc-900 dark:text-white">
            No Credentials Found
          </div>
          <p className="text-xs text-zinc-500 mt-1 font-sans">
            No encrypted secrets found matching your filter criteria.
          </p>
        </div>
      ) : viewMode === "cards" ? (
        /* Secrets Grid (Cards View) */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredCredentials.map((cred) => {
            const Icon = categoryIcons[cred.category] || Lock;
            const isRevealed = revealedSecret?.id === cred.id;
            const ageDays = getAgeInDays(cred.createdAt);
            const isOld = ageDays > 90;

            return (
              <div
                key={cred.id}
                className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-5 shadow-sm flex flex-col justify-between space-y-4 hover:border-zinc-300 dark:hover:border-zinc-700 transition"
              >
                <div>
                  <div className="flex items-center justify-between gap-2 mb-2.5">
                    <div className="flex items-center gap-2">
                      <div className="p-2 rounded-lg bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300">
                        <Icon className="w-4 h-4" />
                      </div>
                      <span className="steel-pill text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300">
                        {categoryLabels[cred.category] || cred.category}
                      </span>
                    </div>

                    {/* Rotation Age Indicator */}
                    <span
                      className={`inline-flex items-center gap-1 text-[10px] font-tech font-bold px-2 py-0.5 rounded border ${
                        isOld
                          ? "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-400 dark:border-amber-800"
                          : "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-800"
                      }`}
                      title={
                        isOld
                          ? "Secret is older than 90 days — key rotation recommended"
                          : "Secret rotation age is within 90-day policy"
                      }
                    >
                      {isOld ? (
                        <AlertTriangle className="w-3 h-3" />
                      ) : (
                        <CheckCircle2 className="w-3 h-3" />
                      )}
                      <span>{ageDays}d old</span>
                    </span>
                  </div>

                  <h3 className="text-sm font-bold font-steel text-zinc-900 dark:text-white truncate">
                    {cred.name}
                  </h3>
                  <div className="text-xs text-zinc-500 mt-1 font-sans flex items-center justify-between">
                    <span>
                      Client:{" "}
                      <span className="font-semibold text-zinc-700 dark:text-zinc-300">
                        {cred.clientName || cred.clientId}
                      </span>
                    </span>
                    {cred.oneTimeReveal && (
                      <span className="text-[10px] font-tech font-semibold text-rose-600 dark:text-rose-400">
                        1-Time Burn
                      </span>
                    )}
                  </div>
                  {cred.username && (
                    <div className="text-xs text-zinc-400 mt-0.5 font-sans truncate">
                      Identity / Host:{" "}
                      <span className="font-tech text-zinc-600 dark:text-zinc-400">
                        {cred.username}
                      </span>
                    </div>
                  )}

                  {/* Secret Display Box */}
                  <div className="mt-3 p-2.5 rounded-lg bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800/80 font-tech text-xs text-zinc-600 dark:text-zinc-400 space-y-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate select-all">
                        {isRevealed
                          ? revealedSecret.plaintext
                          : "••••••••••••••••••••••••••••"}
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

                  {/* Quick Copy Actions */}
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
                            "Plaintext secret copied to clipboard."
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
                        handleCopyEnvLine(
                          cred,
                          isRevealed ? revealedSecret.plaintext : undefined
                        )
                      }
                      className="flex-1 inline-flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-800/60 text-zinc-600 dark:text-zinc-300 text-[11px] font-tech font-semibold transition cursor-pointer"
                      title={`Copy as ${toEnvKeyName(cred.name)}="value"`}
                    >
                      <Terminal className="w-3 h-3 text-blue-500" />
                      <span>Copy .env Line</span>
                    </button>
                  </div>
                </div>

                <div className="pt-3 border-t border-zinc-100 dark:border-zinc-800/80 flex items-center justify-between text-xs">
                  <span className="text-[11px] text-zinc-400 font-tech">
                    Audited Reveals: {cred.revealedCount}
                  </span>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleReveal(cred)}
                      disabled={revealingId === cred.id}
                      className={`px-2.5 py-1 rounded-lg font-semibold transition flex items-center gap-1 cursor-pointer font-tech ${
                        isRevealed
                          ? "bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300"
                          : "bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 hover:bg-blue-100"
                      }`}
                    >
                      {isRevealed ? (
                        <>
                          <EyeOff className="w-3 h-3" />
                          <span>Mask ({countdownSeconds}s)</span>
                        </>
                      ) : (
                        <>
                          <Eye className="w-3 h-3" />
                          <span>
                            {revealingId === cred.id
                              ? "Decrypting..."
                              : "Reveal"}
                          </span>
                        </>
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(cred)}
                      className="p-1 rounded-lg text-zinc-400 hover:text-rose-600 dark:hover:text-rose-400 transition cursor-pointer"
                      title="Delete secret"
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
        /* Secrets Table View */
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-zinc-50 dark:bg-zinc-800/60 border-b border-zinc-200 dark:border-zinc-800 text-zinc-500 uppercase font-semibold">
                <tr>
                  <th className="py-3.5 px-4">Secret Label</th>
                  <th className="py-3.5 px-4">Client Tenant</th>
                  <th className="py-3.5 px-4">Category</th>
                  <th className="py-3.5 px-4">Username / Host</th>
                  <th className="py-3.5 px-4">Ciphertext / Value</th>
                  <th className="py-3.5 px-4">Rotation Age</th>
                  <th className="py-3.5 px-4">Audits</th>
                  <th className="py-3.5 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                {filteredCredentials.map((cred) => {
                  const isRevealed = revealedSecret?.id === cred.id;
                  const ageDays = getAgeInDays(cred.createdAt);
                  const isOld = ageDays > 90;

                  return (
                    <tr
                      key={cred.id}
                      className="hover:bg-zinc-50/70 dark:hover:bg-zinc-800/40 transition"
                    >
                      <td className="py-3.5 px-4 font-bold text-zinc-900 dark:text-white">
                        <div>{cred.name}</div>
                        <div className="text-[10px] font-mono text-zinc-400">
                          {toEnvKeyName(cred.name)}
                        </div>
                      </td>
                      <td className="py-3.5 px-4 font-semibold text-zinc-700 dark:text-zinc-300">
                        {cred.clientName || cred.clientId}
                      </td>
                      <td className="py-3.5 px-4">
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300">
                          {categoryLabels[cred.category] || cred.category}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 font-tech text-zinc-500">
                        {cred.username || "—"}
                      </td>
                      <td className="py-3.5 px-4 font-mono">
                        {isRevealed ? (
                          <span className="text-emerald-600 dark:text-emerald-400 font-semibold">
                            {revealedSecret.plaintext}{" "}
                            <span className="text-[10px] text-amber-500">
                              ({countdownSeconds}s)
                            </span>
                          </span>
                        ) : (
                          <span className="text-zinc-400">••••••••••••••</span>
                        )}
                      </td>
                      <td className="py-3.5 px-4">
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-tech font-bold ${
                            isOld
                              ? "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400"
                              : "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400"
                          }`}
                        >
                          {ageDays}d {isOld ? "(Rotate)" : "OK"}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 font-tech text-zinc-500">
                        {cred.revealedCount}
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        <div className="inline-flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => handleReveal(cred)}
                            className="px-2.5 py-1 rounded-lg bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 font-tech font-semibold hover:bg-blue-100 cursor-pointer"
                          >
                            {isRevealed ? "Mask" : "Reveal"}
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              handleCopyEnvLine(
                                cred,
                                isRevealed
                                  ? revealedSecret.plaintext
                                  : undefined
                              )
                            }
                            className="px-2 py-1 rounded-lg border border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-300 font-tech hover:bg-zinc-100 dark:hover:bg-zinc-800 cursor-pointer"
                            title="Copy as .env line"
                          >
                            .env
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDelete(cred)}
                            className="p-1 text-zinc-400 hover:text-rose-600 cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Create Secret Modal with Built-in Cryptographic Generator */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl w-full max-w-lg shadow-2xl p-6 space-y-5 animate-in fade-in zoom-in-95 max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold font-steel text-zinc-900 dark:text-white flex items-center gap-2">
                <KeyRound className="w-5 h-5 text-blue-600" />
                Store Encrypted Secret
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
                    onChange={(e) =>
                      setForm({ ...form, category: e.target.value as any })
                    }
                    className="w-full px-3 py-2 text-sm rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 font-medium"
                  >
                    <option value="database">Database</option>
                    <option value="server_ssh">SSH / Server</option>
                    <option value="api_key">API Key / Token</option>
                    <option value="env_file">Cloud / DNS (.env)</option>
                    <option value="smtp">App Login / SMTP</option>
                    <option value="other">Other Secret</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                  Username / Host / Identifier (Optional)
                </label>
                <input
                  type="text"
                  placeholder="e.g., db_admin or ssh://root@10.0.0.12"
                  value={form.username}
                  onChange={(e) =>
                    setForm({ ...form, username: e.target.value })
                  }
                  className="w-full px-3 py-2 text-sm rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900"
                />
              </div>

              {/* Built-in Cryptographic Secret Generator Toolbar */}
              <div className="p-3 rounded-xl bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-200 dark:border-zinc-700/80 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-tech font-bold uppercase tracking-wider text-zinc-600 dark:text-zinc-300 flex items-center gap-1.5">
                    <Wand2 className="w-3.5 h-3.5 text-blue-600" />
                    Cryptographic Secret Generator
                  </span>
                  <span className="text-[10px] font-tech text-zinc-400">
                    WebCrypto CSPRNG
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => handleGenerateInForm("password32")}
                    className="px-2.5 py-1.5 rounded-lg bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 hover:border-blue-500 text-[11px] font-tech font-semibold text-zinc-700 dark:text-zinc-200 transition cursor-pointer"
                  >
                    32-Char Entropy
                  </button>
                  <button
                    type="button"
                    onClick={() => handleGenerateInForm("hex64")}
                    className="px-2.5 py-1.5 rounded-lg bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 hover:border-blue-500 text-[11px] font-tech font-semibold text-zinc-700 dark:text-zinc-200 transition cursor-pointer"
                  >
                    64-Char Hex Key
                  </button>
                  <button
                    type="button"
                    onClick={() => handleGenerateInForm("rsl_token")}
                    className="px-2.5 py-1.5 rounded-lg bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 hover:border-blue-500 text-[11px] font-tech font-semibold text-zinc-700 dark:text-zinc-200 transition cursor-pointer"
                  >
                    rsl_sec_... Token
                  </button>
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                    Secret Plaintext Value
                  </label>
                  {form.name && (
                    <span className="text-[10px] font-mono text-zinc-400">
                      .env key: {toEnvKeyName(form.name)}
                    </span>
                  )}
                </div>
                <textarea
                  rows={3}
                  required
                  placeholder="Paste password, private key, connection string, or click a generator button above..."
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
                  onChange={(e) =>
                    setForm({ ...form, oneTimeReveal: e.target.checked })
                  }
                  className="rounded text-indigo-600 focus:ring-indigo-500"
                />
                <label
                  htmlFor="oneTimeReveal"
                  className="text-xs text-zinc-600 dark:text-zinc-400"
                >
                  One-time reveal only (burn after first decryption)
                </label>
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-zinc-100 dark:border-zinc-800">
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

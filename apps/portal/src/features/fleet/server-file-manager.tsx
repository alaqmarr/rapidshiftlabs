"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import {
  Folder,
  FileText,
  KeyRound,
  Plus,
  FolderPlus,
  RefreshCw,
  Trash2,
  Save,
  ArrowUp,
  Upload,
  Download,
  Eye,
  EyeOff,
  Sparkles,
  Lock,
  Pencil,
  RotateCw,
  Search,
  Code2,
  ListPlus,
  X,
} from "lucide-react";
import { useAlert } from "@/components/ui/alert-popup";
import { IosSpinner } from "@/components/ui/ios-spinner";
import type { SerializedProcess } from "./server-manager";

interface RemoteFileEntry {
  name: string;
  path: string;
  type: "file" | "directory" | "symlink";
  size: number;
  permissionsOctal: string;
  permissionsSymbolic: string;
  modifiedAt: number;
  isDotfile: boolean;
  isEnvFile: boolean;
}

interface RemoteBookmark {
  label: string;
  path: string;
  category: "system" | "pm2" | "web";
}

interface DirectoryPayload {
  currentPath: string;
  parentPath: string | null;
  homeDir: string;
  entries: RemoteFileEntry[];
  bookmarks: RemoteBookmark[];
  simulatedFallback?: boolean;
}

interface OpenedFileState {
  path: string;
  name: string;
  content: string;
  originalContent: string;
  permissionsOctal: string;
  exists: boolean;
}

interface EnvRow {
  id: string;
  key: string;
  value: string;
  revealed: boolean;
}

interface ServerFileManagerProps {
  serverId: string;
  serverName: string;
  processes: SerializedProcess[];
  initialPath?: string | null;
  onRestartPm2Process?: (proc: SerializedProcess) => Promise<void>;
}

const ENV_STARTER_TEMPLATES: Record<string, { label: string; content: string }> = {
  nextjs: {
    label: "Next.js + RapidShift SDK",
    content: [
      "NODE_ENV=production",
      "PORT=3000",
      "DATABASE_URL=file:./data/app.db",
      "AUTH_SECRET=",
      "RSL_CLIENT_ID=",
      "RSL_API_KEY=",
      "NEXT_PUBLIC_APP_URL=https://",
      "",
    ].join("\n"),
  },
  node_api: {
    label: "Node / Express API + DB",
    content: [
      "NODE_ENV=production",
      "PORT=4000",
      "DATABASE_URL=postgresql://postgres:password@127.0.0.1:5432/app",
      "REDIS_URL=redis://127.0.0.1:6379",
      "JWT_SECRET=",
      "CORS_ORIGIN=https://",
      "",
    ].join("\n"),
  },
  smtp: {
    label: "Add SMTP Mailer Vars",
    content: [
      "SMTP_HOST=smtp.gmail.com",
      "SMTP_PORT=587",
      "SMTP_USER=",
      "SMTP_PASS=",
      "SMTP_FROM=noreply@yourdomain.com",
      "",
    ].join("\n"),
  },
};

function parseEnvContentToRows(raw: string): EnvRow[] {
  const lines = raw.split(/\r?\n/);
  const rows: EnvRow[] = [];
  let idx = 0;
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqPos = trimmed.indexOf("=");
    if (eqPos === -1) continue;
    const key = trimmed.slice(0, eqPos).trim().replace(/^export\s+/, "");
    let val = trimmed.slice(eqPos + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    rows.push({
      id: `env-${idx++}-${key}`,
      key,
      value: val,
      revealed: false,
    });
  }
  if (rows.length === 0) {
    rows.push({ id: `env-init-1`, key: "NODE_ENV", value: "production", revealed: true });
    rows.push({ id: `env-init-2`, key: "PORT", value: "3000", revealed: true });
  }
  return rows;
}

function serializeEnvRows(rows: EnvRow[]): string {
  return (
    rows
      .filter((r) => r.key.trim().length > 0)
      .map((r) => {
        const cleanKey = r.key.trim();
        const needsQuotes = /[\s#"']/.test(r.value);
        const val = needsQuotes ? `"${r.value.replace(/"/g, '\\"')}"` : r.value;
        return `${cleanKey}=${val}`;
      })
      .join("\n") + "\n"
  );
}

function generateSecureHex(byteLen = 32): string {
  const arr = new Uint8Array(byteLen);
  crypto.getRandomValues(arr);
  return Array.from(arr)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function formatFileSize(bytes: number, type: RemoteFileEntry["type"]): string {
  if (type === "directory") return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export function ServerFileManager({
  serverId,
  serverName,
  processes,
  initialPath,
  onRestartPm2Process,
}: ServerFileManagerProps) {
  const { showSuccess, showError } = useAlert();
  const [dir, setDir] = useState<DirectoryPayload | null>(null);
  const [pathInput, setPathInput] = useState("");
  const [filterQuery, setFilterQuery] = useState("");
  const [loadingDir, setLoadingDir] = useState(true);

  // Editor state
  const [openFile, setOpenFile] = useState<OpenedFileState | null>(null);
  const [loadingFile, setLoadingFile] = useState(false);
  const [savingFile, setSavingFile] = useState(false);
  const [editorMode, setEditorMode] = useState<"raw" | "env-studio">("raw");
  const [envRows, setEnvRows] = useState<EnvRow[]>([]);
  const [restartProcIdAfterSave, setRestartProcIdAfterSave] = useState<string>("");

  // New file / folder modals
  const [newEntryModal, setNewEntryModal] = useState<"file" | "folder" | "env" | null>(null);
  const [newEntryName, setNewEntryName] = useState("");
  const [renameTarget, setRenameTarget] = useState<RemoteFileEntry | null>(null);
  const [renameNewName, setRenameNewName] = useState("");
  const uploadInputRef = useRef<HTMLInputElement | null>(null);

  const loadDirectory = useCallback(
    async (targetPath?: string) => {
      setLoadingDir(true);
      try {
        const q = targetPath ? `?mode=list&path=${encodeURIComponent(targetPath)}` : "?mode=list";
        const res = await fetch(`/api/v1/admin/servers/${serverId}/files${q}`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Failed to list directory");
        setDir(data.directory);
        setPathInput(data.directory.currentPath);
      } catch (err: any) {
        showError("SFTP Directory Error", err.message);
      } finally {
        setLoadingDir(false);
      }
    },
    [serverId, showError]
  );

  useEffect(() => {
    let active = true;
    const q = initialPath ? `?mode=list&path=${encodeURIComponent(initialPath)}` : "?mode=list";
    fetch(`/api/v1/admin/servers/${serverId}/files${q}`)
      .then((res) => res.json().then((d) => ({ ok: res.ok, d })))
      .then(({ ok, d }) => {
        if (!active) return;
        if (!ok) throw new Error(d.error || "Failed to list directory");
        setDir(d.directory);
        setPathInput(d.directory.currentPath);
      })
      .catch((err: any) => {
        if (active) showError("SFTP Directory Error", err.message);
      })
      .finally(() => {
        if (active) setLoadingDir(false);
      });
    return () => {
      active = false;
    };
  }, [serverId, initialPath, showError]);

  const openRemoteFile = useCallback(
    async (fullPath: string) => {
      setLoadingFile(true);
      try {
        const res = await fetch(
          `/api/v1/admin/servers/${serverId}/files?mode=read&path=${encodeURIComponent(fullPath)}`
        );
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Failed to read file");

        const file = data.file;
        const isEnv = file.name === ".env" || file.name.startsWith(".env.");
        setOpenFile({
          path: file.path,
          name: file.name,
          content: file.content,
          originalContent: file.content,
          permissionsOctal: file.permissionsOctal || (isEnv ? "0600" : "0644"),
          exists: Boolean(file.exists),
        });

        if (isEnv) {
          setEnvRows(parseEnvContentToRows(file.content));
          setEditorMode("env-studio");
        } else {
          setEditorMode("raw");
        }
      } catch (err: any) {
        showError("Open File Failed", err.message);
      } finally {
        setLoadingFile(false);
      }
    },
    [serverId, showError]
  );

  const handleSaveFile = useCallback(async () => {
    if (!openFile) return;
    setSavingFile(true);

    const finalContent =
      editorMode === "env-studio" ? serializeEnvRows(envRows) : openFile.content;

    try {
      const res = await fetch(`/api/v1/admin/servers/${serverId}/files`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "write",
          path: openFile.path,
          content: finalContent,
          modeOctal: openFile.permissionsOctal,
          createParents: true,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to save file");

      setOpenFile({
        ...openFile,
        content: finalContent,
        originalContent: finalContent,
        exists: true,
      });

      if (restartProcIdAfterSave && onRestartPm2Process) {
        const targetProc = processes.find((p) => p.id === restartProcIdAfterSave);
        if (targetProc) {
          await onRestartPm2Process(targetProc);
        }
      }

      showSuccess(
        openFile.exists ? "File Saved to Server" : "New File Created on Server",
        `Wrote ${data.file.size} bytes to ${data.file.path} (chmod ${data.file.permissionsOctal})${
          restartProcIdAfterSave ? " & restarted PM2 process." : "."
        }`
      );
      void loadDirectory(dir ? dir.currentPath : undefined);
    } catch (err: any) {
      showError("Save Failed", err.message);
    } finally {
      setSavingFile(false);
    }
  }, [
    openFile,
    editorMode,
    envRows,
    serverId,
    restartProcIdAfterSave,
    onRestartPm2Process,
    processes,
    showSuccess,
    showError,
    loadDirectory,
    dir,
  ]);

  // Ctrl+S / Cmd+S keyboard save shortcut inside editor
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s" && openFile) {
        e.preventDefault();
        void handleSaveFile();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [openFile, handleSaveFile]);

  async function handleCreateNewEntry(e: React.FormEvent) {
    e.preventDefault();
    if (!dir || !newEntryName.trim()) return;
    const cleanName = newEntryName.trim().replace(/^\/+/, "");
    const baseDir = dir.currentPath === "/" ? "" : dir.currentPath;
    const fullPath = `${baseDir}/${cleanName}`;

    if (newEntryModal === "folder") {
      try {
        const res = await fetch(`/api/v1/admin/servers/${serverId}/files`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "mkdir", path: fullPath }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Failed to create directory");
        showSuccess("Directory Created", `Created ${data.path}`);
        setNewEntryModal(null);
        setNewEntryName("");
        void loadDirectory(dir.currentPath);
      } catch (err: any) {
        showError("Create Folder Failed", err.message);
      }
    } else {
      setNewEntryModal(null);
      setNewEntryName("");
      void openRemoteFile(fullPath);
    }
  }

  async function handleDeleteEntry(entry: RemoteFileEntry) {
    const msg =
      entry.type === "directory"
        ? `Recursively delete folder '${entry.path}' and ALL its contents on ${serverName}?`
        : `Permanently delete file '${entry.path}' from ${serverName}?`;
    if (!window.confirm(msg)) return;

    try {
      const res = await fetch(
        `/api/v1/admin/servers/${serverId}/files?path=${encodeURIComponent(entry.path)}&recursive=${
          entry.type === "directory" ? "1" : "0"
        }`,
        { method: "DELETE" }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Delete failed");
      if (openFile?.path === entry.path) setOpenFile(null);
      showSuccess("Deleted", `Removed ${entry.path}`);
      void loadDirectory(dir?.currentPath);
    } catch (err: any) {
      showError("Delete Failed", err.message);
    }
  }

  async function handleRenameSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!renameTarget || !dir || !renameNewName.trim()) return;
    const parent = dir.currentPath === "/" ? "" : dir.currentPath;
    const newPath = `${parent}/${renameNewName.trim()}`;

    try {
      const res = await fetch(`/api/v1/admin/servers/${serverId}/files`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "rename",
          oldPath: renameTarget.path,
          newPath,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Rename failed");
      showSuccess("Renamed", `${renameTarget.name} → ${renameNewName.trim()}`);
      setRenameTarget(null);
      void loadDirectory(dir.currentPath);
    } catch (err: any) {
      showError("Rename Failed", err.message);
    }
  }

  async function handleUploadLocalFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !dir) return;
    if (file.size > 2 * 1024 * 1024) {
      showError("File Too Large", "Web SFTP upload supports text/config files up to 2 MB.");
      e.target.value = "";
      return;
    }

    try {
      const content = await file.text();
      const targetPath = `${dir.currentPath === "/" ? "" : dir.currentPath}/${file.name}`;
      const isEnv = file.name === ".env" || file.name.startsWith(".env.");
      const res = await fetch(`/api/v1/admin/servers/${serverId}/files`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "write",
          path: targetPath,
          content,
          modeOctal: isEnv ? "0600" : "0644",
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Upload failed");
      showSuccess("File Uploaded", `Uploaded '${file.name}' to ${data.file.path}`);
      void loadDirectory(dir.currentPath);
    } catch (err: any) {
      showError("Upload Failed", err.message);
    } finally {
      e.target.value = "";
    }
  }

  async function handleDownloadFile(entry: RemoteFileEntry) {
    try {
      const res = await fetch(
        `/api/v1/admin/servers/${serverId}/files?mode=read&path=${encodeURIComponent(entry.path)}`
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Download failed");
      const blob = new Blob([data.file.content], { type: "text/plain;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = entry.name;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err: any) {
      showError("Download Failed", err.message);
    }
  }

  const displayedEntries = useMemo(() => {
    if (!dir) return [];
    const q = filterQuery.trim().toLowerCase();
    if (!q) return dir.entries;
    return dir.entries.filter((e) => e.name.toLowerCase().includes(q));
  }, [dir, filterQuery]);

  const hasDotEnvInCurrentDir = useMemo(
    () => Boolean(dir?.entries.some((e) => e.name === ".env")),
    [dir]
  );

  const isDirty = useMemo(() => {
    if (!openFile) return false;
    const current = editorMode === "env-studio" ? serializeEnvRows(envRows) : openFile.content;
    return !openFile.exists || current !== openFile.originalContent;
  }, [openFile, editorMode, envRows]);

  return (
    <div className="bg-white dark:bg-zinc-900/90 border border-zinc-200 dark:border-zinc-800/90 rounded-2xl overflow-hidden shadow-xs">
      {/* Top Bar: Bookmarks, Path Bar & 1-Click .env Creator */}
      <div className="p-4 sm:p-5 border-b border-zinc-200 dark:border-zinc-800 space-y-3.5">
        <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-base font-bold steel-heading text-zinc-900 dark:text-white flex items-center gap-2">
                <Folder className="w-4 h-4 text-blue-500" />
                Remote SFTP File Manager &amp; `.env` Studio ({serverName})
              </h3>
              {dir?.simulatedFallback && (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-tech bg-amber-500/10 text-amber-400 border border-amber-500/30">
                  Sandbox Preview
                </span>
              )}
            </div>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
              Create, edit, or delete server files directly over encrypted SFTP — including missing{" "}
              <code className="font-mono text-emerald-400">.env</code> files (auto-hardened with{" "}
              <code className="font-mono">chmod 0600</code>).
            </p>
          </div>

          {/* Primary Action Buttons */}
          <div className="flex flex-wrap items-center gap-2">
            {/* 1-Click Create/Edit .env Button! */}
            <button
              type="button"
              onClick={() => {
                if (!dir) return;
                const envPath = `${dir.currentPath === "/" ? "" : dir.currentPath}/.env`;
                void openRemoteFile(envPath);
              }}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-tech font-bold shadow-xs transition cursor-pointer"
            >
              <KeyRound className="w-3.5 h-3.5" />
              {hasDotEnvInCurrentDir ? "Edit .env" : "+ Create .env Here"}
            </button>

            <button
              type="button"
              onClick={() => {
                setNewEntryName("");
                setNewEntryModal("file");
              }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-tech font-bold transition cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              New File
            </button>

            <button
              type="button"
              onClick={() => {
                setNewEntryName("");
                setNewEntryModal("folder");
              }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-xs font-tech font-semibold text-zinc-700 dark:text-zinc-200 transition cursor-pointer"
            >
              <FolderPlus className="w-3.5 h-3.5 text-amber-400" />
              New Folder
            </button>

            <input
              ref={uploadInputRef}
              type="file"
              className="hidden"
              onChange={handleUploadLocalFile}
            />
            <button
              type="button"
              onClick={() => uploadInputRef.current?.click()}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-xs font-tech font-semibold text-zinc-700 dark:text-zinc-200 transition cursor-pointer"
            >
              <Upload className="w-3.5 h-3.5 text-indigo-400" />
              Upload
            </button>
          </div>
        </div>

        {/* Quick Project & System Bookmarks */}
        {dir && dir.bookmarks.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 text-[11px] font-tech">
            <span className="text-zinc-400 text-[10px] uppercase mr-1">Jump to:</span>
            {dir.bookmarks.map((bm) => (
              <button
                key={bm.path}
                type="button"
                onClick={() => loadDirectory(bm.path)}
                className={`px-2.5 py-1 rounded-lg border transition cursor-pointer ${
                  dir.currentPath === bm.path
                    ? "bg-blue-600 text-white border-blue-500 font-bold"
                    : bm.category === "pm2"
                    ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/25 hover:bg-emerald-500/20"
                    : "bg-zinc-100 dark:bg-zinc-800/80 text-zinc-300 border-zinc-700/80 hover:border-zinc-600"
                }`}
              >
                {bm.label}
              </button>
            ))}
          </div>
        )}

        {/* Path Navigator + Filter */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
          <div className="flex items-center gap-1.5 flex-1">
            <button
              type="button"
              disabled={!dir?.parentPath || loadingDir}
              onClick={() => dir?.parentPath && loadDirectory(dir.parentPath)}
              className="p-2 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 text-zinc-400 hover:text-white disabled:opacity-40 cursor-pointer"
              title="Up to parent directory"
            >
              <ArrowUp className="w-4 h-4" />
            </button>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                void loadDirectory(pathInput);
              }}
              className="flex-1 flex items-center gap-1.5"
            >
              <input
                type="text"
                value={pathInput}
                onChange={(e) => setPathInput(e.target.value)}
                placeholder="/home/ubuntu/my-project"
                className="flex-1 px-3 py-1.5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 text-xs font-mono text-zinc-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
              <button
                type="submit"
                className="px-3 py-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-xs font-tech font-semibold text-zinc-200 border border-zinc-700 cursor-pointer"
              >
                Go
              </button>
            </form>

            <button
              type="button"
              onClick={() => loadDirectory(dir?.currentPath)}
              disabled={loadingDir}
              className="p-2 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 text-zinc-400 hover:text-white cursor-pointer"
              title="Refresh directory"
            >
              {loadingDir ? <IosSpinner size="xs" className="text-blue-400" /> : <RefreshCw className="w-4 h-4" />}
            </button>
          </div>

          <div className="relative sm:w-56">
            <Search className="w-3.5 h-3.5 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={filterQuery}
              onChange={(e) => setFilterQuery(e.target.value)}
              placeholder="Filter files (.env, json)..."
              className="w-full pl-8 pr-3 py-1.5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 text-xs font-tech focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
        </div>
      </div>

      {/* Main Split Workspace: Directory Tree/List (Left) + File/.env Studio (Right) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 min-h-[540px] divide-y lg:divide-y-0 lg:divide-x divide-zinc-200 dark:divide-zinc-800">
        {/* Left: Directory Contents */}
        <div
          className={`${
            openFile ? "lg:col-span-5" : "lg:col-span-12"
          } flex flex-col max-h-[620px] overflow-y-auto`}
        >
          {!hasDotEnvInCurrentDir && dir && (
            <div className="mx-4 mt-3 px-3.5 py-2.5 rounded-xl bg-emerald-500/5 border border-dashed border-emerald-500/30 flex items-center justify-between gap-2 text-xs font-tech">
              <div className="flex items-center gap-2 text-zinc-300">
                <KeyRound className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>
                  No <code className="text-emerald-400 font-bold">.env</code> file in{" "}
                  <code className="text-zinc-200">{dir.currentPath}</code> yet.
                </span>
              </div>
              <button
                type="button"
                onClick={() =>
                  openRemoteFile(`${dir.currentPath === "/" ? "" : dir.currentPath}/.env`)
                }
                className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-bold shrink-0 cursor-pointer"
              >
                Create `.env`
              </button>
            </div>
          )}

          {loadingDir && !dir ? (
            <div className="p-12 text-center">
              <IosSpinner size="md" className="mx-auto text-blue-500 mb-2" />
              <p className="text-xs font-tech text-zinc-400">Connecting SFTP subsystem...</p>
            </div>
          ) : displayedEntries.length === 0 ? (
            <div className="p-10 text-center text-xs font-tech text-zinc-400">
              Directory is empty. Click <strong>+ Create .env Here</strong> or{" "}
              <strong>New File</strong> to create a file.
            </div>
          ) : (
            <table className="w-full text-left text-xs font-tech mt-2">
              <thead className="bg-zinc-50 dark:bg-zinc-950/60 text-zinc-400 border-b border-zinc-200 dark:border-zinc-800 text-[10px] uppercase">
                <tr>
                  <th className="px-4 py-2.5">Name</th>
                  <th className="px-3 py-2.5">Perm</th>
                  <th className="px-3 py-2.5">Size</th>
                  <th className="px-4 py-2.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-200/60 dark:divide-zinc-800/70">
                {displayedEntries.map((entry) => {
                  const isSelected = openFile?.path === entry.path;
                  return (
                    <tr
                      key={entry.path}
                      onClick={() => {
                        if (entry.type === "directory") {
                          void loadDirectory(entry.path);
                        } else {
                          void openRemoteFile(entry.path);
                        }
                      }}
                      className={`cursor-pointer transition ${
                        isSelected
                          ? "bg-blue-600/15"
                          : "hover:bg-zinc-50 dark:hover:bg-zinc-800/40"
                      }`}
                    >
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-2">
                          {entry.type === "directory" ? (
                            <Folder className="w-4 h-4 text-blue-400 shrink-0" />
                          ) : entry.isEnvFile ? (
                            <KeyRound className="w-4 h-4 text-emerald-400 shrink-0" />
                          ) : (
                            <FileText className="w-4 h-4 text-zinc-400 shrink-0" />
                          )}
                          <span
                            className={`truncate font-semibold ${
                              entry.isEnvFile
                                ? "text-emerald-400"
                                : entry.type === "directory"
                                ? "text-zinc-100"
                                : "text-zinc-300"
                            }`}
                          >
                            {entry.name}
                          </span>
                          {entry.isEnvFile && (
                            <span className="px-1.5 py-0.2 rounded bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 text-[9px] font-bold">
                              ENV
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-2.5 text-[11px] text-zinc-400 font-mono">
                        {entry.permissionsOctal}
                      </td>
                      <td className="px-3 py-2.5 text-[11px] text-zinc-400 tabular-nums">
                        {formatFileSize(entry.size, entry.type)}
                      </td>
                      <td
                        className="px-4 py-2.5 text-right"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="inline-flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => {
                              setRenameTarget(entry);
                              setRenameNewName(entry.name);
                            }}
                            className="p-1 rounded hover:bg-zinc-700 text-zinc-400 hover:text-white cursor-pointer"
                            title="Rename"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          {entry.type !== "directory" && (
                            <button
                              type="button"
                              onClick={() => handleDownloadFile(entry)}
                              className="p-1 rounded hover:bg-zinc-700 text-zinc-400 hover:text-blue-400 cursor-pointer"
                              title="Download file"
                            >
                              <Download className="w-3.5 h-3.5" />
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => handleDeleteEntry(entry)}
                            className="p-1 rounded hover:bg-rose-500/20 text-zinc-400 hover:text-rose-400 cursor-pointer"
                            title="Delete"
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
          )}
        </div>

        {/* Right: Active File / .env Studio Editor */}
        {openFile && (
          <div className="lg:col-span-7 flex flex-col bg-zinc-950/90">
            {/* Editor Header */}
            <div className="px-4 py-3 border-b border-zinc-800 flex flex-wrap items-center justify-between gap-2">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-mono font-bold text-sm text-white truncate">
                    {openFile.path}
                  </span>
                  {!openFile.exists && (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-tech font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                      NEW FILE (UNSAVED)
                    </span>
                  )}
                  {isDirty && openFile.exists && (
                    <span className="w-2 h-2 rounded-full bg-amber-400" title="Unsaved changes" />
                  )}
                </div>
                <div className="text-[11px] font-tech text-zinc-400 flex items-center gap-2 mt-0.5">
                  <Lock className="w-3 h-3 text-emerald-400" />
                  <span>chmod:</span>
                  <select
                    value={openFile.permissionsOctal}
                    onChange={(e) =>
                      setOpenFile({ ...openFile, permissionsOctal: e.target.value })
                    }
                    className="bg-zinc-900 border border-zinc-800 rounded px-1.5 py-0.2 text-zinc-200 text-[11px]"
                  >
                    <option value="0600">0600 (Owner Secrets Only)</option>
                    <option value="0644">0644 (Standard Config)</option>
                    <option value="0755">0755 (Executable Script)</option>
                  </select>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {(openFile.name === ".env" || openFile.name.startsWith(".env.")) && (
                  <div className="flex rounded-lg bg-zinc-900 p-0.5 border border-zinc-800 text-[11px] font-tech">
                    <button
                      type="button"
                      onClick={() => {
                        if (editorMode === "raw") {
                          setEnvRows(parseEnvContentToRows(openFile.content));
                        }
                        setEditorMode("env-studio");
                      }}
                      className={`px-2.5 py-1 rounded-md inline-flex items-center gap-1 cursor-pointer ${
                        editorMode === "env-studio"
                          ? "bg-emerald-600 text-white font-bold"
                          : "text-zinc-400 hover:text-white"
                      }`}
                    >
                      <ListPlus className="w-3 h-3" /> Key-Value Studio
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (editorMode === "env-studio") {
                          setOpenFile({
                            ...openFile,
                            content: serializeEnvRows(envRows),
                          });
                        }
                        setEditorMode("raw");
                      }}
                      className={`px-2.5 py-1 rounded-md inline-flex items-center gap-1 cursor-pointer ${
                        editorMode === "raw"
                          ? "bg-blue-600 text-white font-bold"
                          : "text-zinc-400 hover:text-white"
                      }`}
                    >
                      <Code2 className="w-3 h-3" /> Raw `.env`
                    </button>
                  </div>
                )}

                <button
                  type="button"
                  onClick={() => setOpenFile(null)}
                  className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Starter Templates Bar for .env */}
            {(openFile.name === ".env" || openFile.name.startsWith(".env.")) && (
              <div className="px-4 py-2 bg-zinc-900/70 border-b border-zinc-800 flex flex-wrap items-center justify-between gap-2 text-[11px] font-tech">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-zinc-400">Insert Template:</span>
                  {Object.entries(ENV_STARTER_TEMPLATES).map(([key, tpl]) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => {
                        const base =
                          editorMode === "env-studio"
                            ? serializeEnvRows(envRows)
                            : openFile.content;
                        const merged = (base.trim() ? `${base.trim()}\n` : "") + tpl.content;
                        setOpenFile({ ...openFile, content: merged });
                        setEnvRows(parseEnvContentToRows(merged));
                      }}
                      className="px-2 py-0.5 rounded bg-zinc-800 hover:bg-zinc-700 text-emerald-400 border border-zinc-700 cursor-pointer"
                    >
                      + {tpl.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Editor Body */}
            {loadingFile ? (
              <div className="flex-1 flex items-center justify-center p-12">
                <IosSpinner size="md" className="text-blue-500" />
              </div>
            ) : editorMode === "env-studio" ? (
              <div className="flex-1 p-4 space-y-2.5 overflow-y-auto max-h-[440px]">
                {envRows.map((row, idx) => (
                  <div key={row.id} className="flex items-center gap-2">
                    <input
                      type="text"
                      value={row.key}
                      onChange={(e) => {
                        const val = e.target.value;
                        setEnvRows((prev) =>
                          prev.map((r, i) => (i === idx ? { ...r, key: val } : r))
                        );
                      }}
                      placeholder="KEY_NAME"
                      className="w-44 sm:w-56 px-2.5 py-1.5 rounded-lg bg-zinc-900 border border-zinc-800 font-mono text-xs text-emerald-400 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                    />
                    <span className="text-zinc-500 font-mono">=</span>
                    <div className="relative flex-1">
                      <input
                        type={row.revealed ? "text" : "password"}
                        value={row.value}
                        onChange={(e) => {
                          const val = e.target.value;
                          setEnvRows((prev) =>
                            prev.map((r, i) => (i === idx ? { ...r, value: val } : r))
                          );
                        }}
                        placeholder="value"
                        className="w-full pr-16 pl-2.5 py-1.5 rounded-lg bg-zinc-900 border border-zinc-800 font-mono text-xs text-zinc-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
                      />
                      <div className="absolute right-1.5 top-1/2 -translate-y-1/2 flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() =>
                            setEnvRows((prev) =>
                              prev.map((r, i) =>
                                i === idx ? { ...r, revealed: !r.revealed } : r
                              )
                            )
                          }
                          className="p-1 text-zinc-400 hover:text-white cursor-pointer"
                          title={row.revealed ? "Mask secret" : "Reveal value"}
                        >
                          {row.revealed ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            const sec = generateSecureHex(32);
                            setEnvRows((prev) =>
                              prev.map((r, i) =>
                                i === idx ? { ...r, value: sec, revealed: true } : r
                              )
                            );
                          }}
                          className="p-1 text-amber-400 hover:text-amber-300 cursor-pointer"
                          title="Generate random 64-char cryptographic secret"
                        >
                          <Sparkles className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        setEnvRows((prev) => prev.filter((_, i) => i !== idx))
                      }
                      className="p-1.5 rounded-lg text-zinc-500 hover:text-rose-400 hover:bg-rose-500/10 cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}

                <button
                  type="button"
                  onClick={() =>
                    setEnvRows((prev) => [
                      ...prev,
                      {
                        id: `env-${Date.now()}`,
                        key: "",
                        value: "",
                        revealed: true,
                      },
                    ])
                  }
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-xs font-tech text-emerald-400 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" /> Add Environment Variable
                </button>
              </div>
            ) : (
              <textarea
                value={openFile.content}
                onChange={(e) => setOpenFile({ ...openFile, content: e.target.value })}
                spellCheck={false}
                placeholder="# Enter file contents here..."
                className="flex-1 w-full p-4 bg-zinc-950 font-mono text-xs leading-relaxed text-zinc-200 focus:outline-none resize-none min-h-[380px]"
              />
            )}

            {/* Editor Save Footer + Optional PM2 Restart Hook */}
            <div className="px-4 py-3 border-t border-zinc-800 bg-zinc-900/80 flex flex-wrap items-center justify-between gap-3 text-xs font-tech">
              {processes.length > 0 ? (
                <div className="flex items-center gap-2">
                  <RotateCw className="w-3.5 h-3.5 text-blue-400" />
                  <select
                    value={restartProcIdAfterSave}
                    onChange={(e) => setRestartProcIdAfterSave(e.target.value)}
                    className="px-2.5 py-1 rounded-lg bg-zinc-950 border border-zinc-800 text-zinc-300 text-[11px]"
                  >
                    <option value="">Save only (Do not restart PM2)</option>
                    {processes.map((p) => (
                      <option key={p.id} value={p.id}>
                        Save &amp; Restart PM2: {p.name} (#{p.pm2Id})
                      </option>
                    ))}
                  </select>
                </div>
              ) : (
                <span className="text-[11px] text-zinc-500">Shortcut: Ctrl+S / Cmd+S</span>
              )}

              <button
                type="button"
                disabled={savingFile}
                onClick={handleSaveFile}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold shadow-xs transition cursor-pointer disabled:opacity-50"
              >
                {savingFile ? (
                  <IosSpinner size="xs" className="text-white" />
                ) : (
                  <Save className="w-3.5 h-3.5" />
                )}
                {savingFile
                  ? "Writing via SFTP..."
                  : openFile.exists
                  ? "Save Changes"
                  : `Create ${openFile.name}`}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Create File / Folder Modal */}
      {newEntryModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl max-w-md w-full p-5 shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="font-steel font-bold text-sm text-white">
                {newEntryModal === "folder" ? "Create New Directory" : "Create New File"}
              </h4>
              <button
                type="button"
                onClick={() => setNewEntryModal(null)}
                className="text-zinc-400 hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleCreateNewEntry} className="space-y-3 text-xs font-tech">
              <div className="text-zinc-400">
                In <code className="text-zinc-200">{dir?.currentPath}</code>
              </div>
              <input
                type="text"
                required
                autoFocus
                value={newEntryName}
                onChange={(e) => setNewEntryName(e.target.value)}
                placeholder={
                  newEntryModal === "folder"
                    ? "e.g. my-new-project"
                    : "e.g. .env.production or ecosystem.config.cjs"
                }
                className="w-full px-3 py-2 rounded-xl bg-zinc-950 border border-zinc-700 font-mono text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              {newEntryModal === "file" && (
                <div className="flex flex-wrap gap-1.5">
                  {[".env", ".env.local", ".env.production", "ecosystem.config.cjs", ".gitignore"].map(
                    (preset) => (
                      <button
                        key={preset}
                        type="button"
                        onClick={() => setNewEntryName(preset)}
                        className="px-2 py-0.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-[10px] cursor-pointer"
                      >
                        {preset}
                      </button>
                    )
                  )}
                </div>
              )}
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setNewEntryModal(null)}
                  className="px-3 py-1.5 rounded-lg border border-zinc-700 text-zinc-300 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-bold cursor-pointer"
                >
                  {newEntryModal === "folder" ? "Create Folder" : "Open in Editor"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Rename Modal */}
      {renameTarget && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl max-w-md w-full p-5 shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="font-steel font-bold text-sm text-white">
                Rename {renameTarget.name}
              </h4>
              <button
                type="button"
                onClick={() => setRenameTarget(null)}
                className="text-zinc-400 hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleRenameSubmit} className="space-y-3 text-xs font-tech">
              <input
                type="text"
                required
                autoFocus
                value={renameNewName}
                onChange={(e) => setRenameNewName(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-zinc-950 border border-zinc-700 font-mono text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setRenameTarget(null)}
                  className="px-3 py-1.5 rounded-lg border border-zinc-700 text-zinc-300 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-bold cursor-pointer"
                >
                  Save Name
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

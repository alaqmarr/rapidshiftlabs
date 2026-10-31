"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import {
  Terminal as TerminalIcon,
  Plus,
  X,
  RotateCw,
  Maximize2,
  Minimize2,
  ClipboardPaste,
  Copy,
  Zap,
  Shield,
  FolderOpen,
} from "lucide-react";
import "@xterm/xterm/css/xterm.css";
import { IosSpinner } from "@/components/ui/ios-spinner";

interface ServerSshTerminalProps {
  serverId: string;
  serverName: string;
  serverHost: string;
  serverPort: number;
  serverUsername: string;
  onOpenFileManagerAt?: (path?: string) => void;
}

interface ShellTab {
  tabId: string;
  label: string;
  sessionId: string | null;
  status: "connecting" | "connected" | "disconnected";
  mode: "ssh" | "sandbox";
}

function uint8ToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]!);
  }
  return btoa(binary);
}

function base64ToUint8(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

const QUICK_COMMANDS = [
  { label: "pm2 status", cmd: "pm2 status\r" },
  { label: "ls -la", cmd: "ls -la\r" },
  { label: "nginx -t", cmd: "sudo nginx -t\r" },
  { label: "ss -tlnp (Ports)", cmd: "ss -tlnp\r" },
  { label: "df -h && free -m", cmd: "df -h && free -m\r" },
  { label: "cd /var/www", cmd: "cd /var/www && ls -la\r" },
  { label: "Ctrl+C", cmd: "\x03" },
  { label: "Clear", cmd: "\x0c" },
];

export function ServerSshTerminal({
  serverId,
  serverName,
  serverHost,
  serverPort,
  serverUsername,
  onOpenFileManagerAt,
}: ServerSshTerminalProps) {
  const initialFirstTabId = `tab-${serverId}-1`;
  const [tabs, setTabs] = useState<ShellTab[]>([
    {
      tabId: initialFirstTabId,
      label: `${serverUsername}@${serverHost} #1`,
      sessionId: null,
      status: "connecting",
      mode: "ssh",
    },
  ]);
  const [activeTabId, setActiveTabId] = useState<string>(initialFirstTabId);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [fontSize, setFontSize] = useState(13);
  const tabCounterRef = useRef(1);

  const handleAddTab = () => {
    if (tabs.length >= 6) return;
    tabCounterRef.current += 1;
    const n = tabCounterRef.current;
    const newId = `tab-${serverId}-${n}-${Date.now()}`;
    setTabs((prev) => [
      ...prev,
      {
        tabId: newId,
        label: `${serverUsername}@${serverHost} #${n}`,
        sessionId: null,
        status: "connecting",
        mode: "ssh",
      },
    ]);
    setActiveTabId(newId);
  };

  const handleCloseTab = (tabId: string, sessionId: string | null) => {
    if (sessionId) {
      void fetch(`/api/v1/admin/servers/${serverId}/terminal/input`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, action: "close" }),
        keepalive: true,
      }).catch(() => {});
    }

    setTabs((prev) => {
      const remaining = prev.filter((t) => t.tabId !== tabId);
      if (remaining.length === 0) {
        tabCounterRef.current += 1;
        const freshId = `tab-${serverId}-${tabCounterRef.current}-${Date.now()}`;
        setActiveTabId(freshId);
        return [
          {
            tabId: freshId,
            label: `${serverUsername}@${serverHost} #${tabCounterRef.current}`,
            sessionId: null,
            status: "connecting",
            mode: "ssh",
          },
        ];
      }
      if (activeTabId === tabId) {
        setActiveTabId(remaining[remaining.length - 1]!.tabId);
      }
      return remaining;
    });
  };

  const updateTabMeta = useCallback(
    (tabId: string, patch: Partial<ShellTab>) => {
      setTabs((prev) =>
        prev.map((t) => (t.tabId === tabId ? { ...t, ...patch } : t))
      );
    },
    []
  );

  const activeTab = tabs.find((t) => t.tabId === activeTabId) || tabs[0]!;

  return (
    <div
      className={
        isFullscreen
          ? "fixed inset-3 z-50 flex flex-col bg-[#090b10] border border-zinc-700 rounded-2xl shadow-2xl overflow-hidden"
          : "bg-[#090b10] border border-zinc-800 rounded-2xl shadow-xs overflow-hidden flex flex-col"
      }
    >
      {/* Windows-Terminal-Style Tab Strip + Controls */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 bg-zinc-900/95 border-b border-zinc-800">
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
          {/* macOS/Windows Traffic Indicator + Tabs */}
          <div className="hidden sm:flex items-center gap-1.5 px-2 mr-1">
            <TerminalIcon className="w-4 h-4 text-emerald-400" />
            <span className="text-[11px] font-tech font-bold text-zinc-300">SSH PTY</span>
          </div>

          {tabs.map((tab) => {
            const isActive = tab.tabId === activeTabId;
            return (
              <div
                key={tab.tabId}
                onClick={() => setActiveTabId(tab.tabId)}
                className={`group inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-tech cursor-pointer border transition ${
                  isActive
                    ? "bg-[#090b10] text-white border-zinc-700 shadow-xs"
                    : "bg-zinc-950/50 text-zinc-400 border-transparent hover:text-zinc-200 hover:bg-zinc-800/70"
                }`}
              >
                <span
                  className={`w-2 h-2 rounded-full ${
                    tab.status === "connected"
                      ? tab.mode === "sandbox"
                        ? "bg-amber-400"
                        : "bg-emerald-400"
                      : tab.status === "connecting"
                      ? "bg-blue-400 animate-ping"
                      : "bg-rose-500"
                  }`}
                />
                <span className="font-semibold">{tab.label}</span>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleCloseTab(tab.tabId, tab.sessionId);
                  }}
                  className="p-0.5 rounded hover:bg-zinc-700 text-zinc-500 hover:text-white"
                  title="Close SSH session tab"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            );
          })}

          {tabs.length < 6 && (
            <button
              type="button"
              onClick={handleAddTab}
              className="p-1.5 rounded-lg bg-zinc-800/70 hover:bg-zinc-700 text-zinc-300 transition cursor-pointer"
              title="Open parallel SSH session tab"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Right Controls */}
        <div className="flex items-center gap-2 text-[11px] font-tech">
          {activeTab?.mode === "sandbox" ? (
            <span className="px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-400 border border-amber-500/30">
              Sandbox Shell
            </span>
          ) : (
            <span className="hidden md:inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              <Zap className="w-3 h-3" /> TCP_NODELAY · xterm-256color
            </span>
          )}

          {onOpenFileManagerAt && (
            <button
              type="button"
              onClick={() => onOpenFileManagerAt()}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700 transition cursor-pointer"
              title="Switch to SFTP File Manager & .env Editor"
            >
              <FolderOpen className="w-3.5 h-3.5 text-emerald-400" />
              <span className="hidden sm:inline">Files &amp; .env</span>
            </button>
          )}

          <div className="hidden sm:flex items-center rounded-lg bg-zinc-800 border border-zinc-700">
            <button
              type="button"
              onClick={() => setFontSize((f) => Math.max(11, f - 1))}
              className="px-2 py-0.5 text-zinc-300 hover:text-white cursor-pointer"
              title="Decrease font size"
            >
              A-
            </button>
            <span className="px-1.5 text-zinc-400 text-[10px]">{fontSize}px</span>
            <button
              type="button"
              onClick={() => setFontSize((f) => Math.min(20, f + 1))}
              className="px-2 py-0.5 text-zinc-300 hover:text-white cursor-pointer"
              title="Increase font size"
            >
              A+
            </button>
          </div>

          <button
            type="button"
            onClick={() => setIsFullscreen(!isFullscreen)}
            className="p-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white border border-zinc-700 transition cursor-pointer"
            title={isFullscreen ? "Exit Fullscreen" : "Expand Fullscreen Terminal"}
          >
            {isFullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      {/* Each Tab Instance Mounted (keeps PTY alive & instant when switching tabs!) */}
      <div className={isFullscreen ? "flex-1 flex flex-col min-h-0" : "flex flex-col"}>
        {tabs.map((tab) => (
          <SshPtyTabViewport
            key={tab.tabId}
            tab={tab}
            active={tab.tabId === activeTabId}
            isFullscreen={isFullscreen}
            fontSize={fontSize}
            serverId={serverId}
            serverName={serverName}
            serverHost={serverHost}
            serverPort={serverPort}
            serverUsername={serverUsername}
            onMetaChange={(patch) => updateTabMeta(tab.tabId, patch)}
          />
        ))}
      </div>
    </div>
  );
}

function SshPtyTabViewport({
  tab,
  active,
  isFullscreen,
  fontSize,
  serverId,
  serverHost,
  serverPort,
  serverUsername,
  onMetaChange,
}: {
  tab: ShellTab;
  active: boolean;
  isFullscreen: boolean;
  fontSize: number;
  serverId: string;
  serverName: string;
  serverHost: string;
  serverPort: number;
  serverUsername: string;
  onMetaChange: (patch: Partial<ShellTab>) => void;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const termRef = useRef<any>(null);
  const fitAddonRef = useRef<any>(null);
  const sessionIdRef = useRef<string | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const [reconnectSeed, setReconnectSeed] = useState(0);

  // Ordered, zero-delay micro-queue for outgoing keystrokes
  const pendingChunksRef = useRef<Uint8Array[]>([]);
  const inFlightRef = useRef<boolean>(false);

  const flushOutgoingInput = useCallback(async () => {
    if (inFlightRef.current || pendingChunksRef.current.length === 0) return;
    if (!sessionIdRef.current) return;

    inFlightRef.current = true;
    try {
      while (pendingChunksRef.current.length > 0) {
        const sid = sessionIdRef.current;
        if (!sid) break;
        const chunks = pendingChunksRef.current.splice(0, pendingChunksRef.current.length);
        const totalLen = chunks.reduce((acc, c) => acc + c.byteLength, 0);
        const merged = new Uint8Array(totalLen);
        let offset = 0;
        for (const c of chunks) {
          merged.set(c, offset);
          offset += c.byteLength;
        }

        await fetch(`/api/v1/admin/servers/${serverId}/terminal/input`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sessionId: sid,
            action: "input",
            dataB64: uint8ToBase64(merged),
          }),
          keepalive: true,
        });
      }
    } catch {
      // Stream handler handles disconnect state
    } finally {
      inFlightRef.current = false;
    }
  }, [serverId]);

  const sendRawString = useCallback(
    (str: string) => {
      if (!str) return;
      const encoded = new TextEncoder().encode(str);
      pendingChunksRef.current.push(encoded);
      void flushOutgoingInput();
      termRef.current?.focus();
    },
    [flushOutgoingInput]
  );

  // Initialize xterm.js + SSE PTY stream
  useEffect(() => {
    let disposed = false;
    let resizeObserver: ResizeObserver | null = null;

    async function bootTerminal() {
      if (!containerRef.current) return;

      const [{ Terminal }, { FitAddon }, { WebLinksAddon }] = await Promise.all([
        import("@xterm/xterm"),
        import("@xterm/addon-fit"),
        import("@xterm/addon-web-links"),
      ]);

      if (disposed || !containerRef.current) return;

      const term = new Terminal({
        cursorBlink: true,
        cursorStyle: "block",
        fontSize,
        fontFamily:
          "'JetBrains Mono', 'Cascadia Code', 'Consolas', 'Fira Code', ui-monospace, monospace",
        lineHeight: 1.22,
        scrollback: 5000,
        convertEol: false,
        allowProposedApi: true,
        theme: {
          background: "#090b10",
          foreground: "#e4e4e7",
          cursor: "#3b82f6",
          cursorAccent: "#090b10",
          selectionBackground: "rgba(59, 130, 246, 0.35)",
          black: "#18181b",
          red: "#f43f5e",
          green: "#10b981",
          yellow: "#f59e0b",
          blue: "#3b82f6",
          magenta: "#a855f7",
          cyan: "#06b6d4",
          white: "#e4e4e7",
          brightBlack: "#52525b",
          brightRed: "#fb7185",
          brightGreen: "#34d399",
          brightYellow: "#fbbf24",
          brightBlue: "#60a5fa",
          brightMagenta: "#c084fc",
          brightCyan: "#22d3ee",
          brightWhite: "#fafafa",
        },
      });

      const fitAddon = new FitAddon();
      const webLinksAddon = new WebLinksAddon();
      term.loadAddon(fitAddon);
      term.loadAddon(webLinksAddon);

      containerRef.current.innerHTML = "";
      term.open(containerRef.current);
      try {
        fitAddon.fit();
      } catch {}

      termRef.current = term;
      fitAddonRef.current = fitAddon;

      // Windows Terminal / PowerShell identical Ctrl+C & Ctrl+V handling!
      term.attachCustomKeyEventHandler((ev: KeyboardEvent) => {
        if (ev.type !== "keydown") return true;

        // Ctrl+Shift+C OR Ctrl+C when text is highlighted -> copy selection!
        if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === "c") {
          if (ev.shiftKey || term.hasSelection()) {
            const sel = term.getSelection();
            if (sel) {
              void navigator.clipboard.writeText(sel);
              term.clearSelection();
            }
            return false;
          }
          // Otherwise let Ctrl+C send \x03 SIGINT to remote SSH shell!
          return true;
        }

        // Ctrl+V or Ctrl+Shift+V -> paste directly into SSH PTY
        if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === "v") {
          ev.preventDefault();
          void navigator.clipboard
            .readText()
            .then((clip) => {
              if (clip) sendRawString(clip);
            })
            .catch(() => {});
          return false;
        }

        return true;
      });

      term.onData((data: string) => {
        sendRawString(data);
      });

      term.writeln(
        `\x1b[90mConnecting SSH PTY to ${serverUsername}@${serverHost}:${serverPort}...\x1b[0m`
      );
      onMetaChange({ status: "connecting" });

      const cols = term.cols || 120;
      const rows = term.rows || 32;
      const streamUrl = `/api/v1/admin/servers/${serverId}/terminal/stream?cols=${cols}&rows=${rows}`;
      const es = new EventSource(streamUrl);
      eventSourceRef.current = es;

      es.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data);
          if (payload.type === "ready") {
            sessionIdRef.current = payload.sessionId;
            onMetaChange({
              sessionId: payload.sessionId,
              status: "connected",
              mode: payload.mode || "ssh",
            });
            term.clear();
            if (payload.scrollbackB64) {
              term.write(base64ToUint8(payload.scrollbackB64));
            }
            term.focus();
            void flushOutgoingInput();
          } else if (payload.type === "data" && payload.b64) {
            term.write(base64ToUint8(payload.b64));
          } else if (payload.type === "exit") {
            term.writeln(
              `\r\n\x1b[33m[SSH session closed with exit code ${payload.exitCode ?? 0}]\x1b[0m`
            );
            onMetaChange({ status: "disconnected" });
            es.close();
          }
        } catch {
          // ignore malformed keepalive
        }
      };

      es.onerror = () => {
        if (!disposed) {
          onMetaChange({ status: "disconnected" });
        }
      };

      resizeObserver = new ResizeObserver(() => {
        if (!fitAddonRef.current || !termRef.current) return;
        try {
          fitAddonRef.current.fit();
          const sid = sessionIdRef.current;
          if (sid) {
            void fetch(`/api/v1/admin/servers/${serverId}/terminal/input`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                sessionId: sid,
                action: "resize",
                cols: termRef.current.cols,
                rows: termRef.current.rows,
              }),
            }).catch(() => {});
          }
        } catch {}
      });

      resizeObserver.observe(containerRef.current);
    }

    void bootTerminal();

    return () => {
      disposed = true;
      resizeObserver?.disconnect();
      eventSourceRef.current?.close();
      try {
        termRef.current?.dispose();
      } catch {}
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serverId, reconnectSeed]);

  // Dynamic font size adjustment without dropping the active SSH session!
  useEffect(() => {
    if (termRef.current && fitAddonRef.current) {
      termRef.current.options.fontSize = fontSize;
      try {
        fitAddonRef.current.fit();
      } catch {}
    }
  }, [fontSize, active, isFullscreen]);

  return (
    <div className={active ? "flex-1 flex flex-col min-h-0" : "hidden"}>
      {/* Quick Snippet & Clipboard Toolbar */}
      <div className="px-3 py-1.5 bg-zinc-950 border-b border-zinc-800/90 flex flex-wrap items-center justify-between gap-2 text-[11px] font-tech">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-zinc-500 text-[10px] uppercase mr-1">Quick Exec:</span>
          {QUICK_COMMANDS.map((item) => (
            <button
              key={item.label}
              type="button"
              onClick={() => sendRawString(item.cmd)}
              className="px-2 py-0.5 rounded bg-zinc-900 hover:bg-zinc-800 text-zinc-300 hover:text-white border border-zinc-800 transition cursor-pointer"
            >
              {item.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => {
              const sel = termRef.current?.getSelection();
              if (sel) void navigator.clipboard.writeText(sel);
            }}
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-zinc-900 hover:bg-zinc-800 text-zinc-300 border border-zinc-800 cursor-pointer"
            title="Copy selected terminal text (or highlight + Ctrl+C)"
          >
            <Copy className="w-3 h-3" /> Copy
          </button>

          <button
            type="button"
            onClick={() => {
              void navigator.clipboard
                .readText()
                .then((txt) => {
                  if (txt) sendRawString(txt);
                })
                .catch(() => {});
            }}
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-zinc-900 hover:bg-zinc-800 text-zinc-300 border border-zinc-800 cursor-pointer"
            title="Paste clipboard into SSH shell (or press Ctrl+V)"
          >
            <ClipboardPaste className="w-3 h-3" /> Paste
          </button>

          <button
            type="button"
            onClick={() => {
              if (sessionIdRef.current) {
                void fetch(`/api/v1/admin/servers/${serverId}/terminal/input`, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ sessionId: sessionIdRef.current, action: "close" }),
                }).catch(() => {});
                sessionIdRef.current = null;
              }
              setReconnectSeed((s) => s + 1);
            }}
            className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded bg-blue-600/20 hover:bg-blue-600 text-blue-400 hover:text-white border border-blue-500/30 transition cursor-pointer"
          >
            <RotateCw className="w-3 h-3" /> Reconnect
          </button>
        </div>
      </div>

      {/* Xterm Canvas Container */}
      <div
        onContextMenu={(e) => {
          // Right-click paste convenience just like Windows PowerShell / PuTTY!
          if (!termRef.current?.hasSelection()) {
            e.preventDefault();
            void navigator.clipboard
              .readText()
              .then((txt) => {
                if (txt) sendRawString(txt);
              })
              .catch(() => {});
          }
        }}
        className={`relative w-full bg-[#090b10] p-2.5 ${
          isFullscreen ? "flex-1 min-h-0" : "h-[520px]"
        }`}
      >
        <div ref={containerRef} className="w-full h-full" />

        {tab.status === "connecting" && (
          <div className="pointer-events-none absolute top-3 right-4 inline-flex items-center gap-2 px-3 py-1 rounded-full bg-zinc-900/90 border border-zinc-700 text-xs font-tech text-blue-400">
            <IosSpinner size="xs" className="text-blue-400" />
            Negotiating SSH2 PTY...
          </div>
        )}
      </div>

      {/* Bottom Status Bar */}
      <div className="px-3.5 py-1.5 bg-zinc-950 border-t border-zinc-800 flex flex-wrap items-center justify-between gap-2 text-[11px] font-tech text-zinc-400">
        <div className="flex items-center gap-3">
          <span className="inline-flex items-center gap-1.5 text-zinc-300">
            <Shield className="w-3 h-3 text-emerald-400" />
            {serverUsername}@{serverHost}:{serverPort}
          </span>
          <span>·</span>
          <span>Highlight + Ctrl+C to Copy · Ctrl+V or Right-Click to Paste · Tab Completion ON</span>
        </div>
        <div>
          {tab.status === "connected" ? (
            <span className="text-emerald-400 font-semibold">● Connected</span>
          ) : tab.status === "connecting" ? (
            <span className="text-blue-400">● Connecting...</span>
          ) : (
            <span className="text-rose-400 font-semibold">● Disconnected — click Reconnect</span>
          )}
        </div>
      </div>
    </div>
  );
}

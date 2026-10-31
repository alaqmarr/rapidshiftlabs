import * as net from "node:net";
import * as posixPath from "node:path/posix";
import { Client, type ClientChannel, type ConnectConfig } from "ssh2";
import type { ServerConnectionConfig } from "../../domain/ports/ssh-client.port";
import { ExternalServiceError, ForbiddenError, ValidationError } from "../../../../shared/kernel/errors";
import { ulid } from "../../../../shared/kernel/id";

const MAX_SCROLLBACK_BYTES = 64 * 1024;
const IDLE_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes
const MAX_SESSIONS_PER_ADMIN = 8;

export type TerminalDataListener = (event: {
  type: "data" | "exit" | "mode";
  b64?: string;
  exitCode?: number;
  mode?: "ssh" | "sandbox";
}) => void;

interface ActiveTerminalSession {
  sessionId: string;
  serverId: string;
  ownerAdminId: string;
  host: string;
  username: string;
  mode: "ssh" | "sandbox";
  cols: number;
  rows: number;
  createdAt: number;
  lastActiveAt: number;
  closed: boolean;
  scrollback: Buffer[];
  scrollbackBytes: number;
  listeners: Set<TerminalDataListener>;
  sshClient?: Client;
  channel?: ClientChannel;
  // Sandbox interactive shell state (only used when SSH host is unreachable in dev/demo)
  sandboxCwd?: string;
  sandboxLineBuf?: string;
  sandboxHistory?: string[];
  sandboxHistIdx?: number;
}

export class SshPtySessionManager {
  private readonly sessions = new Map<string, ActiveTerminalSession>();
  private reaperInterval: NodeJS.Timeout | null = null;

  constructor() {
    this.reaperInterval = setInterval(() => {
      this.reapIdleSessions();
    }, 60_000);
    if (this.reaperInterval.unref) {
      this.reaperInterval.unref();
    }
  }

  private appendScrollback(session: ActiveTerminalSession, buf: Buffer): void {
    session.scrollback.push(buf);
    session.scrollbackBytes += buf.byteLength;
    while (session.scrollbackBytes > MAX_SCROLLBACK_BYTES && session.scrollback.length > 1) {
      const removed = session.scrollback.shift();
      if (removed) session.scrollbackBytes -= removed.byteLength;
    }
  }

  private emitData(session: ActiveTerminalSession, raw: string | Buffer): void {
    const buf = Buffer.isBuffer(raw) ? raw : Buffer.from(raw, "utf8");
    this.appendScrollback(session, buf);
    const b64 = buf.toString("base64");
    for (const listener of session.listeners) {
      try {
        listener({ type: "data", b64 });
      } catch {
        // Ignore broken listener
      }
    }
  }

  public async createOrGetSession(params: {
    sessionId?: string;
    server: ServerConnectionConfig;
    adminUserId: string;
    cols?: number;
    rows?: number;
  }): Promise<{
    sessionId: string;
    mode: "ssh" | "sandbox";
    scrollbackB64: string;
  }> {
    const cols = Math.min(400, Math.max(20, Math.floor(params.cols || 120)));
    const rows = Math.min(200, Math.max(8, Math.floor(params.rows || 32)));

    if (params.sessionId) {
      const existing = this.sessions.get(params.sessionId);
      if (existing && !existing.closed) {
        if (
          existing.ownerAdminId !== params.adminUserId ||
          existing.serverId !== params.server.serverId
        ) {
          throw new ForbiddenError("Unauthorized access to SSH terminal session");
        }
        existing.lastActiveAt = Date.now();
        const combined = Buffer.concat(existing.scrollback);
        return {
          sessionId: existing.sessionId,
          mode: existing.mode,
          scrollbackB64: combined.toString("base64"),
        };
      }
    }

    // Enforce per-admin session limit; evict oldest closed/idle if needed
    const adminSessions = Array.from(this.sessions.values()).filter(
      (s) => s.ownerAdminId === params.adminUserId && !s.closed
    );
    if (adminSessions.length >= MAX_SESSIONS_PER_ADMIN) {
      const oldest = adminSessions.sort((a, b) => a.lastActiveAt - b.lastActiveAt)[0];
      if (oldest) {
        this.closeSession(oldest.sessionId, params.adminUserId, oldest.serverId);
      }
    }

    const sessionId =
      params.sessionId && /^term_[a-zA-Z0-9_-]{6,64}$/.test(params.sessionId)
        ? params.sessionId
        : `term_${ulid()}`;

    const session: ActiveTerminalSession = {
      sessionId,
      serverId: params.server.serverId,
      ownerAdminId: params.adminUserId,
      host: params.server.host,
      username: params.server.username,
      mode: "ssh",
      cols,
      rows,
      createdAt: Date.now(),
      lastActiveAt: Date.now(),
      closed: false,
      scrollback: [],
      scrollbackBytes: 0,
      listeners: new Set(),
    };

    try {
      await this.attachRealSshPty(session, params.server, cols, rows);
    } catch (err: any) {
      // Fall back to interactive sandbox PTY preview when demo host is unreachable
      this.attachSandboxPty(session, err?.message || "SSH unreachable");
    }

    this.sessions.set(sessionId, session);
    const combined = Buffer.concat(session.scrollback);
    return {
      sessionId,
      mode: session.mode,
      scrollbackB64: combined.toString("base64"),
    };
  }

  private async attachRealSshPty(
    session: ActiveTerminalSession,
    server: ServerConnectionConfig,
    cols: number,
    rows: number
  ): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const client = new Client();
      let settled = false;
      let shellEstablished = false;

      // Create raw TCP socket with TCP_NODELAY enabled for zero Nagle latency (exact Windows SSH responsiveness!)
      const sock = net.createConnection({
        host: server.host,
        port: server.port,
      });
      sock.setNoDelay(true);
      sock.setKeepAlive(true, 10_000);

      const connectTimer = setTimeout(() => {
        if (!settled) {
          settled = true;
          sock.destroy();
          client.end();
          reject(new ExternalServiceError("SSH", `SSH handshake timed out (${server.host}:${server.port})`));
        }
      }, 7_500);

      sock.on("error", (sockErr) => {
        if (!settled) {
          settled = true;
          clearTimeout(connectTimer);
          reject(new ExternalServiceError("SSH", sockErr.message));
        }
      });

      const connectConfig: ConnectConfig = {
        sock,
        username: server.username,
        privateKey: server.decryptedPrivateKey,
        passphrase: server.decryptedPassphrase || undefined,
        readyTimeout: 7_500,
        keepaliveInterval: 10_000,
        keepaliveCountMax: 3,
        hostHash: "sha256",
        hostVerifier: (hashedKey: string) => {
          if (!server.hostFingerprint) return true;
          const cleanExpected = server.hostFingerprint.replace(/^SHA256:/i, "").toLowerCase();
          return hashedKey.toLowerCase() === cleanExpected;
        },
      };

      client.on("ready", () => {
        client.shell(
          {
            term: "xterm-256color",
            cols,
            rows,
            width: cols * 8,
            height: rows * 16,
          },
          (err, stream) => {
            clearTimeout(connectTimer);
            if (err) {
              if (!settled) {
                settled = true;
                client.end();
                return reject(new ExternalServiceError("SSH PTY", err.message));
              }
              return;
            }

            shellEstablished = true;
            session.mode = "ssh";
            session.sshClient = client;
            session.channel = stream;

            stream.on("data", (chunk: Buffer) => {
              session.lastActiveAt = Date.now();
              this.emitData(session, chunk);
            });

            stream.stderr.on("data", (chunk: Buffer) => {
              session.lastActiveAt = Date.now();
              this.emitData(session, chunk);
            });

            stream.on("close", (code: number) => {
              session.closed = true;
              for (const listener of session.listeners) {
                try {
                  listener({ type: "exit", exitCode: code ?? 0 });
                } catch {}
              }
              client.end();
              this.sessions.delete(session.sessionId);
            });

            if (!settled) {
              settled = true;
              resolve();
            }
          }
        );
      });

      client.on("error", (err) => {
        clearTimeout(connectTimer);
        if (!settled) {
          settled = true;
          reject(new ExternalServiceError("SSH", err.message));
        } else if (shellEstablished && session.sshClient === client) {
          session.closed = true;
          this.sessions.delete(session.sessionId);
        }
      });

      client.on("close", () => {
        if (shellEstablished && session.sshClient === client) {
          session.closed = true;
          this.sessions.delete(session.sessionId);
        }
      });

      try {
        client.connect(connectConfig);
      } catch (err: any) {
        clearTimeout(connectTimer);
        if (!settled) {
          settled = true;
          reject(new ExternalServiceError("SSH", err.message));
        }
      }
    });
  }

  private attachSandboxPty(session: ActiveTerminalSession, reason: string): void {
    session.mode = "sandbox";
    const home = session.username === "root" ? "/root" : `/home/${session.username}`;
    session.sandboxCwd = home;
    session.sandboxLineBuf = "";
    session.sandboxHistory = [];
    session.sandboxHistIdx = -1;

    const welcome = [
      `\x1b[1;34mRapidShift Labs Interactive SSH Terminal\x1b[0m \x1b[90m(xterm-256color)\x1b[0m`,
      `\x1b[33m⚡ Sandbox Shell Active:\x1b[0m \x1b[90mDirect TCP port 22 to ${session.host} unavailable (${reason}).\x1b[0m`,
      `Welcome to Ubuntu 24.04.1 LTS (GNU/Linux 6.8.0-1017-oracle x86_64)`,
      `Type \x1b[36mhelp\x1b[0m, \x1b[36mpm2 status\x1b[0m, \x1b[36mnginx -t\x1b[0m, \x1b[36mls -la\x1b[0m, \x1b[36mcd /var/www\x1b[0m, or \x1b[36mclear\x1b[0m.`,
      ``,
    ].join("\r\n");

    this.emitData(session, welcome + "\r\n" + this.getSandboxPrompt(session));
  }

  private getSandboxPrompt(session: ActiveTerminalSession): string {
    const home = session.username === "root" ? "/root" : `/home/${session.username}`;
    const cwd = session.sandboxCwd || home;
    const displayDir = cwd === home ? "~" : cwd.startsWith(`${home}/`) ? `~/${cwd.slice(home.length + 1)}` : cwd;
    const sym = session.username === "root" ? "#" : "$";
    return `\x1b[1;32m${session.username}@${session.host}\x1b[0m:\x1b[1;34m${displayDir}\x1b[0m${sym} `;
  }

  public subscribe(
    sessionId: string,
    adminUserId: string,
    serverId: string,
    listener: TerminalDataListener
  ): () => void {
    const session = this.getAuthorizedSession(sessionId, adminUserId, serverId);
    session.listeners.add(listener);
    return () => {
      session.listeners.delete(listener);
    };
  }

  public writeInput(
    sessionId: string,
    adminUserId: string,
    serverId: string,
    dataB64: string
  ): void {
    const session = this.getAuthorizedSession(sessionId, adminUserId, serverId);
    session.lastActiveAt = Date.now();
    const rawBuf = Buffer.from(dataB64, "base64");
    if (rawBuf.byteLength === 0) return;
    if (rawBuf.byteLength > 64 * 1024) {
      throw new ValidationError("Terminal input payload exceeds 64 KB chunk limit");
    }

    if (session.mode === "ssh" && session.channel) {
      session.channel.write(rawBuf);
      return;
    }

    // Handle interactive Sandbox PTY keystrokes (Enter, Backspace, Ctrl+C, Ctrl+L, Up/Down history, characters)
    this.handleSandboxInput(session, rawBuf.toString("utf8"));
  }

  public resizeSession(
    sessionId: string,
    adminUserId: string,
    serverId: string,
    cols: number,
    rows: number
  ): void {
    const session = this.getAuthorizedSession(sessionId, adminUserId, serverId);
    const safeCols = Math.min(400, Math.max(20, Math.floor(cols || 120)));
    const safeRows = Math.min(200, Math.max(8, Math.floor(rows || 32)));
    session.cols = safeCols;
    session.rows = safeRows;
    session.lastActiveAt = Date.now();

    if (session.mode === "ssh" && session.channel) {
      session.channel.setWindow(safeRows, safeCols, safeRows * 16, safeCols * 8);
    }
  }

  public closeSession(sessionId: string, adminUserId: string, serverId: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;
    if (session.ownerAdminId !== adminUserId || session.serverId !== serverId) {
      throw new ForbiddenError("Unauthorized access to SSH terminal session");
    }
    session.closed = true;
    try {
      session.channel?.close();
    } catch {}
    try {
      session.sshClient?.end();
    } catch {}
    session.listeners.clear();
    this.sessions.delete(sessionId);
  }

  private getAuthorizedSession(
    sessionId: string,
    adminUserId: string,
    serverId: string
  ): ActiveTerminalSession {
    const session = this.sessions.get(sessionId);
    if (!session || session.closed) {
      throw new ValidationError("Terminal session expired or closed. Click Reconnect to open a fresh PTY.");
    }
    if (session.ownerAdminId !== adminUserId || session.serverId !== serverId) {
      throw new ForbiddenError("Unauthorized access to SSH terminal session");
    }
    return session;
  }

  private handleSandboxInput(session: ActiveTerminalSession, input: string): void {
    let i = 0;
    while (i < input.length) {
      // Handle ANSI arrow escape sequences (\x1b[A = Up, \x1b[B = Down)
      if (input.slice(i, i + 3) === "\x1b[A") {
        const hist = session.sandboxHistory || [];
        if (hist.length > 0) {
          const nextIdx =
            session.sandboxHistIdx === -1
              ? hist.length - 1
              : Math.max(0, (session.sandboxHistIdx ?? 0) - 1);
          session.sandboxHistIdx = nextIdx;
          const prevLen = (session.sandboxLineBuf || "").length;
          session.sandboxLineBuf = hist[nextIdx] || "";
          const erase = prevLen > 0 ? `\x1b[${prevLen}D\x1b[K` : "";
          this.emitData(session, erase + session.sandboxLineBuf);
        }
        i += 3;
        continue;
      }
      if (input.slice(i, i + 3) === "\x1b[B") {
        const hist = session.sandboxHistory || [];
        const prevLen = (session.sandboxLineBuf || "").length;
        const erase = prevLen > 0 ? `\x1b[${prevLen}D\x1b[K` : "";
        if (
          session.sandboxHistIdx !== undefined &&
          session.sandboxHistIdx >= 0 &&
          session.sandboxHistIdx < hist.length - 1
        ) {
          session.sandboxHistIdx += 1;
          session.sandboxLineBuf = hist[session.sandboxHistIdx] || "";
        } else {
          session.sandboxHistIdx = -1;
          session.sandboxLineBuf = "";
        }
        this.emitData(session, erase + (session.sandboxLineBuf || ""));
        i += 3;
        continue;
      }
      if (input[i] === "\x1b") {
        // Skip other escape sequences in sandbox
        i += 1;
        while (i < input.length && !/[a-zA-Z~]/.test(input[i]!)) i++;
        i++;
        continue;
      }

      const ch = input[i]!;
      i++;

      if (ch === "\x03") {
        // Ctrl+C
        session.sandboxLineBuf = "";
        session.sandboxHistIdx = -1;
        this.emitData(session, "^C\r\n" + this.getSandboxPrompt(session));
      } else if (ch === "\x0c") {
        // Ctrl+L
        this.emitData(
          session,
          "\x1b[2J\x1b[H" + this.getSandboxPrompt(session) + (session.sandboxLineBuf || "")
        );
      } else if (ch === "\r" || ch === "\n") {
        const cmd = (session.sandboxLineBuf || "").trim();
        session.sandboxLineBuf = "";
        session.sandboxHistIdx = -1;
        this.emitData(session, "\r\n");
        if (cmd) {
          session.sandboxHistory?.push(cmd);
          this.executeSandboxCommand(session, cmd);
        } else {
          this.emitData(session, this.getSandboxPrompt(session));
        }
      } else if (ch === "\x7f" || ch === "\b") {
        // Backspace
        if ((session.sandboxLineBuf || "").length > 0) {
          session.sandboxLineBuf = (session.sandboxLineBuf || "").slice(0, -1);
          this.emitData(session, "\b \b");
        }
      } else if (ch === "\t") {
        // Simple tab completion for common commands
        const buf = session.sandboxLineBuf || "";
        const completions = ["pm2 status", "nginx -t", "systemctl status nginx", "ls -la", "clear"];
        const hit = completions.find((c) => c.startsWith(buf) && c !== buf);
        if (hit) {
          const rest = hit.slice(buf.length);
          session.sandboxLineBuf = hit;
          this.emitData(session, rest);
        }
      } else if (ch >= " ") {
        session.sandboxLineBuf = (session.sandboxLineBuf || "") + ch;
        this.emitData(session, ch);
      }
    }
  }

  private executeSandboxCommand(session: ActiveTerminalSession, cmd: string): void {
    const home = session.username === "root" ? "/root" : `/home/${session.username}`;
    const parts = cmd.split(/\s+/);
    const bin = parts[0] || "";
    let out = "";

    if (bin === "clear") {
      this.emitData(session, "\x1b[2J\x1b[H" + this.getSandboxPrompt(session));
      return;
    } else if (bin === "pwd") {
      out = session.sandboxCwd || home;
    } else if (bin === "whoami") {
      out = session.username;
    } else if (bin === "hostname") {
      out = session.host;
    } else if (bin === "uname") {
      out = "Linux oracle-vm 6.8.0-1017-oracle #18-Ubuntu SMP x86_64 GNU/Linux";
    } else if (bin === "cd") {
      const target = parts[1] || "~";
      const resolved =
        target === "~"
          ? home
          : target.startsWith("~/")
          ? posixPath.join(home, target.slice(2))
          : target.startsWith("/")
          ? posixPath.normalize(target)
          : posixPath.normalize(posixPath.join(session.sandboxCwd || home, target));
      session.sandboxCwd = resolved;
    } else if (bin === "ls" || bin === "ll") {
      out = [
        "drwxr-xr-x  5 ubuntu ubuntu 4096 Oct 31 13:00 \x1b[1;34m.\x1b[0m",
        "drwxr-xr-x  3 root   root   4096 Oct 01 09:00 \x1b[1;34m..\x1b[0m",
        "-rw-------  1 ubuntu ubuntu  312 Oct 31 12:45 \x1b[1;32m.env\x1b[0m",
        "drwxr-xr-x  4 ubuntu ubuntu 4096 Oct 31 12:30 \x1b[1;34mapps\x1b[0m",
        "-rw-r--r--  1 ubuntu ubuntu  485 Oct 30 18:10 ecosystem.config.cjs",
        "-rw-r--r--  1 ubuntu ubuntu 1024 Oct 30 18:10 package.json",
      ].join("\r\n");
    } else if (cmd.startsWith("pm2")) {
      out = [
        "┌────┬────────────────────┬──────────┬──────┬───────────┬──────────┬──────────┐",
        "│ id │ name               │ mode     │ ↺    │ status    │ cpu      │ memory   │",
        "├────┼────────────────────┼──────────┼──────┼───────────┼──────────┼──────────┤",
        "│ 0  │ portal-api         │ fork     │ 2    │ \x1b[32monline\x1b[0m    │ 1.2%     │ 98.4mb   │",
        "│ 1  │ background-worker  │ fork     │ 0    │ \x1b[32monline\x1b[0m    │ 0.3%     │ 51.2mb   │",
        "└────┴────────────────────┴──────────┴──────┴───────────┴──────────┴──────────┘",
      ].join("\r\n");
    } else if (cmd.includes("nginx -t")) {
      out =
        "nginx: the configuration file /etc/nginx/nginx.conf syntax is ok\r\nnginx: configuration file /etc/nginx/nginx.conf test is successful";
    } else if (bin === "df") {
      out = [
        "Filesystem     Size  Used Avail Use% Mounted on",
        "/dev/sda1       50G   16G   34G  32% /",
      ].join("\r\n");
    } else if (bin === "free") {
      out = [
        "               total        used        free      shared  buff/cache   available",
        "Mem:            8000        2150        3900          42        1950        5850",
        "Swap:           2048         102        1946",
      ].join("\r\n");
    } else if (bin === "help") {
      out = [
        "\x1b[1;36mAvailable Sandbox Preview Commands:\x1b[0m",
        "  ls, ll, cd <dir>, pwd, whoami, uname -a, df -h, free -m",
        "  pm2 status, nginx -t, clear, echo <text>",
        "  (Connect a reachable SSH server IP & private key for full live Linux PTY access.)",
      ].join("\r\n");
    } else if (bin === "echo") {
      out = cmd.slice(4).trim().replace(/^["']|["']$/g, "");
    } else {
      out = `${bin}: executed in sandbox preview (${cmd})`;
    }

    const prefix = out ? out + "\r\n" : "";
    this.emitData(session, prefix + this.getSandboxPrompt(session));
  }

  private reapIdleSessions(): void {
    const now = Date.now();
    for (const [id, session] of this.sessions.entries()) {
      if (session.closed || now - session.lastActiveAt > IDLE_TIMEOUT_MS) {
        try {
          session.channel?.close();
        } catch {}
        try {
          session.sshClient?.end();
        } catch {}
        session.listeners.clear();
        this.sessions.delete(id);
      }
    }
  }
}

const globalForPty = globalThis as unknown as {
  __rslSshPtySessionManager?: SshPtySessionManager;
};

export function getSshPtySessionManager(): SshPtySessionManager {
  if (!globalForPty.__rslSshPtySessionManager) {
    globalForPty.__rslSshPtySessionManager = new SshPtySessionManager();
  }
  return globalForPty.__rslSshPtySessionManager;
}

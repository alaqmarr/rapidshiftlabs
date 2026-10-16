export type DiagnosticSeverity = "HEALTHY" | "WARNING" | "CRITICAL";

export type FailureCategory =
  | "NONE"
  | "OUT_OF_MEMORY"
  | "DATABASE_CONNECTION_FAILURE"
  | "PORT_IN_USE"
  | "MISSING_MODULE"
  | "ENV_OR_SECRET_MISSING"
  | "UNCAUGHT_EXCEPTION"
  | "CRASH_LOOP"
  | "UNKNOWN_ERROR";

export type RecoveryAction =
  | "NO_ACTION_NEEDED"
  | "AUTO_RESTART_ELIGIBLE"
  | "MANUAL_RECOVERY_REQUIRED"
  | "CIRCUIT_BREAKER_SUSPENDED";

export interface ProcessDiagnosticReport {
  processId: string;
  pm2Id: number;
  processName: string;
  status: string;
  restarts: number;
  uptimeMs: number;
  severity: DiagnosticSeverity;
  category: FailureCategory;
  title: string;
  summary: string;
  recommendation: string;
  extractedError?: string;
  recoveryAction: RecoveryAction;
  isCrashLoop: boolean;
  timestamp: number;
}

export class FleetDiagnosticsService {
  /**
   * Determines whether a PM2 process is genuinely crashing or in a crash loop
   * based on live status, unstable restarts, and uptime flapping—rather than
   * mistaking cumulative deployment restarts (`restarts`) on a stable online process for errors.
   */
  public static isProcessCrashing(process: {
    status: string;
    restarts?: number;
    unstableRestarts?: number;
    uptimeMs?: number;
  }): boolean {
    const status = String(process.status || "unknown").toLowerCase();
    const restarts = process.restarts || 0;
    const unstableRestarts = process.unstableRestarts || 0;
    const uptime = process.uptimeMs || 0;

    if (status === "errored") return true;
    if (unstableRestarts > 0 && uptime < 120_000) return true;
    // Rapid flapping: process is online right now but has been up for < 45s after many restarts
    // Note: without log context, only flag online processes as flapping if unstableRestarts > 0
    if (status !== "online" && status !== "stopped" && restarts >= 3) return true;
    return false;
  }

  /**
   * Evaluates process telemetry and stdout/stderr logs to produce an intelligent diagnostic report.
   * Crucially distinguishes cumulative project updates/deployments (`restarts` on a stable online process)
   * from actual runtime crashes.
   */
  public static diagnose(
    process: {
      id: string;
      pm2Id: number;
      name: string;
      status: string;
      restarts: number;
      unstableRestarts?: number;
      uptimeMs?: number;
      cpu?: number;
      memory?: number;
    },
    logs?: string
  ): ProcessDiagnosticReport {
    const restarts = process.restarts || 0;
    const unstableRestarts = process.unstableRestarts || 0;
    const uptime = process.uptimeMs || 0;
    const status = String(process.status || "unknown").toLowerCase();
    const logText = logs || "";

    const isErrored = status === "errored" || status === "stopped";

    // For an online process, only inspect the very latest tail of logs (last 20 lines)
    // and only if the process restarted recently (< 2 minutes ago).
    // Historical errors in logs from before a stable deployment (> 2 minutes uptime) are not active crashes.
    const recentLogTail = logText.split("\n").slice(-20).join("\n");
    const fatalLogRegex =
      /heap out of memory|fatal error: runtime: out of memory|javascript heap out of memory|ECONNREFUSED|ETIMEDOUT|SequelizeConnectionError|PrismaClientInitializationError|Connection refused|Can't reach database|EADDRINUSE|Cannot find module|MODULE_NOT_FOUND|secret key required|API key missing|missing required environment variable|is not defined in environment|TypeError:|ReferenceError:|SyntaxError:|Uncaught Exception:/i;

    const hasRecentFatalError = isErrored
      ? fatalLogRegex.test(logText)
      : uptime < 120_000 && fatalLogRegex.test(recentLogTail);

    const isCrashLoop =
      (isErrored && restarts >= 3) ||
      (unstableRestarts >= 3 && uptime < 120_000) ||
      (!isErrored && uptime > 0 && uptime < 60_000 && restarts >= 8 && hasRecentFatalError);

    // If the process is online and not actively crashing, cumulative restarts simply reflect
    // normal project updates / deployments / manual restarts.
    if (!isErrored && !isCrashLoop && !hasRecentFatalError) {
      const restartNote =
        restarts === 0
          ? "0 restarts since launch."
          : `${restarts} cumulative ${restarts === 1 ? "restart/deploy" : "restarts/deploys"} (normal update activity, zero active crash signatures).`;
      return {
        processId: process.id,
        pm2Id: process.pm2Id,
        processName: process.name,
        status,
        restarts,
        uptimeMs: uptime,
        severity: "HEALTHY",
        category: "NONE",
        title: "Process Operational & Stable",
        summary: `Process ${process.name} (#${process.pm2Id}) is online and running normally. ${restartNote}`,
        recommendation:
          restarts >= 3
            ? "No action required. Cumulative restart count reflects routine project deployments or manual restarts while process remains stable."
            : "No action required. Telemetry metrics within normal operational bounds.",
        recoveryAction: "NO_ACTION_NEEDED",
        isCrashLoop: false,
        timestamp: Date.now(),
      };
    }

    // Active error / crash pattern matching across relevant stderr/stdout logs
    const targetLogs = isErrored ? logText : recentLogTail;
    let category: FailureCategory = isCrashLoop ? "CRASH_LOOP" : "UNKNOWN_ERROR";
    let extractedError: string | undefined;
    let title = isErrored ? "Process Halted / Errored" : "Recent Crash Recovery Detected";
    let summary = `Process ${process.name} is in status '${status}' (${restarts} total restarts).`;
    let recommendation = "Review recent application log streams and verify environment configuration.";
    let recoveryAction: RecoveryAction = isCrashLoop
      ? "CIRCUIT_BREAKER_SUSPENDED"
      : "AUTO_RESTART_ELIGIBLE";

    // 1. Out of Memory
    if (/heap out of memory|fatal error: runtime: out of memory|javascript heap out of memory/i.test(targetLogs)) {
      category = "OUT_OF_MEMORY";
      title = "Fatal Memory Exhaustion (OOM)";
      summary = "Node.js V8 runtime reached maximum heap memory limit and terminated abruptly.";
      recommendation = "Increase Node.js max heap allocation using --max-old-space-size=2048 or inspect for memory leaks in caching layers.";
      extractedError = this.extractMatchingLine(targetLogs, /heap out of memory/i);
      recoveryAction = "MANUAL_RECOVERY_REQUIRED";
    }
    // 2. Database connection failure
    else if (/ECONNREFUSED|ETIMEDOUT|SequelizeConnectionError|PrismaClientInitializationError|Connection refused|Can't reach database/i.test(targetLogs)) {
      category = "DATABASE_CONNECTION_FAILURE";
      title = "Database Connection Failure";
      summary = "Application process cannot establish TCP/socket handshake with configured database.";
      recommendation = "Verify target database host availability, network firewalls, and credentials in the Vault.";
      extractedError = this.extractMatchingLine(targetLogs, /(ECONNREFUSED|ETIMEDOUT|Connection refused|Can't reach database)/i);
      recoveryAction = "AUTO_RESTART_ELIGIBLE";
    }
    // 3. Port in use
    else if (/EADDRINUSE/i.test(targetLogs)) {
      category = "PORT_IN_USE";
      title = "Port Collision (EADDRINUSE)";
      summary = "The configured listening port is already bound by another daemon or process.";
      recommendation = "Ensure previous instances are completely stopped before binding, or assign an alternate port in environment settings.";
      extractedError = this.extractMatchingLine(targetLogs, /EADDRINUSE/i);
      recoveryAction = "MANUAL_RECOVERY_REQUIRED";
    }
    // 4. Missing Module / Dependency
    else if (/Cannot find module|MODULE_NOT_FOUND/i.test(targetLogs)) {
      category = "MISSING_MODULE";
      title = "Unresolved Dependency / Missing Module";
      summary = "Node.js loader failed to resolve an imported package or built artifact.";
      recommendation = "Re-run package installation ('pnpm install') and verify the build step ran successfully before PM2 launch.";
      extractedError = this.extractMatchingLine(targetLogs, /(Cannot find module|MODULE_NOT_FOUND)/i);
      recoveryAction = "MANUAL_RECOVERY_REQUIRED";
    }
    // 5. Environment variables or secrets missing
    else if (/secret key required|API key missing|missing required environment variable|is not defined in environment/i.test(targetLogs)) {
      category = "ENV_OR_SECRET_MISSING";
      title = "Missing Environment Secret";
      summary = "Required environment variable or cryptographic secret is missing at launch.";
      recommendation = "Review client credentials in the Vault and verify ecosystem.config.js passes all mandatory keys.";
      extractedError = this.extractMatchingLine(targetLogs, /(secret|api key|environment variable)/i);
      recoveryAction = "MANUAL_RECOVERY_REQUIRED";
    }
    // 6. Generic Uncaught Exception
    else if (/TypeError:|ReferenceError:|SyntaxError:|Uncaught Exception:/i.test(targetLogs)) {
      category = "UNCAUGHT_EXCEPTION";
      title = "Uncaught Runtime Exception";
      summary = "An unhandled runtime error halted execution and triggered a PM2 process exit.";
      recommendation = "Inspect the attached stack trace and commit changes to patch the null-pointer or syntax error.";
      extractedError = this.extractMatchingLine(targetLogs, /(TypeError:|ReferenceError:|SyntaxError:|Uncaught Exception:)/i);
      recoveryAction = isCrashLoop ? "CIRCUIT_BREAKER_SUSPENDED" : "AUTO_RESTART_ELIGIBLE";
    } else if (isCrashLoop) {
      category = "CRASH_LOOP";
      title = "Repetitive Crash Loop Detected";
      summary = `Process entered '${status}' state after ${restarts} failed restarts (uptime ${Math.round(uptime / 1000)}s).`;
      recommendation = "Automatic restarts have been rate-limited by circuit-breaker to protect server CPU. Check server logs.";
      recoveryAction = "CIRCUIT_BREAKER_SUSPENDED";
    }

    const severity: DiagnosticSeverity = isCrashLoop || category === "OUT_OF_MEMORY" || isErrored
      ? "CRITICAL"
      : "WARNING";

    return {
      processId: process.id,
      pm2Id: process.pm2Id,
      processName: process.name,
      status,
      restarts,
      uptimeMs: uptime,
      severity,
      category,
      title,
      summary,
      recommendation,
      extractedError,
      recoveryAction,
      isCrashLoop,
      timestamp: Date.now(),
    };
  }

  private static extractMatchingLine(text: string, regex: RegExp): string | undefined {
    const lines = text.split("\n");
    for (let i = lines.length - 1; i >= 0; i--) {
      const line = lines[i]?.trim();
      if (!line) continue;
      if (regex.test(line)) {
        // Return this line plus the next line if it looks like a stack trace
        const nextLine = lines[i + 1]?.trim();
        if (nextLine && nextLine.startsWith("at ")) {
          return `${line} (${nextLine})`;
        }
        return line.slice(0, 300);
      }
    }
    return undefined;
  }
}

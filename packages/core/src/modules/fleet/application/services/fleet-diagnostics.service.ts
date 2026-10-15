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
   * Evaluates process telemetry and stdout/stderr logs to produce an intelligent diagnostic report.
   */
  public static diagnose(
    process: {
      id: string;
      pm2Id: number;
      name: string;
      status: string;
      restarts: number;
      uptimeMs?: number;
      cpu?: number;
      memory?: number;
    },
    logs?: string
  ): ProcessDiagnosticReport {
    const restarts = process.restarts || 0;
    const uptime = process.uptimeMs || 0;
    const status = String(process.status || "unknown").toLowerCase();
    const logText = logs || "";

    const isErrored = status === "errored" || status === "stopped";
    const isCrashLoop = (isErrored && restarts >= 3) || (restarts >= 8 && uptime < 120_000);

    // If completely online with low restarts and normal uptime
    if (!isErrored && !isCrashLoop && restarts < 3) {
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
        summary: `Process ${process.name} (#${process.pm2Id}) is running normally with ${restarts} restarts.`,
        recommendation: "No action required. Telemetry metrics within normal operational bounds.",
        recoveryAction: "NO_ACTION_NEEDED",
        isCrashLoop: false,
        timestamp: Date.now(),
      };
    }

    // Pattern matching across stderr/stdout logs
    let category: FailureCategory = isCrashLoop ? "CRASH_LOOP" : "UNKNOWN_ERROR";
    let extractedError: string | undefined;
    let title = "Process Instability Detected";
    let summary = `Process ${process.name} is in status '${status}' with ${restarts} accumulated restarts.`;
    let recommendation = "Review recent application log streams and verify environment configuration.";
    let recoveryAction: RecoveryAction = isCrashLoop
      ? "CIRCUIT_BREAKER_SUSPENDED"
      : "AUTO_RESTART_ELIGIBLE";

    // 1. Out of Memory
    if (/heap out of memory|fatal error: runtime: out of memory|javascript heap out of memory/i.test(logText)) {
      category = "OUT_OF_MEMORY";
      title = "Fatal Memory Exhaustion (OOM)";
      summary = "Node.js V8 runtime reached maximum heap memory limit and terminated abruptly.";
      recommendation = "Increase Node.js max heap allocation using --max-old-space-size=2048 or inspect for memory leaks in caching layers.";
      extractedError = this.extractMatchingLine(logText, /heap out of memory/i);
      recoveryAction = "MANUAL_RECOVERY_REQUIRED";
    }
    // 2. Database connection failure
    else if (/ECONNREFUSED|ETIMEDOUT|SequelizeConnectionError|PrismaClientInitializationError|Connection refused|Can't reach database/i.test(logText)) {
      category = "DATABASE_CONNECTION_FAILURE";
      title = "Database Connection Failure";
      summary = "Application process cannot establish TCP/socket handshake with configured database.";
      recommendation = "Verify target database host availability, network firewalls, and credentials in the Vault.";
      extractedError = this.extractMatchingLine(logText, /(ECONNREFUSED|ETIMEDOUT|Connection refused|Can't reach database)/i);
      recoveryAction = "AUTO_RESTART_ELIGIBLE";
    }
    // 3. Port in use
    else if (/EADDRINUSE/i.test(logText)) {
      category = "PORT_IN_USE";
      title = "Port Collision (EADDRINUSE)";
      summary = "The configured listening port is already bound by another daemon or process.";
      recommendation = "Ensure previous instances are completely stopped before binding, or assign an alternate port in environment settings.";
      extractedError = this.extractMatchingLine(logText, /EADDRINUSE/i);
      recoveryAction = "MANUAL_RECOVERY_REQUIRED";
    }
    // 4. Missing Module / Dependency
    else if (/Cannot find module|MODULE_NOT_FOUND/i.test(logText)) {
      category = "MISSING_MODULE";
      title = "Unresolved Dependency / Missing Module";
      summary = "Node.js loader failed to resolve an imported package or built artifact.";
      recommendation = "Re-run package installation ('pnpm install') and verify the build step ran successfully before PM2 launch.";
      extractedError = this.extractMatchingLine(logText, /(Cannot find module|MODULE_NOT_FOUND)/i);
      recoveryAction = "MANUAL_RECOVERY_REQUIRED";
    }
    // 5. Environment variables or secrets missing
    else if (/secret key required|API key missing|missing required environment variable|is not defined in environment/i.test(logText)) {
      category = "ENV_OR_SECRET_MISSING";
      title = "Missing Environment Secret";
      summary = "Required environment variable or cryptographic secret is missing at launch.";
      recommendation = "Review client credentials in the Vault and verify ecosystem.config.js passes all mandatory keys.";
      extractedError = this.extractMatchingLine(logText, /(secret|api key|environment variable)/i);
      recoveryAction = "MANUAL_RECOVERY_REQUIRED";
    }
    // 6. Generic Uncaught Exception
    else if (/TypeError:|ReferenceError:|SyntaxError:|Uncaught Exception:/i.test(logText)) {
      category = "UNCAUGHT_EXCEPTION";
      title = "Uncaught Runtime Exception";
      summary = "An unhandled runtime error halted execution and triggered a PM2 process exit.";
      recommendation = "Inspect the attached stack trace and commit changes to patch the null-pointer or syntax error.";
      extractedError = this.extractMatchingLine(logText, /(TypeError:|ReferenceError:|SyntaxError:|Uncaught Exception:)/i);
      recoveryAction = isCrashLoop ? "CIRCUIT_BREAKER_SUSPENDED" : "AUTO_RESTART_ELIGIBLE";
    } else if (isCrashLoop) {
      category = "CRASH_LOOP";
      title = "Repetitive Crash Loop Detected";
      summary = `Process restarted ${restarts} times without achieving healthy uptime (currently ${Math.round(uptime / 1000)}s).`;
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

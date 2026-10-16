import { describe, it, expect } from "vitest";
import { FleetDiagnosticsService } from "../src/modules/fleet/application/services/fleet-diagnostics.service";

describe("FleetDiagnosticsService (Autonomous Healing)", () => {
  it("detects healthy process with zero errors", () => {
    const report = FleetDiagnosticsService.diagnose({
      id: "proc_1",
      pm2Id: 0,
      name: "web-store",
      status: "online",
      restarts: 0,
      uptimeMs: 3600000,
    });

    expect(report.severity).toBe("HEALTHY");
    expect(report.category).toBe("NONE");
    expect(report.recoveryAction).toBe("NO_ACTION_NEEDED");
    expect(report.isCrashLoop).toBe(false);
  });

  it("detects Out Of Memory (OOM) error and recommends heap increase", () => {
    const logs = `
2026-10-11T12:00:00: <--- Last few GCs --->
2026-10-11T12:00:01: FATAL ERROR: Reached heap limit Allocation failed - JavaScript heap out of memory
at Object.runInThisContext (node:vm:209:10)
    `;

    const report = FleetDiagnosticsService.diagnose(
      {
        id: "proc_oom",
        pm2Id: 1,
        name: "data-pipeline",
        status: "errored",
        restarts: 2,
        uptimeMs: 15000,
      },
      logs
    );

    expect(report.severity).toBe("CRITICAL");
    expect(report.category).toBe("OUT_OF_MEMORY");
    expect(report.title).toContain("Memory Exhaustion");
    expect(report.recommendation).toContain("--max-old-space-size");
    expect(report.recoveryAction).toBe("MANUAL_RECOVERY_REQUIRED");
  });

  it("detects Database Connection Failure and allows auto-restart", () => {
    const logs = `
[database] Connecting to postgres://db.internal:5432...
Error: connect ECONNREFUSED 10.0.0.12:5432
at TCPConnectWrap.afterConnect [as oncomplete] (node:net:1607:16)
    `;

    const report = FleetDiagnosticsService.diagnose(
      {
        id: "proc_db",
        pm2Id: 2,
        name: "api-backend",
        status: "errored",
        restarts: 1,
        uptimeMs: 5000,
      },
      logs
    );

    expect(report.severity).toBe("CRITICAL");
    expect(report.category).toBe("DATABASE_CONNECTION_FAILURE");
    expect(report.recoveryAction).toBe("AUTO_RESTART_ELIGIBLE");
  });

  it("detects Crash Loop and suspends restarts via circuit breaker", () => {
    const report = FleetDiagnosticsService.diagnose({
      id: "proc_loop",
      pm2Id: 3,
      name: "worker-loop",
      status: "errored",
      restarts: 9,
      uptimeMs: 10000,
    });

    expect(report.isCrashLoop).toBe(true);
    expect(report.severity).toBe("CRITICAL");
    expect(report.category).toBe("CRASH_LOOP");
    expect(report.recoveryAction).toBe("CIRCUIT_BREAKER_SUSPENDED");
  });

  it("treats high restart counts on a stable online process as normal project updates/deployments, not errors", () => {
    const logsWithOldErrorAndCleanBoot = [
      "2026-10-01T10:00:00: TypeError: old error from two weeks ago",
      ...Array.from({ length: 25 }, (_, i) => `2026-10-16T08:00:${String(i).padStart(2, "0")}: [INFO] Server listening and handling requests normally`),
    ].join("\n");

    const report = FleetDiagnosticsService.diagnose(
      {
        id: "proc_frequent_deploys",
        pm2Id: 0,
        name: "rsl-portal",
        status: "online",
        restarts: 45,
        uptimeMs: 3600000,
      },
      logsWithOldErrorAndCleanBoot
    );

    expect(report.severity).toBe("HEALTHY");
    expect(report.category).toBe("NONE");
    expect(report.isCrashLoop).toBe(false);
    expect(report.recoveryAction).toBe("NO_ACTION_NEEDED");
    expect(report.summary).toContain("normal update activity");
  });

  it("treats a freshly deployed online process with clean startup logs as healthy despite prior restarts", () => {
    const cleanDeployLogs = `
[PM2] Reloading process rsl-portal...
▲ Next.js 16.4.0
- Local: http://localhost:3000
✓ Ready in 1240ms
    `;

    const report = FleetDiagnosticsService.diagnose(
      {
        id: "proc_fresh_deploy",
        pm2Id: 0,
        name: "rsl-portal",
        status: "online",
        restarts: 22,
        uptimeMs: 15000,
      },
      cleanDeployLogs
    );

    expect(report.severity).toBe("HEALTHY");
    expect(report.category).toBe("NONE");
    expect(report.isCrashLoop).toBe(false);
    expect(report.recoveryAction).toBe("NO_ACTION_NEEDED");
  });

  it("flags an online process that just restarted (<60s uptime) ONLY when recent logs show a real crash signature", () => {
    const flappingLogs = `
Starting worker...
TypeError: Cannot read properties of undefined (reading 'connection')
    at startServer (/app/index.js:42:11)
    `;

    const report = FleetDiagnosticsService.diagnose(
      {
        id: "proc_flapping",
        pm2Id: 4,
        name: "flapping-api",
        status: "online",
        restarts: 10,
        uptimeMs: 12000,
      },
      flappingLogs
    );

    expect(report.isCrashLoop).toBe(true);
    expect(report.severity).toBe("CRITICAL");
    expect(report.category).toBe("UNCAUGHT_EXCEPTION");
    expect(report.recoveryAction).toBe("CIRCUIT_BREAKER_SUSPENDED");
  });
});


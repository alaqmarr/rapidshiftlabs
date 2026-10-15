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
});

import { describe, it, expect } from "vitest";
import { ClientHealthService } from "../src/modules/clients/application/services/client-health.service";

describe("ClientHealthService (Customer 360)", () => {
  it("computes EXCELLENT tier for fully stable client", () => {
    const report = ClientHealthService.calculate({
      clientId: "cli_healthy",
      clientStatus: "active",
      billing: {
        outstandingMinor: 0,
        totalBilledMinor: 1000000,
        overdueInvoicesCount: 0,
        entitlementAllowed: true,
        entitlementStatus: "active",
      },
      fleet: {
        totalProcesses: 2,
        onlineProcesses: 2,
        erroredProcesses: 0,
        hasCrashLoop: false,
      },
      monitoring: {
        totalDomains: 1,
        activeIncidentsCount: 0,
        expiringSslCount: 0,
      },
      support: {
        openTicketsCount: 0,
        breachedSlaCount: 0,
        hasEscalatedP1: false,
      },
    });

    expect(report.overallScore).toBe(100);
    expect(report.tier).toBe("EXCELLENT");
    expect(report.recommendations.length).toBe(0);
    expect(report.factors.billing.score).toBe(100);
    expect(report.factors.fleet.score).toBe(100);
  });

  it("computes CRITICAL tier when dues are blocked and crash loops active", () => {
    const report = ClientHealthService.calculate({
      clientId: "cli_distressed",
      clientStatus: "active",
      billing: {
        outstandingMinor: 500000,
        totalBilledMinor: 500000,
        overdueInvoicesCount: 3,
        entitlementAllowed: false,
        entitlementStatus: "blocked",
      },
      fleet: {
        totalProcesses: 2,
        onlineProcesses: 0,
        erroredProcesses: 2,
        hasCrashLoop: true,
      },
      monitoring: {
        totalDomains: 1,
        activeIncidentsCount: 1,
        expiringSslCount: 1,
      },
      support: {
        openTicketsCount: 5,
        breachedSlaCount: 2,
        hasEscalatedP1: true,
      },
    });

    expect(report.overallScore).toBeLessThan(50);
    expect(report.tier).toBe("CRITICAL");
    expect(report.recommendations.length).toBeGreaterThan(2);
    expect(report.factors.billing.status).toBe("POOR");
    expect(report.factors.fleet.status).toBe("POOR");
  });
});

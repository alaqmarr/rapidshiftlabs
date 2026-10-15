import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  ClientHealthService,
  type ClientHealthInput,
} from "../../../src/modules/clients/application/services/client-health.service";

describe("Customer 360 Health Alert & Retention Synergy (Pillar 2)", () => {
  let mockAuditModule: any;
  let mockRealtimeHub: any;
  let publishedEvents: any[];

  beforeEach(() => {
    publishedEvents = [];
    mockRealtimeHub = {
      publish: vi.fn().mockImplementation((topic: string, event: any) => {
        publishedEvents.push({ topic, event });
      }),
    };

    mockAuditModule = {
      log: vi.fn().mockResolvedValue({ id: "aud_123" }),
    };
  });

  it("triggers Critical retention alert and logs audit alert when health score falls below 50", async () => {
    const distressedInput: ClientHealthInput = {
      clientId: "cli_critical_01",
      clientStatus: "active",
      billing: {
        outstandingMinor: 500000,
        totalBilledMinor: 600000,
        overdueInvoicesCount: 3,
        entitlementAllowed: false,
        entitlementStatus: "blocked",
      },
      fleet: {
        totalProcesses: 4,
        onlineProcesses: 1,
        erroredProcesses: 3,
        hasCrashLoop: true,
      },
      monitoring: {
        totalDomains: 2,
        activeIncidentsCount: 2,
        expiringSslCount: 1,
      },
      support: {
        openTicketsCount: 6,
        breachedSlaCount: 3,
        hasEscalatedP1: true,
      },
    };

    const report = await ClientHealthService.evaluateAndAlert(distressedInput, {
      auditModule: mockAuditModule,
      realtimeHub: mockRealtimeHub,
    });

    expect(report.overallScore).toBeLessThan(50);
    expect(report.tier).toBe("CRITICAL");
    expect(report.alert).toBeDefined();

    // Verify alert object
    expect(report.alert?.clientId).toBe("cli_critical_01");
    expect(report.alert?.tier).toBe("CRITICAL");
    expect(report.alert?.severity).toBe("critical");
    expect(report.alert?.title).toContain("[CRITICAL RETENTION ALERT]");
    expect(report.alert?.recommendations.length).toBeGreaterThan(0);

    // Verify system event published to Admin Dashboard on 'admin:alerts'
    expect(mockRealtimeHub.publish).toHaveBeenCalledWith(
      "admin:alerts",
      expect.objectContaining({
        topic: "admin:alerts",
        type: "client.health_alert",
        clientId: "cli_critical_01",
        payload: expect.objectContaining({
          tier: "CRITICAL",
          severity: "critical",
        }),
      })
    );

    // Verify system event published to client stream
    expect(mockRealtimeHub.publish).toHaveBeenCalledWith(
      "client:cli_critical_01",
      expect.objectContaining({
        type: "client.health_alert",
      })
    );

    // Verify audit log
    expect(mockAuditModule.log).toHaveBeenCalledTimes(1);
    const auditCall = mockAuditModule.log.mock.calls[0][0];
    expect(auditCall.actorId).toBe("system");
    expect(auditCall.actorType).toBe("system");
    expect(auditCall.clientId).toBe("cli_critical_01");
    expect(auditCall.action).toBe("client.health.alert");
    expect(auditCall.entityType).toBe("client");
    expect(auditCall.entityId).toBe("cli_critical_01");

    const auditDetails = JSON.parse(auditCall.details);
    expect(auditDetails.tier).toBe("CRITICAL");
    expect(auditDetails.severity).toBe("critical");
    expect(auditDetails.score).toBe(report.overallScore);
  });

  it("triggers At-Risk retention alert when health score is between 50 and 69", () => {
    const atRiskInput: ClientHealthInput = {
      clientId: "cli_at_risk_02",
      clientStatus: "active",
      billing: {
        outstandingMinor: 200000,
        totalBilledMinor: 1000000,
        overdueInvoicesCount: 1, // Dunning needed
        entitlementAllowed: true,
        entitlementStatus: "active",
      },
      fleet: {
        totalProcesses: 3,
        onlineProcesses: 2,
        erroredProcesses: 1, // 1 errored process
        hasCrashLoop: false,
      },
      monitoring: {
        totalDomains: 1,
        activeIncidentsCount: 0,
        expiringSslCount: 1, // SSL expiring soon
      },
      support: {
        openTicketsCount: 2,
        breachedSlaCount: 1, // 1 SLA breach
        hasEscalatedP1: false,
      },
    };

    const report = ClientHealthService.calculate(atRiskInput, {
      auditModule: mockAuditModule,
      realtimeHub: mockRealtimeHub,
    });

    expect(report.overallScore).toBeGreaterThanOrEqual(50);
    expect(report.overallScore).toBeLessThan(70);
    expect(report.tier).toBe("AT_RISK");
    expect(report.alert).toBeDefined();

    expect(report.alert?.clientId).toBe("cli_at_risk_02");
    expect(report.alert?.tier).toBe("AT_RISK");
    expect(report.alert?.severity).toBe("warning");
    expect(report.alert?.title).toContain("[AT-RISK RETENTION ALERT]");

    // Verify realtime warning event emitted
    expect(mockRealtimeHub.publish).toHaveBeenCalledWith(
      "admin:alerts",
      expect.objectContaining({
        type: "client.health_alert",
        payload: expect.objectContaining({
          tier: "AT_RISK",
          severity: "warning",
        }),
      })
    );
  });

  it("does not trigger retention alert when health score is Good or Excellent (>= 70)", () => {
    const healthyInput: ClientHealthInput = {
      clientId: "cli_healthy_03",
      clientStatus: "active",
      billing: {
        outstandingMinor: 0,
        totalBilledMinor: 1000000,
        overdueInvoicesCount: 0,
        entitlementAllowed: true,
        entitlementStatus: "active",
      },
      fleet: {
        totalProcesses: 5,
        onlineProcesses: 5,
        erroredProcesses: 0,
        hasCrashLoop: false,
      },
      monitoring: {
        totalDomains: 3,
        activeIncidentsCount: 0,
        expiringSslCount: 0,
      },
      support: {
        openTicketsCount: 1,
        breachedSlaCount: 0,
        hasEscalatedP1: false,
      },
    };

    const report = ClientHealthService.calculate(healthyInput, {
      auditModule: mockAuditModule,
      realtimeHub: mockRealtimeHub,
    });

    expect(report.overallScore).toBeGreaterThanOrEqual(70);
    expect(report.tier).toBe("EXCELLENT");
    expect(report.alert).toBeUndefined();

    // Verify NO warning events or audit logs were generated
    expect(mockRealtimeHub.publish).not.toHaveBeenCalled();
    expect(mockAuditModule.log).not.toHaveBeenCalled();
  });

  it("invokes custom onAlert callback if provided in options", () => {
    const atRiskInput: ClientHealthInput = {
      clientId: "cli_callback_04",
      clientStatus: "active",
      billing: {
        outstandingMinor: 100000,
        totalBilledMinor: 200000,
        overdueInvoicesCount: 1,
      },
      fleet: {
        totalProcesses: 1,
        onlineProcesses: 0,
        erroredProcesses: 1,
      },
      monitoring: {
        totalDomains: 1,
        activeIncidentsCount: 1,
      },
      support: {
        openTicketsCount: 3,
        breachedSlaCount: 1,
      },
    };

    const onAlertMock = vi.fn();

    const report = ClientHealthService.calculate(atRiskInput, {
      realtimeHub: mockRealtimeHub,
      onAlert: onAlertMock,
    });

    expect(report.alert).toBeDefined();
    expect(onAlertMock).toHaveBeenCalledTimes(1);
    expect(onAlertMock).toHaveBeenCalledWith(report.alert);
  });
});

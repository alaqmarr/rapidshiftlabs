import { newId } from "../../../../shared/kernel/id";
import { getRealtimeHub } from "../../../../shared/infrastructure/events/realtime-hub";

export type HealthTier = "EXCELLENT" | "GOOD" | "AT_RISK" | "CRITICAL";

export interface HealthScoreFactor {
  name: string;
  weightPercent: number;
  score: number;
  status: "GOOD" | "WARN" | "POOR";
  details: string;
}

export interface ClientHealthInput {
  clientId: string;
  clientStatus?: "active" | "inactive" | "suspended";
  billing: {
    outstandingMinor: number;
    totalBilledMinor: number;
    overdueInvoicesCount: number;
    entitlementAllowed?: boolean;
    entitlementStatus?: string;
  };
  fleet: {
    totalProcesses: number;
    onlineProcesses: number;
    erroredProcesses: number;
    hasCrashLoop?: boolean;
  };
  monitoring: {
    totalDomains: number;
    activeIncidentsCount: number;
    expiringSslCount?: number;
  };
  support: {
    openTicketsCount: number;
    breachedSlaCount: number;
    hasEscalatedP1?: boolean;
  };
}

export interface ClientHealthAlert {
  clientId: string;
  tier: "CRITICAL" | "AT_RISK";
  score: number;
  severity: "critical" | "warning";
  title: string;
  summary: string;
  recommendations: string[];
  timestamp: number;
}

export interface ClientHealthCalculateOptions {
  auditModule?: { log: (record: any) => Promise<any> };
  realtimeHub?: { publish: (topic: string, event: any) => void };
  onAlert?: (alert: ClientHealthAlert) => void | Promise<void>;
  suppressEvents?: boolean;
}

export interface ClientHealthReport {
  clientId: string;
  overallScore: number;
  tier: HealthTier;
  summary: string;
  factors: {
    billing: HealthScoreFactor;
    fleet: HealthScoreFactor;
    monitoring: HealthScoreFactor;
    support: HealthScoreFactor;
  };
  recommendations: string[];
  calculatedAt: number;
  alert?: ClientHealthAlert;
}

export class ClientHealthService {
  public static calculate(
    input: ClientHealthInput,
    options?: ClientHealthCalculateOptions
  ): ClientHealthReport {
    const recommendations: string[] = [];

    // 1. Billing Score (35%)
    let billingScore = 100;
    const isSuspended = input.clientStatus === "suspended";
    const isBlocked = input.billing.entitlementAllowed === false || input.billing.entitlementStatus === "blocked";

    if (isSuspended) {
      billingScore = 0;
      recommendations.push("Account is suspended. Review commercial terms and legal standing.");
    } else if (isBlocked) {
      billingScore = Math.min(billingScore, 20);
      recommendations.push("Access Gate is blocked due to unpaid dues. Follow up with client accounting.");
    } else {
      if (input.billing.overdueInvoicesCount > 0) {
        billingScore -= input.billing.overdueInvoicesCount * 30;
        recommendations.push(`${input.billing.overdueInvoicesCount} invoice(s) are overdue. Initiate dunning reminders.`);
      }
      if (input.billing.totalBilledMinor > 0) {
        const ratio = input.billing.outstandingMinor / input.billing.totalBilledMinor;
        if (ratio > 0.4) {
          billingScore -= 20;
          recommendations.push("Outstanding balance exceeds 40% of total lifetime billing.");
        }
      }
    }
    billingScore = Math.max(0, Math.min(100, Math.round(billingScore)));

    // 2. Fleet Score (25%)
    let fleetScore = 100;
    if (input.fleet.totalProcesses > 0) {
      if (input.fleet.hasCrashLoop) {
        fleetScore -= 50;
        recommendations.push("Critical PM2 crash loop detected on client server. Self-healing circuit tripped.");
      }
      if (input.fleet.erroredProcesses > 0) {
        fleetScore -= input.fleet.erroredProcesses * 35;
        recommendations.push(`${input.fleet.erroredProcesses} PM2 process(es) are currently errored or offline.`);
      }
    }
    fleetScore = Math.max(0, Math.min(100, Math.round(fleetScore)));

    // 3. Monitoring Score (20%)
    let monitoringScore = 100;
    if (input.monitoring.totalDomains > 0) {
      if (input.monitoring.activeIncidentsCount > 0) {
        monitoringScore -= input.monitoring.activeIncidentsCount * 40;
        recommendations.push(`Active domain downtime incident ongoing for client endpoints.`);
      }
      if ((input.monitoring.expiringSslCount || 0) > 0) {
        monitoringScore -= (input.monitoring.expiringSslCount || 0) * 25;
        recommendations.push(`SSL certificate expiring in under 7 days. Automatic renewal check recommended.`);
      }
    }
    monitoringScore = Math.max(0, Math.min(100, Math.round(monitoringScore)));

    // 4. Support & SLA Score (20%)
    let supportScore = 100;
    if (input.support.breachedSlaCount > 0) {
      supportScore -= input.support.breachedSlaCount * 40;
      recommendations.push(`${input.support.breachedSlaCount} ticket SLA breach(es) recorded. Escalate to primary on-call.`);
    }
    if (input.support.hasEscalatedP1) {
      supportScore -= 25;
      recommendations.push("Active P1 Priority Incident under investigation.");
    }
    if (input.support.openTicketsCount > 4) {
      supportScore -= 10;
    }
    supportScore = Math.max(0, Math.min(100, Math.round(supportScore)));

    // Overall weighted composite
    const overallScore = Math.round(
      billingScore * 0.35 +
      fleetScore * 0.25 +
      monitoringScore * 0.20 +
      supportScore * 0.20
    );

    let tier: HealthTier = "EXCELLENT";
    if (overallScore < 50) {
      tier = "CRITICAL";
    } else if (overallScore < 70) {
      tier = "AT_RISK";
    } else if (overallScore < 85) {
      tier = "GOOD";
    }

    const summary =
      tier === "EXCELLENT"
        ? "Client infrastructure, billing, and SLA metrics are operating at peak stability."
        : tier === "GOOD"
        ? "Operations are healthy with minor pending action items."
        : tier === "AT_RISK"
        ? "Client stability is at risk. Operational or billing intervention recommended."
        : "Critical account distress detected. Immediate engineering or commercial outreach required.";

    const getStatus = (score: number): "GOOD" | "WARN" | "POOR" =>
      score >= 80 ? "GOOD" : score >= 60 ? "WARN" : "POOR";

    // Proactive Alert & Retention Synergy for Critical and At Risk accounts
    let alert: ClientHealthAlert | undefined;
    if (tier === "CRITICAL" || tier === "AT_RISK") {
      alert = {
        clientId: input.clientId,
        tier,
        score: overallScore,
        severity: tier === "CRITICAL" ? "critical" : "warning",
        title:
          tier === "CRITICAL"
            ? `[CRITICAL RETENTION ALERT] Client ${input.clientId} in severe distress (Health Score: ${overallScore}/100)`
            : `[AT-RISK RETENTION ALERT] Client ${input.clientId} operational stability degraded (Health Score: ${overallScore}/100)`,
        summary,
        recommendations: [...recommendations],
        timestamp: Date.now(),
      };

      // 1. Emit proactive warning event via RealtimeHub for Admin Dashboard
      if (!options?.suppressEvents) {
        try {
          const hub = options?.realtimeHub ?? getRealtimeHub();
          const evt = {
            id: newId("evt"),
            topic: "admin:alerts",
            type: "client.health_alert",
            clientId: input.clientId,
            payload: alert,
            timestamp: alert.timestamp,
          };
          hub.publish("admin:alerts", evt);
          hub.publish(`client:${input.clientId}`, evt);
        } catch {
          // Hub publish is non-blocking
        }
      }

      // 2. Log audit alert if audit module provided
      if (options?.auditModule) {
        options.auditModule
          .log({
            actorId: "system",
            actorType: "system",
            clientId: input.clientId,
            action: "client.health.alert",
            entityType: "client",
            entityId: input.clientId,
            details: JSON.stringify({
              tier: alert.tier,
              score: alert.score,
              severity: alert.severity,
              title: alert.title,
              recommendations: alert.recommendations,
            }),
          })
          .catch((err: any) => {
            console.warn("[ClientHealthService] Failed to log audit alert:", err);
          });
      }

      // 3. Optional user alert callback
      if (options?.onAlert) {
        try {
          options.onAlert(alert);
        } catch {}
      }
    }

    return {
      clientId: input.clientId,
      overallScore,
      tier,
      summary,
      factors: {
        billing: {
          name: "Billing & Access Gate",
          weightPercent: 35,
          score: billingScore,
          status: getStatus(billingScore),
          details: `${input.billing.overdueInvoicesCount} overdue, gate ${input.billing.entitlementAllowed ? "allowed" : "blocked"}`,
        },
        fleet: {
          name: "Fleet & PM2 Stability",
          weightPercent: 25,
          score: fleetScore,
          status: getStatus(fleetScore),
          details: `${input.fleet.onlineProcesses}/${input.fleet.totalProcesses} processes online`,
        },
        monitoring: {
          name: "Domains & SSL Health",
          weightPercent: 20,
          score: monitoringScore,
          status: getStatus(monitoringScore),
          details: `${input.monitoring.activeIncidentsCount} active incidents, ${input.monitoring.totalDomains} domains`,
        },
        support: {
          name: "Support Desk & SLA",
          weightPercent: 20,
          score: supportScore,
          status: getStatus(supportScore),
          details: `${input.support.breachedSlaCount} breached SLAs, ${input.support.openTicketsCount} open tickets`,
        },
      },
      recommendations,
      calculatedAt: Date.now(),
      alert,
    };
  }

  /**
   * Calculates health and guarantees asynchronous persistence of audit alerts.
   */
  public static async evaluateAndAlert(
    input: ClientHealthInput,
    deps?: {
      auditModule?: { log: (record: any) => Promise<any> };
      realtimeHub?: { publish: (topic: string, event: any) => void };
      onAlert?: (alert: ClientHealthAlert) => void | Promise<void>;
    }
  ): Promise<ClientHealthReport> {
    const report = this.calculate(input, {
      realtimeHub: deps?.realtimeHub,
      onAlert: deps?.onAlert,
    });

    if (report.alert && deps?.auditModule) {
      await deps.auditModule.log({
        actorId: "system",
        actorType: "system",
        clientId: input.clientId,
        action: "client.health.alert",
        entityType: "client",
        entityId: input.clientId,
        details: JSON.stringify({
          tier: report.alert.tier,
          score: report.alert.score,
          severity: report.alert.severity,
          title: report.alert.title,
          recommendations: report.alert.recommendations,
        }),
      });
    }

    return report;
  }
}

import type { MonitoredDomainRepositoryPort } from "../../domain/ports/monitored-domain-repo.port";
import type { DomainCheckRepositoryPort } from "../../domain/ports/domain-check-repo.port";
import type {
  HttpCheckerPort,
  HttpCheckResult,
} from "../../domain/ports/http-checker.port";
import type { IncidentRepositoryPort } from "../../domain/ports/incident-repo.port";
import { MonitoredDomain } from "../../domain/entities/monitored-domain.entity";
import { Incident } from "../../domain/entities/incident.entity";
import { invariant } from "../../../../shared/kernel/errors";
import type { ExecuteHttpCheckInput } from "../dtos/monitoring.dto";

export interface ExecuteHttpCheckOutput {
  domainId: string;
  isUp: boolean;
  statusCode: number | null;
  latencyMs: number;
  status: string;
  transition: {
    becameDown: boolean;
    recovered: boolean;
    incidentOpened: boolean;
    incidentResolved: boolean;
  };
  checkResult: HttpCheckResult;
  incidentId?: string | null;
}

export interface MonitoringIncidentNotifierPort {
  notifyIncident(params: {
    domain: string;
    checkType: "http" | "ssl" | "dns";
    state: "opened" | "resolved";
    reason: string;
    clientId: string;
    timestamp: number;
  }): Promise<void>;
}

export class ExecuteHttpCheckUseCase {
  constructor(
    private readonly monitoredDomainRepo: MonitoredDomainRepositoryPort,
    private readonly domainCheckRepo: DomainCheckRepositoryPort,
    private readonly httpChecker: HttpCheckerPort,
    private readonly incidentRepo?: IncidentRepositoryPort,
    private readonly notifier?: MonitoringIncidentNotifierPort,
  ) {}

  async execute(
    input: ExecuteHttpCheckInput | { domain: MonitoredDomain },
  ): Promise<ExecuteHttpCheckOutput> {
    const domain =
      "domain" in input
        ? input.domain
        : await this.monitoredDomainRepo.findById(input.domainId);

    invariant(domain, "domain_not_found", `Monitored domain not found`);

    // Network check executes strictly OUTSIDE transactions
    const config = domain.config.http;
    const checkResult = await this.httpChecker.check(domain.targetUrl, {
      timeoutMs: config.timeoutMs,
      keyword: config.keyword,
      expectedStatusCodes: config.expectedStatusCodes,
      method: config.method,
      headers: config.headers,
    });

    const previousActiveIncidentId = domain.activeIncidentId;

    const transition = domain.recordHttpCheckResult({
      isUp: checkResult.isUp,
      statusCode: checkResult.statusCode,
      latencyMs: checkResult.latencyMs,
      errorMessage: checkResult.errorMessage ?? null,
      now: checkResult.timestamp,
    });

    let affectedIncidentId: string | null = null;

    if (this.incidentRepo) {
      if (transition.becameDown) {
        if (!domain.activeIncidentId) {
          const reason =
            checkResult.errorMessage ||
            `HTTP check failed with status ${checkResult.statusCode ?? "unknown"}`;
          const incident = Incident.create({
            domainId: domain.id,
            clientId: domain.clientId,
            type: "http",
            severity: "critical",
            reason,
            failureCount: domain.consecutiveFailures,
            startedAt: checkResult.timestamp,
          });
          await this.incidentRepo.save(incident);
          domain.linkIncident(incident.id);
          affectedIncidentId = incident.id;

          if (this.notifier) {
            this.notifier
              .notifyIncident({
                domain: domain.hostname,
                checkType: "http",
                state: "opened",
                reason,
                clientId: domain.clientId,
                timestamp: checkResult.timestamp,
              })
              .catch((e) =>
                console.error("[Monitoring] Warning: Failed to send incident email:", e),
              );
          }
        }
      } else if (transition.recovered) {
        let activeIncident: Incident | null = null;
        if (previousActiveIncidentId) {
          activeIncident = await this.incidentRepo.findById(
            previousActiveIncidentId,
          );
        }
        if (!activeIncident) {
          activeIncident = await this.incidentRepo.findActiveByDomainId(
            domain.id,
          );
        }
        if (activeIncident) {
          activeIncident.resolve(checkResult.timestamp);
          await this.incidentRepo.save(activeIncident);
          affectedIncidentId = activeIncident.id;

          if (this.notifier) {
            this.notifier
              .notifyIncident({
                domain: domain.hostname,
                checkType: "http",
                state: "resolved",
                reason: "Service recovered and returned expected HTTP status",
                clientId: domain.clientId,
                timestamp: checkResult.timestamp,
              })
              .catch((e) =>
                console.error("[Monitoring] Warning: Failed to send incident recovery email:", e),
              );
          }
        }
        domain.clearIncident();
      }
    }

    await this.monitoredDomainRepo.save(domain);

    await this.domainCheckRepo.recordCheck({
      domainId: domain.id,
      checkType: "http",
      timestamp: checkResult.timestamp,
      isSuccess: checkResult.isUp,
      latencyMs: checkResult.latencyMs,
      statusCode: checkResult.statusCode,
      errorMessage: checkResult.errorMessage ?? null,
      detailsJson: JSON.stringify({
        url: checkResult.url,
        statusCode: checkResult.statusCode,
        latencyMs: checkResult.latencyMs,
        errorMessage: checkResult.errorMessage,
        transition,
        incidentId: affectedIncidentId,
      }),
    });

    return {
      domainId: domain.id,
      isUp: checkResult.isUp,
      statusCode: checkResult.statusCode,
      latencyMs: checkResult.latencyMs,
      status: domain.status,
      transition,
      checkResult,
      incidentId: affectedIncidentId,
    };
  }
}

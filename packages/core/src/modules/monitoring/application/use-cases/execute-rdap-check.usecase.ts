import type { MonitoredDomainRepositoryPort } from "../../domain/ports/monitored-domain-repo.port";
import type { DomainCheckRepositoryPort } from "../../domain/ports/domain-check-repo.port";
import type {
  RdapCheckerPort,
  RdapCheckResult,
} from "../../domain/ports/rdap-checker.port";
import { MonitoredDomain } from "../../domain/entities/monitored-domain.entity";
import { invariant } from "../../../../shared/kernel/errors";
import type { ExecuteRdapCheckInput } from "../dtos/monitoring.dto";

export interface ExecuteRdapCheckOutput {
  domainId: string;
  hostname: string;
  expiresAt: number | null;
  registrar: string | null;
  daysRemaining: number | null;
  checkResult: RdapCheckResult;
}

export class ExecuteRdapCheckUseCase {
  constructor(
    private readonly monitoredDomainRepo: MonitoredDomainRepositoryPort,
    private readonly domainCheckRepo: DomainCheckRepositoryPort,
    private readonly rdapChecker: RdapCheckerPort,
  ) {}

  async execute(
    input: ExecuteRdapCheckInput | { domain: MonitoredDomain },
  ): Promise<ExecuteRdapCheckOutput> {
    const domain =
      "domain" in input
        ? input.domain
        : await this.monitoredDomainRepo.findById(input.domainId);

    invariant(domain, "domain_not_found", `Monitored domain not found`);

    const checkResult = await this.rdapChecker.check(domain.hostname);

    domain.recordRdapCheckResult({
      expiresAt: checkResult.expiresAt,
      registrar: checkResult.registrar,
      now: checkResult.timestamp,
    });

    await this.monitoredDomainRepo.save(domain);

    await this.domainCheckRepo.recordCheck({
      domainId: domain.id,
      checkType: "rdap",
      timestamp: checkResult.timestamp,
      isSuccess: checkResult.isRegistered && !checkResult.errorMessage,
      latencyMs: null,
      statusCode: null,
      errorMessage: checkResult.errorMessage || null,
      detailsJson: JSON.stringify({
        hostname: checkResult.hostname,
        isRegistered: checkResult.isRegistered,
        expiresAt: checkResult.expiresAt,
        daysRemaining: checkResult.daysRemaining,
        registrar: checkResult.registrar,
        rawEvents: checkResult.rawEvents,
      }),
    });

    return {
      domainId: domain.id,
      hostname: domain.hostname,
      expiresAt: checkResult.expiresAt,
      registrar: checkResult.registrar,
      daysRemaining: checkResult.daysRemaining,
      checkResult,
    };
  }
}

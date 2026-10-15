import type { MonitoredDomainRepositoryPort } from "../../domain/ports/monitored-domain-repo.port";
import type { DomainCheckRepositoryPort } from "../../domain/ports/domain-check-repo.port";
import type {
  SslCheckerPort,
  SslCheckResult,
} from "../../domain/ports/ssl-checker.port";
import { MonitoredDomain } from "../../domain/entities/monitored-domain.entity";
import { invariant } from "../../../../shared/kernel/errors";
import type { ExecuteSslCheckInput } from "../dtos/monitoring.dto";

export interface ExecuteSslCheckOutput {
  domainId: string;
  hostname: string;
  isValid: boolean;
  isExpired: boolean;
  daysRemaining: number;
  sslStatus: string | null;
  checkResult: SslCheckResult;
}

export class ExecuteSslCheckUseCase {
  constructor(
    private readonly monitoredDomainRepo: MonitoredDomainRepositoryPort,
    private readonly domainCheckRepo: DomainCheckRepositoryPort,
    private readonly sslChecker: SslCheckerPort,
  ) {}

  async execute(
    input: ExecuteSslCheckInput | { domain: MonitoredDomain },
  ): Promise<ExecuteSslCheckOutput> {
    const domain =
      "domain" in input
        ? input.domain
        : await this.monitoredDomainRepo.findById(input.domainId);

    invariant(domain, "domain_not_found", `Monitored domain not found`);

    const config = domain.config.ssl;
    const port = config.port ?? domain.port ?? 443;
    const checkResult = await this.sslChecker.check(
      domain.hostname,
      port,
      10_000,
    );

    const expiresAt = checkResult.validTo
      ? new Date(checkResult.validTo).getTime()
      : null;

    domain.recordSslCheckResult({
      isValid: checkResult.isValid,
      expiresAt,
      daysRemaining: checkResult.daysRemaining,
      issuer: checkResult.issuer,
      error: checkResult.errorMessage || checkResult.authError,
      now: checkResult.timestamp,
    });

    await this.monitoredDomainRepo.save(domain);

    await this.domainCheckRepo.recordCheck({
      domainId: domain.id,
      checkType: "ssl",
      timestamp: checkResult.timestamp,
      isSuccess: checkResult.isValid,
      latencyMs: null,
      statusCode: null,
      errorMessage: checkResult.errorMessage || checkResult.authError || null,
      detailsJson: JSON.stringify({
        hostname: checkResult.hostname,
        port: checkResult.port,
        isValid: checkResult.isValid,
        isExpired: checkResult.isExpired,
        daysRemaining: checkResult.daysRemaining,
        validFrom: checkResult.validFrom,
        validTo: checkResult.validTo,
        issuer: checkResult.issuer,
        subject: checkResult.subject,
        sans: checkResult.sans,
        authError: checkResult.authError,
        errorMessage: checkResult.errorMessage,
      }),
    });

    return {
      domainId: domain.id,
      hostname: domain.hostname,
      isValid: checkResult.isValid,
      isExpired: checkResult.isExpired,
      daysRemaining: checkResult.daysRemaining,
      sslStatus: domain.sslStatus,
      checkResult,
    };
  }
}

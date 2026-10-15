import type { MonitoredDomainRepositoryPort } from "../../domain/ports/monitored-domain-repo.port";
import type { DomainCheckRepositoryPort } from "../../domain/ports/domain-check-repo.port";
import type {
  DnsCheckerPort,
  DnsCheckResult,
} from "../../domain/ports/dns-checker.port";
import { MonitoredDomain } from "../../domain/entities/monitored-domain.entity";
import { invariant } from "../../../../shared/kernel/errors";
import type { ExecuteDnsCheckInput } from "../dtos/monitoring.dto";

export interface ExecuteDnsCheckOutput {
  domainId: string;
  hostname: string;
  resolved: boolean;
  driftDetected: boolean;
  dnsStatus: string | null;
  resolvedIp: string | null;
  checkResult: DnsCheckResult;
}

export class ExecuteDnsCheckUseCase {
  constructor(
    private readonly monitoredDomainRepo: MonitoredDomainRepositoryPort,
    private readonly domainCheckRepo: DomainCheckRepositoryPort,
    private readonly dnsChecker: DnsCheckerPort,
  ) {}

  async execute(
    input: ExecuteDnsCheckInput | { domain: MonitoredDomain },
  ): Promise<ExecuteDnsCheckOutput> {
    const domain =
      "domain" in input
        ? input.domain
        : await this.monitoredDomainRepo.findById(input.domainId);

    invariant(domain, "domain_not_found", `Monitored domain not found`);

    const baseline = domain.config.dns.expectedRecords ?? null;
    const checkResult = await this.dnsChecker.check(domain.hostname, baseline);

    const driftDetails =
      checkResult.drifts.length > 0
        ? checkResult.drifts.map((d) => d.description).join("; ")
        : null;

    const resolvedIp = checkResult.records.a[0] ?? null;

    domain.recordDnsCheckResult({
      healthy: checkResult.resolved,
      driftDetected: checkResult.driftDetected,
      driftDetails,
      resolvedIp,
      now: checkResult.timestamp,
    });

    await this.monitoredDomainRepo.save(domain);

    await this.domainCheckRepo.recordCheck({
      domainId: domain.id,
      checkType: "dns",
      timestamp: checkResult.timestamp,
      isSuccess: checkResult.resolved && !checkResult.driftDetected,
      latencyMs: null,
      statusCode: null,
      errorMessage: checkResult.errorMessage ?? null,
      detailsJson: JSON.stringify({
        hostname: checkResult.hostname,
        resolved: checkResult.resolved,
        records: checkResult.records,
        driftDetected: checkResult.driftDetected,
        drifts: checkResult.drifts,
        errorMessage: checkResult.errorMessage,
      }),
    });

    return {
      domainId: domain.id,
      hostname: domain.hostname,
      resolved: checkResult.resolved,
      driftDetected: checkResult.driftDetected,
      dnsStatus: domain.dnsStatus,
      resolvedIp: domain.resolvedIp,
      checkResult,
    };
  }
}

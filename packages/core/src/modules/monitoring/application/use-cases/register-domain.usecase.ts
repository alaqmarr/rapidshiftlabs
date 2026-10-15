import type { MonitoredDomainRepositoryPort } from "../../domain/ports/monitored-domain-repo.port";
import { MonitoredDomain } from "../../domain/entities/monitored-domain.entity";
import { invariant } from "../../../../shared/kernel/errors";
import type { RegisterDomainInput } from "../dtos/monitoring.dto";

export class RegisterDomainUseCase {
  constructor(
    private readonly monitoredDomainRepo: MonitoredDomainRepositoryPort,
  ) {}

  async execute(input: RegisterDomainInput): Promise<MonitoredDomain> {
    invariant(input.clientId, "missing_client_id", "Client ID is required");
    invariant(input.name?.trim(), "missing_name", "Domain name is required");
    invariant(
      input.hostname?.trim(),
      "missing_hostname",
      "Domain hostname is required",
    );

    const normalizedHostname = input.hostname
      .trim()
      .toLowerCase()
      .replace(/^https?:\/\//, "")
      .replace(/\/.*$/, "");

    // Check for existing domain with same hostname for client
    const existingDomains = await this.monitoredDomainRepo.findByClientId(
      input.clientId,
    );
    const alreadyRegistered = existingDomains.find(
      (d) => d.hostname === normalizedHostname,
    );
    invariant(
      !alreadyRegistered,
      "domain_already_exists",
      `Domain with hostname '${normalizedHostname}' is already registered for this client`,
    );

    const domain = MonitoredDomain.create({
      clientId: input.clientId,
      projectId: input.projectId ?? null,
      name: input.name.trim(),
      hostname: normalizedHostname,
      targetUrl: input.targetUrl,
      port: input.port,
      config: input.config,
    });

    await this.monitoredDomainRepo.save(domain);

    return domain;
  }
}

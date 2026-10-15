import { DrizzleMonitoredDomainRepository } from "./infrastructure/repositories/drizzle-monitored-domain.repository";
import { DrizzleDomainCheckRepository } from "./infrastructure/repositories/drizzle-domain-check.repository";
import { DrizzleIncidentRepository } from "./infrastructure/repositories/drizzle-incident.repository";
import { NodeHttpChecker } from "./infrastructure/adapters/node-http-checker.adapter";
import { NodeSslChecker } from "./infrastructure/adapters/node-ssl-checker.adapter";
import { NodeDnsChecker } from "./infrastructure/adapters/node-dns-checker.adapter";
import { NodeRdapChecker } from "./infrastructure/adapters/node-rdap-checker.adapter";

import type { MonitoredDomainRepositoryPort } from "./domain/ports/monitored-domain-repo.port";
import type { DomainCheckRepositoryPort } from "./domain/ports/domain-check-repo.port";
import type { IncidentRepositoryPort } from "./domain/ports/incident-repo.port";
import type { HttpCheckerPort } from "./domain/ports/http-checker.port";
import type { SslCheckerPort } from "./domain/ports/ssl-checker.port";
import type { DnsCheckerPort } from "./domain/ports/dns-checker.port";
import type { RdapCheckerPort } from "./domain/ports/rdap-checker.port";

import { RegisterDomainUseCase } from "./application/use-cases/register-domain.usecase";
import {
  ExecuteHttpCheckUseCase,
  type ExecuteHttpCheckOutput,
  type MonitoringIncidentNotifierPort,
} from "./application/use-cases/execute-http-check.usecase";
import { getSettingsModule, renderDomainIncidentEmail } from "../settings";
import { getClientsModule } from "../clients";
import {
  ExecuteSslCheckUseCase,
  type ExecuteSslCheckOutput,
} from "./application/use-cases/execute-ssl-check.usecase";
import {
  ExecuteDnsCheckUseCase,
  type ExecuteDnsCheckOutput,
} from "./application/use-cases/execute-dns-check.usecase";
import {
  ExecuteRdapCheckUseCase,
  type ExecuteRdapCheckOutput,
} from "./application/use-cases/execute-rdap-check.usecase";
import {
  GetPublicStatusPageUseCase,
  type ClientLookupFn,
} from "./application/use-cases/get-public-status-page.usecase";
import type {
  RegisterDomainInput,
  MonitoredDomainDTO,
  ExecuteHttpCheckInput,
  ExecuteSslCheckInput,
  ExecuteDnsCheckInput,
  ExecuteRdapCheckInput,
} from "./application/dtos/monitoring.dto";
import type {
  GetPublicStatusPageInput,
  PublicStatusPageData,
} from "./application/dtos/status-page.dto";
import type { MonitoredDomain } from "./domain/entities/monitored-domain.entity";
import type { Incident } from "./domain/entities/incident.entity";

// Re-export all layers
export * from "./domain";
export * from "./infrastructure";
export * from "./application";
export {
  validateSafeOutboundUrl,
  SecurityError,
  isPrivateOrBlockedIp,
} from "../../shared/infrastructure/network/ssrf-guard";

export interface MonitoringModuleDependencies {
  monitoredDomainRepo?: MonitoredDomainRepositoryPort;
  domainCheckRepo?: DomainCheckRepositoryPort;
  incidentRepo?: IncidentRepositoryPort;
  httpChecker?: HttpCheckerPort;
  sslChecker?: SslCheckerPort;
  dnsChecker?: DnsCheckerPort;
  rdapChecker?: RdapCheckerPort;
  clientLookup?: ClientLookupFn;
  incidentNotifier?: MonitoringIncidentNotifierPort;
}

export class MonitoringModule {
  public readonly monitoredDomainRepo: MonitoredDomainRepositoryPort;
  public readonly domainCheckRepo: DomainCheckRepositoryPort;
  public readonly incidentRepo: IncidentRepositoryPort;
  public readonly httpChecker: HttpCheckerPort;
  public readonly sslChecker: SslCheckerPort;
  public readonly dnsChecker: DnsCheckerPort;
  public readonly rdapChecker: RdapCheckerPort;

  public readonly registerDomainUseCase: RegisterDomainUseCase;
  public readonly executeHttpCheckUseCase: ExecuteHttpCheckUseCase;
  public readonly executeSslCheckUseCase: ExecuteSslCheckUseCase;
  public readonly executeDnsCheckUseCase: ExecuteDnsCheckUseCase;
  public readonly executeRdapCheckUseCase: ExecuteRdapCheckUseCase;
  public readonly getPublicStatusPageUseCase: GetPublicStatusPageUseCase;

  constructor(deps?: MonitoringModuleDependencies) {
    this.monitoredDomainRepo =
      deps?.monitoredDomainRepo ?? new DrizzleMonitoredDomainRepository();
    this.domainCheckRepo =
      deps?.domainCheckRepo ?? new DrizzleDomainCheckRepository();
    this.incidentRepo =
      deps?.incidentRepo ?? new DrizzleIncidentRepository();
    this.httpChecker = deps?.httpChecker ?? new NodeHttpChecker();
    this.sslChecker = deps?.sslChecker ?? new NodeSslChecker();
    this.dnsChecker = deps?.dnsChecker ?? new NodeDnsChecker();
    this.rdapChecker = deps?.rdapChecker ?? new NodeRdapChecker();

    const defaultNotifier: MonitoringIncidentNotifierPort = deps?.incidentNotifier ?? {
      async notifyIncident(params) {
        try {
          const settingsModule = getSettingsModule();
          const emailSettings = await settingsModule.repo.getEmailSettings();
          const companySettings = await settingsModule.repo.getCompanySettings();

          const clientModule = getClientsModule();
          const contacts = await clientModule.repo.findContactsByClient(params.clientId);
          const primaryContact = contacts.find((c: any) => c.isPrimary) || contacts[0];
          const client = await clientModule.repo.findById(params.clientId);

          const timeFormatted = new Date(params.timestamp).toLocaleString("en-IN", {
            timeZone: "Asia/Kolkata",
          });

          const rendered = renderDomainIncidentEmail({
            domain: params.domain,
            checkType: params.checkType,
            state: params.state,
            reason: params.reason,
            clientName: primaryContact?.name || client?.name || "Client",
            timestampFormatted: timeFormatted,
            firmName: companySettings.legalName || "RapidShift Labs",
          });

          if (primaryContact?.email) {
            await settingsModule.emailSender.send({
              to: primaryContact.email,
              subject: rendered.subject,
              html: rendered.html,
              text: rendered.text,
            });
            console.log(`[Monitoring Alert Email] Dispatched ${params.state} alert to ${primaryContact.email}`);
          }

          const staffEmail = emailSettings.fromEmail || emailSettings.user;
          if (staffEmail) {
            await settingsModule.emailSender.send({
              to: staffEmail,
              subject: `[STAFF ALERT] ${rendered.subject}`,
              html: rendered.html,
              text: rendered.text,
            });
            console.log(`[Monitoring Alert Email] Dispatched alert to staff ${staffEmail}`);
          }
        } catch (e) {
          console.error("[MonitoringModule] Warning: Failed to send incident email:", e);
        }
      },
    };

    this.registerDomainUseCase = new RegisterDomainUseCase(
      this.monitoredDomainRepo,
    );
    this.executeHttpCheckUseCase = new ExecuteHttpCheckUseCase(
      this.monitoredDomainRepo,
      this.domainCheckRepo,
      this.httpChecker,
      this.incidentRepo,
      defaultNotifier,
    );
    this.executeSslCheckUseCase = new ExecuteSslCheckUseCase(
      this.monitoredDomainRepo,
      this.domainCheckRepo,
      this.sslChecker,
    );
    this.executeDnsCheckUseCase = new ExecuteDnsCheckUseCase(
      this.monitoredDomainRepo,
      this.domainCheckRepo,
      this.dnsChecker,
    );
    this.executeRdapCheckUseCase = new ExecuteRdapCheckUseCase(
      this.monitoredDomainRepo,
      this.domainCheckRepo,
      this.rdapChecker,
    );
    this.getPublicStatusPageUseCase = new GetPublicStatusPageUseCase(
      this.monitoredDomainRepo,
      this.domainCheckRepo,
      this.incidentRepo,
      deps?.clientLookup,
    );
  }

  // Facade convenience methods
  async registerDomain(input: RegisterDomainInput): Promise<MonitoredDomainDTO> {
    return this.registerDomainUseCase.execute(input);
  }

  async executeHttpCheck(
    input: ExecuteHttpCheckInput | { domain: MonitoredDomain },
  ): Promise<ExecuteHttpCheckOutput> {
    return this.executeHttpCheckUseCase.execute(input);
  }

  async executeSslCheck(
    input: ExecuteSslCheckInput | { domain: MonitoredDomain },
  ): Promise<ExecuteSslCheckOutput> {
    return this.executeSslCheckUseCase.execute(input);
  }

  async executeDnsCheck(
    input: ExecuteDnsCheckInput | { domain: MonitoredDomain },
  ): Promise<ExecuteDnsCheckOutput> {
    return this.executeDnsCheckUseCase.execute(input);
  }

  async executeRdapCheck(
    input: ExecuteRdapCheckInput | { domain: MonitoredDomain },
  ): Promise<ExecuteRdapCheckOutput> {
    return this.executeRdapCheckUseCase.execute(input);
  }

  async getPublicStatusPage(
    input: GetPublicStatusPageInput,
  ): Promise<PublicStatusPageData | null> {
    return this.getPublicStatusPageUseCase.execute(input);
  }

  async getDomain(id: string): Promise<MonitoredDomain | null> {
    return this.monitoredDomainRepo.findById(id);
  }

  async listDomainsByClient(clientId: string): Promise<MonitoredDomain[]> {
    return this.monitoredDomainRepo.findByClientId(clientId);
  }

  async listActiveIncidents(clientId: string): Promise<Incident[]> {
    return this.incidentRepo.findActiveByClientId(clientId);
  }

  async listRecentIncidents(
    clientId: string,
    limit = 10,
  ): Promise<Incident[]> {
    return this.incidentRepo.findRecentByClientId(clientId, limit);
  }
}

let instance: MonitoringModule | null = null;

export function getMonitoringModule(
  deps?: MonitoringModuleDependencies,
): MonitoringModule {
  if (deps) {
    return new MonitoringModule(deps);
  }
  if (!instance) {
    instance = new MonitoringModule();
  }
  return instance;
}

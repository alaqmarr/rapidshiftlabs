import { DrizzleAdminUserRepository } from "./modules/identity/infrastructure/repositories/drizzle-admin-user.repository";
import { DrizzleClientUserRepository } from "./modules/identity/infrastructure/repositories/drizzle-client-user.repository";
import { DrizzleEventOutboxRepository } from "./shared/infrastructure/events/outbox-repository";
import { DrizzleAuditRepository } from "./modules/audit/infrastructure/drizzle-audit.repository";
import { DrizzleEntitlementRepository } from "./modules/entitlement/infrastructure/repositories/drizzle-entitlement.repository";
import { DrizzleApiKeyRepository } from "./modules/api-platform/infrastructure/repositories/drizzle-api-key.repository";
import { DrizzleSettingsRepository } from "./modules/settings/infrastructure/repositories/drizzle-settings.repository";
import { DrizzleClientRepository } from "./modules/clients/infrastructure/repositories/drizzle-client.repository";
import { DrizzleContractRepository } from "./modules/contracts/infrastructure/repositories/drizzle-contract.repository";
import { DrizzleBillingRepository } from "./modules/billing/infrastructure/repositories/drizzle-billing.repository";
import { DrizzleServerRepository } from "./modules/fleet/infrastructure/repositories/drizzle-server.repository";
import { DrizzlePm2ProcessRepository } from "./modules/fleet/infrastructure/repositories/drizzle-pm2-process.repository";
import { DrizzleProcessActionRepository } from "./modules/fleet/infrastructure/repositories/drizzle-process-action.repository";
import { DrizzleMonitoredDomainRepository } from "./modules/monitoring/infrastructure/repositories/drizzle-monitored-domain.repository";
import { DrizzleDomainCheckRepository } from "./modules/monitoring/infrastructure/repositories/drizzle-domain-check.repository";
import { DrizzleIncidentRepository } from "./modules/monitoring/infrastructure/repositories/drizzle-incident.repository";
import { DrizzleTicketRepository } from "./modules/support/infrastructure/repositories/drizzle-ticket.repository";
import { DrizzleAnalyticsRepository } from "./modules/analytics/infrastructure/repositories/drizzle-analytics.repository";
import { DrizzleVaultRepository } from "./modules/vault/infrastructure/repositories/drizzle-vault.repository";
import { DrizzleReleaseRepository } from "./modules/releases/infrastructure/repositories/drizzle-release.repository";
import { DrizzleChangelogRepository } from "./modules/releases/infrastructure/repositories/drizzle-changelog.repository";
import { DrizzleEmbedRepository } from "./modules/embeds/infrastructure/repositories/drizzle-embed.repository";
import { getRealtimeHub, type RealtimeHub } from "./shared/infrastructure/events/realtime-hub";
import { getWebhookDispatcher, type OutboundWebhookDispatcher } from "./shared/infrastructure/webhooks";
import { getIdentityModule, type IdentityModule } from "./modules/identity";
import { getAuditModule, type AuditModule } from "./modules/audit";
import { EntitlementModule, getEntitlementModule } from "./modules/entitlement";
import { getApiPlatformModule, type ApiPlatformModule, type ITokenSigner } from "./modules/api-platform";
import { getSettingsModule, type SettingsModule } from "./modules/settings";
import { getClientsModule, type ClientsModule } from "./modules/clients";
import { getContractsModule, type ContractsModule } from "./modules/contracts";
import { getBillingModule, type BillingModule } from "./modules/billing";
import { getFleetModule, type FleetModule } from "./modules/fleet";
import { getMonitoringModule, type MonitoringModule } from "./modules/monitoring";
import { getSupportModule, type SupportModule } from "./modules/support";
import { getAnalyticsModule, type AnalyticsModule } from "./modules/analytics";
import { getVaultModule, type VaultModule } from "./modules/vault";
import { getReleasesModule, type ReleasesModule } from "./modules/releases";
import { getEmbedsModule, type EmbedsModule } from "./modules/embeds";
import { uow, type IUnitOfWork } from "./shared/infrastructure/db";

// Ensure entitlementModule has getClientEntitlement helper for Gateway status route
if (typeof (EntitlementModule.prototype as any).getClientEntitlement !== "function") {
  (EntitlementModule.prototype as any).getClientEntitlement = async function (clientId: string, params?: any) {
    const res = await this.evaluate(clientId, params);
    return {
      clientId,
      status: (res.status?.toLowerCase?.() ?? "active") as "active" | "overdue" | "blocked" | "suspended",
      isBlocked: res.isBlocked,
      allowed: res.allowed,
      reason: res.reason ?? undefined,
      manualOverride: res.manualOverrideMode ? { mode: res.manualOverrideMode } : undefined,
      tierStatus: res.tierStatus,
      daysOverdue: res.daysOverdue,
      graceDaysRemaining: res.graceDaysRemaining,
      amountDuePaise: res.amountDuePaise,
      restrictedPrefixes: res.restrictedPrefixes,
      warningMessage: res.warningMessage,
    };
  };
}

export interface Container {
  uow: IUnitOfWork;
  adminRepo: DrizzleAdminUserRepository;
  clientRepo: DrizzleClientUserRepository;
  outboxRepo: DrizzleEventOutboxRepository;
  auditRepo: DrizzleAuditRepository;
  entitlementRepo: DrizzleEntitlementRepository;
  apiKeyRepo: DrizzleApiKeyRepository;
  settingsRepo: DrizzleSettingsRepository;
  clientDirectoryRepo: DrizzleClientRepository;
  contractRepo: DrizzleContractRepository;
  billingRepo: DrizzleBillingRepository;
  realtimeHub: RealtimeHub;
  identityModule: IdentityModule;
  auditModule: AuditModule;
  entitlementModule: EntitlementModule;
  apiPlatformModule: ApiPlatformModule;
  tokenSigner: ITokenSigner;
  settingsModule: SettingsModule;
  clientsModule: ClientsModule;
  contractsModule: ContractsModule;
  billingModule: BillingModule;
  serverRepo: DrizzleServerRepository;
  pm2ProcessRepo: DrizzlePm2ProcessRepository;
  processActionRepo: DrizzleProcessActionRepository;
  fleetModule: FleetModule;
  monitoredDomainRepo: DrizzleMonitoredDomainRepository;
  domainCheckRepo: DrizzleDomainCheckRepository;
  incidentRepo: DrizzleIncidentRepository;
  monitoringModule: MonitoringModule;
  monitoring: MonitoringModule;
  ticketRepo: DrizzleTicketRepository;
  supportModule: SupportModule;
  support: SupportModule;
  analyticsRepo: DrizzleAnalyticsRepository;
  analyticsModule: AnalyticsModule;
  analytics: AnalyticsModule;
  vaultRepo: DrizzleVaultRepository;
  vaultModule: VaultModule;
  vault: VaultModule;
  releaseRepo: DrizzleReleaseRepository;
  changelogRepo: DrizzleChangelogRepository;
  releasesModule: ReleasesModule;
  releases: ReleasesModule;
  embedRepo: DrizzleEmbedRepository;
  embedsModule: EmbedsModule;
  embeds: EmbedsModule;
  webhookDispatcher: OutboundWebhookDispatcher;
}

let containerInstance: Container | null = null;

export function getContainer(): Container {
  if (!containerInstance) {
    const monitoredDomainRepo = new DrizzleMonitoredDomainRepository();
    const domainCheckRepo = new DrizzleDomainCheckRepository();
    const incidentRepo = new DrizzleIncidentRepository();
    const monitoring = getMonitoringModule({
      monitoredDomainRepo,
      domainCheckRepo,
      incidentRepo,
    });

    const apiPlatformModule = getApiPlatformModule();
    const ticketRepo = new DrizzleTicketRepository();
    const support = getSupportModule({ ticketRepo });
    const analyticsRepo = new DrizzleAnalyticsRepository();
    const analytics = getAnalyticsModule({ analyticsRepo });
    const vaultRepo = new DrizzleVaultRepository();
    const vault = getVaultModule({ vaultRepo });
    const releaseRepo = new DrizzleReleaseRepository();
    const changelogRepo = new DrizzleChangelogRepository();
    const settingsRepo = new DrizzleSettingsRepository();
    const clientDirectoryRepo = new DrizzleClientRepository();
    const releases = getReleasesModule({
      releaseRepo,
      changelogRepo,
      settingsRepo,
      clientRepo: clientDirectoryRepo,
    });
    const embedRepo = new DrizzleEmbedRepository();
    const embeds = getEmbedsModule({ embedRepo });

    containerInstance = {
      uow,
      adminRepo: new DrizzleAdminUserRepository(),
      clientRepo: new DrizzleClientUserRepository(),
      outboxRepo: new DrizzleEventOutboxRepository(),
      auditRepo: new DrizzleAuditRepository(),
      entitlementRepo: new DrizzleEntitlementRepository(),
      apiKeyRepo: new DrizzleApiKeyRepository(),
      settingsRepo: new DrizzleSettingsRepository(),
      clientDirectoryRepo: new DrizzleClientRepository(),
      contractRepo: new DrizzleContractRepository(),
      billingRepo: new DrizzleBillingRepository(),
      serverRepo: new DrizzleServerRepository(),
      pm2ProcessRepo: new DrizzlePm2ProcessRepository(),
      processActionRepo: new DrizzleProcessActionRepository(),
      realtimeHub: getRealtimeHub(),
      identityModule: getIdentityModule(),
      auditModule: getAuditModule(),
      entitlementModule: getEntitlementModule(),
      apiPlatformModule,
      tokenSigner: apiPlatformModule.tokenSigner,
      settingsModule: getSettingsModule(),
      clientsModule: getClientsModule(),
      contractsModule: getContractsModule(),
      billingModule: getBillingModule(),
      fleetModule: getFleetModule(),
      monitoredDomainRepo,
      domainCheckRepo,
      incidentRepo,
      monitoringModule: monitoring,
      monitoring,
      ticketRepo,
      supportModule: support,
      support,
      analyticsRepo,
      analyticsModule: analytics,
      analytics,
      vaultRepo,
      vaultModule: vault,
      vault,
      releaseRepo,
      changelogRepo,
      releasesModule: releases,
      releases,
      embedRepo,
      embedsModule: embeds,
      embeds,
      webhookDispatcher: getWebhookDispatcher(),
    };
  }
  return containerInstance;
}

export const container: Container = new Proxy({} as Container, {
  get(_target, prop: string | symbol) {
    return (getContainer() as any)[prop];
  },
});



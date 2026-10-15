import { AggregateRoot } from "../../../../shared/kernel/domain-event";
import { newId } from "../../../../shared/kernel/id";
import { invariant } from "../../../../shared/kernel/errors";
import type {
  DomainStatus,
  SslStatus,
  DnsStatus,
} from "../value-objects/domain-status.vo";
import {
  type CheckConfigurations,
  createDefaultCheckConfigurations,
} from "../value-objects/check-config.vo";
import { createDomainDownEvent } from "../events/domain-down.event";
import { createDomainRecoveredEvent } from "../events/domain-recovered.event";
import { createSslExpiringEvent } from "../events/ssl-expiring.event";

export interface MonitoredDomainProps {
  id: string; // dom_...
  clientId: string; // cli_...
  projectId: string | null;
  name: string;
  hostname: string;
  targetUrl: string;
  port: number;
  config: CheckConfigurations;
  status: DomainStatus;
  consecutiveFailures: number;
  activeIncidentId: string | null;
  // Snapshot timestamps & values
  lastHttpCheckAt: number | null;
  lastHttpStatus: number | null;
  lastLatencyMs: number | null;
  lastHttpError: string | null;
  lastSslCheckAt: number | null;
  sslStatus: SslStatus | null;
  sslExpiresAt: number | null;
  sslDaysRemaining: number | null;
  sslIssuer: string | null;
  sslError: string | null;
  lastDnsCheckAt: number | null;
  dnsStatus: DnsStatus | null;
  dnsDriftDetails: string | null;
  lastRdapCheckAt: number | null;
  domainExpiresAt: number | null;
  domainRegistrar: string | null;
  resolvedIp: string | null;
  createdAt: number;
  updatedAt: number;
}

export class MonitoredDomain extends AggregateRoot<MonitoredDomainProps> {
  private constructor(props: MonitoredDomainProps) {
    super(props);
  }

  public static create(params: {
    clientId: string;
    projectId?: string | null;
    name: string;
    hostname: string;
    targetUrl?: string;
    port?: number;
    config?: Partial<{
      http: Partial<CheckConfigurations["http"]>;
      ssl: Partial<CheckConfigurations["ssl"]>;
      dns: Partial<CheckConfigurations["dns"]>;
      rdap: Partial<CheckConfigurations["rdap"]>;
    }>;
  }): MonitoredDomain {
    invariant(params.clientId, "missing_client_id", "Client ID is required");
    invariant(params.name?.trim(), "missing_name", "Name is required");
    invariant(params.hostname?.trim(), "missing_hostname", "Hostname is required");

    const normalizedHostname = params.hostname
      .trim()
      .toLowerCase()
      .replace(/^https?:\/\//, "")
      .replace(/\/.*$/, "");

    const targetUrl = params.targetUrl?.trim() || `https://${normalizedHostname}`;
    const now = Date.now();
    const config = createDefaultCheckConfigurations(params.config);

    return new MonitoredDomain({
      id: newId("dom"),
      clientId: params.clientId,
      projectId: params.projectId ?? null,
      name: params.name.trim(),
      hostname: normalizedHostname,
      targetUrl,
      port: params.port ?? 443,
      config,
      status: "pending",
      consecutiveFailures: 0,
      activeIncidentId: null,
      lastHttpCheckAt: null,
      lastHttpStatus: null,
      lastLatencyMs: null,
      lastHttpError: null,
      lastSslCheckAt: null,
      sslStatus: null,
      sslExpiresAt: null,
      sslDaysRemaining: null,
      sslIssuer: null,
      sslError: null,
      lastDnsCheckAt: null,
      dnsStatus: null,
      dnsDriftDetails: null,
      lastRdapCheckAt: null,
      domainExpiresAt: null,
      domainRegistrar: null,
      resolvedIp: null,
      createdAt: now,
      updatedAt: now,
    });
  }

  public static reconstitute(props: MonitoredDomainProps): MonitoredDomain {
    return new MonitoredDomain({
      ...props,
      config: structuredClone(props.config),
    });
  }

  public override toState(): Readonly<MonitoredDomainProps> {
    return Object.freeze({
      ...this.props,
      config: structuredClone(this.props.config),
    });
  }

  // Getters
  public get id(): string { return this.props.id; }
  public get clientId(): string { return this.props.clientId; }
  public get projectId(): string | null { return this.props.projectId; }
  public get name(): string { return this.props.name; }
  public get hostname(): string { return this.props.hostname; }
  public get targetUrl(): string { return this.props.targetUrl; }
  public get port(): number { return this.props.port; }
  public get config(): CheckConfigurations { return structuredClone(this.props.config); }
  public get status(): DomainStatus { return this.props.status; }
  public get consecutiveFailures(): number { return this.props.consecutiveFailures; }
  public get activeIncidentId(): string | null { return this.props.activeIncidentId; }
  public get lastHttpCheckAt(): number | null { return this.props.lastHttpCheckAt; }
  public get lastHttpStatus(): number | null { return this.props.lastHttpStatus; }
  public get lastLatencyMs(): number | null { return this.props.lastLatencyMs; }
  public get lastHttpError(): string | null { return this.props.lastHttpError; }
  public get lastSslCheckAt(): number | null { return this.props.lastSslCheckAt; }
  public get sslStatus(): SslStatus | null { return this.props.sslStatus; }
  public get sslExpiresAt(): number | null { return this.props.sslExpiresAt; }
  public get sslDaysRemaining(): number | null { return this.props.sslDaysRemaining; }
  public get sslIssuer(): string | null { return this.props.sslIssuer; }
  public get sslError(): string | null { return this.props.sslError; }
  public get lastDnsCheckAt(): number | null { return this.props.lastDnsCheckAt; }
  public get dnsStatus(): DnsStatus | null { return this.props.dnsStatus; }
  public get dnsDriftDetails(): string | null { return this.props.dnsDriftDetails; }
  public get lastRdapCheckAt(): number | null { return this.props.lastRdapCheckAt; }
  public get domainExpiresAt(): number | null { return this.props.domainExpiresAt; }
  public get domainRegistrar(): string | null { return this.props.domainRegistrar; }
  public get resolvedIp(): string | null { return this.props.resolvedIp; }
  public get createdAt(): number { return this.props.createdAt; }
  public get updatedAt(): number { return this.props.updatedAt; }

  // State transitions & check recording

  public recordHttpCheckResult(params: {
    isUp: boolean;
    statusCode?: number | null;
    latencyMs?: number | null;
    errorMessage?: string | null;
    now?: number;
  }): {
    becameDown: boolean;
    recovered: boolean;
    incidentOpened: boolean;
    incidentResolved: boolean;
  } {
    const at = params.now ?? Date.now();
    const threshold = this.props.config.http.consecutiveThreshold ?? 3;

    this.props.lastHttpCheckAt = at;
    this.props.lastHttpStatus = params.statusCode ?? null;
    this.props.lastLatencyMs = params.latencyMs ?? null;
    this.props.updatedAt = at;

    if (this.props.status === "paused") {
      if (!params.isUp) {
        this.props.lastHttpError = params.errorMessage ?? "HTTP check failed";
      }
      return {
        becameDown: false,
        recovered: false,
        incidentOpened: false,
        incidentResolved: false,
      };
    }

    if (params.isUp) {
      const wasDown = this.props.status === "down";
      const previousIncidentId = this.props.activeIncidentId;

      this.props.consecutiveFailures = 0;
      this.props.lastHttpError = null;

      const hasDegradedCondition =
        this.props.sslStatus === "expired" ||
        this.props.sslStatus === "invalid" ||
        this.props.sslStatus === "expiring_soon" ||
        this.props.sslStatus === "unreachable" ||
        this.props.dnsStatus === "resolution_failed" ||
        this.props.dnsStatus === "drift_detected";

      if (wasDown) {
        this.props.status = hasDegradedCondition ? "degraded" : "up";
        this.props.activeIncidentId = null;
        this.raise(
          createDomainRecoveredEvent({
            domainId: this.props.id,
            clientId: this.props.clientId,
            hostname: this.props.hostname,
            incidentId: previousIncidentId,
            recoveredAt: at,
          }),
        );
        return {
          becameDown: false,
          recovered: true,
          incidentOpened: false,
          incidentResolved: true,
        };
      } else if (this.props.status === "pending") {
        this.props.status = hasDegradedCondition ? "degraded" : "up";
      }

      return {
        becameDown: false,
        recovered: false,
        incidentOpened: false,
        incidentResolved: false,
      };
    } else {
      this.props.consecutiveFailures += 1;
      this.props.lastHttpError = params.errorMessage ?? "HTTP check failed";

      // False-positive guard: only mark DOWN when consecutive failures reach or exceed threshold
      if (
        this.props.status !== "down" &&
        this.props.consecutiveFailures >= threshold
      ) {
        this.props.status = "down";
        this.raise(
          createDomainDownEvent({
            domainId: this.props.id,
            clientId: this.props.clientId,
            hostname: this.props.hostname,
            failureCount: this.props.consecutiveFailures,
            reason: this.props.lastHttpError,
            startedAt: at,
            incidentId: this.props.activeIncidentId,
          }),
        );
        return {
          becameDown: true,
          recovered: false,
          incidentOpened: true,
          incidentResolved: false,
        };
      }

      return {
        becameDown: false,
        recovered: false,
        incidentOpened: false,
        incidentResolved: false,
      };
    }
  }

  public recordHttpSuccess(params: {
    statusCode?: number | null;
    latencyMs?: number | null;
    now?: number;
  }) {
    return this.recordHttpCheckResult({
      isUp: true,
      statusCode: params.statusCode,
      latencyMs: params.latencyMs,
      now: params.now,
    });
  }

  public recordHttpFailure(params: {
    errorMessage?: string | null;
    statusCode?: number | null;
    latencyMs?: number | null;
    now?: number;
  }) {
    return this.recordHttpCheckResult({
      isUp: false,
      errorMessage: params.errorMessage,
      statusCode: params.statusCode,
      latencyMs: params.latencyMs,
      now: params.now,
    });
  }

  public recordSslCheckResult(params: {
    isValid: boolean;
    expiresAt?: number | null;
    daysRemaining?: number | null;
    issuer?: string | null;
    error?: string | null;
    now?: number;
  }): void {
    const at = params.now ?? Date.now();
    this.props.lastSslCheckAt = at;
    this.props.sslExpiresAt = params.expiresAt ?? null;
    this.props.sslDaysRemaining = params.daysRemaining ?? null;
    this.props.sslIssuer = params.issuer ?? null;
    this.props.sslError = params.error ?? null;
    this.props.updatedAt = at;

    if (!params.isValid) {
      this.props.sslStatus = "expired";
      if (this.props.status === "up") {
        this.props.status = "degraded";
      }
    } else if (params.daysRemaining != null && params.daysRemaining <= 14) {
      this.props.sslStatus = "expiring_soon";
      if (this.props.status === "up") {
        this.props.status = "degraded";
      }
      this.raise(
        createSslExpiringEvent({
          domainId: this.props.id,
          clientId: this.props.clientId,
          hostname: this.props.hostname,
          daysRemaining: params.daysRemaining,
          expiresAt: params.expiresAt ?? at,
          issuer: params.issuer,
        }),
      );
    } else {
      this.props.sslStatus = "valid";
      if (
        this.props.status === "degraded" &&
        this.props.consecutiveFailures === 0 &&
        (this.props.dnsStatus === "healthy" || this.props.dnsStatus === null)
      ) {
        this.props.status = "up";
      }
    }
  }

  public recordDnsCheckResult(params: {
    healthy: boolean;
    driftDetected?: boolean;
    driftDetails?: string | null;
    resolvedIp?: string | null;
    now?: number;
  }): void {
    const at = params.now ?? Date.now();
    this.props.lastDnsCheckAt = at;
    if (params.resolvedIp) {
      this.props.resolvedIp = params.resolvedIp;
    }
    this.props.updatedAt = at;

    if (!params.healthy) {
      this.props.dnsStatus = "resolution_failed";
      if (this.props.status === "up") {
        this.props.status = "degraded";
      }
    } else if (params.driftDetected) {
      this.props.dnsStatus = "drift_detected";
      this.props.dnsDriftDetails = params.driftDetails ?? null;
    } else {
      this.props.dnsStatus = "healthy";
      this.props.dnsDriftDetails = null;
      if (
        this.props.status === "degraded" &&
        this.props.consecutiveFailures === 0 &&
        (this.props.sslStatus === "valid" || this.props.sslStatus === null)
      ) {
        this.props.status = "up";
      }
    }
  }

  public recordRdapCheckResult(params: {
    expiresAt?: number | null;
    registrar?: string | null;
    now?: number;
  }): void {
    const at = params.now ?? Date.now();
    this.props.lastRdapCheckAt = at;
    this.props.domainExpiresAt = params.expiresAt ?? null;
    this.props.domainRegistrar = params.registrar ?? null;
    this.props.updatedAt = at;
  }

  public linkIncident(incidentId: string): void {
    this.props.activeIncidentId = incidentId;
    this.props.updatedAt = Date.now();
  }

  public clearIncident(): void {
    this.props.activeIncidentId = null;
    this.props.updatedAt = Date.now();
  }

  public pause(): void {
    this.props.status = "paused";
    this.props.updatedAt = Date.now();
  }

  public resume(): void {
    this.props.status = "pending";
    this.props.consecutiveFailures = 0;
    this.props.updatedAt = Date.now();
  }

  public updateConfig(config: Partial<{
    http: Partial<CheckConfigurations["http"]>;
    ssl: Partial<CheckConfigurations["ssl"]>;
    dns: Partial<CheckConfigurations["dns"]>;
    rdap: Partial<CheckConfigurations["rdap"]>;
  }>): void {
    this.props.config = {
      http: {
        ...this.props.config.http,
        ...(config.http ?? {}),
      },
      ssl: {
        ...this.props.config.ssl,
        ...(config.ssl ?? {}),
      },
      dns: {
        ...this.props.config.dns,
        ...(config.dns ?? {}),
      },
      rdap: {
        ...this.props.config.rdap,
        ...(config.rdap ?? {}),
      },
    };
    this.props.updatedAt = Date.now();
  }
}

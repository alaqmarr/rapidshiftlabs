import type {
  DomainStatus,
  SslStatus,
  DnsStatus,
} from "../../domain/value-objects/domain-status.vo";
import type { CheckConfigurations } from "../../domain/value-objects/check-config.vo";

export interface RegisterDomainInput {
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
}

export interface ExecuteHttpCheckInput {
  domainId: string;
}

export interface ExecuteSslCheckInput {
  domainId: string;
}

export interface ExecuteDnsCheckInput {
  domainId: string;
}

export interface ExecuteRdapCheckInput {
  domainId: string;
}

export interface ExecuteCheckResultSummary {
  domainId: string;
  hostname: string;
  status: DomainStatus;
  checkType: "http" | "ssl" | "dns" | "rdap";
  timestamp: number;
  success: boolean;
  details: Record<string, any>;
}

export type MonitoredDomainDTO = import("../../domain/entities/monitored-domain.entity").MonitoredDomain;


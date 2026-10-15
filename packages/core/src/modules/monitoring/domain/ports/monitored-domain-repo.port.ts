import type { MonitoredDomain } from "../entities/monitored-domain.entity";

export interface MonitoredDomainRepositoryPort {
  findById(id: string): Promise<MonitoredDomain | null>;
  findByClientId(clientId: string): Promise<MonitoredDomain[]>;
  findByHostname(hostname: string): Promise<MonitoredDomain | null>;
  listAll?(): Promise<MonitoredDomain[]>;
  findDueForHttpCheck(limit?: number): Promise<MonitoredDomain[]>;
  findDueForSslCheck(limit?: number): Promise<MonitoredDomain[]>;
  findDueForDnsCheck(limit?: number): Promise<MonitoredDomain[]>;
  findDueForRdapCheck?(limit?: number): Promise<MonitoredDomain[]>;
  listDueForHttpCheck(dueBeforeEpochMs: number, limit?: number): Promise<MonitoredDomain[]>;
  listDueForSslCheck(dueBeforeEpochMs: number, limit?: number): Promise<MonitoredDomain[]>;
  listDueForDnsCheck(dueBeforeEpochMs: number, limit?: number): Promise<MonitoredDomain[]>;
  save(domain: MonitoredDomain): Promise<void>;
  delete(id: string): Promise<void>;
}

import { eq, and, ne, isNull, lte, or, asc } from "drizzle-orm";
import type { LibSQLDatabase } from "drizzle-orm/libsql";
import { getDb, uow } from "../../../../shared/infrastructure/db";
import {
  monitoredDomainsTable,
  type MonitoredDomainRow,
} from "../../../../shared/infrastructure/db/schema/monitoring";
import { outbox } from "../../../../shared/infrastructure/db/schema/outbox";
import type { MonitoredDomainRepositoryPort } from "../../domain/ports/monitored-domain-repo.port";
import {
  MonitoredDomain,
  type MonitoredDomainProps,
} from "../../domain/entities/monitored-domain.entity";
import type { CheckConfigurations } from "../../domain/value-objects/check-config.vo";

export class DrizzleMonitoredDomainRepository
  implements MonitoredDomainRepositoryPort
{
  constructor(private readonly db: LibSQLDatabase<any> = getDb("core")) {}

  async findById(id: string): Promise<MonitoredDomain | null> {
    const rows = await this.db
      .select()
      .from(monitoredDomainsTable)
      .where(eq(monitoredDomainsTable.id, id))
      .limit(1);

    const row = rows[0];
    if (!row) return null;
    return this.mapToEntity(row);
  }

  async findByClientId(clientId: string): Promise<MonitoredDomain[]> {
    const rows = await this.db
      .select()
      .from(monitoredDomainsTable)
      .where(eq(monitoredDomainsTable.clientId, clientId));

    return rows.map((r) => this.mapToEntity(r));
  }

  async findByHostname(hostname: string): Promise<MonitoredDomain | null> {
    const normalized = hostname
      .trim()
      .toLowerCase()
      .replace(/^https?:\/\//, "")
      .replace(/\/.*$/, "");

    const rows = await this.db
      .select()
      .from(monitoredDomainsTable)
      .where(eq(monitoredDomainsTable.hostname, normalized))
      .limit(1);

    const row = rows[0];
    if (!row) return null;
    return this.mapToEntity(row);
  }

  async listAll(): Promise<MonitoredDomain[]> {
    const rows = await this.db.select().from(monitoredDomainsTable);
    return rows.map((r) => this.mapToEntity(r));
  }

  async findDueForHttpCheck(limit = 50): Promise<MonitoredDomain[]> {
    const rows = await this.db
      .select()
      .from(monitoredDomainsTable)
      .where(ne(monitoredDomainsTable.status, "paused"))
      .orderBy(asc(monitoredDomainsTable.lastHttpCheckAt))
      .limit(limit);

    const now = Date.now();
    const due = rows.filter((r) => {
      const cfg = (
        typeof r.config === "string" ? JSON.parse(r.config) : r.config
      ) as CheckConfigurations;
      if (!cfg?.http?.enabled) return false;
      const last = r.lastHttpCheckAt ?? 0;
      const intervalMs = (cfg?.http?.intervalSeconds ?? 60) * 1000;
      return now - last >= intervalMs;
    });

    return due.map((r) => this.mapToEntity(r));
  }

  async listDueForHttpCheck(
    dueBeforeEpochMs: number,
    limit = 50,
  ): Promise<MonitoredDomain[]> {
    const rows = await this.db
      .select()
      .from(monitoredDomainsTable)
      .where(
        and(
          ne(monitoredDomainsTable.status, "paused"),
          or(
            isNull(monitoredDomainsTable.lastHttpCheckAt),
            lte(monitoredDomainsTable.lastHttpCheckAt, dueBeforeEpochMs),
          ),
        ),
      )
      .orderBy(asc(monitoredDomainsTable.lastHttpCheckAt))
      .limit(limit);

    return rows.map((r) => this.mapToEntity(r));
  }

  async findDueForSslCheck(limit = 50): Promise<MonitoredDomain[]> {
    const rows = await this.db
      .select()
      .from(monitoredDomainsTable)
      .where(ne(monitoredDomainsTable.status, "paused"))
      .orderBy(asc(monitoredDomainsTable.lastSslCheckAt))
      .limit(limit);

    const now = Date.now();
    const due = rows.filter((r) => {
      const cfg = (
        typeof r.config === "string" ? JSON.parse(r.config) : r.config
      ) as CheckConfigurations;
      if (!cfg?.ssl?.enabled) return false;
      const last = r.lastSslCheckAt ?? 0;
      const intervalMs = (cfg?.ssl?.intervalSeconds ?? 21_600) * 1000;
      return now - last >= intervalMs;
    });

    return due.map((r) => this.mapToEntity(r));
  }

  async listDueForSslCheck(
    dueBeforeEpochMs: number,
    limit = 50,
  ): Promise<MonitoredDomain[]> {
    const rows = await this.db
      .select()
      .from(monitoredDomainsTable)
      .where(
        and(
          ne(monitoredDomainsTable.status, "paused"),
          or(
            isNull(monitoredDomainsTable.lastSslCheckAt),
            lte(monitoredDomainsTable.lastSslCheckAt, dueBeforeEpochMs),
          ),
        ),
      )
      .orderBy(asc(monitoredDomainsTable.lastSslCheckAt))
      .limit(limit);

    return rows.map((r) => this.mapToEntity(r));
  }

  async findDueForDnsCheck(limit = 50): Promise<MonitoredDomain[]> {
    const rows = await this.db
      .select()
      .from(monitoredDomainsTable)
      .where(ne(monitoredDomainsTable.status, "paused"))
      .orderBy(asc(monitoredDomainsTable.lastDnsCheckAt))
      .limit(limit);

    const now = Date.now();
    const due = rows.filter((r) => {
      const cfg = (
        typeof r.config === "string" ? JSON.parse(r.config) : r.config
      ) as CheckConfigurations;
      if (!cfg?.dns?.enabled) return false;
      const last = r.lastDnsCheckAt ?? 0;
      const intervalMs = (cfg?.dns?.intervalSeconds ?? 900) * 1000;
      return now - last >= intervalMs;
    });

    return due.map((r) => this.mapToEntity(r));
  }

  async listDueForDnsCheck(
    dueBeforeEpochMs: number,
    limit = 50,
  ): Promise<MonitoredDomain[]> {
    const rows = await this.db
      .select()
      .from(monitoredDomainsTable)
      .where(
        and(
          ne(monitoredDomainsTable.status, "paused"),
          or(
            isNull(monitoredDomainsTable.lastDnsCheckAt),
            lte(monitoredDomainsTable.lastDnsCheckAt, dueBeforeEpochMs),
          ),
        ),
      )
      .orderBy(asc(monitoredDomainsTable.lastDnsCheckAt))
      .limit(limit);

    return rows.map((r) => this.mapToEntity(r));
  }

  async findDueForRdapCheck(limit = 50): Promise<MonitoredDomain[]> {
    const rows = await this.db
      .select()
      .from(monitoredDomainsTable)
      .where(ne(monitoredDomainsTable.status, "paused"))
      .orderBy(asc(monitoredDomainsTable.lastRdapCheckAt))
      .limit(limit);

    const now = Date.now();
    const due = rows.filter((r) => {
      const cfg = (
        typeof r.config === "string" ? JSON.parse(r.config) : r.config
      ) as CheckConfigurations;
      if (cfg?.rdap?.enabled === false) return false;
      const last = r.lastRdapCheckAt ?? 0;
      const intervalMs = (cfg?.rdap?.intervalSeconds ?? 86_400) * 1000;
      return now - last >= intervalMs;
    });

    return due.map((r) => this.mapToEntity(r));
  }

  async save(domain: MonitoredDomain): Promise<void> {
    await uow.runInTransaction("core", async (tx) => {
      const state = domain.toState();
      const existing = await tx
        .select({ id: monitoredDomainsTable.id })
        .from(monitoredDomainsTable)
        .where(eq(monitoredDomainsTable.id, state.id))
        .limit(1);

      const values = {
        id: state.id,
        clientId: state.clientId,
        projectId: state.projectId,
        name: state.name,
        hostname: state.hostname,
        targetUrl: state.targetUrl,
        port: state.port,
        config: state.config,
        status: state.status,
        consecutiveFailures: state.consecutiveFailures,
        activeIncidentId: state.activeIncidentId,
        lastHttpCheckAt: state.lastHttpCheckAt,
        lastHttpStatus: state.lastHttpStatus,
        lastLatencyMs: state.lastLatencyMs,
        lastHttpError: state.lastHttpError,
        lastSslCheckAt: state.lastSslCheckAt,
        sslStatus: state.sslStatus,
        sslExpiresAt: state.sslExpiresAt,
        sslDaysRemaining: state.sslDaysRemaining,
        sslIssuer: state.sslIssuer,
        sslError: state.sslError,
        lastDnsCheckAt: state.lastDnsCheckAt,
        dnsStatus: state.dnsStatus,
        dnsDriftDetails: state.dnsDriftDetails,
        lastRdapCheckAt: state.lastRdapCheckAt,
        domainExpiresAt: state.domainExpiresAt,
        domainRegistrar: state.domainRegistrar,
        resolvedIp: state.resolvedIp,
        createdAt: state.createdAt,
        updatedAt: state.updatedAt,
      };

      if (existing.length > 0) {
        await tx
          .update(monitoredDomainsTable)
          .set(values)
          .where(eq(monitoredDomainsTable.id, state.id));
      } else {
        await tx.insert(monitoredDomainsTable).values(values);
      }

      // Flush any domain events to outbox
      const events = domain.pullEvents();
      if (events.length > 0) {
        const outboxRows = events.map((event) => ({
          id: event.id,
          type: event.type,
          aggregateType: event.aggregateType,
          aggregateId: event.aggregateId,
          clientId: event.clientId ?? null,
          payload: JSON.stringify(event.payload),
          occurredAt: event.occurredAt,
          status: "pending" as const,
          attempts: 0,
          maxAttempts: 5,
          nextRetryAt: event.occurredAt,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        }));
        await tx.insert(outbox).values(outboxRows);
      }
    });
  }

  async delete(id: string): Promise<void> {
    await uow.runInTransaction("core", async (tx) => {
      await tx
        .delete(monitoredDomainsTable)
        .where(eq(monitoredDomainsTable.id, id));
    });
  }

  private mapToEntity(row: MonitoredDomainRow): MonitoredDomain {
    const config = (
      typeof row.config === "string" ? JSON.parse(row.config) : row.config
    ) as CheckConfigurations;

    const props: MonitoredDomainProps = {
      id: row.id,
      clientId: row.clientId,
      projectId: row.projectId,
      name: row.name,
      hostname: row.hostname,
      targetUrl: row.targetUrl,
      port: row.port,
      config,
      status: row.status as any,
      consecutiveFailures: row.consecutiveFailures,
      activeIncidentId: row.activeIncidentId,
      lastHttpCheckAt: row.lastHttpCheckAt,
      lastHttpStatus: row.lastHttpStatus,
      lastLatencyMs: row.lastLatencyMs,
      lastHttpError: row.lastHttpError,
      lastSslCheckAt: row.lastSslCheckAt,
      sslStatus: row.sslStatus as any,
      sslExpiresAt: row.sslExpiresAt,
      sslDaysRemaining: row.sslDaysRemaining,
      sslIssuer: row.sslIssuer,
      sslError: row.sslError,
      lastDnsCheckAt: row.lastDnsCheckAt,
      dnsStatus: row.dnsStatus as any,
      dnsDriftDetails: row.dnsDriftDetails,
      lastRdapCheckAt: row.lastRdapCheckAt,
      domainExpiresAt: row.domainExpiresAt,
      domainRegistrar: row.domainRegistrar,
      resolvedIp: row.resolvedIp,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };

    return MonitoredDomain.reconstitute(props);
  }
}

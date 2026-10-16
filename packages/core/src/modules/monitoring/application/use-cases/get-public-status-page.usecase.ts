import { eq, or, sql } from "drizzle-orm";
import type { MonitoredDomainRepositoryPort } from "../../domain/ports/monitored-domain-repo.port";
import type { DomainCheckRepositoryPort } from "../../domain/ports/domain-check-repo.port";
import type { IncidentRepositoryPort } from "../../domain/ports/incident-repo.port";
import type {
  PublicStatusPageData,
  PublicStatusPageDomain,
  PublicStatusPageActiveIncident,
  PublicStatusPageRecentIncident,
  GetPublicStatusPageInput,
} from "../dtos/status-page.dto";
import { getDb } from "../../../../shared/infrastructure/db";
import { clients } from "../../../../shared/infrastructure/db/schema/clients";
import { statusPagesTable } from "../../../../shared/infrastructure/db/schema/monitoring";

export type ClientLookupFn = (
  clientSlug: string,
) => Promise<{ id: string; name: string; slug: string } | null>;

export class GetPublicStatusPageUseCase {
  constructor(
    private readonly monitoredDomainRepo: MonitoredDomainRepositoryPort,
    private readonly domainCheckRepo: DomainCheckRepositoryPort,
    private readonly incidentRepo: IncidentRepositoryPort,
    private readonly clientLookup?: ClientLookupFn,
  ) {}

  async execute(
    input: GetPublicStatusPageInput,
  ): Promise<PublicStatusPageData | null> {
    const rawIdentifier = input.clientSlug.trim();
    const slug = rawIdentifier.toLowerCase();
    if (!slug) return null;

    // 1. Resolve client (by slug OR by client ID, case-insensitively)
    let clientInfo: { id: string; name: string; slug: string } | null = null;

    if (this.clientLookup) {
      clientInfo =
        (await this.clientLookup(slug)) ??
        (rawIdentifier !== slug ? await this.clientLookup(rawIdentifier) : null);
    } else {
      try {
        const db = getDb("core");
        // Lookup from clients table by slug OR id (exact or case-insensitive)
        const clientRows = await db
          .select({
            id: clients.id,
            name: clients.name,
            slug: clients.slug,
          })
          .from(clients)
          .where(
            or(
              eq(clients.slug, slug),
              eq(clients.id, rawIdentifier),
              sql`lower(${clients.id}) = ${slug}`,
              sql`lower(${clients.slug}) = ${slug}`,
            ),
          )
          .limit(1);

        if (clientRows.length > 0 && clientRows[0]) {
          clientInfo = clientRows[0];
        } else {
          // Lookup status page table fallback
          const pageRows = await db
            .select({
              clientId: statusPagesTable.clientId,
              title: statusPagesTable.title,
              slug: statusPagesTable.slug,
            })
            .from(statusPagesTable)
            .where(eq(statusPagesTable.slug, slug))
            .limit(1);

          if (pageRows.length > 0 && pageRows[0]) {
            const page = pageRows[0];
            const clientMatch = await db
              .select({
                id: clients.id,
                name: clients.name,
                slug: clients.slug,
              })
              .from(clients)
              .where(eq(clients.id, page.clientId))
              .limit(1);

            clientInfo = clientMatch[0] ?? {
              id: page.clientId,
              name: page.title,
              slug: page.slug,
            };
          }
        }
      } catch {
        // If DB not ready or error
        clientInfo = null;
      }
    }

    if (!clientInfo) {
      return null;
    }

    // 2. Load all domains for client
    const domains = await this.monitoredDomainRepo.findByClientId(clientInfo.id);
    const domainMap = new Map(domains.map((d) => [d.id, d]));

    // 3. Load active & recent incidents
    const rawActiveIncidents = await this.incidentRepo.findActiveByClientId(
      clientInfo.id,
    );
    const rawRecentIncidents = await this.incidentRepo.findRecentByClientId(
      clientInfo.id,
      10,
    );

    // 4. Compute metrics for each domain
    const now = Date.now();
    const ms24h = 24 * 3600 * 1000;
    const ms7d = 7 * ms24h;
    const ms30d = 30 * ms24h;
    const ms90d = 90 * ms24h;

    const domainItems: PublicStatusPageDomain[] = await Promise.all(
      domains.map(async (domain) => {
        const [u24, u7, u30, u90, dailyBars] = await Promise.all([
          this.domainCheckRepo.getUptimePercentage(domain.id, now - ms24h),
          this.domainCheckRepo.getUptimePercentage(domain.id, now - ms7d),
          this.domainCheckRepo.getUptimePercentage(domain.id, now - ms30d),
          this.domainCheckRepo.getUptimePercentage(domain.id, now - ms90d),
          this.domainCheckRepo.getDailyBars(domain.id, 90),
        ]);

        return {
          id: domain.id,
          name: domain.name,
          hostname: domain.hostname,
          status: domain.status,
          uptime24h: u24,
          uptime7d: u7,
          uptime30d: u30,
          uptime90d: u90,
          dailyHealthBars: dailyBars.map((b) => ({
            date: b.date,
            status: b.status,
          })),
          sslDaysRemaining: domain.sslDaysRemaining,
        };
      }),
    );

    // 5. Build active incidents
    const activeIncidents: PublicStatusPageActiveIncident[] =
      rawActiveIncidents.map((inc) => {
        const domain = domainMap.get(inc.domainId);
        return {
          id: inc.id,
          domainId: inc.domainId,
          domainName: domain ? domain.name : "Unknown Domain",
          type: inc.type,
          severity: inc.severity,
          startedAt: inc.startedAt,
          reason: inc.reason,
        };
      });

    // 6. Build recent incidents
    const recentIncidents: PublicStatusPageRecentIncident[] =
      rawRecentIncidents.map((inc) => {
        const domain = domainMap.get(inc.domainId);
        return {
          id: inc.id,
          domainId: inc.domainId,
          domainName: domain ? domain.name : "Unknown Domain",
          type: inc.type,
          severity: inc.severity,
          startedAt: inc.startedAt,
          resolvedAt: inc.resolvedAt,
          durationSeconds: inc.durationSeconds,
          reason: inc.reason,
        };
      });

    // 7. Calculate overall status
    let overallStatus: "operational" | "degraded" | "outage" = "operational";

    const hasOutage =
      domainItems.some((d) => d.status === "down") ||
      activeIncidents.some(
        (inc) => inc.severity === "critical" || inc.type === "http",
      );

    const hasDegraded =
      domainItems.some((d) => d.status === "degraded") ||
      activeIncidents.length > 0;

    if (hasOutage) {
      overallStatus = "outage";
    } else if (hasDegraded) {
      overallStatus = "degraded";
    } else {
      overallStatus = "operational";
    }

    return {
      client: clientInfo,
      overallStatus,
      domains: domainItems,
      activeIncidents,
      recentIncidents,
    };
  }
}

import type { DomainStatus } from "../../domain/value-objects/domain-status.vo";

export interface PublicStatusPageDomain {
  id: string;
  name: string;
  hostname: string;
  status: DomainStatus;
  uptime24h: number;
  uptime7d: number;
  uptime30d: number;
  uptime90d: number;
  dailyHealthBars: Array<{ date: string; status: "up" | "degraded" | "down" }>;
  sslDaysRemaining: number | null;
}

export interface PublicStatusPageActiveIncident {
  id: string;
  domainId: string;
  domainName: string;
  type: string;
  severity: string;
  startedAt: number;
  reason: string;
}

export interface PublicStatusPageRecentIncident {
  id: string;
  domainId: string;
  domainName: string;
  type: string;
  severity: string;
  startedAt: number;
  resolvedAt: number | null;
  durationSeconds: number | null;
  reason: string;
}

export interface PublicStatusPageData {
  client: {
    id: string;
    name: string;
    slug: string;
  };
  overallStatus: "operational" | "degraded" | "outage";
  domains: PublicStatusPageDomain[];
  activeIncidents: PublicStatusPageActiveIncident[];
  recentIncidents: PublicStatusPageRecentIncident[];
}

export interface GetPublicStatusPageInput {
  clientSlug: string;
}

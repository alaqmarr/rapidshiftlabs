export interface DomainCheckSample {
  id?: string;
  domainId: string;
  checkType: "http" | "ssl" | "dns" | "rdap";
  timestamp: number;
  isSuccess: boolean;
  latencyMs?: number | null;
  statusCode?: number | null;
  errorMessage?: string | null;
  detailsJson?: string | null;
}

export interface DomainUptimeStats {
  uptimePercentage: number;
  totalChecks: number;
  successfulChecks: number;
  avgLatencyMs: number | null;
}

export interface DailyHealthBar {
  date: string;
  uptimePercentage: number;
  status: "up" | "degraded" | "down";
}

export interface DomainCheckRepositoryPort {
  recordCheck(sample: DomainCheckSample): Promise<void>;
  getUptimePercentage(domainId: string, sinceEpochMs: number): Promise<number>;
  getRecentChecks(domainId: string, limit: number): Promise<DomainCheckSample[]>;
  calculateUptime(
    domainId: string,
    fromEpochMs: number,
    toEpochMs: number,
  ): Promise<DomainUptimeStats>;
  getDailyBars(domainId: string, days?: number): Promise<DailyHealthBar[]>;
}

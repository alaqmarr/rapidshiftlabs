import type { AnalyticsEvent } from "../entities/analytics-event.entity";

export interface AnalyticsOverview {
  totalPageviews: number;
  uniqueVisitors: number;
  totalEvents: number;
  totalErrors: number;
  avgLcpMs: number | null;
}

export interface TimeseriesPoint {
  timestamp: number;
  date: string;
  pageviews: number;
  uniqueVisitors: number;
}

export interface TopMetricPoint {
  key: string;
  count: number;
  percentage?: number;
}

export interface WebVitalSummary {
  name: string; // LCP, INP, CLS, FCP, TTFB
  medianValue: number;
  p75Value: number;
  rating: "good" | "needs-improvement" | "poor";
  sampleCount: number;
}

export interface AnalyticsOffloadConfig {
  clientId: string;
  endpointUrl: string;
  secret: string;
  enabled: boolean;
  lastExportedAt?: number | null;
  lastExportStatus?: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface IAnalyticsRepository {
  insertBatch(events: AnalyticsEvent[]): Promise<void>;
  getOverview(clientId: string, fromEpoch: number, toEpoch: number): Promise<AnalyticsOverview>;
  getTimeseries(
    clientId: string,
    fromEpoch: number,
    toEpoch: number,
    interval?: "hour" | "day",
  ): Promise<TimeseriesPoint[]>;
  getTopPages(
    clientId: string,
    fromEpoch: number,
    toEpoch: number,
    limit?: number,
  ): Promise<TopMetricPoint[]>;
  getTopReferrers(
    clientId: string,
    fromEpoch: number,
    toEpoch: number,
    limit?: number,
  ): Promise<TopMetricPoint[]>;
  getDeviceStats(
    clientId: string,
    fromEpoch: number,
    toEpoch: number,
  ): Promise<{
    browsers: TopMetricPoint[];
    os: TopMetricPoint[];
    devices: TopMetricPoint[];
  }>;
  getWebVitals(
    clientId: string,
    fromEpoch: number,
    toEpoch: number,
  ): Promise<WebVitalSummary[]>;
  exportEvents(
    clientId: string,
    fromEpoch: number,
    toEpoch: number,
    limit?: number,
  ): Promise<AnalyticsEvent[]>;
  buildRollups(windowStartMs: number): Promise<{ hourlyCount: number; dailyCount: number }>;
  pruneRawEvents(olderThanEpoch: number): Promise<number>;

  // Offload configuration
  getOffloadConfig(clientId: string): Promise<AnalyticsOffloadConfig | null>;
  saveOffloadConfig(config: AnalyticsOffloadConfig): Promise<void>;
  listActiveOffloadConfigs(): Promise<AnalyticsOffloadConfig[]>;
  recordOffloadStatus(clientId: string, status: string, exportedAt: number): Promise<void>;
}

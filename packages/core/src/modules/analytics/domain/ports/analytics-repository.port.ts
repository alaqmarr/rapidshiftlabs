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

  // Full Deep Analytics Suite
  getDeepAnalyticsSuite?(
    clientId: string,
    fromEpoch: number,
    toEpoch: number,
    interval?: "hour" | "day"
  ): Promise<DeepAnalyticsSuite>;
}

export interface VisitorSessionStep {
  id: string;
  type: string;
  path: string;
  title?: string;
  metricName?: string;
  metricValue?: number | null;
  timestamp: number;
}

export interface VisitorSessionJourney {
  sessionId: string;
  visitorHash: string;
  isRepeatViewer: boolean;
  visitNumber: number;
  country: string;
  timezone: string;
  language: string;
  referrer: string;
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  browser: string;
  os: string;
  device: string;
  screen: string;
  startedAt: number;
  lastSeenAt: number;
  durationSec: number;
  pageviewCount: number;
  eventCount: number;
  errorCount: number;
  entryPage: string;
  exitPage: string;
  journey: VisitorSessionStep[];
}

export interface DeepAnalyticsSuite {
  overview: {
    totalPageviews: number;
    uniqueVisitors: number;
    totalSessions: number;
    repeatVisitors: number;
    newVisitors: number;
    repeatVisitorRatePercent: number;
    bounceRatePercent: number;
    avgPagesPerSession: number;
    avgSessionDurationSec: number;
    activeVisitorsNow: number;
    totalEvents: number;
    totalErrors: number;
    avgLcpMs: number | null;
  };
  timeseries: Array<{
    timestamp: number;
    date: string;
    pageviews: number;
    uniqueVisitors: number;
    repeatVisitors: number;
    sessions: number;
  }>;
  topPages: Array<{ key: string; count: number; uniqueVisitors: number; percentage: number }>;
  entryPages: Array<{ key: string; count: number; percentage: number }>;
  exitPages: Array<{ key: string; count: number; percentage: number }>;
  topReferrers: Array<{ key: string; count: number; percentage: number }>;
  countries: Array<{ key: string; count: number; uniqueVisitors: number; percentage: number }>;
  timezones: Array<{ key: string; count: number; percentage: number }>;
  utmSources: Array<{ key: string; count: number; percentage: number }>;
  utmMediums: Array<{ key: string; count: number; percentage: number }>;
  utmCampaigns: Array<{ key: string; count: number; percentage: number }>;
  devices: {
    browsers: Array<{ key: string; count: number; percentage: number }>;
    os: Array<{ key: string; count: number; percentage: number }>;
    devices: Array<{ key: string; count: number; percentage: number }>;
    screens: Array<{ key: string; count: number; percentage: number }>;
    languages: Array<{ key: string; count: number; percentage: number }>;
  };
  webVitals: WebVitalSummary[];
  visitorSessions: VisitorSessionJourney[];
  customEvents: Array<{
    name: string;
    count: number;
    lastSeenAt: number;
    samplePayload: string | null;
  }>;
  recentErrors: Array<{
    id: string;
    message: string;
    path: string;
    browser: string;
    os: string;
    timestamp: number;
  }>;
}


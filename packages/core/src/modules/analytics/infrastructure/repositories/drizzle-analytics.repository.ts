import { eq, and, gte, lte, sql, desc, asc, count as sqlCount } from "drizzle-orm";
import type { LibSQLDatabase } from "drizzle-orm/libsql";
import { getDb, uow, type IUnitOfWork } from "../../../../shared/infrastructure/db";
import {
  rawEventsTable,
  hourlyRollupsTable,
  dailyRollupsTable,
  analyticsOffloadConfigsTable,
} from "../../../../shared/infrastructure/db/schema/analytics";
import type {
  IAnalyticsRepository,
  AnalyticsOverview,
  TimeseriesPoint,
  TopMetricPoint,
  WebVitalSummary,
  AnalyticsOffloadConfig,
} from "../../domain/ports/analytics-repository.port";
import { AnalyticsEvent, type AnalyticsEventProps } from "../../domain/entities/analytics-event.entity";

export class DrizzleAnalyticsRepository implements IAnalyticsRepository {
  constructor(
    private readonly db: LibSQLDatabase<any> = getDb("analytics"),
    private readonly uowInstance: IUnitOfWork = uow,
  ) {}

  async insertBatch(events: AnalyticsEvent[]): Promise<void> {
    if (events.length === 0) return;

    const values = events.map((e) => {
      const p = e.props;
      return {
        id: p.id,
        clientId: p.clientId,
        eventType: p.eventType,
        visitorHash: p.visitorHash ?? null,
        sessionId: p.sessionId ?? null,
        path: p.path ?? null,
        referrer: p.referrer ?? null,
        utmSource: p.utmSource ?? null,
        utmMedium: p.utmMedium ?? null,
        utmCampaign: p.utmCampaign ?? null,
        browser: p.browser ?? null,
        os: p.os ?? null,
        device: p.device ?? null,
        country: p.country ?? null,
        metricName: p.metricName ?? null,
        metricValue: p.metricValue ?? null,
        metricRating: p.metricRating ?? null,
        payload: p.payload ?? null,
        timestamp: p.timestamp,
        createdAt: p.createdAt,
      };
    });

    await this.uowInstance.runInTransaction("analytics", async (tx) => {
      await tx.insert(rawEventsTable).values(values);
    });
  }

  async getOverview(clientId: string, fromEpoch: number, toEpoch: number): Promise<AnalyticsOverview> {
    const rows = await this.db
      .select({
        eventType: rawEventsTable.eventType,
        visitorHash: rawEventsTable.visitorHash,
        metricName: rawEventsTable.metricName,
        metricValue: rawEventsTable.metricValue,
      })
      .from(rawEventsTable)
      .where(
        and(
          eq(rawEventsTable.clientId, clientId),
          gte(rawEventsTable.timestamp, fromEpoch),
          lte(rawEventsTable.timestamp, toEpoch),
        ),
      );

    let totalPageviews = 0;
    let totalEvents = 0;
    let totalErrors = 0;
    const visitors = new Set<string>();
    const lcpValues: number[] = [];

    for (const r of rows) {
      if (r.eventType === "pageview") {
        totalPageviews++;
        if (r.visitorHash) visitors.add(r.visitorHash);
      } else if (r.eventType === "event") {
        totalEvents++;
      } else if (r.eventType === "error") {
        totalErrors++;
      } else if (r.eventType === "vitals" && r.metricName === "LCP" && typeof r.metricValue === "number") {
        lcpValues.push(r.metricValue);
      }
    }

    const avgLcpMs =
      lcpValues.length > 0
        ? Math.round(lcpValues.reduce((a, b) => a + b, 0) / lcpValues.length)
        : null;

    return {
      totalPageviews,
      uniqueVisitors: visitors.size,
      totalEvents,
      totalErrors,
      avgLcpMs,
    };
  }

  async getTimeseries(
    clientId: string,
    fromEpoch: number,
    toEpoch: number,
    interval: "hour" | "day" = "day",
  ): Promise<TimeseriesPoint[]> {
    const rows = await this.db
      .select({
        timestamp: rawEventsTable.timestamp,
        visitorHash: rawEventsTable.visitorHash,
        eventType: rawEventsTable.eventType,
      })
      .from(rawEventsTable)
      .where(
        and(
          eq(rawEventsTable.clientId, clientId),
          gte(rawEventsTable.timestamp, fromEpoch),
          lte(rawEventsTable.timestamp, toEpoch),
        ),
      )
      .orderBy(asc(rawEventsTable.timestamp));

    const bucketMs = interval === "hour" ? 3600 * 1000 : 86400 * 1000;
    const buckets = new Map<number, { pageviews: number; visitors: Set<string> }>();

    for (const r of rows) {
      if (r.eventType !== "pageview") continue;
      const bucketKey = Math.floor(r.timestamp / bucketMs) * bucketMs;
      let b = buckets.get(bucketKey);
      if (!b) {
        b = { pageviews: 0, visitors: new Set() };
        buckets.set(bucketKey, b);
      }
      b.pageviews++;
      if (r.visitorHash) b.visitors.add(r.visitorHash);
    }

    const points: TimeseriesPoint[] = [];
    const sortedKeys = Array.from(buckets.keys()).sort((a, b) => a - b);

    for (const k of sortedKeys) {
      const b = buckets.get(k)!;
      const d = new Date(k);
      const dateStr = interval === "hour" ? d.toISOString().slice(0, 13) + ":00" : d.toISOString().slice(0, 10);
      points.push({
        timestamp: k,
        date: dateStr,
        pageviews: b.pageviews,
        uniqueVisitors: b.visitors.size,
      });
    }

    return points;
  }

  async getTopPages(clientId: string, fromEpoch: number, toEpoch: number, limit = 10): Promise<TopMetricPoint[]> {
    const rows = await this.db
      .select({
        path: rawEventsTable.path,
        count: sqlCount(),
      })
      .from(rawEventsTable)
      .where(
        and(
          eq(rawEventsTable.clientId, clientId),
          eq(rawEventsTable.eventType, "pageview"),
          gte(rawEventsTable.timestamp, fromEpoch),
          lte(rawEventsTable.timestamp, toEpoch),
        ),
      )
      .groupBy(rawEventsTable.path)
      .orderBy(desc(sqlCount()))
      .limit(limit);

    return rows.map((r) => ({
      key: r.path || "/",
      count: r.count,
    }));
  }

  async getTopReferrers(clientId: string, fromEpoch: number, toEpoch: number, limit = 10): Promise<TopMetricPoint[]> {
    const rows = await this.db
      .select({
        referrer: rawEventsTable.referrer,
        count: sqlCount(),
      })
      .from(rawEventsTable)
      .where(
        and(
          eq(rawEventsTable.clientId, clientId),
          eq(rawEventsTable.eventType, "pageview"),
          gte(rawEventsTable.timestamp, fromEpoch),
          lte(rawEventsTable.timestamp, toEpoch),
        ),
      )
      .groupBy(rawEventsTable.referrer)
      .orderBy(desc(sqlCount()))
      .limit(limit);

    return rows
      .filter((r) => r.referrer && r.referrer.trim().length > 0)
      .map((r) => ({
        key: r.referrer!,
        count: r.count,
      }));
  }

  async getDeviceStats(
    clientId: string,
    fromEpoch: number,
    toEpoch: number,
  ): Promise<{
    browsers: TopMetricPoint[];
    os: TopMetricPoint[];
    devices: TopMetricPoint[];
  }> {
    const rows = await this.db
      .select({
        browser: rawEventsTable.browser,
        os: rawEventsTable.os,
        device: rawEventsTable.device,
      })
      .from(rawEventsTable)
      .where(
        and(
          eq(rawEventsTable.clientId, clientId),
          eq(rawEventsTable.eventType, "pageview"),
          gte(rawEventsTable.timestamp, fromEpoch),
          lte(rawEventsTable.timestamp, toEpoch),
        ),
      );

    const bMap = new Map<string, number>();
    const oMap = new Map<string, number>();
    const dMap = new Map<string, number>();

    for (const r of rows) {
      const b = r.browser || "Unknown";
      const o = r.os || "Unknown";
      const d = r.device || "desktop";
      bMap.set(b, (bMap.get(b) || 0) + 1);
      oMap.set(o, (oMap.get(o) || 0) + 1);
      dMap.set(d, (dMap.get(d) || 0) + 1);
    }

    const toSortedArray = (m: Map<string, number>): TopMetricPoint[] =>
      Array.from(m.entries())
        .map(([key, count]) => ({ key, count }))
        .sort((a, b) => b.count - a.count);

    return {
      browsers: toSortedArray(bMap),
      os: toSortedArray(oMap),
      devices: toSortedArray(dMap),
    };
  }

  async getWebVitals(clientId: string, fromEpoch: number, toEpoch: number): Promise<WebVitalSummary[]> {
    const rows = await this.db
      .select({
        metricName: rawEventsTable.metricName,
        metricValue: rawEventsTable.metricValue,
        metricRating: rawEventsTable.metricRating,
      })
      .from(rawEventsTable)
      .where(
        and(
          eq(rawEventsTable.clientId, clientId),
          eq(rawEventsTable.eventType, "vitals"),
          gte(rawEventsTable.timestamp, fromEpoch),
          lte(rawEventsTable.timestamp, toEpoch),
        ),
      );

    const groups = new Map<string, number[]>();

    for (const r of rows) {
      if (!r.metricName || typeof r.metricValue !== "number") continue;
      let arr = groups.get(r.metricName);
      if (!arr) {
        arr = [];
        groups.set(r.metricName, arr);
      }
      arr.push(r.metricValue);
    }

    const metricOrder = ["LCP", "INP", "CLS", "FCP", "TTFB"];
    const results: WebVitalSummary[] = [];

    for (const name of metricOrder) {
      const values = groups.get(name) || [];
      if (values.length === 0) {
        results.push({
          name,
          medianValue: 0,
          p75Value: 0,
          rating: "good",
          sampleCount: 0,
        });
        continue;
      }

      values.sort((a, b) => a - b);
      const median = values[Math.floor(values.length * 0.5)]!;
      const p75 = values[Math.floor(values.length * 0.75)]!;

      let rating: "good" | "needs-improvement" | "poor" = "good";
      if (name === "LCP") {
        if (p75 > 4000) rating = "poor";
        else if (p75 > 2500) rating = "needs-improvement";
      } else if (name === "CLS") {
        if (p75 > 250) rating = "poor";
        else if (p75 > 100) rating = "needs-improvement";
      } else if (name === "INP") {
        if (p75 > 500) rating = "poor";
        else if (p75 > 200) rating = "needs-improvement";
      }

      results.push({
        name,
        medianValue: Math.round(median),
        p75Value: Math.round(p75),
        rating,
        sampleCount: values.length,
      });
    }

    return results;
  }

  async exportEvents(clientId: string, fromEpoch: number, toEpoch: number, limit = 1000): Promise<AnalyticsEvent[]> {
    const rows = await this.db
      .select()
      .from(rawEventsTable)
      .where(
        and(
          eq(rawEventsTable.clientId, clientId),
          gte(rawEventsTable.timestamp, fromEpoch),
          lte(rawEventsTable.timestamp, toEpoch),
        ),
      )
      .orderBy(asc(rawEventsTable.timestamp))
      .limit(limit);

    return rows.map((r) =>
      AnalyticsEvent.create({
        id: r.id,
        clientId: r.clientId,
        eventType: r.eventType,
        visitorHash: r.visitorHash,
        sessionId: r.sessionId,
        path: r.path,
        referrer: r.referrer,
        utmSource: r.utmSource,
        utmMedium: r.utmMedium,
        utmCampaign: r.utmCampaign,
        browser: r.browser,
        os: r.os,
        device: r.device,
        country: r.country,
        metricName: r.metricName,
        metricValue: r.metricValue,
        metricRating: r.metricRating,
        payload: r.payload,
        timestamp: r.timestamp,
        createdAt: r.createdAt,
      }),
    );
  }

  async buildRollups(windowStartMs: number): Promise<{ hourlyCount: number; dailyCount: number }> {
    const hourlyAggregates = await this.db
      .select({
        clientId: rawEventsTable.clientId,
        eventName: rawEventsTable.eventType,
        hourEpoch: sql<number>`((${rawEventsTable.timestamp} / 3600000) * 3600000)`,
        count: sqlCount(),
        uniqueVisitors: sql<number>`count(distinct ${rawEventsTable.visitorHash})`,
      })
      .from(rawEventsTable)
      .where(gte(rawEventsTable.timestamp, windowStartMs))
      .groupBy(
        rawEventsTable.clientId,
        rawEventsTable.eventType,
        sql`((${rawEventsTable.timestamp} / 3600000) * 3600000)`,
      );

    if (hourlyAggregates.length > 0) {
      await this.uowInstance.runInTransaction("analytics", async (tx) => {
        for (const agg of hourlyAggregates) {
          await tx
            .insert(hourlyRollupsTable)
            .values({
              clientId: agg.clientId,
              eventName: agg.eventName,
              hourEpoch: agg.hourEpoch,
              count: agg.count,
              uniqueVisitors: agg.uniqueVisitors,
            })
            .onConflictDoUpdate({
              target: [
                hourlyRollupsTable.clientId,
                hourlyRollupsTable.eventName,
                hourlyRollupsTable.hourEpoch,
              ],
              set: {
                count: agg.count,
                uniqueVisitors: agg.uniqueVisitors,
              },
            });
        }
      });
    }

    const dailyAggregates = await this.db
      .select({
        clientId: rawEventsTable.clientId,
        eventName: rawEventsTable.eventType,
        dayEpoch: sql<number>`((${rawEventsTable.timestamp} / 86400000) * 86400000)`,
        count: sqlCount(),
        uniqueVisitors: sql<number>`count(distinct ${rawEventsTable.visitorHash})`,
      })
      .from(rawEventsTable)
      .where(gte(rawEventsTable.timestamp, windowStartMs))
      .groupBy(
        rawEventsTable.clientId,
        rawEventsTable.eventType,
        sql`((${rawEventsTable.timestamp} / 86400000) * 86400000)`,
      );

    if (dailyAggregates.length > 0) {
      await this.uowInstance.runInTransaction("analytics", async (tx) => {
        for (const agg of dailyAggregates) {
          await tx
            .insert(dailyRollupsTable)
            .values({
              clientId: agg.clientId,
              eventName: agg.eventName,
              dayEpoch: agg.dayEpoch,
              count: agg.count,
              uniqueVisitors: agg.uniqueVisitors,
            })
            .onConflictDoUpdate({
              target: [
                dailyRollupsTable.clientId,
                dailyRollupsTable.eventName,
                dailyRollupsTable.dayEpoch,
              ],
              set: {
                count: agg.count,
                uniqueVisitors: agg.uniqueVisitors,
              },
            });
        }
      });
    }

    return {
      hourlyCount: hourlyAggregates.length,
      dailyCount: dailyAggregates.length,
    };
  }

  async pruneRawEvents(olderThanEpoch: number): Promise<number> {
    const res = await this.db.delete(rawEventsTable).where(lte(rawEventsTable.timestamp, olderThanEpoch));
    return (res as any)?.rowsAffected ?? 0;
  }

  async getOffloadConfig(clientId: string): Promise<AnalyticsOffloadConfig | null> {
    const rows = await this.db
      .select()
      .from(analyticsOffloadConfigsTable)
      .where(eq(analyticsOffloadConfigsTable.clientId, clientId))
      .limit(1);

    const r = rows[0];
    if (!r) return null;
    return {
      clientId: r.clientId,
      endpointUrl: r.endpointUrl,
      secret: r.secret,
      enabled: Boolean(r.enabled),
      lastExportedAt: r.lastExportedAt,
      lastExportStatus: r.lastExportStatus,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    };
  }

  async saveOffloadConfig(config: AnalyticsOffloadConfig): Promise<void> {
    const existing = await this.getOffloadConfig(config.clientId);
    if (existing) {
      await this.db
        .update(analyticsOffloadConfigsTable)
        .set({
          endpointUrl: config.endpointUrl,
          secret: config.secret,
          enabled: config.enabled,
          lastExportedAt: config.lastExportedAt,
          lastExportStatus: config.lastExportStatus,
          updatedAt: config.updatedAt,
        })
        .where(eq(analyticsOffloadConfigsTable.clientId, config.clientId));
    } else {
      await this.db.insert(analyticsOffloadConfigsTable).values({
        clientId: config.clientId,
        endpointUrl: config.endpointUrl,
        secret: config.secret,
        enabled: config.enabled,
        lastExportedAt: config.lastExportedAt,
        lastExportStatus: config.lastExportStatus,
        createdAt: config.createdAt,
        updatedAt: config.updatedAt,
      });
    }
  }

  async listActiveOffloadConfigs(): Promise<AnalyticsOffloadConfig[]> {
    const rows = await this.db
      .select()
      .from(analyticsOffloadConfigsTable)
      .where(eq(analyticsOffloadConfigsTable.enabled, true));

    return rows.map((r) => ({
      clientId: r.clientId,
      endpointUrl: r.endpointUrl,
      secret: r.secret,
      enabled: Boolean(r.enabled),
      lastExportedAt: r.lastExportedAt,
      lastExportStatus: r.lastExportStatus,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    }));
  }

  async recordOffloadStatus(clientId: string, status: string, exportedAt: number): Promise<void> {
    await this.db
      .update(analyticsOffloadConfigsTable)
      .set({
        lastExportStatus: status,
        lastExportedAt: exportedAt,
        updatedAt: Date.now(),
      })
      .where(eq(analyticsOffloadConfigsTable.clientId, clientId));
  }
}

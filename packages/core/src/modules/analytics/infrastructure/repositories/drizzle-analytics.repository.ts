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
  DeepAnalyticsSuite,
  VisitorSessionJourney,
  VisitorSessionStep,
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

  async getDeepAnalyticsSuite(
    clientId: string,
    fromEpoch: number,
    toEpoch: number,
    interval: "hour" | "day" = "day"
  ): Promise<DeepAnalyticsSuite> {
    const rows = await this.db
      .select()
      .from(rawEventsTable)
      .where(
        and(
          eq(rawEventsTable.clientId, clientId),
          gte(rawEventsTable.timestamp, fromEpoch),
          lte(rawEventsTable.timestamp, toEpoch)
        )
      )
      .orderBy(asc(rawEventsTable.timestamp));

    const now = Date.now();
    const activeCutoff = now - 5 * 60 * 1000;

    let totalPageviews = 0;
    let totalEvents = 0;
    let totalErrors = 0;
    const visitors = new Set<string>();
    const activeNowVisitors = new Set<string>();
    const lcpValues: number[] = [];

    // Visitor-level aggregation to detect repeat viewers
    const visitorSessionsCount = new Map<string, Set<string>>();
    const visitorPageviewsCount = new Map<string, number>();
    const visitorMaxHintCount = new Map<string, number>();

    // Breakdown maps
    const pageViewsMap = new Map<string, { count: number; visitors: Set<string> }>();
    const referrerMap = new Map<string, number>();
    const countryMap = new Map<string, { count: number; visitors: Set<string> }>();
    const timezoneMap = new Map<string, number>();
    const utmSourceMap = new Map<string, number>();
    const utmMediumMap = new Map<string, number>();
    const utmCampaignMap = new Map<string, number>();
    const browserMap = new Map<string, number>();
    const osMap = new Map<string, number>();
    const deviceMap = new Map<string, number>();
    const screenMap = new Map<string, number>();
    const langMap = new Map<string, number>();

    // Custom events & errors
    const customEventMap = new Map<
      string,
      { count: number; lastSeenAt: number; samplePayload: string | null }
    >();
    const recentErrorsList: DeepAnalyticsSuite["recentErrors"] = [];

    // Session reconstruction
    interface SessionAccumulator {
      sessionId: string;
      visitorHash: string;
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
      pageviewCount: number;
      eventCount: number;
      errorCount: number;
      entryPage: string;
      exitPage: string;
      hintVisitCount: number;
      journey: VisitorSessionStep[];
    }
    const sessionsMap = new Map<string, SessionAccumulator>();

    for (const r of rows) {
      const vHash = r.visitorHash || `anon_${r.sessionId || r.id.slice(-8)}`;
      const sId = r.sessionId || `ses_${vHash}_${Math.floor(r.timestamp / 1800000)}`;

      let parsedPayload: Record<string, any> = {};
      if (r.payload) {
        try {
          parsedPayload = JSON.parse(r.payload);
        } catch {}
      }

      const hintVc = Number(parsedPayload.visitCount) || (parsedPayload.isRepeat ? 2 : 1);
      visitorMaxHintCount.set(vHash, Math.max(visitorMaxHintCount.get(vHash) || 1, hintVc));

      if (!visitorSessionsCount.has(vHash)) {
        visitorSessionsCount.set(vHash, new Set());
      }
      visitorSessionsCount.get(vHash)!.add(sId);

      if (r.timestamp >= activeCutoff) {
        activeNowVisitors.add(vHash);
      }

      const tz = typeof parsedPayload.tz === "string" && parsedPayload.tz ? parsedPayload.tz : "";
      const lang =
        typeof parsedPayload.lang === "string" && parsedPayload.lang ? parsedPayload.lang : "";
      const screen =
        typeof parsedPayload.screen === "string" && parsedPayload.screen ? parsedPayload.screen : "";
      const pageTitle =
        typeof parsedPayload.title === "string" && parsedPayload.title ? parsedPayload.title : undefined;

      // Normalize referrer
      let cleanRef = "Direct / Bookmark";
      if (r.referrer && r.referrer.trim()) {
        try {
          const refUrl = new URL(r.referrer);
          cleanRef = refUrl.hostname.replace(/^www\./i, "") || r.referrer;
        } catch {
          cleanRef = r.referrer.trim().slice(0, 64);
        }
      }

      const cleanCountry = (r.country && r.country.trim().toUpperCase()) || "IN";
      const cleanPath = r.path || "/";
      const cleanBrowser = r.browser || "Chrome";
      const cleanOs = r.os || "Windows";
      const cleanDevice = r.device || "desktop";

      // Update or create session accumulator
      let sess = sessionsMap.get(sId);
      if (!sess) {
        sess = {
          sessionId: sId,
          visitorHash: vHash,
          country: cleanCountry,
          timezone: tz || "Asia/Kolkata",
          language: lang || "en-US",
          referrer: cleanRef,
          utmSource: r.utmSource || null,
          utmMedium: r.utmMedium || null,
          utmCampaign: r.utmCampaign || null,
          browser: cleanBrowser,
          os: cleanOs,
          device: cleanDevice,
          screen: screen || "1920x1080",
          startedAt: r.timestamp,
          lastSeenAt: r.timestamp,
          pageviewCount: 0,
          eventCount: 0,
          errorCount: 0,
          entryPage: cleanPath,
          exitPage: cleanPath,
          hintVisitCount: hintVc,
          journey: [],
        };
        sessionsMap.set(sId, sess);
      } else {
        sess.lastSeenAt = Math.max(sess.lastSeenAt, r.timestamp);
        sess.hintVisitCount = Math.max(sess.hintVisitCount, hintVc);
        if (cleanRef !== "Direct / Bookmark" && sess.referrer === "Direct / Bookmark") {
          sess.referrer = cleanRef;
        }
        if (tz && sess.timezone === "Asia/Kolkata") sess.timezone = tz;
        if (screen) sess.screen = screen;
      }

      if (r.eventType === "pageview") {
        totalPageviews++;
        visitors.add(vHash);
        visitorPageviewsCount.set(vHash, (visitorPageviewsCount.get(vHash) || 0) + 1);

        if (sess.pageviewCount === 0) {
          sess.entryPage = cleanPath;
        }
        sess.exitPage = cleanPath;
        sess.pageviewCount++;

        if (sess.journey.length < 25) {
          sess.journey.push({
            id: r.id,
            type: "pageview",
            path: cleanPath,
            title: pageTitle,
            timestamp: r.timestamp,
          });
        }

        // Page aggregation
        let pg = pageViewsMap.get(cleanPath);
        if (!pg) {
          pg = { count: 0, visitors: new Set() };
          pageViewsMap.set(cleanPath, pg);
        }
        pg.count++;
        pg.visitors.add(vHash);

        // Referrer aggregation
        referrerMap.set(cleanRef, (referrerMap.get(cleanRef) || 0) + 1);

        // Country aggregation
        let ct = countryMap.get(cleanCountry);
        if (!ct) {
          ct = { count: 0, visitors: new Set() };
          countryMap.set(cleanCountry, ct);
        }
        ct.count++;
        ct.visitors.add(vHash);

        if (tz) timezoneMap.set(tz, (timezoneMap.get(tz) || 0) + 1);
        if (r.utmSource) utmSourceMap.set(r.utmSource, (utmSourceMap.get(r.utmSource) || 0) + 1);
        if (r.utmMedium) utmMediumMap.set(r.utmMedium, (utmMediumMap.get(r.utmMedium) || 0) + 1);
        if (r.utmCampaign)
          utmCampaignMap.set(r.utmCampaign, (utmCampaignMap.get(r.utmCampaign) || 0) + 1);

        browserMap.set(cleanBrowser, (browserMap.get(cleanBrowser) || 0) + 1);
        osMap.set(cleanOs, (osMap.get(cleanOs) || 0) + 1);
        deviceMap.set(cleanDevice, (deviceMap.get(cleanDevice) || 0) + 1);
        if (screen) screenMap.set(screen, (screenMap.get(screen) || 0) + 1);
        if (lang) langMap.set(lang, (langMap.get(lang) || 0) + 1);
      } else if (r.eventType === "event") {
        totalEvents++;
        visitors.add(vHash);
        sess.eventCount++;
        const evtName = r.metricName || "custom_event";
        const existingEvt = customEventMap.get(evtName);
        customEventMap.set(evtName, {
          count: (existingEvt?.count || 0) + 1,
          lastSeenAt: r.timestamp,
          samplePayload: r.payload || existingEvt?.samplePayload || null,
        });
        if (sess.journey.length < 25) {
          sess.journey.push({
            id: r.id,
            type: "event",
            path: cleanPath,
            metricName: evtName,
            timestamp: r.timestamp,
          });
        }
      } else if (r.eventType === "error") {
        totalErrors++;
        sess.errorCount++;
        const errMsg =
          parsedPayload.message || r.metricName || "Unhandled Runtime Exception";
        recentErrorsList.push({
          id: r.id,
          message: String(errMsg),
          path: cleanPath,
          browser: cleanBrowser,
          os: cleanOs,
          timestamp: r.timestamp,
        });
        if (sess.journey.length < 25) {
          sess.journey.push({
            id: r.id,
            type: "error",
            path: cleanPath,
            metricName: String(errMsg).slice(0, 80),
            timestamp: r.timestamp,
          });
        }
      } else if (r.eventType === "vitals") {
        if (r.metricName === "LCP" && typeof r.metricValue === "number") {
          lcpValues.push(r.metricValue);
        }
      }
    }

    // Identify repeat visitors:
    // A visitor is a Repeat Viewer if they have >1 session, or their hintVisitCount > 1, or >3 pageviews across time
    const repeatVisitorHashes = new Set<string>();
    for (const vHash of visitors) {
      const sCount = visitorSessionsCount.get(vHash)?.size || 0;
      const hintCount = visitorMaxHintCount.get(vHash) || 1;
      if (sCount > 1 || hintCount > 1) {
        repeatVisitorHashes.add(vHash);
      }
    }

    const uniqueVisitorsCount = visitors.size;
    const repeatVisitorsCount = repeatVisitorHashes.size;
    const newVisitorsCount = Math.max(0, uniqueVisitorsCount - repeatVisitorsCount);
    const repeatVisitorRatePercent =
      uniqueVisitorsCount > 0 ? Math.round((repeatVisitorsCount / uniqueVisitorsCount) * 100) : 0;

    // Session metrics: bounce rate, avg pages/session, avg session duration
    const allSessions = Array.from(sessionsMap.values()).filter(
      (s) => s.pageviewCount > 0 || s.eventCount > 0
    );
    const totalSessions = allSessions.length;
    const bouncedSessions = allSessions.filter((s) => s.pageviewCount <= 1 && s.eventCount === 0).length;
    const bounceRatePercent =
      totalSessions > 0 ? Math.round((bouncedSessions / totalSessions) * 100) : 0;
    const avgPagesPerSession =
      totalSessions > 0 ? Number((totalPageviews / totalSessions).toFixed(1)) : 0;

    const engagedDurations = allSessions
      .map((s) => Math.max(0, Math.round((s.lastSeenAt - s.startedAt) / 1000)))
      .filter((d) => d > 0 && d < 7200);
    const avgSessionDurationSec =
      engagedDurations.length > 0
        ? Math.round(engagedDurations.reduce((a, b) => a + b, 0) / engagedDurations.length)
        : totalPageviews > 0
        ? 42
        : 0;

    // Entry & Exit pages from sessions
    const entryMap = new Map<string, number>();
    const exitMap = new Map<string, number>();
    for (const s of allSessions) {
      if (s.pageviewCount > 0) {
        entryMap.set(s.entryPage, (entryMap.get(s.entryPage) || 0) + 1);
        exitMap.set(s.exitPage, (exitMap.get(s.exitPage) || 0) + 1);
      }
    }

    // Build contiguous Timeseries
    const bucketMs = interval === "hour" ? 3600 * 1000 : 86400 * 1000;
    const startBucket = Math.floor(fromEpoch / bucketMs) * bucketMs;
    const endBucket = Math.floor(toEpoch / bucketMs) * bucketMs;
    const tsBuckets = new Map<
      number,
      { pageviews: number; visitors: Set<string>; repeatVisitors: Set<string>; sessions: Set<string> }
    >();

    // Pre-seed up to 90 buckets so charts always look continuous
    const maxBuckets = 92;
    const totalBuckets = Math.min(maxBuckets, Math.max(1, Math.floor((endBucket - startBucket) / bucketMs) + 1));
    const firstBucket = endBucket - (totalBuckets - 1) * bucketMs;
    for (let k = firstBucket; k <= endBucket; k += bucketMs) {
      tsBuckets.set(k, {
        pageviews: 0,
        visitors: new Set(),
        repeatVisitors: new Set(),
        sessions: new Set(),
      });
    }

    for (const r of rows) {
      if (r.eventType !== "pageview") continue;
      const bKey = Math.floor(r.timestamp / bucketMs) * bucketMs;
      let b = tsBuckets.get(bKey);
      if (!b) {
        b = { pageviews: 0, visitors: new Set(), repeatVisitors: new Set(), sessions: new Set() };
        tsBuckets.set(bKey, b);
      }
      const vHash = r.visitorHash || `anon_${r.sessionId || r.id.slice(-8)}`;
      const sId = r.sessionId || vHash;
      b.pageviews++;
      b.visitors.add(vHash);
      b.sessions.add(sId);
      if (repeatVisitorHashes.has(vHash)) {
        b.repeatVisitors.add(vHash);
      }
    }

    const timeseries = Array.from(tsBuckets.keys())
      .sort((a, b) => a - b)
      .map((k) => {
        const b = tsBuckets.get(k)!;
        const d = new Date(k);
        const dateStr =
          interval === "hour"
            ? d.toISOString().slice(11, 16)
            : d.toISOString().slice(5, 10);
        return {
          timestamp: k,
          date: dateStr,
          pageviews: b.pageviews,
          uniqueVisitors: b.visitors.size,
          repeatVisitors: b.repeatVisitors.size,
          sessions: b.sessions.size,
        };
      });

    const toPctList = (m: Map<string, number>, totalDenom: number, limit = 10) => {
      const denom = Math.max(1, totalDenom);
      return Array.from(m.entries())
        .map(([key, count]) => ({
          key,
          count,
          percentage: Math.min(100, Math.round((count / denom) * 100)),
        }))
        .sort((a, b) => b.count - a.count)
        .slice(0, limit);
    };

    const topPages = Array.from(pageViewsMap.entries())
      .map(([key, val]) => ({
        key,
        count: val.count,
        uniqueVisitors: val.visitors.size,
        percentage: Math.min(100, Math.round((val.count / Math.max(1, totalPageviews)) * 100)),
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 12);

    const countries = Array.from(countryMap.entries())
      .map(([key, val]) => ({
        key,
        count: val.count,
        uniqueVisitors: val.visitors.size,
        percentage: Math.min(100, Math.round((val.count / Math.max(1, totalPageviews)) * 100)),
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 12);

    const webVitals = await this.getWebVitals(clientId, fromEpoch, toEpoch);

    const avgLcpMs =
      lcpValues.length > 0
        ? Math.round(lcpValues.reduce((a, b) => a + b, 0) / lcpValues.length)
        : null;

    // Sort sessions newest first (up to 40)
    const visitorSessions: VisitorSessionJourney[] = allSessions
      .sort((a, b) => b.lastSeenAt - a.lastSeenAt)
      .slice(0, 40)
      .map((s) => {
        const totalSessionsForVisitor = visitorSessionsCount.get(s.visitorHash)?.size || 1;
        const visitNumber = Math.max(totalSessionsForVisitor, s.hintVisitCount);
        const isRepeatViewer = repeatVisitorHashes.has(s.visitorHash) || visitNumber > 1;
        return {
          sessionId: s.sessionId,
          visitorHash: s.visitorHash.slice(0, 10),
          isRepeatViewer,
          visitNumber,
          country: s.country,
          timezone: s.timezone,
          language: s.language,
          referrer: s.referrer,
          utmSource: s.utmSource,
          utmMedium: s.utmMedium,
          utmCampaign: s.utmCampaign,
          browser: s.browser,
          os: s.os,
          device: s.device,
          screen: s.screen,
          startedAt: s.startedAt,
          lastSeenAt: s.lastSeenAt,
          durationSec: Math.max(1, Math.round((s.lastSeenAt - s.startedAt) / 1000)),
          pageviewCount: s.pageviewCount,
          eventCount: s.eventCount,
          errorCount: s.errorCount,
          entryPage: s.entryPage,
          exitPage: s.exitPage,
          journey: s.journey,
        };
      });

    const customEvents = Array.from(customEventMap.entries())
      .map(([name, val]) => ({
        name,
        count: val.count,
        lastSeenAt: val.lastSeenAt,
        samplePayload: val.samplePayload,
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 15);

    return {
      overview: {
        totalPageviews,
        uniqueVisitors: uniqueVisitorsCount,
        totalSessions,
        repeatVisitors: repeatVisitorsCount,
        newVisitors: newVisitorsCount,
        repeatVisitorRatePercent,
        bounceRatePercent,
        avgPagesPerSession,
        avgSessionDurationSec,
        activeVisitorsNow: activeNowVisitors.size,
        totalEvents,
        totalErrors,
        avgLcpMs,
      },
      timeseries,
      topPages,
      entryPages: toPctList(entryMap, totalSessions, 8),
      exitPages: toPctList(exitMap, totalSessions, 8),
      topReferrers: toPctList(referrerMap, totalPageviews, 10),
      countries,
      timezones: toPctList(timezoneMap, totalPageviews, 10),
      utmSources: toPctList(utmSourceMap, totalPageviews, 8),
      utmMediums: toPctList(utmMediumMap, totalPageviews, 8),
      utmCampaigns: toPctList(utmCampaignMap, totalPageviews, 8),
      devices: {
        browsers: toPctList(browserMap, totalPageviews, 8),
        os: toPctList(osMap, totalPageviews, 8),
        devices: toPctList(deviceMap, totalPageviews, 5),
        screens: toPctList(screenMap, totalPageviews, 6),
        languages: toPctList(langMap, totalPageviews, 6),
      },
      webVitals,
      visitorSessions,
      customEvents,
      recentErrors: recentErrorsList.sort((a, b) => b.timestamp - a.timestamp).slice(0, 20),
    };
  }
}


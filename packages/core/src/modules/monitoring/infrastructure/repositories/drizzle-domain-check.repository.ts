import { eq, and, gte, lte, desc } from "drizzle-orm";
import type { LibSQLDatabase } from "drizzle-orm/libsql";
import { getDb, uow } from "../../../../shared/infrastructure/db";
import {
  domainChecksTable,
  type DomainCheckRow,
} from "../../../../shared/infrastructure/db/schema/metrics";
import type {
  DomainCheckRepositoryPort,
  DomainCheckSample,
  DomainUptimeStats,
  DailyHealthBar,
} from "../../domain/ports/domain-check-repo.port";

export class DrizzleDomainCheckRepository
  implements DomainCheckRepositoryPort
{
  private static writeQueue: Promise<void> = Promise.resolve();

  constructor(private readonly db: LibSQLDatabase<any> = getDb("metrics")) {}

  async recordCheck(sample: DomainCheckSample): Promise<void> {
    const checkId =
      sample.id ??
      `chk_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

    const currentLock = DrizzleDomainCheckRepository.writeQueue;
    let releaseLock!: () => void;
    DrizzleDomainCheckRepository.writeQueue = new Promise<void>((resolve) => {
      releaseLock = resolve;
    });

    await currentLock;
    try {
      await uow.runInTransaction("metrics", async (tx) => {
        await tx.insert(domainChecksTable).values({
          id: checkId,
          domainId: sample.domainId,
          checkType: sample.checkType,
          timestamp: sample.timestamp,
          isSuccess: sample.isSuccess,
          latencyMs: sample.latencyMs ?? null,
          statusCode: sample.statusCode ?? null,
          errorMessage: sample.errorMessage ?? null,
          detailsJson: sample.detailsJson ?? null,
        });
      });
    } finally {
      releaseLock();
    }
  }

  async getUptimePercentage(
    domainId: string,
    sinceEpochMs: number,
  ): Promise<number> {
    const rows = await this.db
      .select({
        isSuccess: domainChecksTable.isSuccess,
      })
      .from(domainChecksTable)
      .where(
        and(
          eq(domainChecksTable.domainId, domainId),
          eq(domainChecksTable.checkType, "http"),
          gte(domainChecksTable.timestamp, sinceEpochMs),
        ),
      );

    if (rows.length === 0) return 100;

    const successful = rows.filter((r) => r.isSuccess).length;
    return Number(((successful / rows.length) * 100).toFixed(2));
  }

  async getRecentChecks(
    domainId: string,
    limit = 50,
  ): Promise<DomainCheckSample[]> {
    const rows = await this.db
      .select()
      .from(domainChecksTable)
      .where(eq(domainChecksTable.domainId, domainId))
      .orderBy(desc(domainChecksTable.timestamp))
      .limit(limit);

    return rows.map((r) => ({
      id: r.id,
      domainId: r.domainId,
      checkType: r.checkType as any,
      timestamp: r.timestamp,
      isSuccess: r.isSuccess,
      latencyMs: r.latencyMs,
      statusCode: r.statusCode,
      errorMessage: r.errorMessage,
      detailsJson: r.detailsJson,
    }));
  }

  async calculateUptime(
    domainId: string,
    fromEpochMs: number,
    toEpochMs: number,
  ): Promise<DomainUptimeStats> {
    const rows = await this.db
      .select({
        isSuccess: domainChecksTable.isSuccess,
        latencyMs: domainChecksTable.latencyMs,
      })
      .from(domainChecksTable)
      .where(
        and(
          eq(domainChecksTable.domainId, domainId),
          eq(domainChecksTable.checkType, "http"),
          gte(domainChecksTable.timestamp, fromEpochMs),
          lte(domainChecksTable.timestamp, toEpochMs),
        ),
      );

    if (rows.length === 0) {
      return {
        uptimePercentage: 100,
        totalChecks: 0,
        successfulChecks: 0,
        avgLatencyMs: null,
      };
    }

    const successful = rows.filter((r) => r.isSuccess).length;
    const latencies = rows
      .map((r) => r.latencyMs)
      .filter((l): l is number => typeof l === "number" && l >= 0);

    const avgLatencyMs =
      latencies.length > 0
        ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length)
        : null;

    return {
      uptimePercentage: Number(((successful / rows.length) * 100).toFixed(2)),
      totalChecks: rows.length,
      successfulChecks: successful,
      avgLatencyMs,
    };
  }

  async getDailyBars(domainId: string, days = 90): Promise<DailyHealthBar[]> {
    const now = Date.now();
    const msPerDay = 86_400_000;
    const since = now - days * msPerDay;

    const rows = await this.db
      .select({
        timestamp: domainChecksTable.timestamp,
        isSuccess: domainChecksTable.isSuccess,
      })
      .from(domainChecksTable)
      .where(
        and(
          eq(domainChecksTable.domainId, domainId),
          eq(domainChecksTable.checkType, "http"),
          gte(domainChecksTable.timestamp, since),
        ),
      );

    // Group checks by date "YYYY-MM-DD"
    const grouped = new Map<string, { total: number; success: number }>();

    for (const r of rows) {
      const parts = new Date(r.timestamp).toISOString().split("T");
      const dateStr = parts[0] ?? "";
      if (!dateStr) continue;
      const entry = grouped.get(dateStr) ?? { total: 0, success: 0 };
      entry.total += 1;
      if (r.isSuccess) entry.success += 1;
      grouped.set(dateStr, entry);
    }

    const bars: DailyHealthBar[] = [];
    for (let i = days - 1; i >= 0; i--) {
      const parts = new Date(now - i * msPerDay).toISOString().split("T");
      const date = parts[0] ?? "";
      if (!date) continue;
      const data = grouped.get(date);

      if (!data || data.total === 0) {
        bars.push({
          date,
          uptimePercentage: 100,
          status: "up",
        });
      } else {
        const uptime = Number(((data.success / data.total) * 100).toFixed(2));
        let status: "up" | "degraded" | "down" = "up";
        if (uptime < 95 && uptime >= 80) status = "degraded";
        else if (uptime < 80) status = "down";

        bars.push({
          date,
          uptimePercentage: uptime,
          status,
        });
      }
    }

    return bars;
  }
}

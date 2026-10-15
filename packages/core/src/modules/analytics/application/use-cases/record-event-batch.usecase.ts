import { VisitorHasher } from "../../domain/services/visitor-hasher";
import { AnalyticsEvent } from "../../domain/entities/analytics-event.entity";
import type { IAnalyticsRepository } from "../../domain/ports/analytics-repository.port";
import { IngestBatchSchema, type IngestBatchDTO } from "../dtos/analytics.dto";

export class RecordEventBatchUseCase {
  constructor(private readonly repo: IAnalyticsRepository) {}

  async execute(
    input: IngestBatchDTO,
    context?: { ip?: string; userAgent?: string },
  ): Promise<{ recordedCount: number }> {
    const validated = IngestBatchSchema.parse(input);
    const ip = context?.ip || "127.0.0.1";
    const ua = context?.userAgent || "unknown";

    const events = validated.events.map((e) => {
      const eventTime = e.timestamp ?? Date.now();
      const visitorHash = VisitorHasher.hash(ip, ua, new Date(eventTime));

      return AnalyticsEvent.create({
        clientId: validated.clientId,
        eventType: e.type,
        visitorHash,
        sessionId: e.sessionId,
        path: e.path,
        referrer: e.referrer,
        utmSource: e.utmSource,
        utmMedium: e.utmMedium,
        utmCampaign: e.utmCampaign,
        browser: e.browser,
        os: e.os,
        device: e.device,
        country: e.country,
        metricName: e.metricName,
        metricValue: e.metricValue,
        metricRating: e.metricRating,
        payload: e.payload ? JSON.stringify(e.payload) : null,
        timestamp: eventTime,
      });
    });

    await this.repo.insertBatch(events);
    return { recordedCount: events.length };
  }
}

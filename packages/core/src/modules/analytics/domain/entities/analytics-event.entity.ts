import { newId } from "../../../../shared/kernel/id";

export interface AnalyticsEventProps {
  id: string;
  clientId: string;
  eventType: string; // "pageview" | "event" | "vitals" | "error"
  visitorHash?: string | null;
  sessionId?: string | null;
  path?: string | null;
  referrer?: string | null;
  utmSource?: string | null;
  utmMedium?: string | null;
  utmCampaign?: string | null;
  browser?: string | null;
  os?: string | null;
  device?: string | null;
  country?: string | null;
  metricName?: string | null;
  metricValue?: number | null;
  metricRating?: string | null;
  payload?: string | null;
  timestamp: number;
  createdAt: number;
}

export class AnalyticsEvent {
  constructor(public readonly props: AnalyticsEventProps) {}

  public static create(params: {
    id?: string;
    clientId: string;
    eventType: string;
    visitorHash?: string | null;
    sessionId?: string | null;
    path?: string | null;
    referrer?: string | null;
    utmSource?: string | null;
    utmMedium?: string | null;
    utmCampaign?: string | null;
    browser?: string | null;
    os?: string | null;
    device?: string | null;
    country?: string | null;
    metricName?: string | null;
    metricValue?: number | null;
    metricRating?: string | null;
    payload?: string | null;
    timestamp?: number;
    createdAt?: number;
  }): AnalyticsEvent {
    const now = params.createdAt ?? Date.now();
    return new AnalyticsEvent({
      id: params.id ?? newId("evt"),
      clientId: params.clientId,
      eventType: params.eventType,
      visitorHash: params.visitorHash ?? null,
      sessionId: params.sessionId ?? null,
      path: params.path ?? null,
      referrer: params.referrer ?? null,
      utmSource: params.utmSource ?? null,
      utmMedium: params.utmMedium ?? null,
      utmCampaign: params.utmCampaign ?? null,
      browser: params.browser ?? null,
      os: params.os ?? null,
      device: params.device ?? null,
      country: params.country ?? null,
      metricName: params.metricName ?? null,
      metricValue: params.metricValue ?? null,
      metricRating: params.metricRating ?? null,
      payload: params.payload ?? null,
      timestamp: params.timestamp ?? now,
      createdAt: now,
    });
  }

  public get id(): string {
    return this.props.id;
  }
  public get clientId(): string {
    return this.props.clientId;
  }
  public get eventType(): string {
    return this.props.eventType;
  }
  public get timestamp(): number {
    return this.props.timestamp;
  }
}

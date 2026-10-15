import { z } from "zod";

export const IncomingEventSchema = z.object({
  type: z.enum(["pageview", "event", "vitals", "error"]),
  path: z.string().optional(),
  referrer: z.string().optional(),
  sessionId: z.string().optional(),
  utmSource: z.string().optional(),
  utmMedium: z.string().optional(),
  utmCampaign: z.string().optional(),
  browser: z.string().optional(),
  os: z.string().optional(),
  device: z.string().optional(),
  country: z.string().optional(),
  metricName: z.string().optional(),
  metricValue: z.number().optional(),
  metricRating: z.string().optional(),
  payload: z.record(z.string(), z.any()).optional(),
  timestamp: z.number().optional(),
});

export const IngestBatchSchema = z.object({
  clientId: z.string().min(1),
  events: z.array(IncomingEventSchema).min(1).max(100),
});

export type IngestBatchDTO = z.infer<typeof IngestBatchSchema>;

export const OffloadConfigSchema = z.object({
  clientId: z.string().min(1),
  endpointUrl: z.string().url(),
  secret: z.string().min(8),
  enabled: z.boolean().default(true),
});

export type OffloadConfigDTO = z.infer<typeof OffloadConfigSchema>;

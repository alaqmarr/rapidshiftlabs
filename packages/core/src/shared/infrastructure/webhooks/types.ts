export type WebhookEventType =
  | "domain.down"
  | "domain.ssl_expiring"
  | "fleet.process_crashed"
  | "fleet.auto_healed"
  | "invoice.issued"
  | "invoice.overdue"
  | "ticket.staff_replied"
  | "ticket.escalated";

export interface WebhookEndpoint {
  id: string;
  clientId: string | null; // null represents system/admin global listener
  url: string;
  secret: string; // HMAC secret for signing
  events: (WebhookEventType | "*")[];
  description?: string;
  enabled: boolean;
  format?: "standard" | "slack" | "discord";
  createdAt: number;
  updatedAt: number;
}

export interface WebhookPayload<T = unknown> {
  id: string; // delivery id prefixed "whd_"
  event: WebhookEventType;
  clientId: string | null;
  timestamp: number;
  data: T;
  // Notification platform compatibility fields
  text?: string;
  content?: string;
}

export interface WebhookDispatchResult {
  endpointId: string;
  url: string;
  success: boolean;
  statusCode?: number;
  error?: string;
  attempts: number;
  deliveredAt: number;
}

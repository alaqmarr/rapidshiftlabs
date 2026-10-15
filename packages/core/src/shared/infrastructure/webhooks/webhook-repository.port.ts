import type { WebhookEndpoint, WebhookEventType } from "./types";

export interface IWebhookEndpointRepository {
  findById(id: string): Promise<WebhookEndpoint | null>;
  findByClientId(clientId: string | null): Promise<WebhookEndpoint[]>;
  findMatchingEndpoints(clientId: string | null, event: WebhookEventType): Promise<WebhookEndpoint[]>;
  save(endpoint: WebhookEndpoint): Promise<void>;
  delete(id: string): Promise<void>;
  listAll(): Promise<WebhookEndpoint[]>;
}

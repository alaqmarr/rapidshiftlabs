import type { IWebhookEndpointRepository } from "./webhook-repository.port";
import type { WebhookEndpoint, WebhookEventType } from "./types";

export class InMemoryWebhookEndpointRepository implements IWebhookEndpointRepository {
  private readonly endpoints = new Map<string, WebhookEndpoint>();

  async findById(id: string): Promise<WebhookEndpoint | null> {
    const ep = this.endpoints.get(id);
    return ep ? { ...ep } : null;
  }

  async findByClientId(clientId: string | null): Promise<WebhookEndpoint[]> {
    const list: WebhookEndpoint[] = [];
    for (const ep of this.endpoints.values()) {
      if (ep.clientId === clientId) {
        list.push({ ...ep });
      }
    }
    return list;
  }

  async findMatchingEndpoints(clientId: string | null, event: WebhookEventType): Promise<WebhookEndpoint[]> {
    const matched: WebhookEndpoint[] = [];
    for (const ep of this.endpoints.values()) {
      if (!ep.enabled) continue;

      // Match tenant: either matches specific client or is a global listener (null)
      const matchesClient = ep.clientId === null || ep.clientId === clientId;
      if (!matchesClient) continue;

      // Match event: wildcard or specific event
      const matchesEvent = ep.events.includes("*") || ep.events.includes(event);
      if (matchesEvent) {
        matched.push({ ...ep });
      }
    }
    return matched;
  }

  async save(endpoint: WebhookEndpoint): Promise<void> {
    this.endpoints.set(endpoint.id, { ...endpoint });
  }

  async delete(id: string): Promise<void> {
    this.endpoints.delete(id);
  }

  async listAll(): Promise<WebhookEndpoint[]> {
    return Array.from(this.endpoints.values()).map((ep) => ({ ...ep }));
  }

  clear(): void {
    this.endpoints.clear();
  }
}

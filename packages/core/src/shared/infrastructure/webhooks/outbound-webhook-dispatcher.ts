import { newId } from "../../kernel/id";
import type { RealtimeHub, RealtimeEvent } from "../events/realtime-hub";
import { validateSafeOutboundUrl, SecurityError } from "../network/ssrf-guard";
import type { IWebhookEndpointRepository } from "./webhook-repository.port";
import { InMemoryWebhookEndpointRepository } from "./in-memory-webhook.repository";
import { WebhookSigner } from "./webhook-signer";
import { WebhookFormatter } from "./webhook-formatter";
import type {
  WebhookEndpoint,
  WebhookEventType,
  WebhookPayload,
  WebhookDispatchResult,
} from "./types";

export interface OutboundWebhookDispatcherOptions {
  repository?: IWebhookEndpointRepository;
  fetchFn?: typeof fetch;
  maxRetries?: number;
  retryDelayMs?: number;
  timeoutMs?: number;
  enforceSsrfProtection?: boolean;
}

export class OutboundWebhookDispatcher {
  public readonly repo: IWebhookEndpointRepository;
  private readonly fetchFn: typeof fetch;
  private readonly maxRetries: number;
  private readonly retryDelayMs: number;
  private readonly timeoutMs: number;
  private readonly enforceSsrfProtection: boolean;

  constructor(options?: OutboundWebhookDispatcherOptions) {
    this.repo = options?.repository ?? new InMemoryWebhookEndpointRepository();
    this.fetchFn = options?.fetchFn ?? globalThis.fetch;
    this.maxRetries = options?.maxRetries ?? 3;
    this.retryDelayMs = options?.retryDelayMs ?? 100;
    this.timeoutMs = options?.timeoutMs ?? 5000;
    this.enforceSsrfProtection = options?.enforceSsrfProtection ?? (process.env.NODE_ENV !== "test");
  }

  /**
   * Registers a new or updated webhook endpoint for a client or global scope.
   */
  async registerEndpoint(params: {
    id?: string;
    clientId: string | null;
    url: string;
    secret: string;
    events: (WebhookEventType | "*")[];
    description?: string;
    enabled?: boolean;
    format?: "standard" | "slack" | "discord";
  }): Promise<WebhookEndpoint> {
    const id = params.id ?? newId("whk");
    const now = Date.now();
    const endpoint: WebhookEndpoint = {
      id,
      clientId: params.clientId,
      url: params.url.trim(),
      secret: params.secret,
      events: params.events,
      description: params.description,
      enabled: params.enabled ?? true,
      format: params.format,
      createdAt: now,
      updatedAt: now,
    };

    await this.repo.save(endpoint);
    return endpoint;
  }

  /**
   * Unregisters an endpoint by ID.
   */
  async unregisterEndpoint(id: string): Promise<void> {
    await this.repo.delete(id);
  }

  /**
   * Dispatches an event to all configured endpoints matching the client and event type.
   */
  async dispatch<T = unknown>(
    event: WebhookEventType,
    clientId: string | null,
    data: T
  ): Promise<WebhookDispatchResult[]> {
    const endpoints = await this.repo.findMatchingEndpoints(clientId, event);
    if (endpoints.length === 0) {
      return [];
    }

    const payload: WebhookPayload<T> = {
      id: newId("whd"),
      event,
      clientId,
      timestamp: Date.now(),
      data,
    };

    const results: WebhookDispatchResult[] = [];
    for (const endpoint of endpoints) {
      const res = await this.dispatchToEndpoint(endpoint, payload);
      results.push(res);
    }

    return results;
  }

  /**
   * Delivers a webhook payload to a single endpoint with SSRF check, signing, and retry backoff.
   */
  async dispatchToEndpoint(
    endpoint: WebhookEndpoint,
    payload: WebhookPayload
  ): Promise<WebhookDispatchResult> {
    // 1. SSRF Safety Check if enabled
    if (this.enforceSsrfProtection) {
      try {
        await validateSafeOutboundUrl(endpoint.url);
      } catch (err: any) {
        return {
          endpointId: endpoint.id,
          url: endpoint.url,
          success: false,
          error: `SSRF validation failed: ${err.message}`,
          attempts: 0,
          deliveredAt: Date.now(),
        };
      }
    }

    // 2. Format Body (Slack, Discord, or Standard JSON)
    const formattedBody = WebhookFormatter.formatBody(endpoint, payload);

    // 3. Create HMAC-SHA256 headers
    const headers = WebhookSigner.createHeaders({
      payloadString: formattedBody,
      secret: endpoint.secret,
      event: payload.event,
      deliveryId: payload.id,
      timestamp: payload.timestamp,
    });

    let attempts = 0;
    let lastError: string | undefined;
    let statusCode: number | undefined;

    while (attempts < this.maxRetries) {
      attempts++;
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), this.timeoutMs);

        const response = await this.fetchFn(endpoint.url, {
          method: "POST",
          headers,
          body: formattedBody,
          signal: controller.signal,
        });

        clearTimeout(timer);
        statusCode = response.status;

        // Consider 2xx HTTP codes successful
        if (response.ok) {
          return {
            endpointId: endpoint.id,
            url: endpoint.url,
            success: true,
            statusCode,
            attempts,
            deliveredAt: Date.now(),
          };
        }

        // 4xx client errors (e.g. 401 Unauthorized or 400 Bad Request) are not retried
        if (statusCode >= 400 && statusCode < 500) {
          lastError = `HTTP Client Error: ${statusCode} ${response.statusText}`;
          break;
        }

        lastError = `HTTP Server Error: ${statusCode} ${response.statusText}`;
      } catch (err: any) {
        lastError = err.name === "AbortError" ? `Request timed out after ${this.timeoutMs}ms` : err.message;
      }

      // Exponential backoff before next attempt
      if (attempts < this.maxRetries) {
        const backoffMs = this.retryDelayMs * Math.pow(2, attempts - 1);
        await new Promise((resolve) => setTimeout(resolve, backoffMs));
      }
    }

    return {
      endpointId: endpoint.id,
      url: endpoint.url,
      success: false,
      statusCode,
      error: lastError || "Unknown delivery failure",
      attempts,
      deliveredAt: Date.now(),
    };
  }

  /**
   * Attaches this webhook dispatcher to a RealtimeHub instance to automatically
   * translate and relay system events to registered client webhook endpoints.
   */
  attachToRealtimeHub(hub: RealtimeHub): () => void {
    const handler = (event: RealtimeEvent<any>) => {
      this.handleRealtimeEvent(event).catch((err) => {
        console.warn("[OutboundWebhookDispatcher] Failed to relay realtime event:", err);
      });
    };

    return hub.subscribe(["*"], handler);
  }

  private async handleRealtimeEvent(event: RealtimeEvent<any>): Promise<void> {
    const type = event.type;
    const clientId = event.clientId ?? null;
    const payload = event.payload;

    switch (type) {
      case "monitoring.domain.down":
      case "domain.down":
        await this.dispatch("domain.down", clientId, {
          domainId: payload?.domainId,
          hostname: payload?.hostname,
          reason: payload?.reason,
          failureCount: payload?.failureCount ?? 1,
          startedAt: payload?.startedAt ?? Date.now(),
          incidentId: payload?.incidentId,
        });
        break;

      case "monitoring.ssl.expiring":
      case "domain.ssl_expiring":
        await this.dispatch("domain.ssl_expiring", clientId, {
          domainId: payload?.domainId,
          hostname: payload?.hostname,
          daysRemaining: payload?.daysRemaining,
          expiresAt: payload?.expiresAt,
          issuer: payload?.issuer,
        });
        break;

      case "fleet.process_crashed":
        await this.dispatch("fleet.process_crashed", clientId, payload);
        break;

      case "fleet.auto_healed":
        await this.dispatch("fleet.auto_healed", clientId, payload);
        break;

      case "invoice.issued":
        await this.dispatch("invoice.issued", clientId, {
          invoiceId: payload?.invoiceId,
          invoiceNumber: payload?.invoiceNumber,
          clientId: payload?.clientId ?? clientId,
          totalMinor: payload?.totalMinor,
          dueDate: payload?.dueDate,
          billingMode: payload?.billingMode,
        });
        break;

      case "invoice.overdue":
        await this.dispatch("invoice.overdue", clientId, {
          invoiceId: payload?.invoiceId,
          invoiceNumber: payload?.invoiceNumber,
          clientId: payload?.clientId ?? clientId,
          balanceMinor: payload?.balanceMinor,
          dueDate: payload?.dueDate,
        });
        break;

      case "TicketMessageAdded":
        if (payload?.authorType === "admin" && !payload?.isInternal) {
          await this.dispatch("ticket.staff_replied", clientId, {
            ticketId: payload.ticketId,
            messageId: payload.messageId,
            clientId: payload.clientId ?? clientId,
            authorName: payload.authorName,
            bodySnippet: typeof payload.body === "string" ? payload.body.slice(0, 200) : "",
          });
        }
        break;

      case "TicketEscalated":
        await this.dispatch("ticket.escalated", clientId, {
          ticketId: payload?.ticketId,
          clientId: payload?.clientId ?? clientId,
          fromLevel: payload?.fromLevel,
          toLevel: payload?.toLevel,
          reason: payload?.reason,
          triggeredBy: payload?.triggeredBy,
        });
        break;

      default:
        // Other events not mapped to client outbound webhooks
        break;
    }
  }
}

let dispatcherInstance: OutboundWebhookDispatcher | null = null;

export function getWebhookDispatcher(options?: OutboundWebhookDispatcherOptions): OutboundWebhookDispatcher {
  if (options || !dispatcherInstance) {
    dispatcherInstance = new OutboundWebhookDispatcher(options);
  }
  return dispatcherInstance;
}

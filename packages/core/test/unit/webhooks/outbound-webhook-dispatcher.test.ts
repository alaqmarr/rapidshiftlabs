import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  OutboundWebhookDispatcher,
  WebhookSigner,
  WebhookFormatter,
  InMemoryWebhookEndpointRepository,
  type WebhookEventType,
} from "../../../src/shared/infrastructure/webhooks";
import { RealtimeHub } from "../../../src/shared/infrastructure/events/realtime-hub";

describe("Outbound Webhook Dispatcher (Pillar 1 & 2 Synergy)", () => {
  let mockFetch: any;
  let repo: InMemoryWebhookEndpointRepository;
  let dispatcher: OutboundWebhookDispatcher;
  const testSecret = "whsec_test_secret_key_1234567890abcdef";

  beforeEach(() => {
    repo = new InMemoryWebhookEndpointRepository();
    mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: "OK",
    });

    dispatcher = new OutboundWebhookDispatcher({
      repository: repo,
      fetchFn: mockFetch,
      enforceSsrfProtection: false, // disabled for fast in-memory mock testing
      maxRetries: 3,
      retryDelayMs: 10,
    });
  });

  describe("HMAC-SHA256 Cryptographic Signing", () => {
    it("generates deterministic HMAC-SHA256 signature and verifies correctly", () => {
      const payloadString = JSON.stringify({ event: "invoice.issued", invoiceId: "inv_123" });
      const signature = WebhookSigner.sign(payloadString, testSecret);

      expect(typeof signature).toBe("string");
      expect(signature.length).toBe(64); // SHA-256 hex is 64 chars

      // Verify valid signature
      const isValid = WebhookSigner.verify(payloadString, testSecret, signature);
      expect(isValid).toBe(true);

      // Verify with sha256= prefix
      expect(WebhookSigner.verify(payloadString, testSecret, `sha256=${signature}`)).toBe(true);

      // Verify tampered payload fails
      const tamperedPayload = JSON.stringify({ event: "invoice.issued", invoiceId: "inv_999" });
      expect(WebhookSigner.verify(tamperedPayload, testSecret, signature)).toBe(false);

      // Verify incorrect secret fails
      expect(WebhookSigner.verify(payloadString, "wrong_secret", signature)).toBe(false);

      // Verify malformed signature fails
      expect(WebhookSigner.verify(payloadString, testSecret, "invalid_sig")).toBe(false);
    });

    it("creates standard HTTP headers with signature and delivery metadata", () => {
      const payload = JSON.stringify({ message: "hello" });
      const now = 1700000000000;
      const headers = WebhookSigner.createHeaders({
        payloadString: payload,
        secret: testSecret,
        event: "fleet.process_crashed",
        deliveryId: "whd_abc123",
        timestamp: now,
      });

      expect(headers["Content-Type"]).toBe("application/json");
      expect(headers["User-Agent"]).toBe("RapidShift-Outbound-Webhook/1.0");
      expect(headers["X-RSL-Event"]).toBe("fleet.process_crashed");
      expect(headers["X-RSL-Delivery"]).toBe("whd_abc123");
      expect(headers["X-RSL-Timestamp"]).toBe(String(now));
      expect(headers["X-RSL-Signature"]).toMatch(/^sha256=[a-f0-9]{64}$/);
      expect(headers["X-Signature-SHA256"]).toBe(headers["X-RSL-Signature"]);
    });
  });

  describe("Endpoint Subscription & Scoping", () => {
    it("routes events only to subscribed client endpoints and global wildcard listeners", async () => {
      // Client A endpoint for fleet events
      await dispatcher.registerEndpoint({
        id: "whk_client_a",
        clientId: "cli_a",
        url: "https://api.client-a.com/webhooks",
        secret: testSecret,
        events: ["fleet.process_crashed", "fleet.auto_healed"],
      });

      // Client B endpoint for billing events
      await dispatcher.registerEndpoint({
        id: "whk_client_b",
        clientId: "cli_b",
        url: "https://api.client-b.com/webhooks",
        secret: testSecret,
        events: ["invoice.issued", "invoice.overdue"],
      });

      // Global admin listener (clientId: null, events: ["*"])
      await dispatcher.registerEndpoint({
        id: "whk_global_admin",
        clientId: null,
        url: "https://ops.internal.rapidshift.com/webhooks",
        secret: testSecret,
        events: ["*"],
      });

      // Dispatch fleet crash for Client A
      const resultsA = await dispatcher.dispatch("fleet.process_crashed", "cli_a", {
        processName: "api-server",
        serverHost: "10.0.1.10",
      });

      // Should be sent to Client A and Global Admin (2 endpoints), but NOT Client B
      expect(resultsA.length).toBe(2);
      expect(resultsA.map((r) => r.endpointId)).toContain("whk_client_a");
      expect(resultsA.map((r) => r.endpointId)).toContain("whk_global_admin");
      expect(resultsA.map((r) => r.endpointId)).not.toContain("whk_client_b");

      // Verify fetch calls
      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(mockFetch).toHaveBeenCalledWith(
        "https://api.client-a.com/webhooks",
        expect.any(Object)
      );
      expect(mockFetch).toHaveBeenCalledWith(
        "https://ops.internal.rapidshift.com/webhooks",
        expect.any(Object)
      );
    });

    it("skips disabled endpoints", async () => {
      await dispatcher.registerEndpoint({
        id: "whk_disabled",
        clientId: "cli_a",
        url: "https://disabled.com/hook",
        secret: testSecret,
        events: ["domain.down"],
        enabled: false,
      });

      const results = await dispatcher.dispatch("domain.down", "cli_a", { hostname: "app.com" });
      expect(results.length).toBe(0);
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  describe("Platform Formatting: Slack, Discord, and Standard JSON", () => {
    it("formats payload with 'text' and attachments for Slack endpoints", async () => {
      await dispatcher.registerEndpoint({
        id: "whk_slack",
        clientId: "cli_a",
        url: "https://hooks.slack.com/services/T000/B000/XXXX",
        secret: testSecret,
        events: ["domain.down"],
      });

      await dispatcher.dispatch("domain.down", "cli_a", {
        hostname: "api.customer.com",
        reason: "Connection refused (503)",
        failureCount: 3,
      });

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const call = mockFetch.mock.calls[0];
      const body = JSON.parse(call[1].body);

      expect(body.text).toContain("🚨 [RapidShift Alert] Domain DOWN: api.customer.com");
      expect(body.attachments).toBeDefined();
      expect(body.attachments[0].color).toBe("#e11d48"); // Red for outage
    });

    it("formats payload with 'content' and embeds for Discord endpoints", async () => {
      await dispatcher.registerEndpoint({
        id: "whk_discord",
        clientId: "cli_a",
        url: "https://discord.com/api/webhooks/12345/abcdef",
        secret: testSecret,
        events: ["fleet.auto_healed"],
      });

      await dispatcher.dispatch("fleet.auto_healed", "cli_a", {
        processName: "web-worker",
        serverHost: "node-2.rsl.internal",
      });

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const call = mockFetch.mock.calls[0];
      const body = JSON.parse(call[1].body);

      expect(body.content).toContain("✅ [RapidShift Alert] Process 'web-worker' AUTO-HEALED");
      expect(body.embeds).toBeDefined();
      expect(body.embeds[0].color).toBe(0x10b981); // Green for healed
    });
  });

  describe("Coverage for All 8 Required Outbound Webhook Events", () => {
    const allEvents: { event: WebhookEventType; data: any; expectedSnippet: string }[] = [
      {
        event: "domain.down",
        data: { domainId: "dom_1", hostname: "shop.example.com", reason: "HTTP 502 Bad Gateway", failureCount: 2 },
        expectedSnippet: "Domain DOWN",
      },
      {
        event: "domain.ssl_expiring",
        data: { domainId: "dom_1", hostname: "shop.example.com", daysRemaining: 5, expiresAt: Date.now() + 5 * 86400000 },
        expectedSnippet: "SSL Certificate Expiring in 5 days",
      },
      {
        event: "fleet.process_crashed",
        data: { processName: "auth-api", serverHost: "srv-01", restarts: 8, errorSignature: "Fatal OOM" },
        expectedSnippet: "auth-api' CRASHED",
      },
      {
        event: "fleet.auto_healed",
        data: { processName: "auth-api", serverHost: "srv-01", action: "restart" },
        expectedSnippet: "auth-api' AUTO-HEALED",
      },
      {
        event: "invoice.issued",
        data: { invoiceId: "inv_1", invoiceNumber: "INV-2026-001", totalMinor: 500000 },
        expectedSnippet: "Invoice #INV-2026-001 issued",
      },
      {
        event: "invoice.overdue",
        data: { invoiceId: "inv_1", invoiceNumber: "INV-2026-001", balanceMinor: 500000, dueDate: Date.now() },
        expectedSnippet: "Invoice #INV-2026-001 is OVERDUE",
      },
      {
        event: "ticket.staff_replied",
        data: { ticketId: "tkt_1", messageId: "msg_1", authorName: "Dev Support", bodySnippet: "We applied the memory patch." },
        expectedSnippet: "Staff replied to Ticket #tkt_1",
      },
      {
        event: "ticket.escalated",
        data: { ticketId: "tkt_1", fromLevel: "L1", toLevel: "L2", reason: "Repeated crash loop on production database" },
        expectedSnippet: "Ticket #tkt_1 ESCALATED to L2",
      },
    ];

    for (const item of allEvents) {
      it(`dispatches '${item.event}' with valid payload and signature`, async () => {
        await repo.clear();
        await dispatcher.registerEndpoint({
          id: `whk_${item.event.replace(".", "_")}`,
          clientId: "cli_omni",
          url: `https://webhook.site/test/${item.event}`,
          secret: testSecret,
          events: [item.event],
        });

        const results = await dispatcher.dispatch(item.event, "cli_omni", item.data);
        expect(results.length).toBe(1);
        expect(results[0].success).toBe(true);

        const call = mockFetch.mock.calls[mockFetch.mock.calls.length - 1];
        const headers = call[1].headers;
        const bodyStr = call[1].body;
        const body = JSON.parse(bodyStr);

        // Verify headers
        expect(headers["X-RSL-Event"]).toBe(item.event);
        expect(WebhookSigner.verify(bodyStr, testSecret, headers["X-RSL-Signature"])).toBe(true);

        // Verify payload content
        expect(body.event).toBe(item.event);
        expect(body.clientId).toBe("cli_omni");
        expect(body.text).toContain(item.expectedSnippet);
      });
    }
  });

  describe("Retry Mechanism & Fault Tolerance", () => {
    it("retries on HTTP 500 server error and succeeds when subsequent attempt returns 200", async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: false,
          status: 500,
          statusText: "Internal Server Error",
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          statusText: "OK",
        });

      await dispatcher.registerEndpoint({
        id: "whk_retry",
        clientId: "cli_a",
        url: "https://flaky-server.com/hook",
        secret: testSecret,
        events: ["*"],
      });

      const results = await dispatcher.dispatch("domain.down", "cli_a", { hostname: "test.com" });

      expect(results.length).toBe(1);
      expect(results[0].success).toBe(true);
      expect(results[0].attempts).toBe(2);
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it("does not retry on HTTP 400 Bad Request client errors", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        statusText: "Bad Request",
      });

      await dispatcher.registerEndpoint({
        id: "whk_no_retry",
        clientId: "cli_a",
        url: "https://bad-client.com/hook",
        secret: testSecret,
        events: ["*"],
      });

      const results = await dispatcher.dispatch("domain.down", "cli_a", { hostname: "test.com" });

      expect(results.length).toBe(1);
      expect(results[0].success).toBe(false);
      expect(results[0].attempts).toBe(1);
      expect(results[0].error).toContain("HTTP Client Error: 400");
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });
  });

  describe("RealtimeHub Event Bus Integration", () => {
    it("automatically catches RealtimeHub events and dispatches outbound webhooks", async () => {
      const hub = new RealtimeHub();
      const detach = dispatcher.attachToRealtimeHub(hub);

      await dispatcher.registerEndpoint({
        id: "whk_hub_listener",
        clientId: "cli_hub",
        url: "https://hub-consumer.com/webhooks",
        secret: testSecret,
        events: ["invoice.issued", "ticket.staff_replied"],
      });

      // 1. Emit invoice.issued on RealtimeHub
      hub.publish("billing:cli_hub", {
        id: "evt_1",
        topic: "billing:cli_hub",
        type: "invoice.issued",
        clientId: "cli_hub",
        payload: {
          invoiceId: "inv_777",
          invoiceNumber: "INV-777",
          totalMinor: 250000,
          dueDate: Date.now(),
        },
        timestamp: Date.now(),
      });

      // Wait a tick for async handler
      await new Promise((r) => setTimeout(r, 20));

      expect(mockFetch).toHaveBeenCalledWith(
        "https://hub-consumer.com/webhooks",
        expect.objectContaining({
          headers: expect.objectContaining({
            "X-RSL-Event": "invoice.issued",
          }),
        })
      );

      // 2. Emit TicketMessageAdded by staff
      hub.publish("support:tkt_1", {
        id: "evt_2",
        topic: "support:tkt_1",
        type: "TicketMessageAdded",
        clientId: "cli_hub",
        payload: {
          ticketId: "tkt_1",
          messageId: "msg_2",
          clientId: "cli_hub",
          authorName: "Senior SRE",
          authorType: "admin",
          isInternal: false,
          body: "We have isolated the root cause.",
        },
        timestamp: Date.now(),
      });

      await new Promise((r) => setTimeout(r, 20));

      expect(mockFetch).toHaveBeenCalledWith(
        "https://hub-consumer.com/webhooks",
        expect.objectContaining({
          headers: expect.objectContaining({
            "X-RSL-Event": "ticket.staff_replied",
          }),
        })
      );

      detach();
    });
  });
});

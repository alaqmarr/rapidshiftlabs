import { describe, it, expect } from "vitest";
import { EmbedToken } from "../../../src/modules/embeds/domain/entities/embed-token.entity";
import { WIDGET_CATALOG } from "../../../src/modules/embeds/domain/constants/widget-catalog";

describe("Embeds & Scoped Widget Security", () => {
  it("defines all expected widgets in the catalog with required scopes", () => {
    const widgetKeys = Object.keys(WIDGET_CATALOG);
    expect(widgetKeys.length).toBeGreaterThanOrEqual(18);

    expect(WIDGET_CATALOG["due-banner"]).toBeDefined();
    expect(WIDGET_CATALOG["billing-summary"]).toBeDefined();
    expect(WIDGET_CATALOG["server-status"]).toBeDefined();
    expect(WIDGET_CATALOG["domain-status"]).toBeDefined();
    expect(WIDGET_CATALOG["ticket-widget"]).toBeDefined();
    expect(WIDGET_CATALOG["analytics-overview"]).toBeDefined();
    expect(WIDGET_CATALOG["web-vitals"]).toBeDefined();
    expect(WIDGET_CATALOG["releases-list"]).toBeDefined();
    expect(WIDGET_CATALOG["client-dashboard"]).toBeDefined();
  });

  it("creates scoped embed tokens with 15-minute TTL and origin protection", () => {
    const now = 1700000000000;
    const token = EmbedToken.create({
      clientId: "cli_client_01",
      scopes: ["billing:read", "monitoring:read"],
      allowedOrigins: ["https://clientapp.com", "http://localhost:3000"],
      ttlMs: 900000, // 15 mins
      createdAt: now,
    });

    expect(token.id).toMatch(/^emb_/);
    expect(token.clientId).toBe("cli_client_01");
    expect(token.expiresAt).toBe(now + 900000);
    expect(token.hasScope("billing:read")).toBe(true);
    expect(token.hasScope("billing:write" as any)).toBe(false);

    expect(token.allowsOrigin("https://clientapp.com")).toBe(true);
    expect(token.allowsOrigin("https://malicious-site.com")).toBe(false);

    expect(token.isExpired(now + 10000)).toBe(false);
    expect(token.isExpired(now + 900001)).toBe(true);
  });
});

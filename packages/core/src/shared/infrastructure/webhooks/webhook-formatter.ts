import type { WebhookEventType, WebhookPayload } from "./types";

export class WebhookFormatter {
  /**
   * Formats a human-readable notification string suitable for chat platforms.
   */
  public static formatSummary(event: WebhookEventType, data: any): string {
    switch (event) {
      case "domain.down":
        return `🚨 [RapidShift Alert] Domain DOWN: ${data?.hostname || "Endpoint"} - ${data?.reason || "Health check failed"} (Consecutive failures: ${data?.failureCount ?? 1})`;

      case "domain.ssl_expiring":
        return `⚠️ [RapidShift Alert] SSL Certificate Expiring in ${data?.daysRemaining ?? "?"} days for ${data?.hostname || "Domain"}`;

      case "fleet.process_crashed":
        return `🔥 [RapidShift Alert] Process '${data?.processName || "Process"}' CRASHED on ${data?.serverHost || "server"} (Restarts: ${data?.restarts ?? 0}). ${data?.errorSignature ? `Error: ${data.errorSignature}` : ""}`;

      case "fleet.auto_healed":
        return `✅ [RapidShift Alert] Process '${data?.processName || "Process"}' AUTO-HEALED successfully on ${data?.serverHost || "server"}`;

      case "invoice.issued":
        return `📄 [RapidShift Billing] Invoice #${data?.invoiceNumber || "INV"} issued. Total: ₹${((data?.totalMinor || 0) / 100).toFixed(2)}`;

      case "invoice.overdue":
        return `⚠️ [RapidShift Billing] Invoice #${data?.invoiceNumber || "INV"} is OVERDUE. Outstanding balance: ₹${((data?.balanceMinor || 0) / 100).toFixed(2)}`;

      case "ticket.staff_replied":
        return `💬 [RapidShift Support] Staff replied to Ticket #${data?.ticketId || "TKT"}: "${data?.bodySnippet || data?.body || "New update available"}"`;

      case "ticket.escalated":
        return `⚡ [RapidShift Support] Ticket #${data?.ticketId || "TKT"} ESCALATED to ${data?.toLevel || "higher level"}. Reason: ${data?.reason || "Urgent attention required"}`;

      default:
        return `[RapidShift Notification] Event: ${event}`;
    }
  }

  /**
   * Formats payload based on endpoint type: Slack, Discord, or Standard.
   */
  public static formatBody(
    endpoint: { url: string; format?: "standard" | "slack" | "discord" },
    payload: WebhookPayload
  ): string {
    const textSummary = this.formatSummary(payload.event, payload.data);
    const isSlack = endpoint.format === "slack" || endpoint.url.includes("hooks.slack.com");
    const isDiscord = endpoint.format === "discord" || endpoint.url.includes("discord.com/api/webhooks");

    if (isSlack) {
      return JSON.stringify({
        text: textSummary,
        attachments: [
          {
            color: payload.event.includes("crashed") || payload.event.includes("down") || payload.event.includes("overdue")
              ? "#e11d48"
              : payload.event.includes("healed")
              ? "#10b981"
              : "#3b82f6",
            title: `RapidShift Event: ${payload.event}`,
            fields: [
              { title: "Client", value: payload.clientId || "System / All", short: true },
              { title: "Timestamp", value: new Date(payload.timestamp).toISOString(), short: true },
            ],
            footer: "RapidShift Autonomous Control Plane",
            ts: Math.floor(payload.timestamp / 1000),
          },
        ],
        // Retain original data under custom property for inspection
        rsl_event: payload.event,
        rsl_payload: payload,
      });
    }

    if (isDiscord) {
      return JSON.stringify({
        content: textSummary,
        embeds: [
          {
            title: `Event: ${payload.event}`,
            description: textSummary,
            color: payload.event.includes("crashed") || payload.event.includes("down") || payload.event.includes("overdue")
              ? 0xe11d48
              : payload.event.includes("healed")
              ? 0x10b981
              : 0x3b82f6,
            fields: [
              { name: "Client ID", value: payload.clientId || "Global", inline: true },
              { name: "Delivery ID", value: payload.id, inline: true },
            ],
            timestamp: new Date(payload.timestamp).toISOString(),
            footer: { text: "RapidShift Autonomous Control Plane" },
          },
        ],
        rsl_event: payload.event,
        rsl_payload: payload,
      });
    }

    // Standard JSON format with text/content included for generic webhook listeners
    return JSON.stringify({
      ...payload,
      text: textSummary,
      content: textSummary,
    });
  }
}

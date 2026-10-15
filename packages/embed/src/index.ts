/**
 * RapidShift Embeds Web Components
 * Style-isolated Custom Elements using Shadow DOM.
 */

export const WIDGETS = [
  "due-banner",
  "billing-summary",
  "next-due-countdown",
  "invoice-list",
  "invoice-history",
  "invoice-detail",
  "payment-history",
  "contract-card",
  "server-status",
  "process-list",
  "process-card",
  "metrics-chart",
  "uptime-badge",
  "domain-status",
  "ssl-expiry",
  "ticket-widget",
  "ticket-thread",
  "vault-secret",
  "analytics-overview",
  "analytics-chart",
  "top-pages",
  "web-vitals",
  "releases-list",
  "status-page",
  "client-dashboard",
] as const;

export type WidgetType = (typeof WIDGETS)[number];

export class RslWidgetElement extends HTMLElement {
  static get observedAttributes() {
    return ["token", "theme", "accent", "endpoint", "client-id"];
  }

  protected widgetName: string = "client-dashboard";
  protected shadow: ShadowRoot;

  constructor() {
    super();
    this.shadow = this.attachShadow({ mode: "open" });
  }

  connectedCallback() {
    this.render();
  }

  attributeChangedCallback() {
    this.render();
  }

  public setWidgetName(name: string) {
    this.widgetName = name;
  }

  protected render() {
    const token = this.getAttribute("token") || this.getAttribute("data-token") || "";
    const clientId = this.getAttribute("client-id") || this.getAttribute("data-client-id") || "";
    const theme = this.getAttribute("theme") || "dark";
    const accent = this.getAttribute("accent") || "#6366f1";
    const endpoint =
      this.getAttribute("endpoint") ||
      (window as any).RSL_EMBED_ENDPOINT ||
      window.location.origin;

    const isDark = theme === "dark";
    const bgColor = isDark ? "#09090b" : "#ffffff";
    const textColor = isDark ? "#f4f4f5" : "#09090b";
    const borderColor = isDark ? "#27272a" : "#e4e4e7";

    const iframeSrc = `${endpoint}/embed/${this.widgetName}?token=${encodeURIComponent(token)}&clientId=${encodeURIComponent(clientId)}&theme=${theme}&accent=${encodeURIComponent(accent)}`;

    this.shadow.innerHTML = `
      <style>
        :host {
          display: block;
          font-family: system-ui, -apple-system, sans-serif;
          color-scheme: ${theme};
          width: 100%;
        }
        .rsl-widget-container {
          background-color: ${bgColor};
          color: ${textColor};
          border: 1px solid ${borderColor};
          border-radius: 12px;
          overflow: hidden;
          box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
          width: 100%;
          min-height: 160px;
          position: relative;
        }
        iframe {
          width: 100%;
          height: 100%;
          min-height: 240px;
          border: none;
          display: block;
        }
        .rsl-badge {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 4px 10px;
          border-radius: 9999px;
          font-size: 12px;
          font-weight: 500;
          background: ${accent}20;
          color: ${accent};
        }
      </style>
      <div class="rsl-widget-container">
        <iframe
          src="${iframeSrc}"
          title="RapidShift ${this.widgetName} Widget"
          loading="lazy"
          sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-downloads"
        ></iframe>
      </div>
    `;
  }
}

// Auto-register all 23 custom elements if running in browser
if (typeof window !== "undefined" && typeof customElements !== "undefined") {
  for (const widget of WIDGETS) {
    const tagName = `rsl-${widget}`;
    if (!customElements.get(tagName)) {
      class SpecificWidgetElement extends RslWidgetElement {
        constructor() {
          super();
          this.setWidgetName(widget);
        }
      }
      customElements.define(tagName, SpecificWidgetElement);
    }
  }
}

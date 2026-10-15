/**
 * RapidShift Universal Embeds Runtime (embed.js)
 * Shadow DOM Style-Isolated Custom Elements + Auto-Resizing Iframe Bridge
 *
 * Works with:
 *   1. Permanent API Keys (`api-key="rpk_live_..."` or `data-api-key="rpk_live_..."`) — Recommended!
 *   2. Scoped Embed Tokens (`token="emb_..."`)
 *   3. Global Script Defaults (`<script defer src="https://rsl.alaqmar.dev/embed.js" data-api-key="rpk_live_..."></script>`)
 *
 * Supported Custom Elements:
 *   - Universal element: `<rsl-embed widget="billing-summary" api-key="rpk_live_..."></rsl-embed>`
 *   - Alias element: `<rapidshift-widget widget="billing-summary" api-key="rpk_live_..."></rapidshift-widget>`
 *   - Dedicated elements: `<rsl-billing-summary>`, `<rsl-analytics-overview>`, `<rsl-client-dashboard>`, etc. (all 23 widgets)
 *
 * Domain-Agnostic:
 *   Automatically resolves the RapidShift server origin from the `<script src=".../embed.js">` URL,
 *   so embeds hosted on any external client domain automatically connect to your RapidShift domain
 *   (e.g., https://rsl.alaqmar.dev today, or any custom domain in the future).
 */
(function () {
  if (typeof window === "undefined" || typeof customElements === "undefined") return;

  var WIDGETS = [
    "due-banner",
    "billing-summary",
    "next-due-countdown",
    "invoice-list",
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
    "ticket-desk",
    "ticket-list",
    "ticket-thread",
    "vault-secret",
    "analytics-overview",
    "analytics-chart",
    "top-pages",
    "web-vitals",
    "releases-list",
    "release-list",
    "status-page",
    "client-dashboard",
  ];

  // Auto-detect RapidShift host origin from the <script src=".../embed.js"> tag
  var scriptEl =
    document.currentScript ||
    document.querySelector('script[src*="/embed.js"],script[data-rsl-embed]');

  var detectedOrigin = "";
  try {
    if (scriptEl && scriptEl.src) {
      detectedOrigin = new URL(scriptEl.src).origin;
    }
  } catch (e) {}

  var globalApiKey =
    (scriptEl &&
      (scriptEl.getAttribute("data-api-key") ||
        scriptEl.getAttribute("api-key") ||
        scriptEl.getAttribute("data-key"))) ||
    window.RSL_API_KEY ||
    "";
  var globalToken =
    (scriptEl && (scriptEl.getAttribute("data-token") || scriptEl.getAttribute("token"))) ||
    window.RSL_EMBED_TOKEN ||
    "";
  var globalClientId =
    (scriptEl &&
      (scriptEl.getAttribute("data-client") ||
        scriptEl.getAttribute("data-client-id") ||
        scriptEl.getAttribute("client-id"))) ||
    window.RSL_CLIENT_ID ||
    "";
  var globalEndpoint =
    (scriptEl && (scriptEl.getAttribute("data-endpoint") || scriptEl.getAttribute("endpoint"))) ||
    window.RSL_EMBED_ENDPOINT ||
    detectedOrigin ||
    window.location.origin;

  var OBSERVED_ATTRS = [
    "widget",
    "data-widget",
    "api-key",
    "data-api-key",
    "key",
    "data-key",
    "token",
    "data-token",
    "client-id",
    "client",
    "data-client",
    "data-client-id",
    "theme",
    "accent",
    "endpoint",
    "height",
  ];

  var RslWidgetElement = (function (_super) {
    function RslWidget(fixedWidgetName) {
      var self = Reflect.construct(_super, [], RslWidget);
      self.fixedWidgetName = fixedWidgetName || "";
      self.shadow = self.attachShadow({ mode: "open" });
      self.iframeEl = null;
      return self;
    }
    Object.setPrototypeOf(RslWidget.prototype, _super.prototype);
    Object.setPrototypeOf(RslWidget, _super);

    Object.defineProperty(RslWidget, "observedAttributes", {
      get: function () {
        return OBSERVED_ATTRS;
      },
    });

    RslWidget.prototype.connectedCallback = function () {
      this.render();
    };

    RslWidget.prototype.attributeChangedCallback = function (name, oldVal, newVal) {
      if (oldVal !== newVal && this.isConnected) {
        this.render();
      }
    };

    RslWidget.prototype.render = function () {
      var widgetName =
        this.fixedWidgetName ||
        this.getAttribute("widget") ||
        this.getAttribute("data-widget") ||
        "client-dashboard";

      var apiKey =
        this.getAttribute("api-key") ||
        this.getAttribute("data-api-key") ||
        this.getAttribute("key") ||
        this.getAttribute("data-key") ||
        globalApiKey ||
        "";

      var token =
        this.getAttribute("token") ||
        this.getAttribute("data-token") ||
        globalToken ||
        "";

      var clientId =
        this.getAttribute("client-id") ||
        this.getAttribute("client") ||
        this.getAttribute("data-client") ||
        this.getAttribute("data-client-id") ||
        globalClientId ||
        "";

      var theme = this.getAttribute("theme") || "dark";
      var accent = this.getAttribute("accent") || "#2563eb";
      var minHeight = this.getAttribute("height") || "380px";
      var endpoint = (
        this.getAttribute("endpoint") ||
        this.getAttribute("data-endpoint") ||
        globalEndpoint ||
        window.location.origin
      ).replace(/\/+$/, "");

      var isDark = theme !== "light";
      var bg = isDark ? "#09090b" : "#ffffff";
      var text = isDark ? "#f4f4f5" : "#09090b";
      var border = isDark ? "#27272a" : "#e4e4e7";

      var params = new URLSearchParams();
      if (apiKey) params.set("apiKey", apiKey);
      if (token) params.set("token", token);
      if (clientId) params.set("clientId", clientId);
      if (theme) params.set("theme", theme);
      if (accent) params.set("accent", accent);

      var src = endpoint + "/embed/" + encodeURIComponent(widgetName) + "?" + params.toString();

      this.shadow.innerHTML =
        "<style>" +
        ":host{display:block;width:100%;font-family:system-ui,-apple-system,sans-serif;color-scheme:" +
        (isDark ? "dark" : "light") +
        ";}" +
        ".rsl-card{background:" +
        bg +
        ";color:" +
        text +
        ";border:1px solid " +
        border +
        ";border-radius:16px;overflow:hidden;box-shadow:0 4px 12px -2px rgba(0,0,0,0.12);width:100%;position:relative;}" +
        "iframe{width:100%;min-height:" +
        minHeight +
        ";border:none;display:block;transition:height 0.15s ease;}" +
        "</style>" +
        '<div class="rsl-card">' +
        '<iframe src="' +
        src +
        '" title="RapidShift ' +
        widgetName +
        '" loading="lazy" allow="clipboard-write" sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-downloads"></iframe>' +
        "</div>";

      this.iframeEl = this.shadow.querySelector("iframe");
    };

    return RslWidget;
  })(HTMLElement);

  // 1. Register universal <rsl-embed widget="..."> and <rapidshift-widget widget="...">
  var universalTags = ["rsl-embed", "rapidshift-widget"];
  for (var u = 0; u < universalTags.length; u++) {
    (function (tagName) {
      if (!customElements.get(tagName)) {
        var UniversalElem = function () {
          return Reflect.construct(RslWidgetElement, [""], UniversalElem);
        };
        Object.setPrototypeOf(UniversalElem.prototype, RslWidgetElement.prototype);
        Object.setPrototypeOf(UniversalElem, RslWidgetElement);
        customElements.define(tagName, UniversalElem);
      }
    })(universalTags[u]);
  }

  // 2. Register all dedicated <rsl-[widget]> custom elements
  for (var i = 0; i < WIDGETS.length; i++) {
    (function (w) {
      var tag = "rsl-" + w;
      if (!customElements.get(tag)) {
        var Elem = function () {
          return Reflect.construct(RslWidgetElement, [w], Elem);
        };
        Object.setPrototypeOf(Elem.prototype, RslWidgetElement.prototype);
        Object.setPrototypeOf(Elem, RslWidgetElement);
        customElements.define(tag, Elem);
      }
    })(WIDGETS[i]);
  }

  // 3. Auto-resize listener from embedded iframe postMessage
  window.addEventListener("message", function (event) {
    if (!event || !event.data || event.data.type !== "rsl-embed-resize") return;
    var newHeight = Number(event.data.height);
    if (!newHeight || newHeight < 120) return;

    var allCustomTags = universalTags.concat(
      WIDGETS.map(function (w) {
        return "rsl-" + w;
      })
    );
    for (var t = 0; t < allCustomTags.length; t++) {
      var nodes = document.querySelectorAll(allCustomTags[t]);
      for (var n = 0; n < nodes.length; n++) {
        var node = nodes[n];
        if (node.iframeEl && node.iframeEl.contentWindow === event.source) {
          node.iframeEl.style.height = newHeight + "px";
        }
      }
    }
  });
})();

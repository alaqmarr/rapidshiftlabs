# Embeddable Widgets & Web Components Guide

RapidShift provides **23 embeddable widgets** that allow clients and staff to drop billing cards, PM2 server metrics, domain uptime bars, support ticket creators, and analytics charts into any web page or customer portal using copy-paste code snippets.

---

## 1. Technologies & Architecture

- **Preact Web Components (Shadow DOM)**: Custom HTML elements (`<rapidshift-widget>`) delivered via `/embed.js` (~15 KB). Style encapsulation guarantees that the widget never interferes with or inherits styles from host stylesheets.
- **Iframe Fallbacks**: For strict environments where external JavaScript is prohibited, every widget can also be embedded via an isolated `<iframe>` pointing to `/embed/[widget]`.
- **Scoped Embed Tokens (`emb_...`)**: Server-minted tokens limit widget capabilities to specific data domains (e.g., `read:billing` or `create:tickets`), bound to specific allowed origins (`https://clientapp.com`) and expiry times.

---

## 2. Quick Start: Shadow DOM Web Component

### Step 1: Include the Embed Script

```html
<script defer src="https://api.rapidshiftlabs.com/embed.js"></script>
```

### Step 2: Mint a Scoped Embed Token

Before rendering the widget, your backend server calls `/api/v1/embed-tokens` using your secret API key:

```bash
curl -X POST "https://api.rapidshiftlabs.com/api/v1/embed-tokens" \
  -H "Authorization: Bearer rsk_live_01HQXYZ123456789" \
  -H "Content-Type: application/json" \
  -d '{
    "widgetType": "billing-summary",
    "scopes": ["read:billing"],
    "allowedOrigins": ["https://myclientapp.com"],
    "ttlSeconds": 86400
  }'
```

Response:
```json
{
  "data": {
    "token": "emb_01HQXYZ123456789",
    "expiresAt": 1773264000000
  }
}
```

### Step 3: Render the Web Component

```html
<rapidshift-widget
  widget="billing-summary"
  token="emb_01HQXYZ123456789"
  theme="dark"
></rapidshift-widget>
```

---

## 3. Alternative: Iframe Fallback

If you cannot run JavaScript, embed the widget using an iframe:

```html
<iframe
  src="https://api.rapidshiftlabs.com/embed/billing-summary?token=emb_01HQXYZ123456789&theme=dark"
  width="100%"
  height="350"
  frameborder="0"
  style="border-radius: 8px; border: 1px solid #27272a;"
></iframe>
```

---

## 4. 23-Widget Embed Catalog

| Category | Widget Identifier | Description |
|---|---|---|
| **Billing** | `billing-summary` | High-level outstanding balance, payment status, and next due date |
| | `invoices-table` | Interactive table of recent invoices with PDF download links |
| | `next-due-countdown` | Countdown timer badge to next payment deadline |
| | `contract-card` | Contract tenure valid-from/to, active tier, and billing cycle |
| **Fleet & PM2** | `fleet-overview` | Realtime status cards for managed servers and PM2 nodes |
| | `pm2-process-card` | Single PM2 process status, CPU, memory, and restart button |
| | `server-metrics-gauge` | CPU load average and RAM utilization gauges |
| | `process-logs-viewer` | Terminal log viewer streaming recent stdout/stderr lines |
| **Domain Monitoring** | `domain-status-card` | HTTP uptime percentage, response latency, and incident badge |
| | `domain-uptime-bar` | 90-day interactive green/yellow/red uptime history bar |
| | `ssl-expiry-badge` | SSL certificate validity, issuer, and days until renewal |
| | `dns-status-card` | DNS resolution drift verification status |
| **Support Desk** | `ticket-creator` | Interactive form for clients to raise new support tickets |
| | `ticket-list` | List of active and resolved support tickets |
| | `ticket-thread` | Live conversation thread with SSE realtime message streaming |
| | `sla-indicator` | SLA response clock countdown badge |
| **Analytics** | `analytics-summary` | Pageview totals, unique visitors, and bounce rate card |
| | `pageviews-chart` | Daily / hourly pageview line chart |
| | `visitors-donut` | Mobile vs. desktop device distribution donut chart |
| | `vitals-cards` | Core Web Vitals (LCP, INP, CLS) performance scorecards |
| **Releases** | `release-badges` | Current active staging and production build badges |
| | `download-links` | Links to beta artifacts, APKs, or staging environments |
| **Portal** | `portal-dashboard-embed` | Comprehensive multi-tab mini portal embedding all modules |

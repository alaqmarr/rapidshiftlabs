# Embeddable Widgets, Web Components & Universal Client Data API Guide

RapidShift Labs provides **23 drop-in embeddable widgets** and a **Unified Client Data REST API** so you can display live billing cards, invoices, PM2 server metrics, domain uptime, support ticket desks, and visitor analytics inside any web application.

Best of all, you **do not need to mint a new token each time**. You can generate a single **Universal API Key (`rpk_live_...`)** once and use it permanently across **all 23 Web Components**, **all 23 Iframes**, **in-place embed actions**, and the **Client Data REST API (`/api/v1/client/data`)**.

---

## 1. Domain & Origin Portability (`https://rsl.alaqmar.dev` & Custom Domains)

- **Current Production Domain**: `https://rsl.alaqmar.dev`
- **Future Domain Portability**:
  - When loading `/embed.js` or `/t.js`, the script **automatically detects the RapidShift server origin** from its own `<script src="...">` URL.
  - Inside the RapidShift portal, all generated snippets automatically read your active domain (`window.location.origin` or `NEXT_PUBLIC_APP_URL` / `NEXTAUTH_URL`).
  - If you migrate from `https://rsl.alaqmar.dev` to a new domain in the future, simply update `NEXT_PUBLIC_APP_URL` in your `.env` and point your `<script>` or `<iframe>` URL to the new domain — your API keys and embeds continue working without any code changes.

---

## 2. Step 1: Generate Your Universal API Key (One-Time Setup)

You only need to generate your key once:

1. Open the **Client Portal -> API Keys** (`/portal/api-keys`) or **Embed Studio** (`/portal/embeds` or `/admin/embeds`).
2. Click **"1-Click Universal Embed & API Key"**.
3. Copy your permanent key (e.g. `rpk_live_...`).
   - This single key automatically resolves your `clientId` (so you don't even need to pass `clientId` manually) and grants access to all 23 embeds, in-place actions (paying invoices, restarting PM2 processes, viewing logs, raising tickets), and `/api/v1/client/data`.
   - You can revoke or rotate this key at any time from `/portal/api-keys`.

---

## 3. Method A: Native Web Components (`embed.js`)

Web Components work in React, Next.js, Vue, Svelte, WordPress, or plain HTML. They automatically resize to fit their content.

### Option 1: Set Your API Key Globally on the Script Tag (Cleanest)

Pass `data-api-key="rpk_live_..."` once on the `<script>` tag. Every `<rsl-*>` component on the page will automatically inherit it:

```html
<!-- 1. Include RapidShift Embed Runtime once in <head> or <body> -->
<script
  defer
  src="https://rsl.alaqmar.dev/embed.js"
  data-api-key="rpk_live_YOUR_UNIVERSAL_API_KEY"
></script>

<!-- 2. Drop ANY of the 23 Web Components anywhere on your page -->
<rsl-client-dashboard theme="dark"></rsl-client-dashboard>
<rsl-billing-summary theme="dark"></rsl-billing-summary>
<rsl-analytics-overview theme="dark"></rsl-analytics-overview>
<rsl-process-list theme="dark"></rsl-process-list>
<rsl-domain-status theme="dark"></rsl-domain-status>
<rsl-ticket-list theme="dark"></rsl-ticket-list>
```

### Option 2: Pass `api-key` Directly on Individual Web Components

You can also pass `api-key` on each tag (using either the specific `<rsl-*>` tag or the generic `<rsl-embed widget="...">` / `<rapidshift-widget widget="...">` tag):

```html
<script defer src="https://rsl.alaqmar.dev/embed.js"></script>

<!-- Specific widget tag -->
<rsl-billing-summary
  api-key="rpk_live_YOUR_UNIVERSAL_API_KEY"
  theme="dark"
></rsl-billing-summary>

<!-- Or generic <rsl-embed> / <rapidshift-widget> tag -->
<rsl-embed
  widget="analytics-overview"
  api-key="rpk_live_YOUR_UNIVERSAL_API_KEY"
  theme="dark"
  accent="blue"
></rsl-embed>
```

---

## 4. Method B: Zero-JS Responsive Iframe (`/embed/[widget]`)

If your environment blocks external `<script>` tags (such as Notion, Confluence, internal wikis, or strict CSP dashboards), use an `<iframe>` with `?apiKey=`:

```html
<iframe
  src="https://rsl.alaqmar.dev/embed/client-dashboard?apiKey=rpk_live_YOUR_UNIVERSAL_API_KEY&theme=dark"
  width="100%"
  height="540"
  frameborder="0"
  style="border-radius: 16px; border: 1px solid #27272a; width: 100%; min-height: 460px;"
  loading="lazy"
  title="RapidShift Client Dashboard"
></iframe>
```

> **Note:** When using `?apiKey=rpk_live_...`, RapidShift automatically identifies your client account from the API key, so `clientId` is optional.

---

## 5. Method C: Direct Client Data REST API (`/api/v1/client/data`)

Want to build your own custom UI while fetching live client data? Use the same Universal API Key to query `GET /api/v1/client/data`:

```bash
curl -X GET "https://rsl.alaqmar.dev/api/v1/client/data" \
  -H "x-api-key: rpk_live_YOUR_UNIVERSAL_API_KEY"
```

Or in browser / Node.js `fetch` (you can pass `x-api-key`, `Authorization: Bearer rpk_live_...`, or `?apiKey=rpk_live_...`):

```typescript
const res = await fetch(
  "https://rsl.alaqmar.dev/api/v1/client/data?include=client,gate,billing,invoices,payments,contracts,fleet,domains,tickets,releases,analytics&days=30",
  {
    headers: {
      "x-api-key": "rpk_live_YOUR_UNIVERSAL_API_KEY",
    },
  }
);

const { data } = await res.json();
// data.client           -> Client profile & status
// data.gate             -> Realtime access gate status
// data.billingSummary   -> Outstanding balance, total billed, total paid
// data.invoices         -> List of invoices
// data.payments         -> Recorded payments
// data.contracts        -> Active contracts
// data.fleetProcesses   -> Mapped PM2 processes (CPU, RAM, status, restarts)
// data.monitoredDomains -> Domain uptime, SSL expiry days, HTTP status
// data.supportTickets   -> Support tickets & SLA status
// data.releases         -> Software releases & build artifacts
// data.analytics        -> Full visitor analytics, repeat viewers, top pages, vitals
```

---

## 6. Complete 23-Widget Catalog

Every widget below works with both `<rsl-[widget] api-key="...">` and `/embed/[widget]?apiKey=...`:

| Category | Widget Name (`/embed/[widget]`) | Web Component Tag | Description |
|---|---|---|---|
| **Master Suite** | `client-dashboard` | `<rsl-client-dashboard>` | All-in-one multi-tab client portal (Billing, Fleet, Domains, Support, Vault) |
| **Billing & Finance** | `billing-summary` | `<rsl-billing-summary>` | Current balance due, total billed/paid, and 1-click invoice settlement |
| | `due-banner` | `<rsl-due-banner>` | Alert banner when dues are pending or overdue |
| | `invoice-list` | `<rsl-invoice-list>` | Full invoice ledger with GST breakdown and in-place payment |
| | `payment-history` | `<rsl-payment-history>` | Verified payment receipts and transaction references |
| | `contract-card` | `<rsl-contract-card>` | Active contract retainer, billing cycle, and tenure dates |
| **Fleet & PM2** | `server-overview` | `<rsl-server-overview>` | Fleet summary of mapped PM2 processes, CPU, and RAM |
| | `process-list` | `<rsl-process-list>` | Interactive PM2 process table with Restart & Live Terminal Logs |
| | `process-card` | `<rsl-process-card>` | Single PM2 process status card with restart control |
| | `process-logs` | `<rsl-process-logs>` | Live stdout/stderr terminal log viewer |
| **Domain Monitoring** | `domain-status` | `<rsl-domain-status>` | HTTP uptime status, response latency, SSL expiry, and instant re-check |
| | `uptime-bars` | `<rsl-uptime-bars>` | 90-day visual availability timeline |
| | `ssl-badge` | `<rsl-ssl-badge>` | Compact SSL certificate validity and days-remaining badge |
| | `incident-feed` | `<rsl-incident-feed>` | Domain outage and recovery incident feed |
| | `status-page` | `<rsl-status-page>` | Public-style operational status page for all client domains |
| **Support Desk** | `support-widget` | `<rsl-support-widget>` | Full support desk to raise tickets and reply to threads |
| | `ticket-list` | `<rsl-ticket-list>` | Active and resolved support tickets with SLA status |
| | `sla-badge` | `<rsl-sla-badge>` | Live 24×7 SLA response clock badge |
| **Web Analytics** | `analytics-overview` | `<rsl-analytics-overview>` | Complete analytics suite: traffic chart, repeat viewers, top pages, referrers, journeys |
| | `pageviews-chart` | `<rsl-pageviews-chart>` | Daily pageviews, unique visitors, and repeat viewer area chart |
| | `top-pages` | `<rsl-top-pages>` | Top routes, acquisition referrers, and visitor countries |
| | `web-vitals` | `<rsl-web-vitals>` | Real Core Web Vitals (LCP, INP, CLS, FCP, TTFB) scorecard |
| | `visitor-Split` | `<rsl-visitor-split>` | Device, OS, and repeat vs. new visitor breakdown |
| **Releases** | `release-list` | `<rsl-release-list>` | Production, staging, and beta release notes & artifact downloads |

---

## 7. Optional: Short-Lived Scoped Embed Tokens (`emb_...`)

If you prefer short-lived tokens (e.g., 15-minute expiry) for temporary guest sessions, you can still mint `emb_...` tokens via `POST /api/v1/embed-tokens` and pass `token="emb_..."` instead of `api-key="rpk_live_..."`. Both authentication methods are 100% supported side by side.

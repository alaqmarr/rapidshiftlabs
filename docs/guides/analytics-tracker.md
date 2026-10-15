# Cookieless Analytics Tracker, Visitor Intelligence & Offload Guide

RapidShift provides a privacy-first, cookieless analytics and visitor intelligence suite that captures pageviews, click-path session journeys, repeat viewer loyalty, referrers, UTM campaigns, geographic regions, and real Core Web Vitals (LCP, INP, CLS, FCP, TTFB) — without GDPR/CCPA cookie banners.

---

## 1. Drop-In Installation (`t.js`)

Add the single `<script>` tag inside your website's `<head>` or root `layout.tsx`:

```html
<script
  defer
  src="https://rsl.alaqmar.dev/t.js"
  data-client="cli_01M4ZQK3D3EY8WYGS20H5M0D9S"
></script>
```

### Next.js App Router (`app/layout.tsx`)

```tsx
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <script
          defer
          src="https://rsl.alaqmar.dev/t.js"
          data-client="cli_01M4ZQK3D3EY8WYGS20H5M0D9S"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
```

### Domain Portability Note
`t.js` automatically detects the RapidShift ingest endpoint (`/api/collect`) from its own `<script src="...">` domain. Currently it uses `https://rsl.alaqmar.dev`, and if you ever move RapidShift to another domain in the future, updating the `src` URL is all that is required.

---

## 2. What `t.js` Captures Automatically

1. **Pageviews & SPA Route Transitions**: Hooks into `history.pushState`, `replaceState`, and `popstate` to record every route navigation in Next.js/React/Vue SPAs.
2. **User Visit History & Session Click-Paths**: Groups pageviews into sessions so you can inspect the exact sequence of pages a visitor viewed (`/` -> `/pricing` -> `/signup`) along with time spent.
3. **Repeat Viewer Detection**: Uses a privacy-safe first-party visit counter (`rsl_vc`) and rotating visitor hash to distinguish **New Visitors** from **Repeat Viewers (2x, 3x, 5x+)**.
4. **Acquisition & Geographic Attribution**: Captures external referrers, `utm_source`, `utm_medium`, `utm_campaign`, browser language, screen resolution, and country/region (resolved via CDN geo headers or IANA timezone mapping).
5. **Real Core Web Vitals**: Observes `largest-contentful-paint` (LCP), `first-input` / `event` (INP), `layout-shift` (CLS), `first-contentful-paint` (FCP), and navigation `responseStart` (TTFB).
6. **Runtime JS Exceptions**: Captures uncaught `window.onerror` and `unhandledrejection` events for rapid debugging.

---

## 3. Custom Event Tracking

Track custom conversions, button clicks, or checkout steps from anywhere in your frontend code:

```typescript
// Standard global helper
window.rslTrack?.("subscription_upgraded", {
  plan: "enterprise",
  billingCycle: "annual",
  valueInr: 49999,
});

// Alias also supported:
window.rapidshift?.track("lead_submitted", { source: "pricing_modal" });
```

---

## 4. Embedding Live Analytics Widgets on Your Site

Use your **Universal API Key (`rpk_live_...`)** (generated in `/portal/api-keys` or `/portal/embeds`) to embed live analytics dashboards via Web Components or Iframes without having to mint tokens:

### Option A: Web Component
```html
<script
  defer
  src="https://rsl.alaqmar.dev/embed.js"
  data-api-key="rpk_live_YOUR_UNIVERSAL_API_KEY"
></script>

<!-- Full Analytics Suite Embed -->
<rsl-embed widget="analytics-overview" theme="dark" accent="blue"></rsl-embed>
```

### Option B: Responsive Iframe
```html
<iframe
  src="https://rsl.alaqmar.dev/embed/analytics-overview?apiKey=rpk_live_YOUR_UNIVERSAL_API_KEY&theme=dark&accent=blue"
  style="width: 100%; height: 540px; border: 0; border-radius: 16px; overflow: hidden;"
  loading="lazy"
  title="RapidShift Analytics"
></iframe>
```

---

## 5. Querying Analytics via REST API

You can fetch your full analytics suite JSON directly using your Universal API Key:

```bash
# Via Unified Client Data API
curl -X GET "https://rsl.alaqmar.dev/api/v1/client/data?include=analytics&days=30" \
  -H "x-api-key: rpk_live_YOUR_UNIVERSAL_API_KEY"

# Or via Dedicated Analytics Suite Endpoint
curl -X GET "https://rsl.alaqmar.dev/api/v1/analytics/suite?range=30d" \
  -H "x-api-key: rpk_live_YOUR_UNIVERSAL_API_KEY"
```

---

## 6. Analytics Offload (HMAC-Signed Webhook Push & Pull Export)

Clients can stream raw analytics events to their own data warehouse (BigQuery, ClickHouse, Snowflake, or custom HTTP receiver):

1. Configure your **Destination Webhook URL** and **HMAC Verification Secret** in **Analytics -> Embeds & Tracker**.
2. Every batch pushed by RapidShift includes an `X-RapidShift-Signature` HMAC-SHA256 header.
3. Or pull raw events on demand via `GET https://rsl.alaqmar.dev/api/v1/analytics/export?limit=500` with `Authorization: Bearer rsk_live_...`.

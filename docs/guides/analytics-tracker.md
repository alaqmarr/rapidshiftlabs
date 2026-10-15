# Cookieless Analytics Tracker & Offload Guide

RapidShift provides a privacy-first, cookieless analytics solution designed to give both you and your clients deep insight into application traffic, visitor trends, device distribution, and Core Web Vitals without violating GDPR, CCPA, or requiring annoying cookie consent banners.

---

## 1. Features & Principles

- **Zero Cookies & LocalStorage**: Visitor identity is hashed using a daily rotating salt combined with client IP and User-Agent. No persistent identifier is written to the visitor's device.
- **Ultra-lightweight (< 2 KB)**: Loads asynchronously via `sendBeacon` with zero impact on time-to-interactive (TTI) or First Input Delay (FID).
- **Core Web Vitals Built-in**: Automatically captures Largest Contentful Paint (LCP), Interaction to Next Paint (INP), and Cumulative Layout Shift (CLS).
- **Automated Retention**: Raw event rows are automatically pruned after 60 days by the background worker, while aggregated daily/hourly metrics are retained permanently.
- **Client Offloading**: Clients can stream their analytics data directly to their own data warehouse or endpoints via HMAC-signed webhooks or REST pull export.

---

## 2. Drop-in Installation

Add the tracking script to your application's `<head>` or root layout. Replace `rpk_...` with your client publishable key:

```html
<!-- RapidShift Cookieless Tracker -->
<script
  defer
  src="https://api.rapidshiftlabs.com/t.js"
  data-key="rpk_live_01HQXYZ123456789"
  data-endpoint="https://api.rapidshiftlabs.com/api/collect"
></script>
```

### Next.js App Router Integration (`app/layout.tsx`)

```tsx
import Script from "next/script";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <Script
          src="https://api.rapidshiftlabs.com/t.js"
          strategy="afterInteractive"
          data-key={process.env.NEXT_PUBLIC_RAPIDSHIFT_KEY}
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
```

---

## 3. Custom Event Tracking

In addition to automatic pageviews and web vitals, you can track custom business events from client-side code:

```typescript
// Track conversion or custom action
if (window.rapidshift) {
  window.rapidshift.track("plan_purchased", {
    planId: "enterprise-annual",
    currency: "INR",
    amount: 150000,
    tenure: "12_months",
  });
}
```

---

## 4. Analytics Offload & Export

Clients can offload their analytics data out of RapidShift into their own database or analytics lake (e.g., Snowflake, BigQuery, ClickHouse) through two methods:

### Method A: HMAC-Signed Webhook Push

RapidShift background workers batch events every minute and push them to your configured webhook URL. Every payload includes an HMAC-SHA256 signature in the `X-RapidShift-Signature` header:

```typescript
// Webhook Receiver Example (Next.js / Express)
import crypto from "node:crypto";

export async function POST(req: Request) {
  const signature = req.headers.get("x-rapidshift-signature");
  const rawBody = await req.text();
  const webhookSecret = process.env.OFFLOAD_WEBHOOK_SECRET!;

  // 1. Verify HMAC Signature
  const expectedSignature = crypto
    .createHmac("sha256", webhookSecret)
    .update(rawBody)
    .digest("hex");

  if (signature !== expectedSignature) {
    return new Response("Invalid signature", { status: 401 });
  }

  // 2. Process Batched Events
  const { events } = JSON.parse(rawBody);
  console.log(`Received batch of ${events.length} analytics events.`);

  // Write into your internal data store...
  return new Response("OK", { status: 200 });
}
```

### Method B: REST Pull Export

Pull raw and aggregated events via the export API:

```bash
curl -X GET "https://api.rapidshiftlabs.com/api/v1/analytics/export?limit=500" \
  -H "Authorization: Bearer rsk_live_01HQXYZ123456789"
```

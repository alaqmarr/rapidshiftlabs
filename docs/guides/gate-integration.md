# Client Access Gate Integration Guide

The **RapidShift Access Gate** protects client web applications by dynamically verifying subscription and entitlement status. When client dues are settled, incoming requests pass through without delay. When invoices become overdue and the grace period expires, client traffic is safely redirected to an invoice payment screen.

Crucially, the Access Gate is built with a **fail-open architecture**: if the RapidShift control plane is temporarily unreachable or experiences downtime, your application remains 100% operational and traffic is never dropped.

---

## 1. How It Works

```
 Client Visitor Request
          │
          ▼
 [ Client App: proxy.ts / middleware.ts ]
          │
   Check in-memory LRU cache (< 1 ms)
     ├── Cache Hit (Valid pass) ──► Allow Request
     └── Cache Miss:
          │
          ▼
   HTTP GET /api/v1/access/status
   (RapidShift Control Plane API)
          │
     ├── 200 OK (Allowed) ────────► Cache Pass (60s) & Allow Request
     ├── 200 OK (Blocked) ────────► Redirect to /billing/payment-due
     └── Network / 5xx Error ─────► FAIL-OPEN: Log warning & Allow Request
```

### Key Performance Characteristics
- **Sub-millisecond verification**: Passes are signed with Ed25519 and cached in an in-memory LRU cache with a 60-second TTL.
- **Fail-open resilience**: Network timeouts (configurable, default 1500 ms) or HTTP 5xx responses automatically allow traffic to proceed.
- **Zero third-party cookies**: Verification uses server-to-server API authentication with your secret API key (`rsk_...`).

---

## 2. Installation

Install the official RapidShift SDK in your client application:

```bash
# Using pnpm
pnpm add @rapidshift/sdk

# Using npm
npm install @rapidshift/sdk

# Using yarn
yarn add @rapidshift/sdk
```

---

## 3. Integration in Next.js 16 (`proxy.ts`)

Next.js 16 replaces `middleware.ts` with `proxy.ts`. Add the gate handler to your root `proxy.ts`:

```typescript
// proxy.ts
import { NextResponse, type NextRequest } from "next/server";
import { createGate } from "@rapidshift/sdk";

// Initialize the gate instance with your credentials
const gate = createGate({
  apiKey: process.env.RAPIDSHIFT_API_KEY!, // Secret key: rsk_live_...
  apiUrl: process.env.RAPIDSHIFT_API_URL || "https://api.rapidshiftlabs.com",
  blockedRedirectUrl: "https://app.rapidshiftlabs.com/portal/billing",
  timeoutMs: 1500, // Timeout before triggering fail-open mode
  failOpen: true,  // Guaranteed uptime even if control plane is down
  excludePaths: [
    "/_next",
    "/favicon.ico",
    "/api/health",
    "/billing/payment-due",
  ],
});

export default async function proxy(req: NextRequest) {
  // Evaluate the gate
  const result = await gate.evaluate(req);

  if (result.action === "block") {
    // Redirect client to their branded payment-due portal
    return NextResponse.redirect(new URL(result.redirectUrl, req.url));
  }

  // Allow request to continue
  const response = NextResponse.next();

  // Optionally attach gate status headers for debugging
  response.headers.set("X-Gate-Status", result.status); // "allowed" | "fail-open"
  return response;
}
```

---

## 4. Integration in Next.js 14 / 15 (`middleware.ts`)

For applications running Next.js 14 or 15:

```typescript
// middleware.ts
import { NextResponse, type NextRequest } from "next/server";
import { createGate } from "@rapidshift/sdk";

const gate = createGate({
  apiKey: process.env.RAPIDSHIFT_API_KEY!,
  apiUrl: "https://api.rapidshiftlabs.com",
  blockedRedirectUrl: "/payment-due",
  failOpen: true,
});

export async function middleware(req: NextRequest) {
  const result = await gate.evaluate(req);

  if (result.action === "block") {
    return NextResponse.redirect(new URL("/payment-due", req.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api/webhooks).*)"],
};
```

---

## 5. Direct REST API Evaluation

If integrating from Express, Fastify, Go, Python, or Ruby, query the gate endpoint directly:

```bash
curl -X GET "https://api.rapidshiftlabs.com/api/v1/access/status" \
  -H "Authorization: Bearer rsk_live_01HQXYZ123456789"
```

### Response Example (Active & Allowed)
```json
{
  "data": {
    "status": "allowed",
    "allowed": true,
    "state": "active",
    "rapidshiftStatus": "online",
    "token": "eyJhbGciOiJFZERTQ...",
    "client": {
      "id": "cli_01HQXYZ123456789"
    },
    "cachedUntil": 1773177610000,
    "expiresAt": 1773177610000
  }
}
```

### Response Example (Overdue & Blocked)
```json
{
  "data": {
    "status": "blocked",
    "allowed": false,
    "state": "blocked",
    "rapidshiftStatus": "online",
    "token": "eyJhbGciOiJFZERTQ...",
    "client": {
      "id": "cli_01HQXYZ123456789"
    },
    "cachedUntil": 1773177610000,
    "expiresAt": 1773177610000
  }
}
```

---

## 6. Testing Fail-Open Resilience

You can simulate a control plane network failure to verify that your app stays up:

```typescript
// Test gate fail-open behavior locally
import { createGate } from "@rapidshift/sdk";

const brokenGate = createGate({
  apiKey: "rsk_test_mock",
  apiUrl: "http://127.0.0.1:9999", // Deliberately invalid host
  timeoutMs: 500,
  failOpen: true,
});

const result = await brokenGate.evaluate(dummyRequest);
console.assert(result.action === "allow", "Must allow traffic on network failure");
console.assert(result.status === "fail-open", "Status should be fail-open");
```

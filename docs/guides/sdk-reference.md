# RapidShift TypeScript SDK Reference (`@rapidshift/sdk`)

The `@rapidshift/sdk` package provides client-side and server-side utilities for evaluating the **RapidShift Access Gate**, caching Ed25519 entitlement passes, and enforcing fail-open resilience in Node.js, Express, and Next.js applications.

---

## 1. Installation

```bash
pnpm add @rapidshift/sdk
# or
npm install @rapidshift/sdk
```

---

## 2. Core Exports

```typescript
import {
  RapidShiftClient,
  createGate,
  createExpressGate,
  InMemoryCache,
  type GateOptions,
  type GateResult,
  type RapidShiftClientOptions,
} from "@rapidshift/sdk";
```

---

## 3. `createGate(options)`

The primary gateway function used inside Next.js `proxy.ts` or `middleware.ts`.

### Options Signature

```typescript
export interface GateOptions {
  /** Secret API Key issued in the RapidShift portal (rsk_...) */
  apiKey: string;
  /** RapidShift Control Plane API URL (default: https://api.rapidshiftlabs.com) */
  apiUrl?: string;
  /** Full URL to redirect users when access is blocked due to unpaid dues */
  blockedRedirectUrl?: string;
  /** HTTP request timeout in milliseconds before triggering fail-open (default: 1500) */
  timeoutMs?: number;
  /** When true, network/API errors allow traffic to proceed uninterrupted (default: true) */
  failOpen?: boolean;
  /** Array of path prefixes to exclude from gate checking */
  excludePaths?: string[];
  /** Optional custom cache implementation */
  cache?: InMemoryCache;
}
```

### Return Value: `GateHandler`

```typescript
const gate = createGate({
  apiKey: process.env.RAPIDSHIFT_API_KEY!,
  blockedRedirectUrl: "https://app.rapidshiftlabs.com/portal/billing",
});

const result = await gate.evaluate(request);
```

### `GateResult` Properties

| Field | Type | Description |
|---|---|---|
| `action` | `"allow" \| "block"` | Whether the incoming request should proceed or be redirected |
| `status` | `"allowed" \| "blocked" \| "fail-open"` | Diagnostic status of the entitlement check |
| `state` | `"active" \| "overdue" \| "blocked" \| "suspended"` | Raw entitlement state returned by RapidShift |
| `redirectUrl` | `string` | The URL to redirect to if `action === "block"` |
| `cached` | `boolean` | True if the decision was satisfied from local in-memory LRU cache |
| `token` | `string \| null` | Ed25519 JWT pass token issued by RapidShift |

---

## 4. `createExpressGate(options)`

Middleware generator for Express or Connect applications:

```typescript
import express from "express";
import { createExpressGate } from "@rapidshift/sdk";

const app = express();

app.use(
  createExpressGate({
    apiKey: process.env.RAPIDSHIFT_API_KEY!,
    blockedRedirectUrl: "https://app.rapidshiftlabs.com/portal/billing",
    failOpen: true,
  })
);

app.get("/dashboard", (req, res) => {
  res.send("Welcome to your dashboard!");
});
```

---

## 5. `RapidShiftClient`

A low-level API client for querying entitlement status or validating passes directly:

```typescript
import { RapidShiftClient } from "@rapidshift/sdk";

const client = new RapidShiftClient({
  apiKey: "rsk_live_01HQXYZ123456789",
  baseUrl: "https://api.rapidshiftlabs.com",
  timeoutMs: 2000,
});

// Fetch current entitlement pass
const status = await client.getAccessStatus();
console.log("Client Status:", status.data.status); // "allowed" | "blocked"
console.log("RapidShift Platform:", status.data.rapidshiftStatus); // "online"
```

---

## 6. Types Reference

```typescript
export type GateAccessState = "active" | "overdue" | "blocked" | "suspended";
export type GateFailMode = "fail-open" | "fail-closed";
export type RapidShiftPlatformStatus = "online" | "degraded" | "maintenance";

export interface AccessStatusResponse {
  data: {
    status: "allowed" | "blocked";
    allowed: boolean;
    state: GateAccessState;
    rapidshiftStatus: RapidShiftPlatformStatus;
    token: string;
    client: {
      id: string;
    };
    cachedUntil: number;
    expiresAt: number;
  };
}
```

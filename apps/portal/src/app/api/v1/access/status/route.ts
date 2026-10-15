export const runtime = "nodejs";

import { getContainer } from "@rsl/core/container";
import {
  getGateCache,
  type GateStatusEnvelope,
  type GateAccessState,
} from "../../../../../lib/cache/lru-cache";
import { gateStatusLimiter } from "../../../../../lib/rate-limiter";

function extractApiKey(req: Request): string | null {
  const authHeader = req.headers.get("authorization") || req.headers.get("Authorization");
  if (authHeader) {
    const trimmed = authHeader.trim();
    if (trimmed.startsWith("Bearer ") || trimmed.startsWith("bearer ")) {
      const key = trimmed.slice(7).trim();
      if (key) return key;
    } else if (!trimmed.includes(" ")) {
      return trimmed;
    }
  }

  const xApiKey = req.headers.get("x-api-key") || req.headers.get("X-Api-Key");
  if (xApiKey) {
    const trimmed = xApiKey.trim();
    if (trimmed) return trimmed;
  }

  return null;
}

export async function GET(req: Request): Promise<Response> {
  try {
    const ip =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      req.headers.get("x-real-ip") ||
      "127.0.0.1";

    const rateLimit = gateStatusLimiter.hit(ip);
    if (!rateLimit.allowed) {
      return Response.json(
        {
          error: {
            code: "rate_limited",
            message: "Too many requests to access gate. Please back off.",
          },
        },
        {
          status: 429,
          headers: {
            "Content-Type": "application/json",
            "Retry-After": String(rateLimit.retryAfterSeconds),
            "X-RateLimit-Limit": String(rateLimit.limit),
            "X-RateLimit-Remaining": "0",
            "X-RateLimit-Reset": String(rateLimit.resetTime),
          },
        },
      );
    }

    const rawKey = extractApiKey(req);
    if (!rawKey) {
      return Response.json(
        {
          error: {
            code: "unauthorized",
            message: "Missing API key in Authorization or X-Api-Key header",
          },
        },
        {
          status: 401,
          headers: {
            "Content-Type": "application/json",
            "X-RateLimit-Limit": String(rateLimit.limit),
            "X-RateLimit-Remaining": String(rateLimit.remaining),
            "X-RateLimit-Reset": String(rateLimit.resetTime),
          },
        },
      );
    }

    const cache = getGateCache();
    const cached = cache.get(rawKey);
    if (cached && Date.now() < cached.data.cachedUntil) {
      return Response.json(cached, {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "X-Cache": "HIT",
        },
      });
    }

    const container = getContainer();

    // 1. Validate API Key
    const validation = await container.apiPlatformModule.validateApiKey(rawKey);
    if (!validation.valid || !validation.clientId) {
      return Response.json(
        {
          error: {
            code: "unauthorized",
            message: `Invalid, revoked, or expired API key: ${validation.error || "unauthorized"}`,
          },
        },
        { status: 401 },
      );
    }

    const clientId = validation.clientId;

    // 2. Query billing repository for overdue invoices if available
    let daysOverdue: number | undefined;
    let amountDuePaise: number | undefined;

    if (container.billingRepo) {
      try {
        const overdueInvoices = await container.billingRepo.listInvoices({
          clientId,
          status: "overdue",
        });
        if (overdueInvoices?.items && overdueInvoices.items.length > 0) {
          let earliestDue = Infinity;
          let totalDue = 0;
          for (const inv of overdueInvoices.items) {
            if (inv.dueDate && inv.dueDate < earliestDue) {
              earliestDue = inv.dueDate;
            }
            totalDue += (inv.balanceMinor ?? inv.totalMinor ?? 0);
          }
          if (earliestDue < Infinity) {
            const now = Date.now();
            daysOverdue = Math.max(1, Math.floor((now - earliestDue) / (24 * 60 * 60 * 1000)) + 1);
          }
          amountDuePaise = totalDue;
        }
      } catch {
        // Fallback gracefully
      }
    }

    // 3. Retrieve Client Entitlement
    const entitlementProvider = container.entitlementModule as unknown as {
      getClientEntitlement?: (id: string, params?: any) => Promise<{
        status?: string;
        allowed?: boolean;
        isBlocked?: boolean;
        reason?: string;
        tierStatus?: "allowed" | "grace_period" | "restricted" | "blocked";
        daysOverdue?: number;
        graceDaysRemaining?: number;
        amountDuePaise?: number;
        restrictedPrefixes?: string[];
        warningMessage?: string;
      }>;
      evaluate: (id: string, params?: any) => Promise<{
        status?: string;
        allowed?: boolean;
        isBlocked?: boolean;
        reason?: string | null;
        tierStatus?: "allowed" | "grace_period" | "restricted" | "blocked";
        daysOverdue?: number;
        graceDaysRemaining?: number;
        amountDuePaise?: number;
        restrictedPrefixes?: string[];
        warningMessage?: string;
      }>;
    };

    const entitlement =
      typeof entitlementProvider.getClientEntitlement === "function"
        ? await entitlementProvider.getClientEntitlement(clientId, { daysOverdue, amountDuePaise })
        : await entitlementProvider.evaluate(clientId, { daysOverdue, amountDuePaise });

    if (daysOverdue === undefined && entitlement?.daysOverdue !== undefined) {
      daysOverdue = entitlement.daysOverdue;
    }
    if (amountDuePaise === undefined && entitlement?.amountDuePaise !== undefined) {
      amountDuePaise = entitlement.amountDuePaise;
    }

    // 4. Compute 3-Stage Tiered Access Status
    const normalizedState = (entitlement.status || "active").toLowerCase() as GateAccessState;
    const state: GateAccessState =
      normalizedState === "active" ||
      normalizedState === "overdue" ||
      normalizedState === "blocked" ||
      normalizedState === "suspended"
        ? normalizedState
        : "active";

    let tierStatus: "allowed" | "grace_period" | "restricted" | "blocked";
    let graceDaysRemaining: number | undefined;
    let restrictedPrefixes: string[] | undefined;
    let warningMessage: string | undefined;

    if (state === "suspended" || state === "blocked" || entitlement.isBlocked || !entitlement.allowed) {
      tierStatus = "blocked";
      warningMessage =
        state === "suspended"
          ? "Account is administratively suspended."
          : "Account access is blocked due to unpaid dues.";
    } else if (state === "overdue") {
      const days = daysOverdue ?? 1;
      if (days <= 3) {
        tierStatus = "grace_period";
        graceDaysRemaining = Math.max(0, 3 - days);
        warningMessage = `Payment overdue by ${days} day${days === 1 ? "" : "s"}. Grace period active: ${graceDaysRemaining} day${graceDaysRemaining === 1 ? "" : "s"} remaining.`;
      } else if (days <= 7) {
        tierStatus = "restricted";
        restrictedPrefixes = ["/admin", "/api/admin"];
        warningMessage = `Account in restricted mode (${days} days overdue). Admin routes are restricted.`;
      } else {
        tierStatus = "blocked";
        warningMessage = `Account access is blocked due to overdue invoices (${days} days overdue).`;
      }
    } else {
      tierStatus = entitlement.tierStatus || "allowed";
    }

    const allowed = tierStatus !== "blocked";

    // 5. Generate signed Ed25519 access pass token
    const token = await container.apiPlatformModule.signAccessPass({
      clientId,
      allowed,
      state,
      keyId: validation.keyId,
    });

    // 6. Build envelope matching project contract and cache
    const ttlMs = 10_000; // 10 seconds LRU cache TTL
    const cachedUntil = Date.now() + ttlMs;

    const envelope: GateStatusEnvelope = {
      data: {
        status: tierStatus,
        allowed,
        state,
        rapidshiftStatus: "online",
        token,
        client: {
          id: clientId,
        },
        cachedUntil,
        expiresAt: cachedUntil,
        ...(daysOverdue !== undefined ? { daysOverdue } : {}),
        ...(graceDaysRemaining !== undefined ? { graceDaysRemaining } : {}),
        ...(restrictedPrefixes ? { restrictedPrefixes } : {}),
        ...(amountDuePaise !== undefined ? { amountDuePaise } : {}),
        ...(warningMessage ? { warningMessage } : {}),
      },
    };

    cache.set(rawKey, envelope, ttlMs);

    return Response.json(envelope, {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "X-Cache": "MISS",
        "X-RateLimit-Limit": String(rateLimit.limit),
        "X-RateLimit-Remaining": String(rateLimit.remaining),
        "X-RateLimit-Reset": String(rateLimit.resetTime),
      },
    });
  } catch (error) {
    console.error("[Gateway Status Error]:", error);
    return Response.json(
      {
        error: {
          code: "internal_error",
          message: error instanceof Error ? error.message : "An unexpected error occurred",
        },
      },
      { status: 500 },
    );
  }
}

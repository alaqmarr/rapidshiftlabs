export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { getContainer } from "@rsl/core/container";
import { getRequestActor } from "@/lib/auth-actor";
import { calculateContractTenure, pickPrimaryClientContract } from "@/lib/contract-tenure";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, x-api-key, x-publishable-key",
};

function serializeEntity(item: any): any {
  if (item === null || item === undefined) return item;
  if (Array.isArray(item)) return item.map(serializeEntity);
  if (typeof item.toState === "function") {
    return JSON.parse(JSON.stringify(item.toState()));
  }
  if (typeof item.toSnapshot === "function") {
    return JSON.parse(JSON.stringify(item.toSnapshot()));
  }
  if (item.props && typeof item.props === "object") {
    return JSON.parse(JSON.stringify({ ...item.props, ...item }));
  }
  return JSON.parse(JSON.stringify(item));
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

/**
 * GET /api/v1/client/data
 *
 * Universal Client Data & Embed REST API endpoint.
 * Authenticates via a permanent API Key (`rpk_live_...` or `rsk_live_...`):
 *   - Header: `Authorization: Bearer rpk_live_...`
 *   - Header: `x-api-key: rpk_live_...`
 *   - Query:  `?apiKey=rpk_live_...`
 *
 * Optional query parameters:
 *   - `include`: comma-separated sections to fetch (default: all)
 *     Valid values: `client,gate,billing,invoices,payments,contracts,fleet,domains,tickets,releases,analytics`
 *   - `days`: analytics window in days (default: 30)
 */
export async function GET(req: NextRequest) {
  const actor = await getRequestActor(req);

  if (!actor) {
    return NextResponse.json(
      {
        error: {
          code: "UNAUTHORIZED",
          message:
            "Missing or invalid API key. Pass your API key via 'Authorization: Bearer rpk_live_...', 'x-api-key: rpk_live_...', or '?apiKey=rpk_live_...'.",
        },
      },
      { status: 401, headers: CORS_HEADERS }
    );
  }

  const url = new URL(req.url);
  const requestedClientId = url.searchParams.get("clientId");
  const clientId =
    actor.kind === "admin"
      ? requestedClientId || null
      : actor.kind === "client_user" || actor.kind === "api_key"
        ? actor.clientId
        : null;

  if (!clientId) {
    return NextResponse.json(
      {
        error: {
          code: "BAD_REQUEST",
          message: "No clientId resolved from API key or query parameters.",
        },
      },
      { status: 400, headers: CORS_HEADERS }
    );
  }

  const includeParam = url.searchParams.get("include");
  const allSections = [
    "client",
    "gate",
    "billing",
    "invoices",
    "payments",
    "contracts",
    "fleet",
    "domains",
    "tickets",
    "releases",
    "analytics",
  ];
  const requestedSections = new Set(
    includeParam
      ? includeParam
          .split(",")
          .map((s) => s.trim().toLowerCase())
          .filter(Boolean)
      : allSections
  );

  const days = Math.min(
    365,
    Math.max(1, Number(url.searchParams.get("days") || "30") || 30)
  );

  try {
    const container = getContainer();
    const nowMs = Date.now();
    const fromMs = nowMs - days * 86400000;

    const [
      clientRecord,
      gateRecord,
      billingSummaryRecord,
      invoicesRes,
      paymentsRes,
      contractsRes,
      fleetProcesses,
      monitoredDomains,
      ticketsRes,
      releasesRes,
      analyticsRes,
    ] = await Promise.all([
      requestedSections.has("client")
        ? container.clientDirectoryRepo.findById(clientId).catch(() => null)
        : Promise.resolve(null),
      requestedSections.has("gate")
        ? container.entitlementModule
            .evaluate(clientId)
            .catch(() => null)
        : Promise.resolve(null),
      requestedSections.has("billing")
        ? container.billingRepo.getBillingSummary(clientId).catch(() => null)
        : Promise.resolve(null),
      requestedSections.has("invoices")
        ? container.billingRepo.listInvoices({ clientId }).catch(() => [])
        : Promise.resolve([]),
      requestedSections.has("payments")
        ? container.billingRepo.listPayments({ clientId }).catch(() => [])
        : Promise.resolve([]),
      requestedSections.has("contracts") || requestedSections.has("billing")
        ? container.contractRepo.list({ clientId }).catch(() => [])
        : Promise.resolve([]),
      requestedSections.has("fleet")
        ? container.pm2ProcessRepo.listByClientId(clientId).catch(() => [])
        : Promise.resolve([]),
      requestedSections.has("domains")
        ? container.monitoredDomainRepo.findByClientId(clientId).catch(() => [])
        : Promise.resolve([]),
      requestedSections.has("tickets")
        ? container.ticketRepo.list({ clientId }).catch(() => [])
        : Promise.resolve([]),
      requestedSections.has("releases")
        ? container.releases.listReleasesUseCase
            .execute({ clientId }, actor)
            .catch(() => [])
        : Promise.resolve([]),
      requestedSections.has("analytics")
        ? container.analyticsRepo.getDeepAnalyticsSuite
          ? container.analyticsRepo
              .getDeepAnalyticsSuite(clientId, fromMs, nowMs)
              .catch(() => null)
          : Promise.resolve(null)
        : Promise.resolve(null),
    ]);

    const responseData: Record<string, unknown> = {
      clientId,
      generatedAt: new Date(nowMs).toISOString(),
    };

    if (requestedSections.has("client")) {
      responseData.client = serializeEntity(clientRecord);
    }

    if (requestedSections.has("gate")) {
      responseData.gate = gateRecord;
    }

    const rawContractsList =
      (contractsRes as any)?.items ||
      (Array.isArray(contractsRes) ? contractsRes : []);
    const serializedContracts = (serializeEntity(rawContractsList) || []).map((c: any) => ({
      ...c,
      calculatedTenure: calculateContractTenure(
        {
          billingCycle: c.billingCycle || "monthly",
          intervalCount: c.intervalCount || 1,
          anchorDay: c.anchorDay || 1,
          validFrom: c.validFrom,
          validTo: c.validTo,
          amountMinor: c.amountMinor || 0,
          currency: c.currency || "INR",
          status: c.status,
        },
        nowMs
      ),
    }));
    const primaryContract = pickPrimaryClientContract(serializedContracts);

    if (requestedSections.has("billing")) {
      responseData.billingSummary = {
        ...(billingSummaryRecord || {}),
        activeContract: primaryContract
          ? {
              ...primaryContract,
              calculatedTenure: calculateContractTenure(primaryContract, nowMs),
            }
          : null,
      };
    }

    if (requestedSections.has("invoices")) {
      const rawInvoices =
        (invoicesRes as any)?.items ||
        (Array.isArray(invoicesRes) ? invoicesRes : []);
      responseData.invoices = serializeEntity(rawInvoices);
    }

    if (requestedSections.has("payments")) {
      const rawPayments =
        (paymentsRes as any)?.items ||
        (Array.isArray(paymentsRes) ? paymentsRes : []);
      responseData.payments = serializeEntity(rawPayments);
    }

    if (requestedSections.has("contracts")) {
      responseData.contracts = serializedContracts;
    }

    if (requestedSections.has("fleet")) {
      responseData.fleetProcesses = serializeEntity(fleetProcesses);
    }

    if (requestedSections.has("domains")) {
      responseData.monitoredDomains = serializeEntity(monitoredDomains);
    }

    if (requestedSections.has("tickets")) {
      const rawTickets =
        (ticketsRes as any)?.items ||
        (Array.isArray(ticketsRes) ? ticketsRes : []);
      responseData.supportTickets = serializeEntity(rawTickets);
    }

    if (requestedSections.has("releases")) {
      responseData.releases = serializeEntity(releasesRes);
    }

    if (requestedSections.has("analytics")) {
      responseData.analytics = analyticsRes;
    }

    return NextResponse.json(
      { data: responseData },
      { status: 200, headers: CORS_HEADERS }
    );
  } catch (err: any) {
    return NextResponse.json(
      {
        error: {
          code: "INTERNAL_ERROR",
          message: err?.message || "Failed to fetch client data.",
        },
      },
      { status: 500, headers: CORS_HEADERS }
    );
  }
}

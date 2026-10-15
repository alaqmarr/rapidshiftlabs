import { NextRequest, NextResponse } from "next/server";
import { getContainer } from "@rsl/core/container";
import { assertCan, scopeClientId } from "@rsl/core/kernel";
import { getRequestActor } from "@/lib/auth-actor";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const actor = await getRequestActor(req);
    if (!actor) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    assertCan(actor, "analytics:read");

    const { searchParams } = new URL(req.url);
    const requestedClientId = searchParams.get("clientId");
    const targetClientId = scopeClientId(actor, requestedClientId);

    if (!targetClientId) {
      return NextResponse.json(
        { error: "Client ID is required to query analytics suite" },
        { status: 400 }
      );
    }

    const range = searchParams.get("range") || "30d";
    const now = Date.now();
    let from = now - 30 * 86400 * 1000;
    let interval: "hour" | "day" = "day";

    if (range === "24h") {
      from = now - 24 * 3600 * 1000;
      interval = "hour";
    } else if (range === "7d") {
      from = now - 7 * 86400 * 1000;
      interval = "day";
    } else if (range === "30d") {
      from = now - 30 * 86400 * 1000;
      interval = "day";
    } else if (range === "90d") {
      from = now - 90 * 86400 * 1000;
      interval = "day";
    }

    if (searchParams.get("from")) {
      from = parseInt(searchParams.get("from")!, 10) || from;
    }
    const to = searchParams.get("to")
      ? parseInt(searchParams.get("to")!, 10) || now
      : now;

    const container = getContainer();
    const suite = await container.analyticsRepo.getDeepAnalyticsSuite!(
      targetClientId,
      from,
      to,
      interval
    );

    return NextResponse.json({ suite });
  } catch (err: any) {
    console.error("[API] Analytics suite error:", err);
    return NextResponse.json(
      { error: err?.message || "Failed to fetch analytics suite" },
      { status: err?.status || 400 }
    );
  }
}

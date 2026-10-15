export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { getContainer } from "@rsl/core/container";
import { getRequestActor } from "@/lib/auth-actor";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const actor = await getRequestActor(request);
    if (!actor) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await context.params;
    const container = getContainer();

    const domain = await container.monitoringModule.getDomain(id);
    if (!domain) {
      return NextResponse.json({ error: "Domain not found" }, { status: 404 });
    }

    if (actor.kind === "client_user" || actor.kind === "api_key") {
      if (domain.clientId !== actor.clientId) {
        return NextResponse.json(
          { error: "Forbidden: domain belongs to another client" },
          { status: 403 },
        );
      }
    } else if (actor.kind !== "admin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const [recentChecks, dailyBars] = await Promise.all([
      container.domainCheckRepo.getRecentChecks(id, 50),
      container.domainCheckRepo.getDailyBars(id, 90),
    ]);

    return NextResponse.json({
      domain: domain.toState(),
      recentChecks,
      dailyBars,
    });
  } catch (error: any) {
    console.error("[API] Error fetching client domain details:", error);
    return NextResponse.json({ error: error.message || String(error) }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from "next/server";
import { getContainer } from "@rsl/core/container";
import { getRequestActor } from "@/lib/auth-actor";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const actor = await getRequestActor(req);
    if (!actor) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const clientId = searchParams.get("clientId");
    const now = Date.now();
    const from = parseInt(searchParams.get("from") || `${now - 30 * 86400 * 1000}`, 10);
    const to = parseInt(searchParams.get("to") || `${now}`, 10);
    const limit = parseInt(searchParams.get("limit") || "1000", 10);

    const container = getContainer();
    const events = await container.analytics.exportAnalyticsUseCase.execute(
      clientId,
      from,
      to,
      limit,
      actor,
    );

    return NextResponse.json({
      data: events.map((e) => e.props),
      meta: { count: events.length, from, to },
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || "Failed to export analytics events" },
      { status: err?.status || 400 },
    );
  }
}

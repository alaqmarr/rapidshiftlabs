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
    const interval = (searchParams.get("interval") || "day") as "hour" | "day";

    const container = getContainer();
    const points = await container.analytics.getTimeseriesUseCase.execute(
      clientId,
      from,
      to,
      interval,
      actor,
    );

    return NextResponse.json({ data: points });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || "Failed to fetch analytics timeseries" },
      { status: err?.status || 400 },
    );
  }
}

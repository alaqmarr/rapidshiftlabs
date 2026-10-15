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

    const container = getContainer();
    const result = await container.analytics.getOverviewUseCase.execute(
      clientId,
      from,
      to,
      actor,
    );

    return NextResponse.json({ data: result });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || "Failed to fetch analytics overview" },
      { status: err?.status || 400 },
    );
  }
}

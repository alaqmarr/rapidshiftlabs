export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { getContainer } from "@rsl/core/container";
import { getRequestActor } from "@/lib/auth-actor";
import { ForbiddenError, NotFoundError } from "@rsl/core/kernel";

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
    const searchParams = request.nextUrl.searchParams;
    const linesParam = searchParams.get("lines");
    const lines = linesParam ? Math.min(Math.max(Number(linesParam) || 100, 1), 1000) : 100;
    const container = getContainer();

    const logs = await container.fleetModule.getProcessLogs({
      processId: id,
      options: { lines },
      actor,
    });

    return NextResponse.json({ logs });
  } catch (error: any) {
    console.error("[API] Error fetching process logs:", error);
    if (error instanceof ForbiddenError) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    if (error instanceof NotFoundError) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    return NextResponse.json({ error: error.message || String(error) }, { status: 400 });
  }
}

export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { getContainer } from "@rsl/core/container";
import { ForbiddenError, NotFoundError } from "@rsl/core/kernel";
import { requireAdminInfraActor } from "@/lib/admin-server-guard";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const guard = await requireAdminInfraActor(request, { allowSupportRead: true });
    if (guard.errorResponse) return guard.errorResponse;

    const { id } = await context.params;
    const searchParams = request.nextUrl.searchParams;
    const linesParam = searchParams.get("lines");
    const lines = linesParam ? Math.min(Math.max(Number(linesParam) || 100, 1), 1000) : 100;
    const container = getContainer();

    const logs = await container.fleetModule.getProcessLogs({
      processId: id,
      options: { lines },
      actor: guard.actor,
    });

    return NextResponse.json({ logs });
  } catch (error: any) {
    console.error("[API] Error fetching process logs from admin:", error);
    if (error instanceof ForbiddenError) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    if (error instanceof NotFoundError) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    return NextResponse.json({ error: error.message || String(error) }, { status: 400 });
  }
}

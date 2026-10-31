export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { getContainer } from "@rsl/core/container";
import { ForbiddenError, NotFoundError, RateLimitError } from "@rsl/core/kernel";
import { requireAdminInfraActor } from "@/lib/admin-server-guard";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const guard = await requireAdminInfraActor(request);
    if (guard.errorResponse) return guard.errorResponse;

    const { id } = await context.params;
    const container = getContainer();

    const result = await container.fleetModule.restartProcess({
      processId: id,
      actor: guard.actor,
    });

    return NextResponse.json({ result });
  } catch (error: any) {
    console.error("[API] Error restarting process from admin:", error);
    if (error instanceof ForbiddenError) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    if (error instanceof NotFoundError) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    if (error instanceof RateLimitError) {
      return NextResponse.json({ error: error.message }, { status: 429 });
    }
    return NextResponse.json({ error: error.message || String(error) }, { status: 400 });
  }
}

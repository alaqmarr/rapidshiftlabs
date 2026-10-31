export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { getContainer } from "@rsl/core/container";
import { requireAdminInfraActor } from "@/lib/admin-server-guard";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const guard = await requireAdminInfraActor(request);
    if (guard.errorResponse) return guard.errorResponse;

    const { id } = await context.params;
    const container = getContainer();

    const processes = await container.fleetModule.discoverProcesses(id);
    return NextResponse.json({ processes });
  } catch (error: any) {
    console.error("[API] Error discovering processes:", error);
    return NextResponse.json({ error: error.message || String(error) }, { status: 500 });
  }
}

export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { getContainer } from "@rsl/core/container";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const body = await request.json();
    const container = getContainer();

    const process = await container.fleetModule.mapProcessToClient({
      processId: id,
      clientId: body.clientId !== undefined ? body.clientId : null,
      allowClientRestart: body.allowClientRestart !== undefined ? Boolean(body.allowClientRestart) : undefined,
      restartCooldownSec: body.restartCooldownSec ? Number(body.restartCooldownSec) : undefined,
    });

    return NextResponse.json({ process });
  } catch (error: any) {
    console.error("[API] Error mapping process:", error);
    return NextResponse.json({ error: error.message || String(error) }, { status: 400 });
  }
}

export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { getContainer } from "@rsl/core/container";

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const container = getContainer();

    const server = await container.fleetModule.getServer(id);
    if (!server) {
      return NextResponse.json({ error: "Server not found" }, { status: 404 });
    }

    const processes = await container.pm2ProcessRepo.listByServerId(id);

    return NextResponse.json({
      server,
      processes: processes.map((p) => p.toSnapshot()),
    });
  } catch (error: any) {
    console.error("[API] Error fetching server:", error);
    return NextResponse.json({ error: error.message || String(error) }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const container = getContainer();

    await container.fleetModule.deleteServer(id);
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("[API] Error deleting server:", error);
    return NextResponse.json({ error: error.message || String(error) }, { status: 500 });
  }
}

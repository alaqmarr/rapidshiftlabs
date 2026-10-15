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

    const stats = await container.fleetModule.getServerStats(id);
    return NextResponse.json({ stats });
  } catch (error: any) {
    console.error("[API] Error fetching server stats:", error);
    return NextResponse.json({ error: error.message || String(error) }, { status: 500 });
  }
}

export async function POST(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const container = getContainer();

    const stats = await container.fleetModule.getServerStats(id);
    return NextResponse.json({ stats });
  } catch (error: any) {
    console.error("[API] Error polling server stats:", error);
    return NextResponse.json({ error: error.message || String(error) }, { status: 500 });
  }
}

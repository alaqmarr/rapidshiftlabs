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

    const domain = await container.monitoringModule.getDomain(id);
    if (!domain) {
      return NextResponse.json({ error: "Domain not found" }, { status: 404 });
    }

    const [recentChecks, dailyBars] = await Promise.all([
      container.domainCheckRepo.getRecentChecks(id, 50),
      container.domainCheckRepo.getDailyBars(id, 90),
    ]);

    return NextResponse.json({
      domain: domain.toState(),
      recentChecks,
      dailyBars,
    });
  } catch (error: any) {
    console.error("[API] Error fetching domain:", error);
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

    await container.monitoredDomainRepo.delete(id);
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("[API] Error deleting domain:", error);
    return NextResponse.json({ error: error.message || String(error) }, { status: 500 });
  }
}

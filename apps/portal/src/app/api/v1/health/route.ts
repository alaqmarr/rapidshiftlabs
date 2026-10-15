export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { getContainer } from "@rsl/core/container";

export async function GET() {
  try {
    const container = getContainer();
    await container.clientDirectoryRepo.list({ limit: 1 });

    return NextResponse.json({
      status: "ok",
      service: "rapidshift-control-panel",
      uptime: process.uptime(),
      timestamp: Date.now(),
      database: "healthy",
    });
  } catch (error) {
    return NextResponse.json(
      {
        status: "degraded",
        service: "rapidshift-control-panel",
        error: String(error),
        timestamp: Date.now(),
      },
      { status: 503 }
    );
  }
}

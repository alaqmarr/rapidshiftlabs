export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { getContainer } from "@rsl/core/container";
import type { Actor } from "@rsl/core/kernel";
import { ForbiddenError, NotFoundError, RateLimitError } from "@rsl/core/kernel";

export async function POST(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const container = getContainer();

    const actor: Actor = {
      kind: "admin",
      id: "admin_operator",
      email: "admin@rapidshiftlabs.com",
      name: "Admin Operator",
      role: "owner",
      supportLevel: null,
    };

    const result = await container.fleetModule.restartProcess({
      processId: id,
      actor,
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

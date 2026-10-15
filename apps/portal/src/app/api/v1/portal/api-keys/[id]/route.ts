export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { getContainer } from "@rsl/core/container";
import { getRequestActor } from "@/lib/auth-actor";
import { clearGateCache } from "@/lib/cache/lru-cache";

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const actor = await getRequestActor(request);
    if (!actor) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await context.params;
    if (!id) {
      return NextResponse.json({ error: "Missing key ID" }, { status: 400 });
    }

    const container = getContainer();

    const revoked = await container.apiPlatformModule.revokeApiKey(id, actor);

    // Invalidate gate LRU cache
    clearGateCache();

    return NextResponse.json({ success: true, apiKey: revoked });
  } catch (error) {
    console.error("[API Portal Revoke API Key Error]:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to revoke API key" },
      { status: 400 },
    );
  }
}

export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { getContainer } from "@rsl/core/container";
import { clearGateCache } from "@/lib/cache/lru-cache";
import { requireAdminRole } from "@/lib/admin-server-guard";

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const guard = await requireAdminRole(request, { blockedRoles: ["support", "finance"] });
    if (guard.errorResponse) return guard.errorResponse;

    const { id } = await context.params;
    if (!id) {
      return NextResponse.json({ error: "Missing key ID" }, { status: 400 });
    }

    const container = getContainer();
    const revoked = await container.apiPlatformModule.revokeApiKey(id, guard.actor);

    // Invalidate gate LRU cache so revoked key immediately fails gate check
    clearGateCache();

    return NextResponse.json({ success: true, apiKey: revoked });
  } catch (error) {
    console.error("[API Admin Revoke API Key Error]:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to revoke API key" },
      { status: 400 },
    );
  }
}

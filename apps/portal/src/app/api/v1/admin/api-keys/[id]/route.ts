export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { getContainer } from "@rsl/core/container";
import { clearGateCache } from "@/lib/cache/lru-cache";
import type { Actor } from "@rsl/core/kernel";

const ADMIN_ACTOR: Actor = {
  kind: "admin",
  id: "adm_system",
  email: "admin@rapidshift.internal",
  name: "System Admin",
  role: "owner",
  supportLevel: null,
};

export async function DELETE(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    if (!id) {
      return NextResponse.json({ error: "Missing key ID" }, { status: 400 });
    }

    const container = getContainer();
    const revoked = await container.apiPlatformModule.revokeApiKey(id, ADMIN_ACTOR);

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

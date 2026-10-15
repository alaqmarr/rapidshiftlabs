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

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ clientId: string }> },
) {
  try {
    const { clientId } = await context.params;
    if (!clientId) {
      return NextResponse.json({ error: "Missing clientId" }, { status: 400 });
    }

    const container = getContainer();
    const [evalResult, entRecord] = await Promise.all([
      container.entitlementModule.evaluate(clientId),
      container.entitlementRepo.findByClientId(clientId),
    ]);

    return NextResponse.json({
      entitlement: {
        clientId,
        status: evalResult.status,
        allowed: evalResult.allowed,
        isBlocked: evalResult.isBlocked,
        reason: evalResult.reason,
        overrideMode: entRecord?.manualOverride?.mode || null,
        overrideValidUntil: entRecord?.manualOverride?.validUntil || null,
        overrideNote: entRecord?.manualOverride?.note || null,
        isOverrideActive: entRecord?.manualOverride?.isActive(Date.now()) || false,
      },
    });
  } catch (error) {
    console.error("[API Admin Get Entitlement Error]:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to get entitlement" },
      { status: 500 },
    );
  }
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ clientId: string }> },
) {
  try {
    const { clientId } = await context.params;
    if (!clientId) {
      return NextResponse.json({ error: "Missing clientId" }, { status: 400 });
    }

    const body = await request.json();
    const { mode, validUntil, note } = body;

    if (!mode || !["allow", "block", "maintenance"].includes(mode)) {
      return NextResponse.json(
        { error: "Invalid override mode. Must be 'allow', 'block', or 'maintenance'" },
        { status: 400 },
      );
    }

    const container = getContainer();
    const result = await container.entitlementModule.setOverride(
      {
        clientId,
        mode,
        validUntil: validUntil ? Number(validUntil) : null,
        note: note || undefined,
        actor: ADMIN_ACTOR,
      },
      ADMIN_ACTOR,
    );

    // Invalidate gate cache so updated override is active immediately
    clearGateCache();

    return NextResponse.json({ success: true, entitlement: result });
  } catch (error) {
    console.error("[API Admin Set Override Error]:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to set entitlement override" },
      { status: 400 },
    );
  }
}

export async function DELETE(
  _request: NextRequest,
  context: { params: Promise<{ clientId: string }> },
) {
  try {
    const { clientId } = await context.params;
    if (!clientId) {
      return NextResponse.json({ error: "Missing clientId" }, { status: 400 });
    }

    const container = getContainer();
    const result = await container.entitlementModule.clearOverride(clientId, ADMIN_ACTOR);

    // Invalidate gate cache so cleared override is active immediately
    clearGateCache();

    return NextResponse.json({ success: true, entitlement: result });
  } catch (error) {
    console.error("[API Admin Clear Override Error]:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to clear entitlement override" },
      { status: 400 },
    );
  }
}

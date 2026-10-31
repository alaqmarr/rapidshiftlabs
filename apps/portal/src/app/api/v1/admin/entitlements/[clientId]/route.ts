export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { getContainer } from "@rsl/core/container";
import { clearGateCache } from "@/lib/cache/lru-cache";
import { requireAdminRole } from "@/lib/admin-server-guard";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ clientId: string }> },
) {
  try {
    const guard = await requireAdminRole(request);
    if (guard.errorResponse) return guard.errorResponse;

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
    const guard = await requireAdminRole(request, { blockedRoles: ["support"] });
    if (guard.errorResponse) return guard.errorResponse;

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
        actor: guard.actor,
      },
      guard.actor,
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
  request: NextRequest,
  context: { params: Promise<{ clientId: string }> },
) {
  try {
    const guard = await requireAdminRole(request, { blockedRoles: ["support"] });
    if (guard.errorResponse) return guard.errorResponse;

    const { clientId } = await context.params;
    if (!clientId) {
      return NextResponse.json({ error: "Missing clientId" }, { status: 400 });
    }

    const container = getContainer();
    const result = await container.entitlementModule.clearOverride(clientId, guard.actor);

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

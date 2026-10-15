export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { getContainer } from "@rsl/core/container";
import { getRequestActor } from "@/lib/auth-actor";
import { isSuperAdmin } from "@rsl/core/kernel";
import { invalidateSessionVersionCache } from "@/auth";

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const actor = await getRequestActor(req);
    if (!actor) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!isSuperAdmin(actor)) {
      return NextResponse.json({ error: "Forbidden: SuperAdmin or Owner access required" }, { status: 403 });
    }

    const { id } = await context.params;
    const container = getContainer();
    const staff = await container.identityModule.getAdminUserById(id, actor);

    return NextResponse.json({
      staff: {
        id: staff.id,
        email: staff.email,
        name: staff.name,
        role: staff.role,
        supportLevel: staff.supportLevel,
        status: staff.status,
        sessionVersion: staff.sessionVersion,
        createdAt: staff.createdAt,
        updatedAt: staff.updatedAt,
      },
    });
  } catch (error: any) {
    console.error("[API] Error fetching staff member:", error);
    return NextResponse.json({ error: error.message || "Failed to fetch staff member" }, { status: error.status || 500 });
  }
}

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const actor = await getRequestActor(req);
    if (!actor) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!isSuperAdmin(actor)) {
      return NextResponse.json({ error: "Forbidden: SuperAdmin or Owner access required" }, { status: 403 });
    }

    const { id } = await context.params;
    const body = await req.json();
    const { name, role, status, supportLevel, password } = body;

    const container = getContainer();
    const updated = await container.identityModule.updateAdminUser(
      {
        id,
        name,
        role,
        status,
        supportLevel: supportLevel !== undefined ? (supportLevel ? Number(supportLevel) as 1 | 2 | 3 : null) : undefined,
        password,
      },
      actor,
    );

    // If status changed to suspended or password changed, invalidate cached session version immediately
    if (status === "suspended" || password) {
      invalidateSessionVersionCache(id, "admin");
    }

    return NextResponse.json({
      staff: {
        id: updated.id,
        email: updated.email,
        name: updated.name,
        role: updated.role,
        supportLevel: updated.supportLevel,
        status: updated.status,
        sessionVersion: updated.sessionVersion,
        createdAt: updated.createdAt,
        updatedAt: updated.updatedAt,
      },
    });
  } catch (error: any) {
    console.error("[API] Error updating staff member:", error);
    return NextResponse.json({ error: error.message || "Failed to update staff member" }, { status: error.status || 400 });
  }
}

export async function DELETE(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const actor = await getRequestActor(req);
    if (!actor) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!isSuperAdmin(actor)) {
      return NextResponse.json({ error: "Forbidden: SuperAdmin or Owner access required" }, { status: 403 });
    }

    const { id } = await context.params;
    const container = getContainer();
    const result = await container.identityModule.deleteAdminUser(id, actor);

    invalidateSessionVersionCache(id, "admin");
    return NextResponse.json(result);
  } catch (error: any) {
    console.error("[API] Error deleting staff member:", error);
    return NextResponse.json({ error: error.message || "Failed to delete staff member" }, { status: error.status || 400 });
  }
}

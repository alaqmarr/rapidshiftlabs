export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { getContainer } from "@rsl/core/container";
import { getRequestActor } from "@/lib/auth-actor";
import { isSuperAdmin, type Actor } from "@rsl/core/kernel";

export async function GET(req: NextRequest) {
  try {
    const actor = await getRequestActor(req);
    if (!actor) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!isSuperAdmin(actor)) {
      return NextResponse.json({ error: "Forbidden: SuperAdmin or Owner access required" }, { status: 403 });
    }

    const container = getContainer();
    const staff = await container.identityModule.listAdminUsers(actor);

    return NextResponse.json({
      items: staff.map((s) => ({
        id: s.id,
        email: s.email,
        name: s.name,
        role: s.role,
        supportLevel: s.supportLevel,
        status: s.status,
        sessionVersion: s.sessionVersion,
        createdAt: s.createdAt,
        updatedAt: s.updatedAt,
      })),
      total: staff.length,
    });
  } catch (error: any) {
    console.error("[API] Error listing staff:", error);
    return NextResponse.json({ error: error.message || "Failed to list staff" }, { status: error.status || 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const actor = await getRequestActor(req);
    if (!actor) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!isSuperAdmin(actor)) {
      return NextResponse.json({ error: "Forbidden: SuperAdmin or Owner access required" }, { status: 403 });
    }

    const body = await req.json();
    const { email, name, password, role, supportLevel } = body;

    if (!email || !name || !password || !role) {
      return NextResponse.json({ error: "Email, name, password, and role are required" }, { status: 400 });
    }

    const validRoles = ["owner", "superadmin", "finance", "ops", "support"];
    if (!validRoles.includes(role)) {
      return NextResponse.json({ error: `Invalid role. Must be one of: ${validRoles.join(", ")}` }, { status: 400 });
    }

    const container = getContainer();
    const newStaff = await container.identityModule.createAdminUserUseCase.execute(
      {
        email: email.trim().toLowerCase(),
        name: name.trim(),
        password: password.trim(),
        role,
        supportLevel: supportLevel ? Number(supportLevel) as 1 | 2 | 3 : null,
      },
      actor,
    );

    const state = newStaff.toState();
    return NextResponse.json(
      {
        staff: {
          id: state.id,
          email: state.email,
          name: state.name,
          role: state.role,
          supportLevel: state.supportLevel,
          status: state.status,
          createdAt: state.createdAt,
          updatedAt: state.updatedAt,
        },
      },
      { status: 201 },
    );
  } catch (error: any) {
    console.error("[API] Error creating staff:", error);
    return NextResponse.json({ error: error.message || "Failed to create staff" }, { status: error.status || 400 });
  }
}

export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { getContainer } from "@rsl/core/container";
import { requireAdminRole } from "@/lib/admin-server-guard";

export async function GET(request: NextRequest) {
  try {
    const guard = await requireAdminRole(request, { blockedRoles: ["support", "ops"] });
    if (guard.errorResponse) return guard.errorResponse;

    const container = getContainer();
    const settings = await container.settingsModule.getSettingsUseCase.execute();
    return NextResponse.json(settings);
  } catch (error) {
    console.error("[API] Error fetching settings:", error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const guard = await requireAdminRole(request, { allowedRoles: ["owner", "superadmin"] });
    if (guard.errorResponse) return guard.errorResponse;

    const body = await request.json();
    const container = getContainer();

    if (body.company) {
      await container.settingsModule.updateCompanySettingsUseCase.execute(body.company);
    }
    if (body.email) {
      await container.settingsModule.updateEmailSettingsUseCase.execute(body.email);
    }
    if (body.numbering) {
      await container.settingsModule.updateNumberingSettingsUseCase.execute(body.numbering);
    }
    if (body.github) {
      await container.settingsModule.updateGitHubSettingsUseCase.execute(body.github);
    }

    const updated = await container.settingsModule.getSettingsUseCase.execute();
    return NextResponse.json(updated);
  } catch (error) {
    console.error("[API] Error updating settings:", error);
    return NextResponse.json({ error: String(error) }, { status: 400 });
  }
}

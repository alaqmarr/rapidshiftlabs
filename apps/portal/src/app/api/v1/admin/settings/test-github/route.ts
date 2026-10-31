export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { getContainer } from "@rsl/core/container";
import { requireAdminRole } from "@/lib/admin-server-guard";

export async function POST(request: NextRequest) {
  try {
    const guard = await requireAdminRole(request, { allowedRoles: ["owner", "superadmin"] });
    if (guard.errorResponse) return guard.errorResponse;

    const body = await request.json().catch(() => ({}));
    const container = getContainer();

    const result = await container.settingsModule.testGitHubConnectionUseCase.execute(
      body.token,
    );

    return NextResponse.json(result);
  } catch (error: any) {
    console.error("[API] Error testing GitHub connection:", error);
    return NextResponse.json(
      { ok: false, message: error?.message || String(error) },
      { status: 500 },
    );
  }
}

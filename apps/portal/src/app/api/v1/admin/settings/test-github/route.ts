export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { getContainer } from "@rsl/core/container";

export async function POST(request: NextRequest) {
  try {
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

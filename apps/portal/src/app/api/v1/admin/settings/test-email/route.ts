export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { getContainer } from "@rsl/core/container";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const targetEmail = body.to || body.targetEmail;

    if (!targetEmail || !targetEmail.includes("@")) {
      return NextResponse.json(
        { error: "Valid target email is required" },
        { status: 400 },
      );
    }

    const container = getContainer();
    const result = await container.settingsModule.sendTestEmailUseCase.execute(targetEmail);
    return NextResponse.json(result);
  } catch (error) {
    console.error("[API] Error sending test email:", error);
    return NextResponse.json({ error: String(error) }, { status: 400 });
  }
}

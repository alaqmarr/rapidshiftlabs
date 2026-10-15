export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { getContainer } from "@rsl/core/container";

export async function GET() {
  try {
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

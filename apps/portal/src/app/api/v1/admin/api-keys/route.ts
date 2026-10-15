export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { getContainer } from "@rsl/core/container";
import type { Actor } from "@rsl/core/kernel";

const ADMIN_ACTOR: Actor = {
  kind: "admin",
  id: "adm_system",
  email: "admin@rapidshift.internal",
  name: "System Admin",
  role: "owner",
  supportLevel: null,
};

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const clientId = searchParams.get("clientId");

    if (!clientId) {
      return NextResponse.json(
        { error: "clientId query parameter is required" },
        { status: 400 },
      );
    }

    const container = getContainer();
    const includeRevoked = searchParams.get("includeRevoked") !== "false";

    const keys = await container.apiPlatformModule.listApiKeys({
      clientId,
      actor: ADMIN_ACTOR,
      includeRevoked,
    });

    return NextResponse.json({ items: keys });
  } catch (error) {
    console.error("[API Admin List API Keys Error]:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to list API keys" },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { clientId, name, type, scopes, expiresAt } = body;

    if (!clientId) {
      return NextResponse.json(
        { error: "clientId is required" },
        { status: 400 },
      );
    }

    const container = getContainer();
    const result = await container.apiPlatformModule.generateApiKey(
      {
        clientId,
        name: name || "Default Key",
        type: type || "secret",
        scopes: Array.isArray(scopes) && scopes.length > 0 ? scopes : ["access:read"],
        expiresAt: expiresAt ? Number(expiresAt) : null,
        actor: ADMIN_ACTOR,
      },
      ADMIN_ACTOR,
    );

    return NextResponse.json(
      {
        apiKey: result.apiKey,
        rawKey: result.rawKey,
      },
      { status: 201 },
    );
  } catch (error) {
    console.error("[API Admin Generate API Key Error]:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to generate API key" },
      { status: 400 },
    );
  }
}

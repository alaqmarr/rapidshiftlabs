export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { getContainer } from "@rsl/core/container";
import { getRequestActor } from "@/lib/auth-actor";

export async function GET(request: NextRequest) {
  try {
    const actor = await getRequestActor(request);
    if (!actor) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const searchParams = request.nextUrl.searchParams;
    const requestedClientId = searchParams.get("clientId");
    const container = getContainer();

    let targetClientId: string | null = null;
    if (actor.kind === "client_user" || actor.kind === "api_key") {
      if (requestedClientId && requestedClientId !== actor.clientId) {
        return NextResponse.json(
          { error: "Forbidden: Cannot access another client's API keys" },
          { status: 403 }
        );
      }
      targetClientId = actor.clientId;
    } else if (actor.kind === "admin") {
      targetClientId = requestedClientId || null;
      if (!targetClientId) {
        return NextResponse.json({ error: "Client ID is required" }, { status: 400 });
      }
    } else {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const keys = await container.apiPlatformModule.listApiKeys({
      clientId: targetClientId,
      actor,
      includeRevoked: true,
    });

    return NextResponse.json({ items: keys });
  } catch (error) {
    console.error("[API Portal List API Keys Error]:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to list client API keys" },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const actor = await getRequestActor(request);
    if (!actor) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { name, type, scopes, expiresAt, clientId: bodyClientId } = body;
    const container = getContainer();

    let targetClientId: string | null = null;
    if (actor.kind === "client_user" || actor.kind === "api_key") {
      targetClientId = actor.clientId;
    } else if (actor.kind === "admin") {
      targetClientId = bodyClientId || request.nextUrl.searchParams.get("clientId");
      if (!targetClientId) {
        return NextResponse.json({ error: "Client ID is required" }, { status: 400 });
      }
    } else {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const result = await container.apiPlatformModule.generateApiKey(
      {
        clientId: targetClientId,
        name: name || "Production API Key",
        type: type || "secret",
        scopes: Array.isArray(scopes) && scopes.length > 0 ? scopes : ["access:read"],
        expiresAt: expiresAt ? Number(expiresAt) : null,
        actor,
      },
      actor,
    );

    return NextResponse.json(
      {
        apiKey: result.apiKey,
        rawKey: result.rawKey,
      },
      { status: 201 },
    );
  } catch (error) {
    console.error("[API Portal Generate API Key Error]:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to generate API key" },
      { status: 400 },
    );
  }
}

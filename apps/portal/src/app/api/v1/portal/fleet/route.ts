export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { getContainer } from "@rsl/core/container";
import { getRequestActor } from "@/lib/auth-actor";
import type { Actor } from "@rsl/core/kernel";

export async function GET(request: NextRequest) {
  try {
    const actor = await getRequestActor(request);
    if (!actor) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const searchParams = request.nextUrl.searchParams;
    const requestedClientId = searchParams.get("clientId");
    const container = getContainer();

    let targetActor: Actor;
    if (actor.kind === "client_user" || actor.kind === "api_key") {
      if (requestedClientId && requestedClientId !== actor.clientId) {
        return NextResponse.json(
          { error: "Forbidden: Cannot access another client's processes" },
          { status: 403 }
        );
      }
      targetActor = actor;
    } else if (actor.kind === "admin") {
      if (!requestedClientId) {
        return NextResponse.json({ processes: [] });
      }
      targetActor = {
        kind: "client_user",
        id: actor.id,
        email: actor.email,
        name: actor.name,
        clientId: requestedClientId,
        role: "client_admin",
      };
    } else {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const processes = await container.fleetModule.listClientProcesses({ actor: targetActor });
    return NextResponse.json({ processes });
  } catch (error: any) {
    console.error("[API] Error listing portal fleet processes:", error);
    return NextResponse.json({ error: error.message || String(error) }, { status: 500 });
  }
}

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
          { error: "Forbidden: Cannot access another client's contracts" },
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

    const [client, contractsRes] = await Promise.all([
      container.clientDirectoryRepo.findById(targetClientId),
      container.contractRepo.list({ clientId: targetClientId, limit: 100 }),
    ]);

    return NextResponse.json({
      client: client?.toJSON() || null,
      contracts: contractsRes.items.map((c) => c.toJSON()),
      total: contractsRes.total,
    });
  } catch (error) {
    console.error("[API] Error fetching client contracts:", error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

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
          { error: "Forbidden: Cannot access another client's server stats" },
          { status: 403 }
        );
      }
      targetClientId = actor.clientId;
    } else if (actor.kind === "admin") {
      targetClientId = requestedClientId || null;
    } else {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    if (!targetClientId) {
      return NextResponse.json({ stats: [] });
    }

    const clientProcesses = await container.pm2ProcessRepo.listByClientId(targetClientId);
    const serverIds = Array.from(new Set(clientProcesses.map((p) => p.serverId)));

    if (serverIds.length === 0) {
      return NextResponse.json({ stats: [] });
    }

    const statsList = await Promise.all(
      serverIds.map(async (sid) => {
        try {
          return await container.fleetModule.getServerStats(sid);
        } catch (err: any) {
          console.error(`[portal stats] error fetching stats for server ${sid}:`, err);
          return null;
        }
      })
    );

    return NextResponse.json({
      stats: statsList.filter(Boolean),
    });
  } catch (error: any) {
    console.error("[API] Error fetching client server stats:", error);
    return NextResponse.json({ error: error.message || String(error) }, { status: 500 });
  }
}

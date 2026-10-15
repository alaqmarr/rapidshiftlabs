export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getContainer } from "@rsl/core/container";
import { getRequestActor } from "@/lib/auth-actor";

export async function GET(req: NextRequest) {
  try {
    const actor = await getRequestActor(req);
    if (!actor) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const requestedClientId = searchParams.get("clientId");

    // Enforce tenant scoping: client users can only see their own changelogs
    const clientId =
      actor.kind === "client_user"
        ? actor.clientId
        : actor.kind === "api_key"
          ? actor.clientId
          : requestedClientId;

    if (!clientId) {
      return NextResponse.json(
        { error: "clientId is required" },
        { status: 400 },
      );
    }

    const projectId = searchParams.get("projectId") || undefined;
    const filterType = searchParams.get("filter") || "all";
    const limit = parseInt(searchParams.get("limit") || "50", 10);

    const container = getContainer();
    const result = await container.releases.getClientChangelogUseCase.execute({
      clientId,
      projectId,
      filterType,
      limit,
    });

    return NextResponse.json({
      data: result.items,
      repo: result.clientRepo,
      branch: result.clientBranch,
    });
  } catch (err: any) {
    console.error("[API] Error fetching changelog:", err);
    return NextResponse.json(
      { error: err?.message || "Failed to fetch changelog" },
      { status: 500 },
    );
  }
}

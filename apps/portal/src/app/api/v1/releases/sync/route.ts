export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getContainer } from "@rsl/core/container";
import { getRequestActor } from "@/lib/auth-actor";

export async function POST(req: NextRequest) {
  try {
    const actor = await getRequestActor(req);
    if (!actor) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const requestedClientId = body.clientId;

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

    const container = getContainer();
    const result = await container.releases.syncGitHubChangelogUseCase.execute({
      clientId,
      projectId: body.projectId,
      repoOverride: body.repo,
      branchOverride: body.branch,
    });

    return NextResponse.json(result);
  } catch (err: any) {
    console.error("[API] Error syncing GitHub changelog:", err);
    return NextResponse.json(
      { success: false, message: err?.message || "Failed to sync" },
      { status: 500 },
    );
  }
}

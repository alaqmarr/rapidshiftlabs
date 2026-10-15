import { NextRequest, NextResponse } from "next/server";
import { getContainer } from "@rsl/core/container";
import { getRequestActor } from "@/lib/auth-actor";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const actor = await getRequestActor(req);
    if (!actor) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const clientId = searchParams.get("clientId");
    const projectId = searchParams.get("projectId");
    const environment = searchParams.get("environment") as any;
    const status = searchParams.get("status") as any;

    const container = getContainer();
    const releases = await container.releases.listReleasesUseCase.execute(
      { clientId, projectId, environment, status },
      actor,
    );

    return NextResponse.json({ data: releases.map((r) => r.props) });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || "Failed to list releases" },
      { status: err?.status || 400 },
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const actor = await getRequestActor(req);
    if (!actor) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const container = getContainer();

    const release = await container.releases.createReleaseUseCase.execute(body, actor);

    return NextResponse.json({ data: release.props }, { status: 201 });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || "Failed to create release" },
      { status: err?.status || 400 },
    );
  }
}

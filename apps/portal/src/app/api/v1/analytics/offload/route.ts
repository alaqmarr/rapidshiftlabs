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

    const container = getContainer();
    const config = await container.analytics.manageOffloadConfigUseCase.get(
      clientId,
      actor,
    );

    return NextResponse.json({ data: config });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || "Failed to fetch offload configuration" },
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

    const config = await container.analytics.manageOffloadConfigUseCase.update(
      body,
      actor,
    );

    return NextResponse.json({ data: config });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || "Failed to update offload configuration" },
      { status: err?.status || 400 },
    );
  }
}

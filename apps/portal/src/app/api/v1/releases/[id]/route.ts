import { NextRequest, NextResponse } from "next/server";
import { getContainer } from "@rsl/core/container";
import { getRequestActor } from "@/lib/auth-actor";

export const dynamic = "force-dynamic";

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const actor = await getRequestActor(req);
    if (!actor) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await context.params;
    const body = await req.json();
    const container = getContainer();

    const updated = await container.releases.updateReleaseUseCase.execute(id, body, actor);

    return NextResponse.json({ data: updated.props });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || "Failed to update release" },
      { status: err?.status || 400 },
    );
  }
}

export async function DELETE(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const actor = await getRequestActor(req);
    if (!actor) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await context.params;
    const container = getContainer();

    await container.releases.deleteReleaseUseCase.execute(id, actor);

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || "Failed to delete release" },
      { status: err?.status || 400 },
    );
  }
}

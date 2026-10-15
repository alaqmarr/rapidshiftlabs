import { NextRequest, NextResponse } from "next/server";
import { getContainer } from "@rsl/core/container";
import { getRequestActor } from "@/lib/auth-actor";

export const dynamic = "force-dynamic";

export async function POST(
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

    const revealed = await container.vault.revealCredentialUseCase.execute(id, actor);

    return NextResponse.json({ data: revealed });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || "Failed to reveal credential" },
      { status: err?.status || 400 },
    );
  }
}

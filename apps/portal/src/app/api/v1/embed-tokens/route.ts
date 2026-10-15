import { NextRequest, NextResponse } from "next/server";
import { getContainer } from "@rsl/core/container";
import { getRequestActor } from "@/lib/auth-actor";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const actor = await getRequestActor(req);
    if (!actor) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const container = getContainer();

    const token = await container.embeds.mintEmbedTokenUseCase.execute(body, actor);

    return NextResponse.json({
      data: {
        token: token.id,
        clientId: token.clientId,
        scopes: token.scopes,
        allowedOrigins: token.allowedOrigins,
        expiresAt: token.expiresAt,
      },
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || "Failed to mint embed token" },
      { status: err?.status || 400 },
    );
  }
}

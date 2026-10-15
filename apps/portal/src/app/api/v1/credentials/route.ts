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
    const category = searchParams.get("category") as any;

    const container = getContainer();
    const credentials = await container.vault.listCredentialsUseCase.execute(
      { clientId, projectId, category },
      actor,
    );

    return NextResponse.json({ data: credentials });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || "Failed to list credentials" },
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

    const credential = await container.vault.createCredentialUseCase.execute(body, actor);

    return NextResponse.json(
      {
        data: {
          id: credential.id,
          clientId: credential.clientId,
          name: credential.name,
          category: credential.category,
          username: credential.props.username,
          oneTimeReveal: credential.oneTimeReveal,
          expiresAt: credential.expiresAt,
          createdAt: credential.props.createdAt,
        },
      },
      { status: 201 },
    );
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || "Failed to create credential" },
      { status: err?.status || 400 },
    );
  }
}

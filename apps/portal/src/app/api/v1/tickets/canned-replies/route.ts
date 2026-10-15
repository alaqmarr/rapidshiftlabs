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
    const category = searchParams.get("category") || undefined;

    const container = getContainer();
    const replies = await container.support.manageCannedRepliesUseCase.list(category, actor);

    return NextResponse.json({ data: replies.map((r) => r.props) });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || "Failed to list canned replies" },
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

    const reply = await container.support.manageCannedRepliesUseCase.create(body, actor);

    return NextResponse.json({ data: reply.props }, { status: 201 });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || "Failed to create canned reply" },
      { status: err?.status || 400 },
    );
  }
}

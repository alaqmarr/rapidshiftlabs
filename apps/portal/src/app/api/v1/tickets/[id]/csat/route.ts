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
    const body = await req.json();
    const container = getContainer();

    const ticket = await container.support.submitCsatUseCase.execute(
      {
        ticketId: id,
        rating: body.rating,
        feedback: body.feedback,
      },
      actor,
    );

    return NextResponse.json({ data: ticket.toState() });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || "Failed to submit CSAT" },
      { status: err?.status || 400 },
    );
  }
}

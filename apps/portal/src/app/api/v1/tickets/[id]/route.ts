import { NextRequest, NextResponse } from "next/server";
import { getContainer } from "@rsl/core/container";
import { getRequestActor } from "@/lib/auth-actor";

export const dynamic = "force-dynamic";

export async function GET(
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

    const { ticket, messages } = await container.support.getTicketUseCase.execute(id, actor);

    return NextResponse.json({
      data: {
        ticket: ticket.toState(),
        messages: messages.map((m) => m.props),
      },
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || "Failed to fetch ticket" },
      { status: err?.status || 400 },
    );
  }
}

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

    const ticket = await container.support.updateTicketStatusUseCase.execute(
      {
        ticketId: id,
        status: body.status,
        reason: body.reason,
      },
      actor,
    );

    return NextResponse.json({ data: ticket.toState() });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || "Failed to update ticket status" },
      { status: err?.status || 400 },
    );
  }
}

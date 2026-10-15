export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { getContainer } from "@rsl/core/container";
import type { Actor } from "@rsl/core/kernel";
import { ForbiddenError, NotFoundError } from "@rsl/core/kernel";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    let body: Record<string, any> = {};
    try {
      body = await request.json();
    } catch {}

    const container = getContainer();
    const autoHeal = Boolean(body.autoHeal);

    const actor: Actor = {
      kind: "admin",
      id: "admin_operator",
      email: "admin@rapidshiftlabs.com",
      name: "Admin Operator",
      role: "owner",
      supportLevel: null,
    };

    const result = await container.fleetModule.diagnoseAndHealProcess({
      processId: id,
      actor,
      autoHeal,
      createSupportTicketOnFailure: async (ticketData: any) => {
        try {
          const sysActor: Actor = {
            kind: "system",
            name: "Autonomous Sentinel",
          };
          const created = await container.supportModule.createTicketUseCase.execute(
            {
              clientId: ticketData.clientId,
              category: "outage",
              subject: ticketData.subject,
              message: ticketData.message,
              priority: ticketData.priority,
              source: "system",
              linkedProcessId: ticketData.linkedProcessId,
            },
            sysActor
          );
          return { ticketId: created.ticket.id };
        } catch (e) {
          console.error("[Autonomous Fleet Admin] Auto-ticket generation failed:", e);
          return null;
        }
      },
    });

    return NextResponse.json(result);
  } catch (error: any) {
    console.error("[API] Error running admin fleet diagnostics:", error);
    if (error instanceof ForbiddenError) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    if (error instanceof NotFoundError) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    return NextResponse.json({ error: error.message || String(error) }, { status: 400 });
  }
}

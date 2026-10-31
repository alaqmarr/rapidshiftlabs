export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getSshPtySessionManager } from "@rsl/core/fleet";
import {
  requireAdminInfraActor,
  logServerAudit,
  mapServerErrorStatus,
} from "@/lib/admin-server-guard";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const guard = await requireAdminInfraActor(request);
  if (guard.errorResponse) return guard.errorResponse;

  try {
    const { id: serverId } = await context.params;
    const body = await request.json();
    const sessionId = String(body.sessionId || "").trim();
    const action = String(body.action || "input");

    if (!sessionId) {
      return NextResponse.json({ error: "'sessionId' is required" }, { status: 400 });
    }

    const ptyManager = getSshPtySessionManager();

    if (action === "resize") {
      ptyManager.resizeSession(
        sessionId,
        guard.actor.id,
        serverId,
        Number(body.cols || 120),
        Number(body.rows || 32)
      );
      return NextResponse.json({ ok: true });
    }

    if (action === "close") {
      ptyManager.closeSession(sessionId, guard.actor.id, serverId);
      await logServerAudit({
        actor: guard.actor,
        req: request,
        serverId,
        action: "server.terminal.disconnect",
        details: { sessionId },
      });
      return NextResponse.json({ ok: true, closed: true });
    }

    // Default: instant raw PTY keystroke write
    if (typeof body.dataB64 === "string" && body.dataB64.length > 0) {
      ptyManager.writeInput(sessionId, guard.actor.id, serverId, body.dataB64);
    }

    return NextResponse.json({ ok: true });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Failed to send terminal input" },
      { status: mapServerErrorStatus(error) }
    );
  }
}

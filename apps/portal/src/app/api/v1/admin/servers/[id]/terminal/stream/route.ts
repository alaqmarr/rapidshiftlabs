export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getContainer } from "@rsl/core/container";
import { getSshPtySessionManager } from "@rsl/core/fleet";
import {
  requireAdminInfraActor,
  logServerAudit,
  mapServerErrorStatus,
} from "@/lib/admin-server-guard";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const guard = await requireAdminInfraActor(request);
  if (guard.errorResponse) return guard.errorResponse;

  try {
    const { id: serverId } = await context.params;
    const requestedSessionId = request.nextUrl.searchParams.get("sessionId") || undefined;
    const cols = Number(request.nextUrl.searchParams.get("cols") || 120);
    const rows = Number(request.nextUrl.searchParams.get("rows") || 32);

    const container = getContainer();
    const serverCfg = await container.fleetModule.adminOpsUseCase.resolveConnectionConfig(
      serverId
    );

    const ptyManager = getSshPtySessionManager();
    const { sessionId, mode, scrollbackB64 } = await ptyManager.createOrGetSession({
      sessionId: requestedSessionId,
      server: serverCfg,
      adminUserId: guard.actor.id,
      cols,
      rows,
    });

    await logServerAudit({
      actor: guard.actor,
      req: request,
      serverId,
      action: "server.terminal.connect",
      details: { sessionId, mode, host: serverCfg.host },
    });

    const encoder = new TextEncoder();

    const stream = new ReadableStream({
      start(controller) {
        // 1. Emit initial session handshake + scrollback buffer immediately
        const initPayload = JSON.stringify({
          type: "ready",
          sessionId,
          mode,
          host: serverCfg.host,
          username: serverCfg.username,
          scrollbackB64,
        });
        controller.enqueue(encoder.encode(`data: ${initPayload}\n\n`));

        // 2. Subscribe to real-time unbuffered PTY stdout/stderr chunks
        const unsubscribe = ptyManager.subscribe(
          sessionId,
          guard.actor.id,
          serverId,
          (evt) => {
            try {
              controller.enqueue(encoder.encode(`data: ${JSON.stringify(evt)}\n\n`));
            } catch {
              // Client disconnected
            }
          }
        );

        // 3. Keepalive SSE comment every 15 seconds so proxies never drop idle shell tabs
        const keepAlive = setInterval(() => {
          try {
            controller.enqueue(encoder.encode(`: keepalive\n\n`));
          } catch {
            clearInterval(keepAlive);
          }
        }, 15_000);

        request.signal.addEventListener("abort", () => {
          clearInterval(keepAlive);
          unsubscribe();
          try {
            controller.close();
          } catch {}
        });
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Failed to establish SSH PTY stream" },
      { status: mapServerErrorStatus(error) }
    );
  }
}

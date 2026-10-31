export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { getContainer } from "@rsl/core/container";
import { requireAdminInfraActor, logServerAudit } from "@/lib/admin-server-guard";

export async function GET(request: NextRequest) {
  try {
    const guard = await requireAdminInfraActor(request, { allowSupportRead: true });
    if (guard.errorResponse) return guard.errorResponse;

    const container = getContainer();
    const servers = await container.fleetModule.listServers();
    return NextResponse.json({ servers });
  } catch (error: any) {
    console.error("[API] Error listing servers:", error);
    return NextResponse.json({ error: error.message || String(error) }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const guard = await requireAdminInfraActor(request);
    if (guard.errorResponse) return guard.errorResponse;

    const body = await request.json();
    const container = getContainer();

    if (!body.name || !body.host || !body.privateKey) {
      return NextResponse.json(
        { error: "name, host, and privateKey are required" },
        { status: 400 },
      );
    }

    const server = await container.fleetModule.registerServer({
      name: body.name,
      host: body.host,
      port: body.port ? Number(body.port) : 22,
      username: body.username || "ubuntu",
      privateKey: body.privateKey,
      keyPassphrase: body.passphrase || body.keyPassphrase || undefined,
      hostFingerprint: body.hostFingerprint || undefined,
    });

    await logServerAudit({
      actor: guard.actor,
      req: request,
      serverId: server.id,
      action: "server.register",
      details: { name: server.name, host: server.host, port: server.port },
    });

    return NextResponse.json({ server }, { status: 201 });
  } catch (error: any) {
    console.error("[API] Error registering server:", error);
    return NextResponse.json({ error: error.message || String(error) }, { status: 400 });
  }
}

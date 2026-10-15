export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { getContainer } from "@rsl/core/container";

export async function GET() {
  try {
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

    return NextResponse.json({ server }, { status: 201 });
  } catch (error: any) {
    console.error("[API] Error registering server:", error);
    return NextResponse.json({ error: error.message || String(error) }, { status: 400 });
  }
}

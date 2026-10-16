export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { getContainer } from "@rsl/core/container";

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const container = getContainer();

    const server = await container.fleetModule.getServer(id);
    if (!server) {
      return NextResponse.json({ error: "Server not found" }, { status: 404 });
    }

    const processes = await container.pm2ProcessRepo.listByServerId(id);

    return NextResponse.json({
      server,
      processes: processes.map((p) => p.toSnapshot()),
    });
  } catch (error: any) {
    console.error("[API] Error fetching server:", error);
    return NextResponse.json({ error: error.message || String(error) }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const body = await request.json();
    const container = getContainer();

    const server = await container.fleetModule.serverRepo.findById(id);
    if (!server) {
      return NextResponse.json({ error: "Server not found" }, { status: 404 });
    }

    if (body.name !== undefined && !String(body.name).trim()) {
      return NextResponse.json({ error: "Server name cannot be empty" }, { status: 400 });
    }

    server.updateDetails({
      name: body.name !== undefined ? String(body.name).trim() : undefined,
      host: body.host !== undefined ? String(body.host).trim() : undefined,
      port: body.port !== undefined ? Number(body.port) : undefined,
      username: body.username !== undefined ? String(body.username).trim() : undefined,
      hostFingerprint:
        body.hostFingerprint !== undefined
          ? body.hostFingerprint
            ? String(body.hostFingerprint).trim()
            : null
          : undefined,
    });

    if (body.privateKey && String(body.privateKey).trim()) {
      const encryptedKey = container.fleetModule.encryptionService.encrypt(
        String(body.privateKey).trim(),
      );
      const encryptedPass =
        body.passphrase || body.keyPassphrase
          ? container.fleetModule.encryptionService.encrypt(
              String(body.passphrase || body.keyPassphrase),
            )
          : null;
      server.updateCredentials(encryptedKey, encryptedPass);
    }

    await container.fleetModule.serverRepo.save(server);

    const updated = await container.fleetModule.getServer(id);
    return NextResponse.json({ server: updated });
  } catch (error: any) {
    console.error("[API] Error updating server:", error);
    return NextResponse.json({ error: error.message || String(error) }, { status: 400 });
  }
}

export async function PUT(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  return PATCH(request, context);
}

export async function DELETE(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const container = getContainer();

    await container.fleetModule.deleteServer(id);
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("[API] Error deleting server:", error);
    return NextResponse.json({ error: error.message || String(error) }, { status: 500 });
  }
}

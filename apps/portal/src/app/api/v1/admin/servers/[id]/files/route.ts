export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getContainer } from "@rsl/core/container";
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
    const mode = request.nextUrl.searchParams.get("mode") || "list";
    const targetPath = request.nextUrl.searchParams.get("path") || undefined;
    const container = getContainer();

    if (mode === "read") {
      if (!targetPath) {
        return NextResponse.json({ error: "Query parameter 'path' is required" }, { status: 400 });
      }
      const file = await container.fleetModule.adminOpsUseCase.readFile(serverId, targetPath);
      return NextResponse.json({ file });
    }

    const directory = await container.fleetModule.adminOpsUseCase.listDirectory(
      serverId,
      targetPath
    );
    return NextResponse.json({ directory });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Failed to browse remote server files" },
      { status: mapServerErrorStatus(error) }
    );
  }
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const guard = await requireAdminInfraActor(request);
  if (guard.errorResponse) return guard.errorResponse;

  try {
    const { id: serverId } = await context.params;
    const body = await request.json();
    const action = String(body.action || "write");
    const container = getContainer();

    if (action === "mkdir") {
      if (!body.path) {
        return NextResponse.json({ error: "Directory 'path' is required" }, { status: 400 });
      }
      const result = await container.fleetModule.adminOpsUseCase.createDirectory(
        serverId,
        String(body.path)
      );
      await logServerAudit({
        actor: guard.actor,
        req: request,
        serverId,
        action: "server.file.mkdir",
        details: { path: result.path },
      });
      return NextResponse.json(result);
    }

    if (action === "rename") {
      if (!body.oldPath || !body.newPath) {
        return NextResponse.json(
          { error: "'oldPath' and 'newPath' are required" },
          { status: 400 }
        );
      }
      const result = await container.fleetModule.adminOpsUseCase.renameEntry(
        serverId,
        String(body.oldPath),
        String(body.newPath)
      );
      await logServerAudit({
        actor: guard.actor,
        req: request,
        serverId,
        action: "server.file.rename",
        details: { oldPath: result.oldPath, newPath: result.newPath },
      });
      return NextResponse.json(result);
    }

    if (action === "chmod") {
      if (!body.path || !body.modeOctal) {
        return NextResponse.json(
          { error: "'path' and 'modeOctal' are required" },
          { status: 400 }
        );
      }
      const result = await container.fleetModule.adminOpsUseCase.chmodEntry(
        serverId,
        String(body.path),
        String(body.modeOctal)
      );
      await logServerAudit({
        actor: guard.actor,
        req: request,
        serverId,
        action: "server.file.chmod",
        details: { path: result.path, permissionsOctal: result.permissionsOctal },
      });
      return NextResponse.json(result);
    }

    // Default: write / create file (e.g. .env, config, script)
    if (!body.path || typeof body.content !== "string") {
      return NextResponse.json(
        { error: "'path' and string 'content' are required" },
        { status: 400 }
      );
    }

    const file = await container.fleetModule.adminOpsUseCase.writeFile(
      serverId,
      String(body.path),
      body.content,
      {
        modeOctal: body.modeOctal ? String(body.modeOctal) : undefined,
        createParents: body.createParents !== false,
      }
    );

    await logServerAudit({
      actor: guard.actor,
      req: request,
      serverId,
      action: "server.file.write",
      details: {
        path: file.path,
        sizeBytes: file.size,
        permissionsOctal: file.permissionsOctal,
      },
    });

    return NextResponse.json({ file });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Failed to modify remote file" },
      { status: mapServerErrorStatus(error) }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const guard = await requireAdminInfraActor(request);
  if (guard.errorResponse) return guard.errorResponse;

  try {
    const { id: serverId } = await context.params;
    const targetPath =
      request.nextUrl.searchParams.get("path") ||
      (await request
        .json()
        .then((b) => b?.path)
        .catch(() => null));

    const recursive =
      request.nextUrl.searchParams.get("recursive") === "true" ||
      request.nextUrl.searchParams.get("recursive") === "1";

    if (!targetPath) {
      return NextResponse.json({ error: "Target 'path' is required" }, { status: 400 });
    }

    const container = getContainer();
    const result = await container.fleetModule.adminOpsUseCase.deleteEntry(
      serverId,
      String(targetPath),
      recursive
    );

    await logServerAudit({
      actor: guard.actor,
      req: request,
      serverId,
      action: "server.file.delete",
      details: { path: result.path, recursive },
    });

    return NextResponse.json(result);
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Failed to delete remote entry" },
      { status: mapServerErrorStatus(error) }
    );
  }
}

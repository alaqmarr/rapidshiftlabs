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
    const logType = request.nextUrl.searchParams.get("logs");
    const container = getContainer();

    if (logType === "error" || logType === "access") {
      const lines = Number(request.nextUrl.searchParams.get("lines") || 100);
      const logs = await container.fleetModule.adminOpsUseCase.getNginxLogs(
        serverId,
        logType,
        lines
      );
      return NextResponse.json({ logs, logType });
    }

    const status = await container.fleetModule.adminOpsUseCase.getNginxStatus(serverId);
    const settingsEmail = await container.settingsModule.repo
      .getEmailSettings()
      .then((s) => s.fromEmail || s.user || "")
      .catch(() => "");

    return NextResponse.json({
      nginx: status,
      defaultSslEmail: settingsEmail || guard.actor.email || "",
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Failed to inspect Nginx status" },
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
    const action = String(body.action || "save");
    const container = getContainer();

    if (action === "toggle") {
      if (!body.filename || typeof body.enable !== "boolean") {
        return NextResponse.json(
          { error: "'filename' and boolean 'enable' are required" },
          { status: 400 }
        );
      }
      const res = await container.fleetModule.adminOpsUseCase.toggleNginxSite(
        serverId,
        String(body.filename),
        body.enable
      );
      await logServerAudit({
        actor: guard.actor,
        req: request,
        serverId,
        action: body.enable ? "server.nginx.enable" : "server.nginx.disable",
        details: { filename: body.filename },
      });
      return NextResponse.json(res);
    }

    if (action === "reload" || action === "test") {
      const res = await container.fleetModule.adminOpsUseCase.testAndReloadNginx(serverId);
      await logServerAudit({
        actor: guard.actor,
        req: request,
        serverId,
        action: "server.nginx.reload",
      });
      return NextResponse.json(res);
    }

    // Save / Create Nginx site block
    const domains: string[] = Array.isArray(body.domains)
      ? body.domains
      : typeof body.domain === "string"
      ? [body.domain]
      : [];

    const result = await container.fleetModule.adminOpsUseCase.saveNginxSite(serverId, {
      filename: body.filename ? String(body.filename) : undefined,
      domains,
      mode: body.mode || "proxy",
      proxyHost: body.proxyHost || "127.0.0.1",
      proxyPort: body.proxyPort !== undefined ? Number(body.proxyPort) : 3000,
      rootPath: body.rootPath ? String(body.rootPath) : undefined,
      spaFallback: body.spaFallback !== false,
      redirectTarget: body.redirectTarget ? String(body.redirectTarget) : undefined,
      redirectPermanent: body.redirectPermanent !== false,
      enableWebsockets: body.enableWebsockets !== false,
      clientMaxBodySize: body.clientMaxBodySize || "50M",
      enableGzip: body.enableGzip !== false,
      enableSecurityHeaders: body.enableSecurityHeaders !== false,
      enableSite: body.enableSite !== false,
      rawOverride: body.rawOverride ? String(body.rawOverride) : undefined,
    });

    // Optional: Auto-link domain into RSL Domains & SSL Monitor for a selected client!
    let monitoredDomainId: string | null = null;
    if (body.clientId && typeof body.clientId === "string" && domains[0]) {
      const cleanHostname = String(domains[0])
        .trim()
        .toLowerCase()
        .replace(/^https?:\/\//, "")
        .replace(/\/.*$/, "");
      try {
        const existingDomains = await container.monitoringModule.listDomainsByClient(body.clientId);
        const alreadyTracked = existingDomains.find(
          (d) => d.hostname.toLowerCase() === cleanHostname
        );
        if (alreadyTracked) {
          monitoredDomainId = alreadyTracked.id;
        } else {
          const registered = await container.monitoringModule.registerDomain({
            clientId: body.clientId,
            name: body.domainLabel || cleanHostname,
            hostname: cleanHostname,
            targetUrl: `https://${cleanHostname}`,
          });
          monitoredDomainId = registered.id;
        }
      } catch (monErr) {
        console.warn("[NginxManager] Non-blocking domain monitor sync warning:", monErr);
      }
    }

    await logServerAudit({
      actor: guard.actor,
      req: request,
      serverId,
      action: "server.nginx.save_site",
      details: {
        filename: result.filename,
        domains,
        mode: body.mode || "proxy",
        proxyPort: body.proxyPort,
        monitoredDomainId,
      },
    });

    return NextResponse.json({
      ...result,
      monitoredDomainId,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Failed to save Nginx configuration" },
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
    const filename =
      request.nextUrl.searchParams.get("filename") ||
      (await request
        .json()
        .then((b) => b?.filename)
        .catch(() => null));

    if (!filename) {
      return NextResponse.json({ error: "'filename' is required" }, { status: 400 });
    }

    const container = getContainer();
    const res = await container.fleetModule.adminOpsUseCase.deleteNginxSite(
      serverId,
      String(filename)
    );

    await logServerAudit({
      actor: guard.actor,
      req: request,
      serverId,
      action: "server.nginx.delete_site",
      details: { filename },
    });

    return NextResponse.json(res);
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Failed to delete Nginx site" },
      { status: mapServerErrorStatus(error) }
    );
  }
}

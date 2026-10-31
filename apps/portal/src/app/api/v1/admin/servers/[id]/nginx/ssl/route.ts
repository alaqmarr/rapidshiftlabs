export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getContainer } from "@rsl/core/container";
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
    const container = getContainer();

    const domains: string[] = Array.isArray(body.domains)
      ? body.domains
      : typeof body.domain === "string"
      ? [body.domain]
      : [];

    const fallbackEmail =
      body.email ||
      (await container.settingsModule.repo
        .getEmailSettings()
        .then((s) => s.fromEmail || s.user || "")
        .catch(() => "")) ||
      guard.actor.email;

    const result = await container.fleetModule.adminOpsUseCase.provisionSslCertificate(serverId, {
      domains,
      email: String(fallbackEmail || "").trim(),
      redirectHttpToHttps: body.redirectHttpToHttps !== false,
      installCertbotIfMissing: body.installCertbotIfMissing !== false,
    });

    await logServerAudit({
      actor: guard.actor,
      req: request,
      serverId,
      action: "server.nginx.provision_ssl",
      details: {
        domains: result.domains,
        certPath: result.certPath,
      },
    });

    return NextResponse.json(result);
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Failed to provision Let's Encrypt SSL certificate" },
      { status: mapServerErrorStatus(error) }
    );
  }
}

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getContainer } from "@rsl/core/container";
import {
  requireAdminInfraActor,
  logServerAudit,
  mapServerErrorStatus,
} from "@/lib/admin-server-guard";

// Lightweight 5-minute in-memory cache so switching servers on the Fleet page is instantaneous
const packageReportCache = new Map<string, { expiresAt: number; report: any }>();
const CACHE_TTL_MS = 5 * 60 * 1000;

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const guard = await requireAdminInfraActor(request, { allowSupportRead: true });
  if (guard.errorResponse) return guard.errorResponse;

  try {
    const { id: serverId } = await context.params;
    const refresh =
      request.nextUrl.searchParams.get("refresh") === "1" ||
      request.nextUrl.searchParams.get("refresh") === "true";

    if (!refresh) {
      const cached = packageReportCache.get(serverId);
      if (cached && cached.expiresAt > Date.now()) {
        return NextResponse.json({ report: cached.report, cached: true });
      }
    }

    const container = getContainer();
    const report = await container.fleetModule.adminOpsUseCase.scanOutdatedPackages(serverId, {
      refreshMetadata: refresh,
    });

    packageReportCache.set(serverId, {
      expiresAt: Date.now() + CACHE_TTL_MS,
      report,
    });

    return NextResponse.json({ report, cached: false });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Failed to scan outdated server packages" },
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
    const container = getContainer();

    const ecosystem = body.ecosystem || "apt";
    const packages = Array.isArray(body.packages) ? body.packages.map(String) : undefined;
    const securityOnly = Boolean(body.securityOnly);

    const result = await container.fleetModule.adminOpsUseCase.upgradePackages(serverId, {
      ecosystem,
      packages,
      securityOnly,
    });

    // Invalidate cached report and rescan fresh state
    packageReportCache.delete(serverId);
    const updatedReport = await container.fleetModule.adminOpsUseCase.scanOutdatedPackages(
      serverId,
      { refreshMetadata: false }
    );
    packageReportCache.set(serverId, {
      expiresAt: Date.now() + CACHE_TTL_MS,
      report: updatedReport,
    });

    await logServerAudit({
      actor: guard.actor,
      req: request,
      serverId,
      action: "server.packages.upgrade",
      details: {
        ecosystem,
        packages: packages ?? (securityOnly ? "security_only" : "all"),
        upgradedCount: result.upgradedCount,
      },
    });

    return NextResponse.json({
      result,
      report: updatedReport,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Failed to upgrade server packages" },
      { status: mapServerErrorStatus(error) }
    );
  }
}

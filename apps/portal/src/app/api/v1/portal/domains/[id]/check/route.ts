export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { getContainer } from "@rsl/core/container";
import { getRequestActor } from "@/lib/auth-actor";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const actor = await getRequestActor(request);
    if (!actor) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await context.params;
    let body: Record<string, any> = {};
    try {
      body = await request.json();
    } catch {}

    const container = getContainer();
    const domain = await container.monitoringModule.getDomain(id);
    if (!domain) {
      return NextResponse.json({ error: "Domain not found" }, { status: 404 });
    }

    if (actor.kind === "client_user" || actor.kind === "api_key") {
      if (domain.clientId !== actor.clientId) {
        return NextResponse.json(
          { error: "Forbidden: domain belongs to another client" },
          { status: 403 },
        );
      }
    } else if (actor.kind !== "admin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const checkType = body.checkType || request.nextUrl.searchParams.get("type") || "all";
    const results: Record<string, any> = {};

    if (checkType === "http" || checkType === "all") {
      results.http = await container.monitoringModule.executeHttpCheck({ domain });
    }
    if (checkType === "ssl" || checkType === "all") {
      results.ssl = await container.monitoringModule.executeSslCheck({ domain });
    }
    if (checkType === "dns" || checkType === "all") {
      results.dns = await container.monitoringModule.executeDnsCheck({ domain });
    }
    if (checkType === "rdap" || checkType === "all") {
      results.rdap = await container.monitoringModule.executeRdapCheck({ domain });
    }

    const updated = await container.monitoringModule.getDomain(id);

    return NextResponse.json({
      domain: updated?.toState(),
      results,
    });
  } catch (error: any) {
    console.error("[API] Error executing portal domain check:", error);
    return NextResponse.json({ error: error.message || String(error) }, { status: 500 });
  }
}

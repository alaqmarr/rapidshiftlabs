export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { getContainer } from "@rsl/core/container";
import { getRequestActor } from "@/lib/auth-actor";
import { validateSafeOutboundUrl, SecurityError } from "@rsl/core/monitoring";

export async function GET(request: NextRequest) {
  try {
    const actor = await getRequestActor(request);
    if (!actor) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const searchParams = request.nextUrl.searchParams;
    const requestedClientId = searchParams.get("clientId");
    const container = getContainer();

    let targetClientId: string | null = null;
    if (actor.kind === "client_user" || actor.kind === "api_key") {
      if (requestedClientId && requestedClientId !== actor.clientId) {
        return NextResponse.json(
          { error: "Forbidden: Cannot access another client's domains" },
          { status: 403 }
        );
      }
      targetClientId = actor.clientId;
    } else if (actor.kind === "admin") {
      targetClientId = requestedClientId || null;
      if (!targetClientId) {
        return NextResponse.json({ error: "Client ID is required" }, { status: 400 });
      }
    } else {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const [domains, incidents] = await Promise.all([
      container.monitoringModule.listDomainsByClient(targetClientId),
      container.monitoringModule.listActiveIncidents(targetClientId),
    ]);

    return NextResponse.json({
      domains: domains.map((d) => d.toState()),
      incidents: incidents.map((i) => i.toState()),
    });
  } catch (error: any) {
    console.error("[API] Error fetching client domains:", error);
    return NextResponse.json({ error: error.message || String(error) }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const actor = await getRequestActor(request);
    if (!actor) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const container = getContainer();

    let targetClientId: string | null = null;
    if (actor.kind === "client_user" || actor.kind === "api_key") {
      targetClientId = actor.clientId;
    } else if (actor.kind === "admin") {
      targetClientId = body.clientId || request.nextUrl.searchParams.get("clientId");
    } else {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    if (!targetClientId) {
      return NextResponse.json({ error: "Client ID is required" }, { status: 400 });
    }

    if (!body.name || !body.hostname) {
      return NextResponse.json(
        { error: "name and hostname are required" },
        { status: 400 },
      );
    }

    // SSRF Pre-validation on targetUrl or hostname if in production
    const testUrl = body.targetUrl || `https://${body.hostname}`;
    try {
      await validateSafeOutboundUrl(testUrl);
    } catch (err: any) {
      if (err instanceof SecurityError) {
        return NextResponse.json({ error: `Security check failed: ${err.message}` }, { status: 400 });
      }
    }

    const domain = await container.monitoringModule.registerDomain({
      clientId: targetClientId,
      projectId: body.projectId || null,
      name: body.name,
      hostname: body.hostname,
      targetUrl: body.targetUrl || undefined,
      port: body.port ? Number(body.port) : undefined,
    });

    // Run immediate initial diagnostics check so domain is not left in pending/error state
    try {
      await Promise.allSettled([
        container.monitoringModule.executeHttpCheck({ domain }),
        container.monitoringModule.executeSslCheck({ domain }),
        container.monitoringModule.executeDnsCheck({ domain }),
        container.monitoringModule.executeRdapCheck({ domain }),
      ]);
    } catch (checkErr) {
      console.warn("[API] Initial domain check non-blocking notice:", checkErr);
    }

    const freshDomain = (await container.monitoringModule.getDomain(domain.id)) || domain;
    return NextResponse.json({ domain: freshDomain.toState() }, { status: 201 });
  } catch (error: any) {
    console.error("[API] Error registering client domain:", error);
    return NextResponse.json({ error: error.message || String(error) }, { status: 400 });
  }
}

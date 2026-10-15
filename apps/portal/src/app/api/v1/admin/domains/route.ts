export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { getContainer } from "@rsl/core/container";

export async function GET() {
  try {
    const container = getContainer();
    const domains = (await container.monitoredDomainRepo.listAll?.()) ?? [];
    return NextResponse.json({
      domains: domains.map((d) => d.toState()),
    });
  } catch (error: any) {
    console.error("[API] Error listing monitored domains:", error);
    return NextResponse.json({ error: error.message || String(error) }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const container = getContainer();

    if (!body.clientId || !body.name || !body.hostname) {
      return NextResponse.json(
        { error: "clientId, name, and hostname are required" },
        { status: 400 },
      );
    }

    const domain = await container.monitoringModule.registerDomain({
      clientId: body.clientId,
      projectId: body.projectId || null,
      name: body.name,
      hostname: body.hostname,
      targetUrl: body.targetUrl || undefined,
      port: body.port ? Number(body.port) : undefined,
      config: body.config || undefined,
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
    console.error("[API] Error registering domain:", error);
    return NextResponse.json({ error: error.message || String(error) }, { status: 400 });
  }
}

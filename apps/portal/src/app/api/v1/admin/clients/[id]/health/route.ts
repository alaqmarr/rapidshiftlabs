export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { getContainer } from "@rsl/core/container";
import { ClientHealthService } from "@rsl/core/clients";
import { NotFoundError } from "@rsl/core/kernel";

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const container = getContainer();

    const client = await container.clientDirectoryRepo.findById(id);
    if (!client) {
      throw new NotFoundError("Client", id);
    }

    const [
      billingSummary,
      entitlement,
      processes,
      domains,
      tickets,
    ] = await Promise.all([
      container.billingRepo.getBillingSummary(id).catch(() => ({
        totalBilledMinor: 0,
        totalPaidMinor: 0,
        outstandingMinor: 0,
        overdueCount: 0,
        activeInvoicesCount: 0,
      })),
      container.entitlementModule.evaluate(id).catch(() => ({
        status: "active",
        allowed: true,
      })),
      container.pm2ProcessRepo.listByClientId(id).catch(() => []),
      container.monitoredDomainRepo.findByClientId(id).catch(() => []),
      container.ticketRepo.list({ clientId: id }).catch(() => []),
    ]);

    const onlineProcesses = processes.filter((p: any) => p.status === "online").length;
    const erroredProcesses = processes.filter((p: any) => p.status === "errored" || p.status === "stopped").length;
    const hasCrashLoop = processes.some(
      (p: any) =>
        (p.status === "errored" && (p.restarts || 0) >= 3) ||
        (p.status === "online" && p.uptimeMs > 0 && p.uptimeMs < 30_000 && (p.restarts || 0) >= 8)
    );

    const activeIncidents = domains.filter((d: any) => d.status === "down").length;
    const expiringSsl = domains.filter((d: any) => d.sslStatus === "expiring").length;

    const breachedSla = tickets.filter((t: any) => t.isSlaBreached).length;
    const hasEscalatedP1 = tickets.some((t: any) => t.priority === "P1" && t.status !== "resolved" && t.status !== "closed");

    const health = ClientHealthService.calculate({
      clientId: id,
      clientStatus: client.status,
      billing: {
        outstandingMinor: billingSummary.outstandingMinor,
        totalBilledMinor: billingSummary.totalBilledMinor,
        overdueInvoicesCount: billingSummary.overdueCount,
        entitlementAllowed: entitlement.allowed,
        entitlementStatus: entitlement.status,
      },
      fleet: {
        totalProcesses: processes.length,
        onlineProcesses,
        erroredProcesses,
        hasCrashLoop,
      },
      monitoring: {
        totalDomains: domains.length,
        activeIncidentsCount: activeIncidents,
        expiringSslCount: expiringSsl,
      },
      support: {
        openTicketsCount: tickets.filter((t: any) => t.status !== "resolved" && t.status !== "closed").length,
        breachedSlaCount: breachedSla,
        hasEscalatedP1,
      },
    });

    return NextResponse.json({ health });
  } catch (error: any) {
    console.error("[API] Error generating client health score:", error);
    if (error instanceof NotFoundError) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    return NextResponse.json({ error: error.message || String(error) }, { status: 400 });
  }
}
